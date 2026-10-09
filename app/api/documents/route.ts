export const maxDuration = 300;
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { validateAuth, getUserId } from '@/lib/auth';
import { listDocuments } from '@/lib/db';
import { validateEnv, getMissingEnvMessage } from '@/lib/env';
import {
  DOCUMENT_STRATEGIES,
  type DocumentStrategy,
} from '@/lib/documents/chunk';
import { createDocumentFromStorage } from '@/lib/documents/ingest';

export async function GET() {
  const authError = await validateAuth();
  if (authError) return authError;

  try {
    const documents = await listDocuments();
    return NextResponse.json({ documents });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to list documents',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const authError = await validateAuth();
  if (authError) return authError;

  const envCheck = validateEnv('server');
  if (!envCheck.valid) {
    return NextResponse.json(
      { error: getMissingEnvMessage(envCheck.missing) },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { storagePath, strategy, title } = body as {
      storagePath?: string;
      strategy?: string;
      title?: string;
    };

    if (!storagePath) {
      return NextResponse.json(
        { error: 'storagePath is required' },
        { status: 400 }
      );
    }
    if (!DOCUMENT_STRATEGIES.includes(strategy as DocumentStrategy)) {
      return NextResponse.json(
        { error: `strategy must be one of: ${DOCUMENT_STRATEGIES.join(', ')}` },
        { status: 400 }
      );
    }

    const document = await createDocumentFromStorage({
      storagePath,
      strategy: strategy as DocumentStrategy,
      title,
      userId: await getUserId(),
    });
    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to create document',
      },
      { status: 422 }
    );
  }
}
