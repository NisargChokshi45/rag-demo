import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedServerClient } from '@/lib/supabase/server';
import { FEATURE_FLAGS } from '@/lib/config';

export async function POST(_request: NextRequest) {
  if (!FEATURE_FLAGS.AUTH_ENABLED) {
    return NextResponse.json(
      { error: 'Authentication is disabled' },
      { status: 403 }
    );
  }

  try {
    const supabase = await createAuthenticatedServerClient();

    const { error } = await supabase.auth.signOut();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
