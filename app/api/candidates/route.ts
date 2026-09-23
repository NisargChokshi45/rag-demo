import { NextRequest, NextResponse } from 'next/server';
import { listCandidates } from '@/lib/db';

export async function GET(_request: NextRequest) {
  try {
    const candidates = await listCandidates();

    return NextResponse.json({
      candidates,
      count: candidates.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
