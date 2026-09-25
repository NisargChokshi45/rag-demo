# Auth Quick Start Guide

## Enable Auth in 30 Seconds

### 1. Add one line to `.env.local`:
```bash
NEXT_PUBLIC_AUTH_ENABLED=true
```

### 2. Restart dev server:
```bash
npm run dev
# or
pnpm dev
```

### 3. Visit login page:
```
http://localhost:3000/login
```

### 4. Sign up / Sign in
- Create account with email + password
- Or login if you have an account
- You'll be redirected to `/upload`

---

## What Happens When Auth is Enabled

✅ **Enabled:**
- Login page becomes live
- Sign in/up buttons in header
- API routes optionally check auth
- User email displayed in header
- "Sign Out" button available

❌ **Still shared globally:**
- All users see same candidates
- All users see same jobs
- No data isolation yet

---

## Disable Auth Anytime

Just remove or set to false:
```bash
NEXT_PUBLIC_AUTH_ENABLED=false
```

All routes go back to open access. No data loss.

---

## Next: Full Data Isolation (Multi-Tenant)

When you're ready for per-user data:

1. Run schema migration (see [AUTH_SETUP.md](./AUTH_SETUP.md))
2. Set `NEXT_PUBLIC_USER_DATA_ISOLATION=true`
3. Each user only sees their own data

---

## Files Added/Changed

### New Files (Auth):
- `lib/auth.ts` - Auth helpers
- `lib/config.ts` - Feature flags
- `lib/hooks/useAuth.ts` - Auth hook for components
- `lib/supabase/middleware.ts` - Session refresh
- `app/login/page.tsx` - Login page
- `app/components/AuthHeader.tsx` - User menu
- `app/api/auth/login/route.ts` - Login endpoint
- `app/api/auth/logout/route.ts` - Logout endpoint
- `app/api/auth/signup/route.ts` - Signup endpoint
- `middleware.ts` - Next.js middleware
- [AUTH_SETUP.md](./AUTH_SETUP.md) - Full setup guide
- [AUTH_IMPLEMENTATION.md](./AUTH_IMPLEMENTATION.md) - Technical details

### Updated Files:
- `package.json` - Added `@supabase/ssr`
- `lib/supabase/server.ts` - Added `createAuthenticatedServerClient()`
- `lib/db.ts` - Uses renamed `createServiceClient()`
- `app/layout.tsx` - Added `AuthHeader` component
- `app/api/ingest/route.ts` - Optional auth check (example)

---

## Troubleshooting

### Auth page shows but doesn't work
- Check `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`
- Verify Supabase project URL is correct
- Check browser console for errors

### API returns 401 (Unauthorized)
- Make sure you're logged in
- Check auth is enabled: `NEXT_PUBLIC_AUTH_ENABLED=true`
- Try logout → login again

### "Auth is disabled" message
- This is expected if `NEXT_PUBLIC_AUTH_ENABLED=false`
- To enable: set env var and restart server

---

## Full Documentation

- **Setup & Configuration:** See [AUTH_SETUP.md](./AUTH_SETUP.md)
- **Implementation Details:** See [AUTH_IMPLEMENTATION.md](./AUTH_IMPLEMENTATION.md)
- **Code Walkthrough:** See individual files with comments

---

## Feature Roadmap

- ✅ **Phase 1** - Implemented (disabled by default)
  - Login/logout
  - Signup
  - Session management
  - Optional API protection

- 📋 **Phase 2A** - Planned (easy)
  - Add `user_id` to database
  - Filter queries by user
  - Full data isolation

- 📋 **Phase 2B** - Future
  - Email verification
  - Password reset
  - OAuth (Google/GitHub)
  - Teams/organizations
