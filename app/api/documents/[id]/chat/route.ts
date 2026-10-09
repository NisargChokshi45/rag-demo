export const maxDuration = 300;
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { validateAuth } from '@/lib/auth';
import { getDocumentById } from '@/lib/db';
import { answerDocumentQuestion, type GraphTurn } from '@/lib/documents/graph';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await validateAuth();
  if (authError) return authError;

  const { id } = await params;
  try {
    const { question, history } = (await request.json()) as {
      question?: string;
      history?: GraphTurn[];
    };
    if (!question || !question.trim()) {
      return NextResponse.json(
        { error: 'question is required' },
        { status: 400 }
      );
    }

    const document = await getDocumentById(id);
    if (!document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }
    if (document.status !== 'ready') {
      return NextResponse.json(
        { error: 'Document is still being prepared', status: document.status },
        { status: 409 }
      );
    }

    const safeHistory = (history || []).filter(
      (turn) =>
        (turn.role === 'user' || turn.role === 'assistant') &&
        typeof turn.content === 'string' &&
        turn.content.trim().length > 0
    );
    const answer = await answerDocumentQuestion({
      documentId: id,
      question: question.trim(),
      history: safeHistory,
    });
    return NextResponse.json(answer);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Chat failed' },
      { status: 500 }
    );
  }
}
