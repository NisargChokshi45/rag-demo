import { NextRequest, NextResponse } from 'next/server';
import { validateAuth } from '@/lib/auth';
import { countPendingDocumentChunks, getDocumentById } from '@/lib/db';

export async function GET(
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
    const pending =
      document.status === 'ready' ? 0 : await countPendingDocumentChunks(id);
    return NextResponse.json({ document, pendingChunks: pending });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to load document',
      },
      { status: 500 }
    );
  }
}
