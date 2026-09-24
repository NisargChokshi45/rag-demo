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

interface ScreeningMetadata {
  toolCalls?: Array<{
    toolName: string;
    toolInput: Record<string, unknown>;
  }>;
  [key: string]: unknown;
}

interface ToolCallRecord {
  toolName: string;
  toolInput: Record<string, unknown>;
  result?: unknown;
}

function responseText(report: ReportData): string {
  return [report.summary, report.reasoning, ...(report.context || [])]
    .filter(Boolean)
    .join('\n\n');
}

async function insertReportDetails(
  client: ReturnType<typeof createServiceClient>,
  screeningId: string,
  report: ReportData
) {
  for (const assessment of report.assessments) {
    const { data: assessmentData, error: assessmentError } = await client
      .from('screening_assessments')
      .insert({
        screening_id: screeningId,
        candidate_id: assessment.candidateId,
        score: assessment.score,
        evidence: assessment.evidence,
        unknowns: assessment.unknowns,
      })
      .select()
      .single();

    if (assessmentError) throw assessmentError;

    if (assessment.citations?.length) {
      const { error: citationError } = await client
        .from('screening_citations')
        .insert(
          assessment.citations.map((citation) => ({
            screening_id: screeningId,
            assessment_id: assessmentData.id,
            candidate_id: citation.candidateId,
            candidate_name: citation.candidateName,
            content: citation.content,
            tool: citation.tool,
          }))
        );

      if (citationError) throw citationError;
    }
  }
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
      status = report ? 'completed' : 'running',
      metadata = {},
      toolCalls = [],
    }: {
      jobId?: string;
      query: string;
      report?: ReportData;
      status?: 'running' | 'completed' | 'failed';
      metadata?: ScreeningMetadata;
      toolCalls?: ToolCallRecord[];
    } = body;

    if (!query) {
      return NextResponse.json(
        { error: 'Missing required field: query' },
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
        summary: report?.summary || null,
        report: report || null,
        reasoning: report?.reasoning || null,
        context: report?.context || null,
        status,
        response_text: report ? responseText(report) : null,
        metadata,
        tool_calls: toolCalls,
        completed_at: report ? new Date().toISOString() : null,
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

    if (report) await insertReportDetails(client, screening.id, report);

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
      .select(
        'id, query, summary, job_id, created_at, report, status, metadata, tool_calls'
      )
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
