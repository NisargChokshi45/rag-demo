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

/**
 * LangGraph answer pipeline for one document:
 *
 *   retrieve → rerank → expand → generate → verify → END
 *                  ▲                              │ (not grounded, first try)
 *                  └──────── retrieve ◀── rewrite ┘
 *
 * Retrieval is hybrid (vector + keyword, see search_document_chunks). The LLM
 * rerank and the answer step use the shared Groq chat model. Verification
 * rejects citations outside the retrieved context and flags numbers that
 * never appear in the cited passages.
 */

const RERANK_KEEP = 6;
const RETRIEVE_COUNT = 20;
const CONTEXT_CHAR_BUDGET = 14000;
const PASSAGE_PREVIEW = 500;
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
  step: 'retrieve' | 'rerank' | 'expand' | 'generate' | 'verify' | 'rewrite';
  detail: string;
}

export interface DocumentAnswer {
  answer: string;
  answerable: boolean;
  citations: Citation[];
  unverifiedNumbers: string[];
  searchQuery: string;
  trace: TraceStep[];
}

interface GraphState {
  documentId: string;
  question: string;
  history: GraphTurn[];
  searchQuery: string;
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

function parseJsonArray(raw: string): number[] | null {
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

function pageLabel(start: number, end: number) {
  return start === end ? `p.${start}` : `pp.${start}-${end}`;
}

function normalizeNumber(value: string) {
  return value.replace(/,/g, '').replace(/\.$/, '');
}

const model = () => getChatModel(0);

async function retrieveNode(state: GraphState): Promise<Partial<GraphState>> {
  const query = state.searchQuery || state.question;
  const embedding = await embedQuery(query);
  const hits = await searchDocumentChunks(
    state.documentId,
    query,
    embedding,
    RETRIEVE_COUNT
  );
  return {
    hits,
    trace: [
      {
        step: 'retrieve',
        detail: `${hits.length} candidates via hybrid search for "${query}"`,
      },
    ],
  };
}

async function rerankNode(state: GraphState): Promise<Partial<GraphState>> {
  if (state.hits.length <= RERANK_KEEP) {
    return {
      hits: state.hits,
      trace: [{ step: 'rerank', detail: 'kept all candidates' }],
    };
  }

  const listing = state.hits
    .map((hit, index) => {
      const preview = hit.content
        .slice(0, PASSAGE_PREVIEW)
        .replace(/\s+/g, ' ');
      return `[${index}] (${hit.kind}, ${pageLabel(hit.page_start, hit.page_end)}, ${hit.section_path || 'no section'}) ${preview}`;
    })
    .join('\n');

  let ranked: number[] | null = null;
  try {
    const response = await model().invoke([
      new SystemMessage(
        `You rank document passages for a question. Return only a JSON array of the ${RERANK_KEEP} passage numbers most likely to contain the answer, most relevant first. Prefer passages with the exact figures or facts asked for.`
      ),
      new HumanMessage(`Question: ${state.question}\n\nPassages:\n${listing}`),
    ]);
    ranked = parseJsonArray(text(response.content));
  } catch {
    ranked = null;
  }

  const chosen = (ranked ?? [])
    .filter(
      (index, position, all) =>
        index >= 0 &&
        index < state.hits.length &&
        all.indexOf(index) === position
    )
    .slice(0, RERANK_KEEP);
  const fallback = state.hits.slice(0, RERANK_KEEP).map((_, index) => index);
  const order = chosen.length > 0 ? chosen : fallback;

  return {
    hits: order.map((index) => state.hits[index]),
    trace: [
      {
        step: 'rerank',
        detail: ranked
          ? `LLM kept ${order.length} of ${state.hits.length}`
          : `fallback to fused order, kept ${order.length}`,
      },
    ],
  };
}

async function expandNode(state: GraphState): Promise<Partial<GraphState>> {
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
    .map(
      (block) =>
        `[${block.label}] (${block.kind}, ${pageLabel(block.pageStart, block.pageEnd)}, ${block.sectionPath || 'no section'})\n${block.content}`
    )
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
    searchQuery: channel(() => ''),
    hits: channel<DocumentSearchHit[]>(() => []),
    context: channel<ContextBlock[]>(() => []),
    rawAnswer: channel<GraphState['rawAnswer']>(() => null),
    needsRewrite: channel(() => false),
    rewrites: channel(() => 0),
    result: channel<DocumentAnswer | null>(() => null),
    trace: appendChannel<TraceStep>(),
  },
})
  .addNode('retrieve', retrieveNode)
  .addNode('rerank', rerankNode)
  .addNode('expand', expandNode)
  .addNode('generate', generateNode)
  .addNode('verify', verifyNode)
  .addNode('rewrite', rewriteNode)
  .addEdge(START, 'retrieve')
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
}): Promise<DocumentAnswer> {
  const final = (await compiled.invoke({
    documentId: input.documentId,
    question: input.question,
    history: input.history ?? [],
    searchQuery: '',
    rewrites: 0,
  })) as GraphState;

  if (!final.result) {
    throw new Error('Document answer pipeline produced no result');
  }
  return { ...final.result, trace: final.trace };
}
