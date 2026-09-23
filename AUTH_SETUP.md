# Authentication Setup Guide

This document describes how to enable and configure authentication in the RAG demo system.

## Overview

Authentication is **disabled by default** for MVP development. The system is designed to work with or without auth using feature flags, allowing you to enable it when ready.

## Feature Flags

### `NEXT_PUBLIC_AUTH_ENABLED`
- **Default:** `false`
- **Description:** Master flag to enable/disable all authentication features
- **Impact when true:**
  - Login page becomes available at `/login`
  - API routes require authentication headers
  - User session management enabled

### `NEXT_PUBLIC_USER_DATA_ISOLATION`
- **Default:** `false`
- **Requires:** `NEXT_PUBLIC_AUTH_ENABLED=true`
- **Description:** Filter all data (candidates, jobs, screenings) by user ID
- **Impact when true:**
  - Users only see their own candidates and jobs
  - Enables multi-tenant data isolation
  - Requires schema changes (see below)

## Environment Variables

Add these to your `.env.local` file:

```bash
# Authentication
NEXT_PUBLIC_AUTH_ENABLED=false
NEXT_PUBLIC_USER_DATA_ISOLATION=false
```

## Implementation Status

### ✅ Implemented (Gate-Only Auth)
- Supabase Auth integration via `@supabase/ssr`
- Login/logout API routes (`/api/auth/login`, `/api/auth/logout`, `/api/auth/signup`)
- Login page with sign up toggle (`/login`)
- Optional auth checks on API routes
- Auth context helpers (`lib/auth.ts`)
- Session middleware (`middleware.ts`)

### 📋 Needed for Data Isolation (Phase 2)

To enable `NEXT_PUBLIC_USER_DATA_ISOLATION=true`, you must:

1. **Add `user_id` columns to tables:**
   ```sql
   ALTER TABLE candidates ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
   ALTER TABLE jobs ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
   ALTER TABLE screenings ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
   ```

2. **Create RLS policies for each table:**
   ```sql
   -- Allow users to see only their own candidates
   CREATE POLICY "Users can only access their own candidates"
     ON candidates FOR ALL
     USING (auth.uid() = user_id);
   ```

3. **Update `lib/db.ts`** to filter by `user_id` when isolation is enabled:
   ```typescript
   // Example: in listCandidates()
   let query = client.from("candidates").select(...);
   if (FEATURE_FLAGS.USER_DATA_ISOLATION_ENABLED) {
     const userId = await getUserId();
     query = query.eq("user_id", userId);
   }
   ```

4. **Update agent tools** (`lib/agent-tools.ts`) to pass `userId` to search functions

## Enabling Authentication

### Step 1: Gate-Only Authentication (Recommended for Testing)

1. Set `NEXT_PUBLIC_AUTH_ENABLED=true` in `.env.local`
2. Restart dev server
3. Login page appears at `/login`
4. Users can sign up / sign in via Supabase Auth
5. API routes optionally enforce auth (controlled by feature flag)

```bash
# .env.local
NEXT_PUBLIC_AUTH_ENABLED=true
NEXT_PUBLIC_USER_DATA_ISOLATION=false
```

### Step 2: Full Data Isolation (Production)

1. Run schema migration (see above)
2. Set `NEXT_PUBLIC_USER_DATA_ISOLATION=true`
3. Users see only their own data
4. Multi-tenant support enabled

```bash
# .env.local
NEXT_PUBLIC_AUTH_ENABLED=true
NEXT_PUBLIC_USER_DATA_ISOLATION=true
```

## Protected API Routes

When `AUTH_ENABLED=true`, these routes enforce authentication:

- `POST /api/upload-url` — Generate signed upload URLs
- `POST /api/ingest` — Ingest resumes (prevents unsigned upload URL abuse)
- `POST /api/agent` — Run screening (requires authenticated user)
- `GET /api/candidates` — List candidates
- `GET /api/candidates/[id]` — View resume
- `GET /api/jobs` — List jobs
- `POST /api/jobs` — Create jobs

**Note:** Auth check can be disabled per-route by removing the `validateAuth()` call.

## Current Implementation Details

### Auth Clients

**`lib/supabase/server.ts`:**
- `createServiceClient()` — Uses service role key (admin, bypasses RLS)
- `createAuthenticatedServerClient()` — Uses anon key + user session (respects RLS)

**`lib/supabase/client.ts`:**
- `createClient()` — Browser client with anon key

### Auth Routes

- `GET/POST /api/auth/login` — Sign in with email/password
- `POST /api/auth/logout` — Sign out
- `POST /api/auth/signup` — Create new account

### Login Page

- Location: `/login`
- Features: Sign up / sign in toggle, error handling, form validation
- Uses Supabase client for auth (not server route)

## Testing

### Test Gate-Only Auth

1. Set `NEXT_PUBLIC_AUTH_ENABLED=true` in `.env.local`
2. Restart dev server
3. Visit `http://localhost:3000/login`
4. Create test account
5. Try uploading resumes (should succeed if auth works)
6. Try accessing `/api/upload-url` without auth header (should fail with 401)

### Test Data Isolation

1. Create two user accounts
2. Each user uploads different resumes
3. Set `NEXT_PUBLIC_USER_DATA_ISOLATION=true`
4. Login as user A: should see only their resumes
5. Login as user B: should see only their resumes
6. No cross-user data leakage

## Troubleshooting

### "Unauthorized" when accessing routes

- Check `NEXT_PUBLIC_AUTH_ENABLED=true` in `.env.local`
- Verify session cookie is set (browser dev tools → Application → Cookies)
- Ensure you're logged in (visit `/login`)

### RLS policies failing

- Verify `auth.uid()` matches `user_id` in tables
- Check RLS policies are enabled on tables
- Test with Supabase dashboard SQL editor

### User data appearing across accounts

- Verify `NEXT_PUBLIC_USER_DATA_ISOLATION=true` is set
- Check RLS policies exist and are correct
- Verify `lib/db.ts` filters by user_id when isolation enabled

## Future Enhancements

- [ ] Magic link authentication (email-only sign in)
- [ ] OAuth providers (Google, GitHub)
- [ ] Two-factor authentication (2FA)
- [ ] User profile management
- [ ] Team/organization support
- [ ] Role-based access control (RBAC)
