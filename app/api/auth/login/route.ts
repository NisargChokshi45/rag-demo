import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
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

    const supabase = createServiceClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    // Set auth cookies
    const response = NextResponse.json({ success: true, user: data.user });

    // Note: In a real implementation with SSR, you'd set cookies here
    // For now, the client will handle storing the session

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
