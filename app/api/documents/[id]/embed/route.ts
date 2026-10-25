export const maxDuration = 300;
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { validateAuth } from '@/lib/auth';
import {
  countDocumentChunks,
  getDocumentById,
  setDocumentStatus,
} from '@/lib/db';
import { embedPendingChunks } from '@/lib/documents/ingest';
import { EmbeddingQuotaError } from '@/lib/embeddings';

// Stay well inside maxDuration so the response always reaches the client.
const EMBED_BUDGET_MS = 200_000;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await validateAuth();
  if (authError) return authError;

  const { id } = await params;
  try {
    const document = await getDocumentById(id);
    if (!document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }
    if (document.status === 'ready') {
      return NextResponse.json({ status: 'ready', remaining: 0 });
    }
    if (document.status === 'processing') {
      // Parsing never finished, so chunks may be missing. Only Re-parse can
      // rebuild them; embedding now would mark a partial document ready.
      return NextResponse.json(
        { error: 'This document was not fully parsed. Re-parse it instead.' },
        { status: 409 }
      );
    }
    if (document.status === 'failed') {
      // Chunks are stored before embedding starts, so a paused document
      // resumes from its pending rows. With no stored chunks there is nothing
      // to resume, and marking it ready would leave it unsearchable.
      if ((await countDocumentChunks(id)) === 0) {
        return NextResponse.json(
          { error: 'This document has no stored text. Upload it again.' },
          { status: 409 }
        );
      }
      await setDocumentStatus(id, 'embedding');
    }

    const progress = await embedPendingChunks(id, EMBED_BUDGET_MS);
    return NextResponse.json(progress);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Embedding failed';
    const retryAt = error instanceof EmbeddingQuotaError ? error.retryAt : null;
    await setDocumentStatus(id, 'failed', message, retryAt).catch(
      () => undefined
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
