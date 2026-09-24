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

// GET /api/screenings/:id - Get a specific screening with all details
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = await getUserId();
    const client = createServiceClient();

    // Fetch screening with its assessments and citations
    const { data: screening, error } = await client
      .from('screenings')
      .select(
        `
        id,
        query,
        summary,
        job_id,
        created_at,
        report,
        status,
        response_text,
        metadata,
        completed_at,
        reasoning,
        context,
        user_id,
        screening_assessments(
          id,
          candidate_id,
          score,
          evidence,
          unknowns,
          screening_citations(
            id,
            candidate_id,
            candidate_name,
            content,
            tool
          )
        )
      `
      )
      .eq('id', id)
      .single();

    // If auth is enabled, verify user ownership
    if (
      !error &&
      screening &&
      FEATURE_FLAGS.AUTH_ENABLED &&
      userId &&
      screening.user_id !== userId
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    if (error || !screening) {
      return NextResponse.json(
        { error: 'Screening not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(screening);
  } catch (error) {
    console.error('Error fetching screening:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH /api/screenings/:id - Finalize a session after the agent stream ends
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      report?: ReportData;
      status?: 'running' | 'completed' | 'failed';
      metadata?: Record<string, unknown>;
      responseText?: string;
    };
    const client = createServiceClient();
    const { data: screening, error: screeningError } = await client
      .from('screenings')
      .select('id, user_id')
      .eq('id', id)
      .single();

    if (screeningError || !screening) {
      return NextResponse.json(
        { error: 'Screening not found' },
        { status: 404 }
      );
    }

    const userId = await getUserId();
    if (FEATURE_FLAGS.AUTH_ENABLED && userId && screening.user_id !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const update = {
      ...(body.report
        ? {
            summary: body.report.summary,
            report: body.report,
            reasoning: body.report.reasoning || null,
            context: body.report.context || null,
            response_text:
              body.responseText ||
              [
                body.report.summary,
                body.report.reasoning,
                ...(body.report.context || []),
              ]
                .filter(Boolean)
                .join('\n\n'),
          }
        : {}),
      ...(body.status ? { status: body.status } : {}),
      ...(body.metadata ? { metadata: body.metadata } : {}),
      ...(body.status === 'completed'
        ? { completed_at: new Date().toISOString() }
        : {}),
    };

    const { error } = await client
      .from('screenings')
      .update(update)
      .eq('id', id);
    if (error) {
      console.error('Screening update error:', error);
      return NextResponse.json(
        { error: 'Failed to update screening' },
        { status: 500 }
      );
    }

    if (body.report) {
      await client
        .from('screening_assessments')
        .delete()
        .eq('screening_id', id);
      const assessmentRows = body.report.assessments.map((assessment) => ({
        screening_id: id,
        candidate_id: assessment.candidateId,
        score: assessment.score,
        evidence: assessment.evidence,
        unknowns: assessment.unknowns,
      }));
      const { data: assessments, error: assessmentError } = await client
        .from('screening_assessments')
        .insert(assessmentRows)
        .select('id, candidate_id');
      if (assessmentError) throw assessmentError;

      const citations = body.report.assessments.flatMap((assessment, index) =>
        (assessment.citations || []).map((citation) => ({
          screening_id: id,
          assessment_id: assessments?.[index]?.id,
          candidate_id: citation.candidateId,
          candidate_name: citation.candidateName,
          content: citation.content,
          tool: citation.tool,
        }))
      );
      if (citations.length) {
        const { error: citationError } = await client
          .from('screening_citations')
          .insert(citations);
        if (citationError) throw citationError;
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating screening:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/screenings/:id - Delete a screening
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = await getUserId();
    const client = createServiceClient();

    // Fetch screening to verify ownership
    let screeningQuery = client
      .from('screenings')
      .select('id, user_id')
      .eq('id', id)
      .single();

    const { data: screening, error: fetchError } = await screeningQuery;

    if (fetchError || !screening) {
      return NextResponse.json(
        { error: 'Screening not found' },
        { status: 404 }
      );
    }

    // If auth is enabled, verify ownership
    if (FEATURE_FLAGS.AUTH_ENABLED && userId && screening.user_id !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Delete the screening (cascades to assessments and citations)
    const { error: deleteError } = await client
      .from('screenings')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Screening delete error:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete screening' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting screening:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
