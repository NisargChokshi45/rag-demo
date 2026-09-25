import { NextRequest, NextResponse } from 'next/server';
import { getFullResumeById, getAssessmentsByCandidate } from '@/lib/db';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const view = request.nextUrl.searchParams.get('view');

    if (view === 'assessment') {
      return NextResponse.json({
        assessments: await getAssessmentsByCandidate(id),
      });
    }

    const client = createServiceClient();
    const { data: candidate, error: candidateError } = await client
      .from('candidates')
      .select('storage_path')
      .eq('id', id)
      .single();

    if (candidateError) throw candidateError;

    const { data: signedUrl, error: signedUrlError } = await client.storage
      .from('resumes')
      .createSignedUrl(candidate.storage_path, 3600);

    if (signedUrlError) throw signedUrlError;

    const resume = await getFullResumeById(id);
    return NextResponse.json({ resume, pdfUrl: signedUrl.signedUrl });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unable to load resume',
      },
      { status: 500 }
    );
  }
}
