import { NextResponse, type NextRequest } from 'next/server';
import { FEATURE_FLAGS } from '@/lib/config';
import { createAuthenticatedServerClient } from '@/lib/supabase/server';
import { safeNextPath } from '@/lib/supabase/middleware';

/**
 * Landing route for Supabase email links (sign-up confirmation). It trades the
 * one-time `code` for a session cookie, then sends the user on their way.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  if (!FEATURE_FLAGS.AUTH_ENABLED) {
    return NextResponse.redirect(new URL('/', origin));
  }

  const code = searchParams.get('code');
  const next = safeNextPath(searchParams.get('next'));

  if (code) {
    const supabase = await createAuthenticatedServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  return NextResponse.redirect(
    new URL('/login?error=auth_callback_failed', origin)
  );
}
