import { NextRequest, NextResponse } from 'next/server';
import { validateAuth } from '@/lib/auth';
import {
  countPendingDocumentChunks,
  getDocumentById,
  listDocumentChunks,
} from '@/lib/db';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await validateAuth();
  if (authError) return authError;

  const { id } = await params;
  const view = request.nextUrl.searchParams.get('view');
  try {
    const document = await getDocumentById(id);
    if (!document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    if (view === 'pdf') {
      const { data, error } = await createServiceClient()
        .storage.from('documents')
        .createSignedUrl(document.storage_path, 3600);
      if (error) throw error;
      return NextResponse.json({ pdfUrl: data.signedUrl });
    }

    if (view === 'parsed') {
      return NextResponse.json({
        chunks: await listDocumentChunks(id),
      });
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
