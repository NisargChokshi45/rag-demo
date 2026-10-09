import { createServiceClient } from '@/lib/supabase/server';
import { embedDocument, EMBEDDING_DIMENSIONS } from '@/lib/embeddings';
import {
  countPendingDocumentChunks,
  createDocument,
  getPendingDocumentChunks,
  insertDocumentChunks,
  setDocumentChunkEmbedding,
  setDocumentStatus,
  type DocumentRecord,
} from '@/lib/db';
import { chunkBlocks, type ChunkDraft, type DocumentStrategy } from './chunk';
import { extractLayout } from './layout';
import { buildBlocks } from './structure';

/**
 * Two phases, both driven by the upload flow:
 *  1. createDocumentFromStorage: download the PDF, parse it into layout-aware
 *     blocks, chunk with the chosen strategy and store the chunk rows.
 *  2. embedPendingChunks: embed stored chunks sequentially (rate-limit safe)
 *     until a time budget is spent. The caller repeats the call until the
 *     document reports ready, so large documents never exceed one request.
 */

const EMBED_BATCH = 16;
const EMBED_BACKOFF_MS = [1000, 2000, 4000];

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function titleFromPath(storagePath: string) {
  const filename = storagePath.split('/').pop() || storagePath;
  return filename
    .replace(/^\d+-/, '')
    .replace(/\.pdf$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();
}

export async function parseDocumentBuffer(
  buffer: Buffer,
  strategy: DocumentStrategy
) {
  const layout = await extractLayout(new Uint8Array(buffer));
  const blocks = buildBlocks(layout);
  const drafts = chunkBlocks(blocks, strategy);
  return { pageCount: layout.pageCount, drafts };
}

export async function createDocumentFromStorage(input: {
  storagePath: string;
  strategy: DocumentStrategy;
  title?: string;
  userId?: string | null;
}): Promise<DocumentRecord> {
  const client = createServiceClient();
  const { data, error } = await client.storage
    .from('documents')
    .download(input.storagePath);
  if (error) throw new Error(`Failed to download PDF: ${error.message}`);

  const buffer = Buffer.from(await data.arrayBuffer());
  const { pageCount, drafts } = await parseDocumentBuffer(
    buffer,
    input.strategy
  );
  if (drafts.length === 0) {
    throw new Error('PDF did not contain extractable text');
  }

  const record = await createDocument({
    title: input.title?.trim() || titleFromPath(input.storagePath),
    storagePath: input.storagePath,
    strategy: input.strategy,
    pageCount,
    userId: input.userId,
  });

  try {
    await storeDrafts(record.id, drafts);
    await setDocumentStatus(record.id, 'embedding');
    return { ...record, status: 'embedding' };
  } catch (storeError) {
    const message =
      storeError instanceof Error
        ? storeError.message
        : 'Failed to store chunks';
    await setDocumentStatus(record.id, 'failed', message);
    throw storeError;
  }
}

async function storeDrafts(documentId: string, drafts: ChunkDraft[]) {
  // Sections go first so child rows can reference their parent id.
  const sectionRows = drafts
    .map((draft, index) => ({ draft, index }))
    .filter(({ draft }) => draft.kind === 'section');
  const childRows = drafts
    .map((draft, index) => ({ draft, index }))
    .filter(({ draft }) => draft.kind !== 'section');

  const sectionIds = new Map<number, string>();
  const sectionIdList = await insertDocumentChunks(
    documentId,
    sectionRows.map(({ draft, index }) => toRow(draft, index, null))
  );
  sectionRows.forEach(({ index }, position) => {
    sectionIds.set(index, sectionIdList[position]);
  });

  await insertDocumentChunks(
    documentId,
    childRows.map(({ draft, index }) =>
      toRow(
        draft,
        index,
        draft.parentIndex !== undefined
          ? (sectionIds.get(draft.parentIndex) ?? null)
          : null
      )
    )
  );
}

function toRow(draft: ChunkDraft, index: number, parentId: string | null) {
  return {
    parent_id: parentId,
    chunk_index: index,
    kind: draft.kind,
    section_path: draft.sectionPath,
    page_start: draft.pageStart,
    page_end: draft.pageEnd,
    content: draft.content,
  };
}

async function embedWithRetry(text: string): Promise<number[]> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= EMBED_BACKOFF_MS.length; attempt++) {
    try {
      const vector = await embedDocument(text);
      if (vector.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(`Expected ${EMBEDDING_DIMENSIONS} dimensions`);
      }
      return vector;
    } catch (error) {
      lastError = error;
      if (attempt < EMBED_BACKOFF_MS.length) {
        await delay(EMBED_BACKOFF_MS[attempt]);
      }
    }
  }
  throw lastError;
}

export interface EmbedProgress {
  status: 'embedding' | 'ready';
  remaining: number;
}

export async function embedPendingChunks(
  documentId: string,
  budgetMs: number
): Promise<EmbedProgress> {
  const started = Date.now();

  while (Date.now() - started < budgetMs) {
    const pending = await getPendingDocumentChunks(documentId, EMBED_BATCH);
    if (pending.length === 0) break;

    for (const chunk of pending) {
      const label = chunk.section_path
        ? `${chunk.section_path}\n${chunk.content}`
        : chunk.content;
      const vector = await embedWithRetry(label);
      await setDocumentChunkEmbedding(chunk.id, vector);
      if (Date.now() - started >= budgetMs) break;
    }
  }

  const remaining = await countPendingDocumentChunks(documentId);
  if (remaining === 0) {
    await setDocumentStatus(documentId, 'ready');
    return { status: 'ready', remaining: 0 };
  }
  return { status: 'embedding', remaining };
}
