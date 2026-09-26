import { NextRequest, NextResponse } from 'next/server';
import {
  getFullResumeById,
  getAssessmentsByCandidate,
  getJobById,
} from '@/lib/db';
import { createServiceClient } from '@/lib/supabase/server';
import { calculateCandidateScore } from '@/lib/scoring';
import { generateJobHash, jobHashesMatch } from '@/lib/job-hash';

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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { action } = body;

    if (action !== 'rescore') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const client = createServiceClient();

    const { data: candidate, error: candidateError } = await client
      .from('candidates')
      .select('full_text, job_id, score, job_hash')
      .eq('id', id)
      .single();

    if (candidateError) throw candidateError;
    if (!candidate) {
      return NextResponse.json(
        { error: 'Candidate not found' },
        { status: 404 }
      );
    }

    if (!candidate.job_id) {
      return NextResponse.json(
        { error: 'Candidate not associated with a job' },
        { status: 400 }
      );
    }

    const job = await getJobById(candidate.job_id, false);
    if (!job) {
      return NextResponse.json(
        { error: 'Associated job not found' },
        { status: 404 }
      );
    }

    const currentJobHash = generateJobHash({
      description: job.description,
      experience: job.experience,
      skills: job.skills,
    });

    if (
      candidate.score !== null &&
      jobHashesMatch(candidate.job_hash, currentJobHash)
    ) {
      return NextResponse.json(
        {
          error: 'Score is already current',
          score: candidate.score,
          upToDate: true,
        },
        { status: 400 }
      );
    }

    const score = await calculateCandidateScore({
      resumeText: candidate.full_text || '',
      jobDescription: job.description || '',
      jobExperience: job.experience || '',
      jobSkills: job.skills || [],
    });

    if (score === null) {
      return NextResponse.json(
        { error: 'Failed to calculate score' },
        { status: 500 }
      );
    }

    const { error: updateError } = await client
      .from('candidates')
      .update({ score, job_hash: currentJobHash })
      .eq('id', id);

    if (updateError) throw updateError;

    return NextResponse.json({ score, updated: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to rescore candidate',
      },
      { status: 500 }
    );
  }
}
