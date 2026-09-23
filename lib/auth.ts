import { createAuthenticatedServerClient } from './supabase/server';

/**
 * Get current authenticated user
 * Returns null if not authenticated or AUTH_ENABLED is false
 */
export async function getCurrentUser() {
  try {
    const client = await createAuthenticatedServerClient();
    const { data } = await client.auth.getUser();
    return data.user;
  } catch {
    return null;
  }
}

/**
 * Validate auth middleware for API routes
 * Returns null if authenticated, NextResponse with error if not
 * Only enforces if AUTH_ENABLED is true
 */
export async function validateAuth() {
  const { FEATURE_FLAGS } = await import('./config');

  if (!FEATURE_FLAGS.AUTH_ENABLED) {
    return null; // Auth disabled, allow access
  }

  const user = await getCurrentUser();
  if (!user) {
    const { NextResponse } = await import('next/server');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null; // Auth valid, allow access
}

/**
 * Get user ID for database queries
 * Returns user ID if authenticated, null if auth disabled or not authenticated
 */
export async function getUserId(): Promise<string | null> {
  const { FEATURE_FLAGS } = await import('./config');

  if (!FEATURE_FLAGS.AUTH_ENABLED) {
    return null;
  }

  const user = await getCurrentUser();
  return user?.id || null;
}
