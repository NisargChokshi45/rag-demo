import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { validateAuth } from '@/lib/auth';

interface MigrationCheck {
  name: string;
  status: 'applied' | 'pending';
  version: number;
}

// GET /api/admin/migrations - Check migration status
export async function GET(_request: NextRequest) {
  try {
    // Check authentication
    const authError = await validateAuth();
    if (authError) return authError;

    const client = createServiceClient();
    const checks: MigrationCheck[] = [];

    // Check if screening_citations table exists
    const { error: citationsError } = await client
      .from('screening_citations')
      .select('count()')
      .limit(1);

    const migration006Applied = !citationsError;

    checks.push({
      name: '006_screenings_user_and_report',
      version: 6,
      status: migration006Applied ? 'applied' : 'pending',
    });

    // Check if screenings table has required columns
    if (migration006Applied) {
      const { error: screeningsError } = await client
        .from('screenings')
        .select('user_id, report, reasoning, context')
        .limit(1);

      if (screeningsError?.message.includes('column')) {
        checks.push({
          name: 'screenings_columns',
          version: 6,
          status: 'pending',
        });
      }
    }

    const allApplied = checks.every((c) => c.status === 'applied');

    return NextResponse.json({
      success: true,
      allMigrationsApplied: allApplied,
      migrations: checks,
      nextSteps: allApplied
        ? 'All migrations applied'
        : 'Run: supabase db push --remote',
    });
  } catch (error) {
    console.error('Error checking migrations:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to check migration status',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// POST /api/admin/migrations/apply - Trigger migration check/application
export async function POST(_request: NextRequest) {
  try {
    // Check authentication
    const authError = await validateAuth();
    if (authError) return authError;

    const client = createServiceClient();

    // Try to verify the migration by querying screening_citations
    const { error: verifyError } = await client
      .from('screening_citations')
      .select('count()')
      .limit(1);

    if (!verifyError) {
      return NextResponse.json({
        success: true,
        message: 'Migration 006 is already applied',
        status: 'applied',
      });
    }

    // Note: Direct SQL execution is not available through the Supabase JS client
    // Users must run: supabase db push --remote
    return NextResponse.json(
      {
        success: false,
        error: 'Cannot apply migrations directly',
        message:
          'Run "supabase db push --remote" from your terminal to apply pending migrations',
        guidance: {
          step1:
            'Ensure you have supabase CLI installed: npm install -g supabase',
          step2: 'Authenticate: supabase login',
          step3: 'Link your project: supabase link',
          step4: 'Apply migrations: supabase db push --remote',
        },
      },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error applying migrations:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to apply migrations',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
