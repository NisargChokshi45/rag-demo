import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getUserId } from '@/lib/auth';
import { FEATURE_FLAGS } from '@/lib/config';

interface ReportData {
  query: string;
  assessments: Array<{
    candidateId: string;
    candidateName: string;
    score: number;
    evidence: string[];
    unknowns: string[];
    citations?: Array<{
      candidateId: string;
      candidateName: string;
      content: string;
      tool: 'search_chunks' | 'get_full_resume';
    }>;
  }>;
  summary: string;
  reasoning?: string;
  context?: string[];
}

// POST /api/screenings - Save a new screening session
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId();

    // If auth is enabled, userId is required; if disabled, userId will be null
    const body = await request.json();
    const {
      jobId,
      query,
      report,
    }: {
      jobId?: string;
      query: string;
      report: ReportData;
    } = body;

    if (!query || !report) {
      return NextResponse.json(
        { error: 'Missing required fields: query, report' },
        { status: 400 }
      );
    }

    const client = createServiceClient();

    // Insert the screening session
    const { data: screening, error: screeningError } = await client
      .from('screenings')
      .insert({
        user_id: userId,
        job_id: jobId || null,
        query,
        summary: report.summary,
        report,
        reasoning: report.reasoning,
        context: report.context,
      })
      .select()
      .single();

    if (screeningError) {
      console.error('Screening insert error:', screeningError);
      return NextResponse.json(
        { error: 'Failed to save screening' },
        { status: 500 }
      );
    }

    // Insert assessments and citations
    for (const assessment of report.assessments) {
      const { data: assessmentData, error: assessmentError } = await client
        .from('screening_assessments')
        .insert({
          screening_id: screening.id,
          candidate_id: assessment.candidateId,
          score: assessment.score,
          evidence: assessment.evidence,
          unknowns: assessment.unknowns,
        })
        .select()
        .single();

      if (assessmentError) {
        console.error('Assessment insert error:', assessmentError);
        continue;
      }

      // Insert citations if they exist
      if (assessment.citations && assessment.citations.length > 0) {
        const citations = assessment.citations.map((citation) => ({
          screening_id: screening.id,
          assessment_id: assessmentData.id,
          candidate_id: citation.candidateId,
          candidate_name: citation.candidateName,
          content: citation.content,
          tool: citation.tool,
        }));

        const { error: citationError } = await client
          .from('screening_citations')
          .insert(citations);

        if (citationError) {
          console.error('Citation insert error:', citationError);
        }
      }
    }

    return NextResponse.json({
      success: true,
      screeningId: screening.id,
    });
  } catch (error) {
    console.error('Error saving screening:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET /api/screenings - Get screening history
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId();
    const limit = request.nextUrl.searchParams.get('limit') || '50';
    const offset = request.nextUrl.searchParams.get('offset') || '0';

    const client = createServiceClient();

    let query = client
      .from('screenings')
      .select('id, query, summary, job_id, created_at, report')
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    // If user auth is enabled and user exists, filter by user_id
    if (FEATURE_FLAGS.AUTH_ENABLED && userId) {
      query = query.eq('user_id', userId);
    }

    const { data: screenings, error } = await query;

    if (error) {
      console.error('Screenings fetch error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch screenings' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      screenings: screenings || [],
      total: screenings?.length || 0,
    });
  } catch (error) {
    console.error('Error fetching screenings:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
