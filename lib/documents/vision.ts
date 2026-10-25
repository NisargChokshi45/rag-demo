import { PDFDocument } from 'pdf-lib';
import { createServiceClient } from '@/lib/supabase/server';
import {
  getChunkMetaForPage,
  getDocumentById,
  getDocumentFigures,
  figureChunkPages,
  insertDocumentChunks,
  upsertDocumentFigure,
} from '@/lib/db';

/**
 * Reads charts and figure values with a vision model. Each chart page is cut
 * out of the PDF and sent on its own, so the model sees the drawn bars and
 * labels rather than only the extracted text. The description becomes a
 * `figure` chunk, which is embedded like any other chunk.
 *
 * The pass is resumable: results are cached per page, so a re-parse adds the
 * chunks back without calling the model again, and each call works within a
 * time budget like the embedding loop.
 */

export const DEFAULT_VISION_MODEL = 'gemini-3.8-flash';
/** Each chart page is one model call, so the cap bounds cost per document. */
export const MAX_FIGURE_PAGES = Number(process.env.VISION_MAX_PAGES) || 60;
const FIGURE_INDEX_BASE = 100_000;
const VISION_BACKOFF_MS = [1000, 2000, 4000];

/**
 * Raised when Gemini rejects a vision call with a 429. The page is left
 * pending, so a later resume reads it. It is never cached as failed.
 */
export class VisionQuotaError extends Error {
  constructor() {
    super('Figure reading reached the Gemini quota. Resume later.');
    this.name = 'VisionQuotaError';
  }
}

const PROMPT = `This PDF is one page of a report. Describe every chart, graph or
figure on it so the values can be searched.
- Give the figure title and any caption or note, quoted as printed.
- For bar, stacked or line charts, list each category and series with the value shown for it, including units and year.
- Copy numbers exactly as printed. Do not estimate values that are not labelled.
- Plain text, one item per line, no preamble.
If the page has no chart or figure, reply with the single word NONE.`;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function visionModel() {
  return process.env.GEMINI_VISION_MODEL || DEFAULT_VISION_MODEL;
}

async function askVision(pagePdf: Uint8Array): Promise<string> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_API_KEY is missing');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${visionModel()}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                inline_data: {
                  mime_type: 'application/pdf',
                  data: Buffer.from(pagePdf).toString('base64'),
                },
              },
              { text: PROMPT },
            ],
          },
        ],
        generationConfig: { temperature: 0, maxOutputTokens: 2048 },
      }),
    }
  );

  if (!response.ok) {
    const details = await response.text();
    if (response.status === 429) throw new VisionQuotaError();
    throw new Error(`Gemini vision failed (${response.status}): ${details}`);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return (payload.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? '')
    .join('')
    .trim();
}

export async function askVisionWithRetry(pagePdf: Uint8Array): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= VISION_BACKOFF_MS.length; attempt++) {
    try {
      return await askVision(pagePdf);
    } catch (error) {
      if (error instanceof VisionQuotaError) throw error;
      lastError = error;
      if (attempt < VISION_BACKOFF_MS.length) {
        await delay(VISION_BACKOFF_MS[attempt]);
      }
    }
  }
  throw lastError;
}

/** One-page PDF for a 1-based page number. */
export async function splitPage(
  source: PDFDocument,
  pageNumber: number
): Promise<Uint8Array> {
  const target = await PDFDocument.create();
  const [page] = await target.copyPages(source, [pageNumber - 1]);
  target.addPage(page);
  return target.save();
}

/**
 * Adds figure chunks for cached descriptions that have no chunk yet. A
 * re-parse deletes every chunk, so this restores the figure chunks from the
 * cache without another model call.
 */
async function restoreFigureChunks(documentId: string) {
  const cached = await getDocumentFigures(documentId);
  const present = await figureChunkPages(documentId);
  for (const [page, figure] of cached) {
    if (!figure.description || present.has(page)) continue;
    await insertFigureChunk(documentId, page, figure.description);
  }
}

async function insertFigureChunk(
  documentId: string,
  page: number,
  description: string
) {
  const meta = await getChunkMetaForPage(documentId, page);
  await insertDocumentChunks(documentId, [
    {
      parent_id: null,
      chunk_index: FIGURE_INDEX_BASE + page,
      kind: 'figure',
      section_path: meta?.section_path ?? '',
      chapter: meta?.chapter ?? '',
      region: meta?.region ?? '',
      page_start: page,
      page_end: page,
      content: `Figure values on page ${page}:\n${description}`,
    },
  ]);
}

/**
 * Describes the chart pages that are not cached yet, within a time budget.
 * Returns how many chart pages are still waiting, so the caller does not
 * mark the document ready too early.
 */
export async function describePendingFigures(
  documentId: string,
  budgetMs: number
): Promise<number> {
  const document = await getDocumentById(documentId);
  if (!document) return 0;
  const pages = (document.visual_pages ?? []).slice(0, MAX_FIGURE_PAGES);
  if (pages.length === 0) return 0;

  await restoreFigureChunks(documentId);
  const cached = await getDocumentFigures(documentId);
  const pending = pages.filter((page) => !cached.has(page));
  if (pending.length === 0) return 0;

  const started = Date.now();
  let source: PDFDocument;
  try {
    const client = createServiceClient();
    const { data, error } = await client.storage
      .from('documents')
      .download(document.storage_path);
    if (error) throw new Error(`Failed to download PDF: ${error.message}`);
    source = await PDFDocument.load(new Uint8Array(await data.arrayBuffer()), {
      ignoreEncryption: true,
    });
  } catch (error) {
    // Figures are optional, so an unreadable copy for pdf-lib never stops the
    // document from becoming ready.
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Figure reading skipped: ${message}`);
    return 0;
  }

  let remaining = [...pending];
  for (const page of pending) {
    if (Date.now() - started >= budgetMs) break;
    let answer: string;
    try {
      const pagePdf = await splitPage(source, page);
      answer = (await askVisionWithRetry(pagePdf)).trim();
    } catch (error) {
      // A quota error is not a page problem, so the page stays pending.
      if (error instanceof VisionQuotaError) throw error;
      // Figures are best effort: a page that keeps failing is recorded with a
      // marker and does not hold the document back from ready.
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Figure reading failed on page ${page}: ${message}`);
      await upsertDocumentFigure({
        documentId,
        page,
        description: '',
        model: `${visionModel()} (failed)`,
      });
      remaining = remaining.filter((candidate) => candidate !== page);
      continue;
    }
    const description = /^NONE\b/i.test(answer) ? '' : answer;

    await upsertDocumentFigure({
      documentId,
      page,
      description,
      model: visionModel(),
    });
    if (description) await insertFigureChunk(documentId, page, description);
    remaining = remaining.filter((candidate) => candidate !== page);
  }
  return remaining.length;
}
