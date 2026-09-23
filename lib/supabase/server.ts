import { createServerClient as createServerSSRClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

interface CookieToSet {
  name: string;
  value: string;
  options?: Record<string, unknown>;
}

/**
 * Service client with full privileges (service role key)
 * Use for admin operations that bypass RLS
 * Only available in server components and route handlers
 */
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * User-scoped Supabase client for server-side operations
 * Respects user's session and RLS policies
 * Used after AUTH_ENABLED is true for per-user data isolation
 */
export async function createAuthenticatedServerClient() {
  const cookieStore = await cookies();

  return createServerSSRClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Cookie setting may fail in some edge cases
          }
        },
      },
    }
  );
}
