import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getUserId } from '@/lib/auth';
import { FEATURE_FLAGS } from '@/lib/config';

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
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
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
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
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
