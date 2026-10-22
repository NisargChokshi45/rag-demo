export const maxDuration = 300;
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { validateAuth } from '@/lib/auth';
import { refreshChunkMetadata, reparseDocument } from '@/lib/documents/ingest';

/**
 * Re-parses the stored PDF with the document's strategy and replaces its
 * chunks. The client then calls the embed route until the document is ready.
 *
 * With ?mode=metadata only chapter and region labels are refreshed on the
 * existing chunks. Nothing is re-embedded, so this costs no embedding quota.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await validateAuth();
  if (authError) return authError;

  const { id } = await params;
  const mode = request.nextUrl.searchParams.get('mode');
  try {
    if (mode === 'metadata') {
      const result = await refreshChunkMetadata(id);
      return NextResponse.json({ status: 'metadata', ...result });
    }
    await reparseDocument(id);
    return NextResponse.json({ status: 'embedding' });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Re-parse failed',
      },
      { status: 500 }
    );
  }
}
