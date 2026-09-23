import { NextRequest, NextResponse } from 'next/server';
import { getFullResumeById, getAssessmentsByCandidate } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const resume = await getFullResumeById(id);
    const assessments = await getAssessmentsByCandidate(id);
    return NextResponse.json({ resume, assessments });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unable to load resume',
      },
      { status: 500 }
    );
  }
}
