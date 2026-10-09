# Authentication Setup Guide

This document describes how to enable and configure authentication in the RAG demo system.

## Overview

Authentication is **disabled by default** for MVP development. The system is designed to work with or without auth using feature flags, allowing you to enable it when ready.

## Feature Flags

### `NEXT_PUBLIC_AUTH_ENABLED`
- **Default:** `false`
- **Description:** Master flag to enable/disable all authentication features
- **Impact when true:**
  - Every page except `/login` and `/auth/callback` redirects signed-out visitors to `/login?next=<page>`
  - Every `/api/*` route (except `/api/auth/*`) returns `401` without a session
  - Sessions are stored in cookies and refreshed by `middleware.ts`

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
- Supabase Auth integration via `@supabase/ssr` (cookie-based sessions; requires `@supabase/ssr` 0.12+)
- Login page with sign up toggle (`/login`), honouring a safe `?next=` redirect
- Email confirmation callback (`/auth/callback`) that exchanges the code for a session
- Page and API gating in `middleware.ts` (redirect for pages, `401` for APIs)
- `validateAuth()` on every API route handler as a second layer behind the middleware
- Login/logout/signup API routes (`/api/auth/*`); login now sets the session cookie
- Auth helpers (`lib/auth.ts`) and a typed client hook (`lib/hooks/useAuth.ts`) that tracks sign-in/out

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

1. Set `NEXT_PUBLIC_AUTH_ENABLED=true` in `.env.local` (it is read at build time, so restart or rebuild)
2. In the Supabase dashboard (Authentication → URL Configuration), set the **Site URL** to your app URL and add `<your-app-url>/auth/callback` to **Redirect URLs**. Do this for localhost and for each deployed origin.
3. Signed-out visitors are sent to `/login`
4. Users can sign up / sign in via Supabase Auth. With email confirmation on, the confirmation link returns through `/auth/callback`
5. All `/api/*` routes enforce auth (middleware plus `validateAuth()`)

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

When `AUTH_ENABLED=true`, every handler under `/api` enforces authentication, except `/api/auth/*` (needed to sign in):

- `/api/upload-url`, `/api/ingest`, `/api/agent`
- `/api/candidates`, `/api/candidates/[id]`
- `/api/jobs`, `/api/jobs/[id]`
- `/api/screenings`, `/api/screenings/[id]`
- `/api/documents/*`
- `/api/admin/*` and `/api/debug`

Enforcement is layered: `middleware.ts` rejects unauthenticated `/api` requests with `401`, and each handler also calls `validateAuth()` at the top. New route handlers must do the same.

Auth gating does not isolate data: all signed-in users still share one pool until `NEXT_PUBLIC_USER_DATA_ISOLATION` (Phase 2) is implemented.

## Current Implementation Details

### Auth Clients

**`lib/supabase/server.ts`:**
- `createServiceClient()` - Uses service role key (admin, bypasses RLS)
- `createAuthenticatedServerClient()` - Uses anon key + user session (respects RLS)

**`lib/supabase/client.ts`:**
- `createClient()` - Browser client (`createBrowserClient`) that keeps the session in cookies so the server can read it

### Auth Routes

- `POST /api/auth/login` - Sign in with email/password (sets the session cookie)
- `POST /api/auth/logout` - Sign out
- `POST /api/auth/signup` - Create new account
- `GET /auth/callback` - Completes email confirmation (`?code=…&next=…`)

### Login Page

- Location: `/login`
- Features: Sign up / sign in toggle, error handling, form validation, post-login redirect to `?next=` (same-site paths only)
- Uses the Supabase browser client for auth (not the `/api/auth/*` routes)

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
- Verify the `sb-…-auth-token` cookie is set (browser dev tools → Application → Cookies)
- Ensure you're logged in (visit `/login`)
- The flag is read at build time; rebuild or restart after changing it

### Confirmation email link fails

- Add `<your-app-url>/auth/callback` to Supabase **Redirect URLs**
- Open the link in the same browser that signed up (the sign-up stores a PKCE verifier cookie)

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
