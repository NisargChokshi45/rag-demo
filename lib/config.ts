/**
 * Feature flags for the RAG demo
 * Allows toggling features on/off without code changes
 */

export const FEATURE_FLAGS = {
  // Authentication feature flag
  // Set to true to enable auth, false to disable (default: false for MVP)
  AUTH_ENABLED: process.env.NEXT_PUBLIC_AUTH_ENABLED === 'true',

  // Data isolation by user (requires AUTH_ENABLED)
  // Filters all queries to only return user's own data
  // Set to false for shared global pool (current MVP behavior)
  USER_DATA_ISOLATION_ENABLED:
    process.env.NEXT_PUBLIC_AUTH_ENABLED === 'true' &&
    process.env.NEXT_PUBLIC_USER_DATA_ISOLATION === 'true',
};
