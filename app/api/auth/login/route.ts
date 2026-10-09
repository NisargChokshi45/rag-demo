import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedServerClient } from '@/lib/supabase/server';
import { FEATURE_FLAGS } from '@/lib/config';

export async function POST(request: NextRequest) {
  if (!FEATURE_FLAGS.AUTH_ENABLED) {
    return NextResponse.json(
      { error: 'Authentication is disabled' },
      { status: 403 }
    );
  }

  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Cookie-aware client: a successful sign-in sets the session cookies.
    const supabase = await createAuthenticatedServerClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json({ success: true, user: data.user });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
