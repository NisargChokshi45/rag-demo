export const maxDuration = 300;
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { validateAuth } from '@/lib/auth';
import { getDocumentById, setDocumentStatus } from '@/lib/db';
import { embedPendingChunks } from '@/lib/documents/ingest';

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
    if (document.status === 'failed') {
      return NextResponse.json(
        { error: document.error || 'Document failed to process' },
        { status: 409 }
      );
    }

    const progress = await embedPendingChunks(id, EMBED_BUDGET_MS);
    return NextResponse.json(progress);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Embedding failed';
    await setDocumentStatus(id, 'failed', message).catch(() => undefined);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
