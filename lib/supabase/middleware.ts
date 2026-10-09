import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient as createServerSSRClient } from '@supabase/ssr';

interface CookieToSet {
  name: string;
  value: string;
  options?: Record<string, unknown>;
}

/** Pages and routes that stay reachable without a session. */
const PUBLIC_PATHS = ['/login', '/auth/callback', '/api/auth'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

/**
 * Only allow same-origin relative redirects, so `?next=` cannot be used to
 * send a signed-in user to another site.
 */
export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  if (value.startsWith('/\\')) return '/';
  return value;
}

/**
 * Refreshes the Supabase session cookie on every request and, when auth is
 * enabled, gates the app: unauthenticated page requests are redirected to
 * /login and unauthenticated API requests receive a 401.
 */
export async function updateSession(request: NextRequest) {
  const authEnabled = process.env.NEXT_PUBLIC_AUTH_ENABLED === 'true';

  let response = NextResponse.next({ request });

  if (!authEnabled) {
    return response;
  }

  // Cookies (and cache headers) the Supabase client wants written. They must
  // be copied onto whichever response we finally return, including redirects.
  let pendingCookies: CookieToSet[] = [];
  let pendingHeaders: Record<string, string> = {};

  const supabase = createServerSSRClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[], headers: Record<string, string>) {
          pendingCookies = cookiesToSet;
          pendingHeaders = headers;
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
          Object.entries(headers).forEach(([key, value]) =>
            response.headers.set(key, value)
          );
        },
      },
    }
  );

  // Validates the token with Supabase and refreshes it when it has expired.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;

  const withSessionCookies = (target: NextResponse) => {
    pendingCookies.forEach(({ name, value, options }) =>
      target.cookies.set(name, value, options)
    );
    Object.entries(pendingHeaders).forEach(([key, value]) =>
      target.headers.set(key, value)
    );
    return target;
  };

  if (!user && !isPublicPath(pathname)) {
    if (pathname.startsWith('/api/')) {
      return withSessionCookies(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      );
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '';
    loginUrl.searchParams.set('next', `${pathname}${search}`);
    return withSessionCookies(NextResponse.redirect(loginUrl));
  }

  if (user && pathname === '/login') {
    const destination = new URL(
      safeNextPath(request.nextUrl.searchParams.get('next')),
      request.url
    );
    return withSessionCookies(NextResponse.redirect(destination));
  }

  return response;
}
