import { StateGraph, START, END } from '@langchain/langgraph';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { getChatModel } from '@/lib/models';
import { embedQuery } from '@/lib/embeddings';
import {
  getDocumentChunksByIds,
  getDocumentChunksByIndex,
  searchDocumentChunks,
  type DocumentChunkRow,
  type DocumentSearchHit,
} from '@/lib/db';
import { configuredRerankMode, rerank, type RerankMode } from './rerank';
import { routeQuestion, type QuestionRoute } from './routing';
import type { DocumentStrategy } from './chunk';

/**
 * LangGraph answer pipeline for one document:
 *
 * plan → retrieve → rerank → expand → generate → verify → END
 *                         ▲                              │ (not grounded, first try)
 *                         └──────────── rewrite ◀────────┘
 *
 * The document's strategy (its shape) decides which steps apply:
 *  - narrative:       no chapters or regions, so no routing. Hybrid search,
 *                     rerank, then the hits plus their neighbouring windows.
 *  - long_structured: route to a chapter or region when the question names
 *                     one. Search the child windows, rerank them, then answer
 *                     from the parent sections of the reranked hits.
 *  - element_rich:    hybrid search and grounded answers. Rerank defaults to
 *                     off, since prose-trained rerankers under-rate tables.
 *
 * Retrieval is hybrid (vector + OR keyword, see search_document_chunks) and
 * falls back to the whole document when a filtered search is thin. The answer
 * step uses the shared Groq chat model. Verification rejects citations outside
 * the retrieved context and flags numbers that never appear in the cited
 * passages.
 */

const RETRIEVE_COUNT = 20;
const MIN_FILTERED_HITS = 6;
const CONTEXT_CHAR_BUDGET = 14000;
const MAX_REWRITES = 1;

export interface GraphTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ContextBlock {
  label: string;
  chunkId: string;
  kind: DocumentChunkRow['kind'];
  sectionPath: string;
  chapter: string;
  region: string;
  pageStart: number;
  pageEnd: number;
  content: string;
}

export interface Citation {
  label: string;
  chunkId: string;
  kind: string;
  sectionPath: string;
  pages: string;
  excerpt: string;
}

export interface TraceStep {
  step:
    | 'route'
    | 'retrieve'
    | 'rerank'
    | 'expand'
    | 'generate'
    | 'verify'
    | 'rewrite';
  detail: string;
}

/** Retrieval internals, returned only when the eval script asks for them. */
export interface RetrievalDebug {
  rerankMode: RerankMode;
  route: QuestionRoute;
  /** Candidate passages in fused order, before rerank. */
  candidates: string[];
  /** Passages kept by rerank, best first. */
  ranked: string[];
  /** Passages sent to the answer step, labelled C1, C2, ... */
  context: string[];
}

export interface DocumentAnswer {
  answer: string;
  answerable: boolean;
  citations: Citation[];
  unverifiedNumbers: string[];
  searchQuery: string;
  trace: TraceStep[];
  debug?: RetrievalDebug;
}

interface GraphState {
  documentId: string;
  question: string;
  history: GraphTurn[];
  strategy: DocumentStrategy;
  searchQuery: string;
  rerankMode: RerankMode;
  route: QuestionRoute | null;
  candidates: DocumentSearchHit[];
  hits: DocumentSearchHit[];
  context: ContextBlock[];
  rawAnswer: {
    answerable: boolean;
    answer: string;
    citations: string[];
  } | null;
  needsRewrite: boolean;
  rewrites: number;
  result: DocumentAnswer | null;
  trace: TraceStep[];
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

function parseJsonObject<T>(raw: string): T | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

function pageLabel(start: number, end: number) {
  return start === end ? `p.${start}` : `pp.${start}-${end}`;
}

function normalizeNumber(value: string) {
  return value.replace(/,/g, '').replace(/\.$/, '');
}

const model = () => getChatModel(0);

async function routeNode(state: GraphState): Promise<Partial<GraphState>> {
  // Only long reports carry chapter and region tags, so other shapes skip the lookup.
  const route: QuestionRoute =
    state.strategy === 'long_structured'
      ? await routeQuestion(state.documentId, state.question)
      : {
          chapter: null,
          region: null,
          reason: 'no chapters or regions in this document shape',
        };
  return {
    route,
    trace: [{ step: 'route', detail: route.reason }],
  };
}

async function retrieveNode(state: GraphState): Promise<Partial<GraphState>> {
  const query = state.searchQuery || state.question;
  const embedding = await embedQuery(query);
  const filter = {
    region: state.route?.region ?? null,
    chapter: state.route?.chapter ?? null,
  };
  const filtered = Boolean(filter.region || filter.chapter);

  let candidates = await searchDocumentChunks(
    state.documentId,
    query,
    embedding,
    RETRIEVE_COUNT,
    filter
  );
  const filteredCount = candidates.length;
  let widened = false;

  // A thin filtered result would hide the answer, so the whole document
  // joins in behind it.
  if (filtered && filteredCount < MIN_FILTERED_HITS) {
    const wider = await searchDocumentChunks(
      state.documentId,
      query,
      embedding,
      RETRIEVE_COUNT
    );
    const seen = new Set(candidates.map((hit) => hit.id));
    candidates = [
      ...candidates,
      ...wider.filter((hit) => !seen.has(hit.id)),
    ].slice(0, RETRIEVE_COUNT);
    widened = true;
  }

  const scope = filtered
    ? ` in ${[state.route?.region, state.route?.chapter].filter(Boolean).join(', ')}`
    : '';
  return {
    candidates,
    hits: candidates,
    trace: [
      {
        step: 'retrieve',
        detail: `${candidates.length} candidates via hybrid search${scope} for "${query}"${widened ? ` (filter kept ${filteredCount}, widened)` : ''}`,
      },
    ],
  };
}

async function rerankNode(state: GraphState): Promise<Partial<GraphState>> {
  const result = await rerank(state.question, state.candidates, {
    mode: state.rerankMode,
  });
  return {
    hits: result.hits,
    trace: [
      {
        step: 'rerank',
        detail: `${result.mode}: ${result.detail}`,
      },
    ],
  };
}

/**
 * Long reports: the answer step reads the parent section of each reranked
 * child, in rank order, each parent once. Children are searched, parents are
 * read, and neighbouring windows are not added.
 */
async function expandToParents(
  hits: DocumentSearchHit[]
): Promise<ContextBlock[]> {
  const parentIds = [
    ...new Set(
      hits.map((hit) => hit.parent_id).filter((id): id is string => Boolean(id))
    ),
  ];
  const parents = new Map(
    (await getDocumentChunksByIds(parentIds)).map((row) => [row.id, row])
  );

  const ordered: DocumentChunkRow[] = [];
  const seen = new Set<string>();
  for (const hit of hits) {
    const row = hit.parent_id ? parents.get(hit.parent_id) : hit;
    if (!row || seen.has(row.id)) continue;
    seen.add(row.id);
    ordered.push(row);
  }

  const context: ContextBlock[] = [];
  let used = 0;
  for (const row of ordered) {
    if (used + row.content.length > CONTEXT_CHAR_BUDGET && context.length > 0)
      break;
    used += row.content.length;
    context.push({
      label: `C${context.length + 1}`,
      chunkId: row.id,
      kind: row.kind,
      sectionPath: row.section_path,
      chapter: row.chapter ?? '',
      region: row.region ?? '',
      pageStart: row.page_start,
      pageEnd: row.page_end,
      content: row.content,
    });
  }
  return context;
}

async function expandNode(state: GraphState): Promise<Partial<GraphState>> {
  if (state.strategy === 'long_structured') {
    const context = await expandToParents(state.hits);
    const used = context.reduce((sum, block) => sum + block.content.length, 0);
    return {
      context,
      trace: [
        {
          step: 'expand',
          detail: `${context.length} parent sections in context (${used} chars)`,
        },
      ],
    };
  }

  const blocks = new Map<string, DocumentChunkRow>();
  const addRow = (row: DocumentChunkRow) => {
    if (!blocks.has(row.id)) blocks.set(row.id, row);
  };

  for (const hit of state.hits) addRow(hit);

  // Neighbouring windows give the answer step the sentence that follows a figure.
  const neighbourIndexes = new Set<number>();
  for (const hit of state.hits) {
    if (hit.kind === 'section') continue;
    neighbourIndexes.add(hit.chunk_index - 1);
    neighbourIndexes.add(hit.chunk_index + 1);
  }
  const neighbours = await getDocumentChunksByIndex(state.documentId, [
    ...neighbourIndexes,
  ]);
  for (const row of neighbours) {
    if (row.kind !== 'section') addRow(row);
  }

  // Section intros supply the chapter/section framing for text windows.
  const parentIds = [
    ...new Set(
      state.hits
        .map((hit) => hit.parent_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const parents = await getDocumentChunksByIds(parentIds);
  for (const parent of parents) addRow(parent);

  const ordered = [...blocks.values()].sort(
    (a, b) => a.page_start - b.page_start || a.chunk_index - b.chunk_index
  );
  // Hits first so they survive the budget; the rest fill in document order.
  const hitIds = new Set(state.hits.map((hit) => hit.id));
  const prioritized = [
    ...ordered.filter((row) => hitIds.has(row.id)),
    ...ordered.filter((row) => !hitIds.has(row.id)),
  ];

  const context: ContextBlock[] = [];
  let used = 0;
  for (const row of prioritized) {
    if (used + row.content.length > CONTEXT_CHAR_BUDGET && context.length > 0)
      break;
    used += row.content.length;
    context.push({
      label: `C${context.length + 1}`,
      chunkId: row.id,
      kind: row.kind,
      sectionPath: row.section_path,
      chapter: row.chapter ?? '',
      region: row.region ?? '',
      pageStart: row.page_start,
      pageEnd: row.page_end,
      content: row.content,
    });
  }

  return {
    context,
    trace: [
      {
        step: 'expand',
        detail: `${context.length} passages in context (${used} chars)`,
      },
    ],
  };
}

async function generateNode(state: GraphState): Promise<Partial<GraphState>> {
  const contextText = state.context
    .map((block) => {
      const place = [block.chapter, block.region].filter(Boolean).join(', ');
      return `[${block.label}] (${block.kind}, ${pageLabel(block.pageStart, block.pageEnd)}, ${block.sectionPath || 'no section'}${place ? `, ${place}` : ''})\n${block.content}`;
    })
    .join('\n\n');

  const historyText = state.history
    .slice(-4)
    .map((turn) => `${turn.role}: ${turn.content.slice(0, 600)}`)
    .join('\n');

  const response = await model().invoke([
    new SystemMessage(
      `You answer questions about one document using only the numbered passages.
Rules:
- Use only facts stated in the passages. If they do not contain the answer, set "answerable" to false.
- Copy figures exactly as written, with their units and year.
- Cite the passage labels you used in "citations", e.g. ["C1","C3"].
- Respond with a single JSON object: {"answerable": boolean, "answer": string, "citations": string[]}.`
    ),
    new HumanMessage(
      `${historyText ? `Earlier conversation:\n${historyText}\n\n` : ''}Passages:\n${contextText}\n\nQuestion: ${state.question}`
    ),
  ]);

  const parsed = parseJsonObject<{
    answerable?: boolean;
    answer?: string;
    citations?: string[];
  }>(text(response.content));

  return {
    rawAnswer: {
      answerable: parsed?.answerable !== false,
      answer: typeof parsed?.answer === 'string' ? parsed.answer : '',
      citations: Array.isArray(parsed?.citations)
        ? parsed.citations.map(String)
        : [],
    },
    trace: [
      {
        step: 'generate',
        detail: parsed ? 'structured answer' : 'unparseable answer',
      },
    ],
  };
}

async function verifyNode(state: GraphState): Promise<Partial<GraphState>> {
  const raw = state.rawAnswer ?? {
    answerable: false,
    answer: '',
    citations: [],
  };
  const byLabel = new Map(state.context.map((block) => [block.label, block]));
  const cited = raw.citations
    .map((label) => byLabel.get(label))
    .filter((block): block is ContextBlock => Boolean(block));

  const grounded =
    raw.answerable && cited.length > 0 && raw.answer.trim().length > 0;

  if (!grounded && state.rewrites < MAX_REWRITES) {
    return {
      needsRewrite: true,
      trace: [
        {
          step: 'verify',
          detail: 'not grounded, retrying with a rewritten query',
        },
      ],
    };
  }

  const citedText = cited
    .map((block) => normalizeNumber(block.content))
    .join(' ');
  const numbers = [...new Set(raw.answer.match(/\d[\d,]*(\.\d+)?/g) ?? [])];
  const unverifiedNumbers = numbers.filter(
    (value) => !citedText.includes(normalizeNumber(value))
  );

  const citations: Citation[] = cited.map((block) => ({
    label: block.label,
    chunkId: block.chunkId,
    kind: block.kind,
    sectionPath: block.sectionPath,
    pages: pageLabel(block.pageStart, block.pageEnd),
    excerpt: block.content.slice(0, 280),
  }));

  const answered = grounded;
  const result: DocumentAnswer = {
    answer: answered
      ? raw.answer
      : 'The document does not contain enough information to answer this question.',
    answerable: answered,
    citations: answered ? citations : [],
    unverifiedNumbers,
    searchQuery: state.searchQuery || state.question,
    trace: state.trace,
  };

  return {
    needsRewrite: false,
    result,
    trace: [
      {
        step: 'verify',
        detail: answered
          ? `${citations.length} citations${unverifiedNumbers.length ? `, unverified: ${unverifiedNumbers.join(', ')}` : ''}`
          : 'abstained',
      },
    ],
  };
}

async function rewriteNode(state: GraphState): Promise<Partial<GraphState>> {
  let rewritten = state.question;
  try {
    const response = await model().invoke([
      new SystemMessage(
        'Rewrite the question as a short keyword query for searching a document: keep names, numbers, units and section titles, drop filler words. Respond with the query only.'
      ),
      new HumanMessage(state.question),
    ]);
    const candidate = text(response.content).trim().split('\n')[0];
    if (candidate) rewritten = candidate.slice(0, 200);
  } catch {
    // Keep the original question when rewriting fails.
  }
  return {
    searchQuery: rewritten,
    rewrites: state.rewrites + 1,
    trace: [{ step: 'rewrite', detail: `"${rewritten}"` }],
  };
}

const channel = <T>(initial: () => T) => ({
  reducer: (_: T, next: T) => next,
  default: initial,
});
const appendChannel = <T>() => ({
  reducer: (current: T[], next: T[]) => [...current, ...next],
  default: () => [] as T[],
});

const graph = new StateGraph<GraphState>({
  channels: {
    documentId: channel(() => ''),
    question: channel(() => ''),
    history: channel<GraphTurn[]>(() => []),
    strategy: channel<DocumentStrategy>(() => 'narrative'),
    searchQuery: channel(() => ''),
    rerankMode: channel<RerankMode>(() => 'llm'),
    route: channel<QuestionRoute | null>(() => null),
    candidates: channel<DocumentSearchHit[]>(() => []),
    hits: channel<DocumentSearchHit[]>(() => []),
    context: channel<ContextBlock[]>(() => []),
    rawAnswer: channel<GraphState['rawAnswer']>(() => null),
    needsRewrite: channel(() => false),
    rewrites: channel(() => 0),
    result: channel<DocumentAnswer | null>(() => null),
    trace: appendChannel<TraceStep>(),
  },
})
  .addNode('plan', routeNode)
  .addNode('retrieve', retrieveNode)
  .addNode('rerank', rerankNode)
  .addNode('expand', expandNode)
  .addNode('generate', generateNode)
  .addNode('verify', verifyNode)
  .addNode('rewrite', rewriteNode)
  .addEdge(START, 'plan')
  .addEdge('plan', 'retrieve')
  .addEdge('retrieve', 'rerank')
  .addEdge('rerank', 'expand')
  .addEdge('expand', 'generate')
  .addEdge('generate', 'verify')
  .addConditionalEdges('verify', (state: GraphState) =>
    state.needsRewrite ? 'rewrite' : END
  )
  .addEdge('rewrite', 'retrieve');

const compiled = graph.compile();

export async function answerDocumentQuestion(input: {
  documentId: string;
  question: string;
  history?: GraphTurn[];
  /** The document's shape; decides routing, rerank default and expansion. */
  strategy?: DocumentStrategy;
  /** Overrides the strategy's rerank default; the eval script uses this to compare rerankers. */
  rerankMode?: RerankMode;
  includeDebug?: boolean;
}): Promise<DocumentAnswer> {
  const strategy = input.strategy ?? 'narrative';
  const final = (await compiled.invoke({
    documentId: input.documentId,
    question: input.question,
    history: input.history ?? [],
    strategy,
    searchQuery: '',
    rerankMode: input.rerankMode ?? configuredRerankMode(strategy),
    rewrites: 0,
  })) as GraphState;

  if (!final.result) {
    throw new Error('Document answer pipeline produced no result');
  }

  const debug: RetrievalDebug | undefined =
    input.includeDebug && final.route
      ? {
          rerankMode: final.rerankMode,
          route: final.route,
          candidates: final.candidates.map((hit) => hit.content),
          ranked: final.hits.map((hit) => hit.content),
          context: final.context.map((block) => block.content),
        }
      : undefined;

  return { ...final.result, trace: final.trace, debug };
}
