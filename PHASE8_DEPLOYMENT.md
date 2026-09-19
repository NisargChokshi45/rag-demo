# Phase 8: Deployment Guide

**Status**: Ready to deploy after Phase 7 (E2E testing) passes locally.

## Prerequisites

- Phase 7 (E2E testing) completed locally with all three queries passing
- `pnpm build` passes with no type errors
- GitHub account with a repository created for this project
- Vercel account (free tier is sufficient)

## Step-by-Step Deployment

### 1. Push to GitHub

```bash
cd /home/bacancy/Desktop/Work/rag-demo

# If not already a git repo with remote
git remote add origin https://github.com/YOUR_USERNAME/rag-demo.git
git branch -M main
git push -u origin main
```

Verify:
- [ ] Repository is public or you have access
- [ ] All commits are pushed
- [ ] `.env.local` is NOT in the repo (should be in `.gitignore`)

### 2. Create Vercel Project

**Option A: Via Vercel Dashboard (recommended)**

1. Go to https://vercel.com/dashboard
2. Click "Add New..." → "Project"
3. Select GitHub, find `rag-demo` repository
4. Click "Import"
5. Framework: Next.js (should auto-detect)
6. Root Directory: `.` (default)
7. Click "Deploy"

**Option B: Via Vercel CLI**

```bash
vercel --prod
```

Then follow the prompts to link the project.

### 3. Configure Environment Variables in Vercel

**In Vercel Dashboard**:
1. Go to your project → Settings → Environment Variables
2. Add all four variables:
   - `NEXT_PUBLIC_SUPABASE_URL` (public)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public)
   - `SUPABASE_SERVICE_ROLE_KEY` (production only)
   - `GOOGLE_API_KEY` (production only)

**Verification**:
- [ ] Public vars (NEXT_PUBLIC_*) are visible in the dashboard
- [ ] Secret vars (SUPABASE_SERVICE_ROLE_KEY, GOOGLE_API_KEY) are marked as "protected"
- [ ] All four vars are set for the production environment

### 4. Trigger Deployment

Vercel will auto-deploy on push to main. If you've already pushed:

1. Go to Vercel Dashboard → your project
2. Look for the most recent deployment
3. Wait for "Ready" status (usually 2–5 minutes)

**Verification**:
- [ ] Deployment shows "Ready" (not "Failed" or "Building")
- [ ] Build logs show `✓ Compiled successfully`
- [ ] No warnings about missing environment variables

### 5. Smoke Test: Verify Production Deployment

1. Get your production URL from Vercel (e.g., `https://rag-demo-prod.vercel.app`)
2. Test the three E2E queries against production:
   - **Query #1**: Find Java + AWS developers
   - **Query #2**: Find Mahesh with healthcare experience
   - **Query #3**: List all PMs/Scrum Masters

**Verification**:
- [ ] Upload page works (`/upload`)
- [ ] Candidates page displays ingested resumes (`/candidates`)
- [ ] Agent/screen page responds to queries (`/screen`)
- [ ] Tool traces update in real-time (streaming works)
- [ ] Final reports show evidence with proper citations
- [ ] No 500 errors in DevTools Console

### 6. Security Verification: No Secrets Leaked

**Check build output**:
```bash
vercel logs --prod
```

Look for any mention of `SUPABASE_SERVICE_ROLE_KEY` or `GOOGLE_API_KEY` in the build output. There should be **none**.

**Check client bundles**:
1. Open production URL in browser
2. DevTools → Network tab
3. Click on the main JS bundle (e.g., `_next/static/chunks/...`)
4. Search for `SUPABASE_SERVICE_ROLE_KEY` or `GOOGLE_API_KEY`
5. Should find **zero matches**

**Verification**:
- [ ] No secret keys appear in build logs
- [ ] No secret keys appear in client-side bundles
- [ ] Only public keys (`NEXT_PUBLIC_*`) are in client code

## Rollback (if needed)

If deployment has issues:

1. Go to Vercel Dashboard → Deployments
2. Find the previous working deployment
3. Click three-dot menu → "Promote to Production"
4. Vercel will redeploy the previous version immediately

## Optional: Custom Domain

If you want a custom domain:

1. Vercel Dashboard → Settings → Domains
2. Add your domain and follow DNS setup instructions
3. Wait for DNS propagation (usually 10–30 minutes)

## Post-Deployment Checklist

- [ ] All three E2E queries pass on production
- [ ] No 500 errors in logs
- [ ] Streaming works (tool traces appear in real-time)
- [ ] No secrets appear in bundles or logs
- [ ] Response times are acceptable (<5s for typical queries)
- [ ] Supabase database is responsive (no rate limits hit)
- [ ] Google API quota is healthy (monitor in Google Cloud Console)

## Cost Monitoring

**Vercel**:
- Free tier: up to 100 GB data transfer/month, unlimited deployments
- Expected cost: $0 if under limits

**Supabase**:
- Free tier: 500 MB DB, 1 GB Storage
- Your app: 25 resumes × ~25 chunks × ~1KB each ≈ 625 KB DB + ~5 MB Storage (all within free tier)
- Expected cost: $0

**Google API (Gemini)**:
- Free tier: 15 requests per minute, 1,500 requests per day (generous for low-traffic testing)
- Your app: ~10 embed calls per ingest + ~5 generate calls per query
- Expected cost: $0 for testing; scale if > 1 query per minute sustained

## Monitoring & Maintenance

Set up alerts in Vercel to get notified of:
- Deployment failures
- Function errors (500s)
- High latency (>10s response time)

## Next Steps

After deployment:
1. Share the production URL with stakeholders
2. Collect feedback on the screening reports
3. Consider Phase 9 enhancements (if applicable):
   - Per-job-id candidate isolation
   - Advanced filtering (skills, years of experience, education)
   - Batch screening (upload queries from CSV, export results)
   - User authentication + multi-tenant support
