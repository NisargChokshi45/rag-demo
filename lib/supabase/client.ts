import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser Supabase client.
 *
 * Uses @supabase/ssr so the session is stored in cookies (not localStorage).
 * That is what lets middleware and route handlers see the signed-in user.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
