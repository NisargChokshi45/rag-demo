import { createServiceClient } from '@/lib/supabase/server';
import { embedDocument, EMBEDDING_DIMENSIONS } from '@/lib/embeddings';
import {
  countPendingDocumentChunks,
  createDocument,
  deleteDocumentChunks,
  deleteDocumentRecord,
  getDocumentById,
  getPendingDocumentChunks,
  insertDocumentChunks,
  listDocumentChunks,
  setDocumentChunkEmbedding,
  setDocumentStatus,
  setDocumentVisualPages,
  updateDocumentChunkMetadata,
  type DocumentRecord,
} from '@/lib/db';
import { chunkBlocks, type ChunkDraft, type DocumentStrategy } from './chunk';
import { extractLayout } from './layout';
import { buildBlocks } from './structure';
import { describePendingFigures } from './vision';

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
  const layout = await extractLayout(new Uint8Array(buffer), {
    richNotes: strategy === 'element_rich',
  });
  const blocks = buildBlocks(layout, {
    richNotes: strategy === 'element_rich',
  });
  const drafts = chunkBlocks(blocks, strategy);
  return {
    pageCount: layout.pageCount,
    drafts,
    visualPages: layout.visualPages,
  };
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
  const { pageCount, drafts, visualPages } = await parseDocumentBuffer(
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
    await setDocumentVisualPages(record.id, visualPages);
    await storeDrafts(record.id, drafts);
    await setDocumentStatus(record.id, 'embedding');
    return { ...record, status: 'embedding' };
  } catch (storeError) {
    // Partial chunks would be embedded as if the document were complete, so
    // the row is removed rather than kept as a retryable 'failed' document.
    await deleteDocumentRecord(record.id).catch(() => undefined);
    throw storeError;
  }
}

/**
 * Re-parses a stored PDF with the document's current strategy and replaces its
 * chunks. The PDF is parsed before anything is deleted, so a parse failure
 * leaves the existing chunks in place. The caller then runs embedPendingChunks
 * until the document reports ready.
 */
export async function reparseDocument(documentId: string): Promise<void> {
  const document = await getDocumentById(documentId);
  if (!document) throw new Error('Document not found');

  const client = createServiceClient();
  const { data, error } = await client.storage
    .from('documents')
    .download(document.storage_path);
  if (error) throw new Error(`Failed to download PDF: ${error.message}`);

  const buffer = Buffer.from(await data.arrayBuffer());
  const { drafts, visualPages } = await parseDocumentBuffer(
    buffer,
    document.strategy
  );
  if (drafts.length === 0) {
    throw new Error('PDF did not contain extractable text');
  }

  try {
    await setDocumentVisualPages(documentId, visualPages);
    await deleteDocumentChunks(documentId);
    await storeDrafts(documentId, drafts);
    await setDocumentStatus(documentId, 'embedding');
  } catch (storeError) {
    const message =
      storeError instanceof Error ? storeError.message : 'Re-parse failed';
    await setDocumentStatus(documentId, 'failed', message).catch(
      () => undefined
    );
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
    chapter: draft.chapter ?? '',
    region: draft.region ?? '',
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

  // Chart pages are read first, so their figure chunks are embedded below.
  const figuresLeft = await describePendingFigures(
    documentId,
    Math.floor(budgetMs / 2)
  );

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
  if (remaining === 0 && figuresLeft === 0) {
    await setDocumentStatus(documentId, 'ready');
    return { status: 'ready', remaining: 0 };
  }
  return { status: 'embedding', remaining: remaining + figuresLeft };
}

export interface MetadataRefresh {
  updated: number;
  unchanged: number;
  /** Chunks whose text no longer matches the PDF; these need a full re-parse. */
  mismatched: number;
}

/**
 * Sets chapter and region on stored chunks without re-embedding. A chunk is
 * updated only when its text still matches the current parse, so chunks whose
 * text changed are reported and left for a full re-parse.
 */
export async function refreshChunkMetadata(
  documentId: string
): Promise<MetadataRefresh> {
  const document = await getDocumentById(documentId);
  if (!document) throw new Error('Document not found');

  const client = createServiceClient();
  const { data, error } = await client.storage
    .from('documents')
    .download(document.storage_path);
  if (error) throw new Error(`Failed to download PDF: ${error.message}`);

  const buffer = Buffer.from(await data.arrayBuffer());
  const { drafts, visualPages } = await parseDocumentBuffer(
    buffer,
    document.strategy
  );
  const stored = new Map(
    (await listDocumentChunks(documentId)).map((row) => [row.chunk_index, row])
  );

  const result: MetadataRefresh = { updated: 0, unchanged: 0, mismatched: 0 };
  for (const [index, draft] of drafts.entries()) {
    const row = stored.get(index);
    if (!row || row.content !== draft.content) {
      result.mismatched += 1;
      continue;
    }
    const chapter = draft.chapter ?? '';
    const region = draft.region ?? '';
    if (row.chapter === chapter && row.region === region) {
      result.unchanged += 1;
      continue;
    }
    await updateDocumentChunkMetadata(row.id, chapter, region);
    result.updated += 1;
  }

  await setDocumentVisualPages(documentId, visualPages);
  return result;
}
