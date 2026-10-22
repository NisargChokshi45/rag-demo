import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { getChatModel } from '@/lib/models';
import type { DocumentSearchHit } from '@/lib/db';
import type { DocumentStrategy } from './chunk';

/**
 * Orders the retrieved candidates before the answer step. Three strategies,
 * chosen with RERANK_MODE (or the `mode` argument, used by the eval script):
 *
 *  - none:          keep the fused hybrid order.
 *  - llm:           the chat model picks the best passages from the full text.
 *  - cross-encoder: a local MS MARCO cross-encoder scores each question and
 *                   passage pair. Needs the optional @huggingface/transformers
 *                   package and downloads its model on first use.
 *
 * Tables and figures are reserved a slot when they rank in the top candidates,
 * because rerankers trained on prose tend to under-rate them.
 */

export const RERANK_MODES = ['none', 'llm', 'cross-encoder'] as const;
export type RerankMode = (typeof RERANK_MODES)[number];

export const RERANK_KEEP = 6;
const PASSAGE_CHARS = 1200;
const RESERVED_KINDS: DocumentSearchHit['kind'][] = ['table', 'figure'];
const RESERVED_WITHIN = 10;
export const CROSS_ENCODER_MODEL =
  process.env.CROSS_ENCODER_MODEL || 'Xenova/ms-marco-MiniLM-L-6-v2';

export interface RerankResult {
  hits: DocumentSearchHit[];
  mode: RerankMode;
  detail: string;
}

/**
 * RERANK_MODE, when set, wins for every document. Otherwise each shape gets
 * its default: element_rich skips the reranker, because the visual report
 * showed it under-rating table and figure chunks; the others use the LLM.
 */
export function configuredRerankMode(strategy?: DocumentStrategy): RerankMode {
  const configured = (process.env.RERANK_MODE || '').trim() as RerankMode;
  if (RERANK_MODES.includes(configured)) return configured;
  return strategy === 'element_rich' ? 'none' : 'llm';
}

function text(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === 'string'
          ? part
          : part && typeof part === 'object' && 'text' in part
            ? String((part as { text: unknown }).text ?? '')
            : ''
      )
      .join('');
  }
  return '';
}

function parseIndexArray(raw: string): number[] | null {
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start < 0 || end < start) return null;
  try {
    const value = JSON.parse(raw.slice(start, end + 1));
    return Array.isArray(value)
      ? value
          .map((item) => Number(item))
          .filter((item) => Number.isInteger(item))
      : null;
  } catch {
    return null;
  }
}

/** Keeps the first occurrence of each valid index, in the order given. */
function uniqueIndexes(indexes: number[], size: number) {
  return indexes.filter(
    (index, position, all) =>
      index >= 0 && index < size && all.indexOf(index) === position
  );
}

/**
 * Makes sure a table or figure in the top candidates is not dropped. The
 * weakest selected passage makes room for the best such candidate.
 */
export function reserveSlots(
  chosen: DocumentSearchHit[],
  candidates: DocumentSearchHit[],
  keep: number
): DocumentSearchHit[] {
  const result = chosen.slice(0, keep);
  const top = candidates.slice(0, RESERVED_WITHIN);
  for (const kind of RESERVED_KINDS) {
    if (result.some((hit) => hit.kind === kind)) continue;
    const candidate = top.find((hit) => hit.kind === kind);
    if (!candidate || result.includes(candidate)) continue;
    if (result.length < keep) result.push(candidate);
    else result[result.length - 1] = candidate;
  }
  return result;
}

async function rerankWithLlm(
  question: string,
  candidates: DocumentSearchHit[],
  keep: number
): Promise<{ hits: DocumentSearchHit[]; detail: string }> {
  const listing = candidates
    .map((hit, index) => {
      const passage = hit.content.slice(0, PASSAGE_CHARS).replace(/\s+/g, ' ');
      return `[${index}] (${hit.kind}, p.${hit.page_start}, ${hit.section_path || 'no section'}) ${passage}`;
    })
    .join('\n');

  let ranked: number[] | null = null;
  try {
    const response = await getChatModel(0).invoke([
      new SystemMessage(
        `You rank document passages for a question. Return only a JSON array of the ${keep} passage numbers most likely to contain the answer, most relevant first. Prefer passages with the exact figures or facts asked for, including table rows and chart values.`
      ),
      new HumanMessage(`Question: ${question}\n\nPassages:\n${listing}`),
    ]);
    const parsed = parseIndexArray(text(response.content));
    ranked = parsed ? uniqueIndexes(parsed, candidates.length) : null;
  } catch {
    ranked = null;
  }

  if (!ranked || ranked.length === 0) {
    return {
      hits: candidates.slice(0, keep),
      detail: `fallback to fused order, kept ${Math.min(keep, candidates.length)}`,
    };
  }
  const chosen = ranked.map((index) => candidates[index]).slice(0, keep);
  return {
    hits: reserveSlots(chosen, candidates, keep),
    detail: `LLM kept ${chosen.length} of ${candidates.length}`,
  };
}

const TRANSFORMERS_PACKAGE = '@huggingface/transformers';

let crossEncoder: Promise<{
  tokenizer: (queries: string[], options: Record<string, unknown>) => unknown;
  model: (inputs: unknown) => Promise<{ logits: { data: ArrayLike<number> } }>;
}> | null = null;

/**
 * Loads the cross-encoder once per server process. The package is imported
 * lazily so the default (llm) path never loads the ONNX runtime.
 */
function loadCrossEncoder() {
  if (!crossEncoder) {
    crossEncoder = (async () => {
      // webpackIgnore keeps the ONNX native binaries out of the bundle; Node
      // loads the package from node_modules when the mode is first used.
      const transformers = (await import(
        /* webpackIgnore: true */ TRANSFORMERS_PACKAGE
      )) as typeof import('@huggingface/transformers');
      const tokenizer =
        await transformers.AutoTokenizer.from_pretrained(CROSS_ENCODER_MODEL);
      const model =
        await transformers.AutoModelForSequenceClassification.from_pretrained(
          CROSS_ENCODER_MODEL
        );
      return {
        tokenizer: tokenizer as unknown as (
          queries: string[],
          options: Record<string, unknown>
        ) => unknown,
        model: model as unknown as (
          inputs: unknown
        ) => Promise<{ logits: { data: ArrayLike<number> } }>,
      };
    })().catch((error) => {
      crossEncoder = null;
      throw error;
    });
  }
  return crossEncoder;
}

async function rerankWithCrossEncoder(
  question: string,
  candidates: DocumentSearchHit[],
  keep: number
): Promise<{ hits: DocumentSearchHit[]; detail: string }> {
  const { tokenizer, model } = await loadCrossEncoder();
  const passages = candidates.map((hit) => hit.content.slice(0, PASSAGE_CHARS));
  // One (question, passage) pair per candidate, tokenized as a batch.
  const inputs = tokenizer(
    passages.map(() => question),
    {
      text_pair: passages,
      padding: true,
      truncation: true,
      max_length: 512,
    }
  );
  const output = await model(inputs);
  const scores = Array.from(output.logits.data);
  const order = candidates
    .map((_, index) => index)
    .sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0));
  const chosen = order.map((index) => candidates[index]).slice(0, keep);
  return {
    hits: reserveSlots(chosen, candidates, keep),
    detail: `cross-encoder kept ${chosen.length} of ${candidates.length}`,
  };
}

export async function rerank(
  question: string,
  candidates: DocumentSearchHit[],
  options: { mode?: RerankMode; keep?: number } = {}
): Promise<RerankResult> {
  const mode = options.mode ?? configuredRerankMode();
  const keep = options.keep ?? RERANK_KEEP;

  if (candidates.length <= keep) {
    return { hits: candidates, mode, detail: 'kept all candidates' };
  }
  if (mode === 'none') {
    return {
      hits: candidates.slice(0, keep),
      mode,
      detail: `fused order, kept ${keep} of ${candidates.length}`,
    };
  }

  const result =
    mode === 'cross-encoder'
      ? await rerankWithCrossEncoder(question, candidates, keep)
      : await rerankWithLlm(question, candidates, keep);
  return { ...result, mode };
}
