# Credentials Setup Guide

This document walks you through obtaining and configuring all required credentials for the Agentic Resume Screening RAG MVP.

## Required Credentials

You need six environment variables:

1. **NEXT_PUBLIC_SUPABASE_URL** - Supabase project URL (public)
2. **NEXT_PUBLIC_SUPABASE_ANON_KEY** - Supabase anonymous key (public)
3. **SUPABASE_SERVICE_ROLE_KEY** - Supabase service-role key (secret, server-only)
4. **GOOGLE_API_KEY** - Gemini Embedding 2 API key (secret)
5. **GROQ_API_KEY** - Groq chat/agent API key (secret)
6. **GROQ_CHAT_MODEL** - optional Groq model override

## Step 1: Set Up Supabase Project

### Create Supabase Account

1. Go to https://supabase.com
2. Sign up with GitHub, Google, or email
3. Click "New project"

### Create Project

1. **Project name**: `rag-demo` (or whatever you prefer)
2. **Database password**: Generate a strong password (save this somewhere safe)
3. **Region**: Choose closest to you (e.g., `us-east-1`)
4. Click "Create new project"
5. Wait for initialization (2–3 minutes)

### Get Supabase Credentials

Once the project is initialized:

1. Go to **Settings** (bottom-left gear icon)
2. Click **API** in the left sidebar
3. You'll see:
   - **Project URL** → copy this as `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** (labeled "ANON_KEY" or "ANON PUBLIC") → copy this as `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role secret** (labeled "SERVICE_ROLE_KEY") → copy this as `SUPABASE_SERVICE_ROLE_KEY`

**Example values** (yours will be different):
```
NEXT_PUBLIC_SUPABASE_URL=https://xyzabc123.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Create Storage Bucket

1. In Supabase dashboard, click **Storage** (left sidebar)
2. Click **Create a new bucket**
3. Name it `resumes`
4. Set to **Public** (so signed URLs work)
5. Click **Create bucket**

### Run Database Migrations and Seed

Install the [Supabase CLI](https://supabase.com/docs/guides/cli), run
`supabase login`, and configure either a direct database URL or a project
reference before running the production setup script:

```bash
# Option 1: direct database connection string
export SUPABASE_DB_URL='postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres'

# Option 2: project reference; the script links the project automatically
export SUPABASE_PROJECT_REF=YOUR_PROJECT_REF
export SUPABASE_DB_PASSWORD=YOUR_DATABASE_PASSWORD

pnpm db:setup
```

The command applies the migrations and seeds `Java Developer`, `MERN stack
developer`, and `Project Manager`. Verify the `jobs`, `candidates`, and
`resume_chunks` tables in Supabase Table Editor.

## Step 2: Get Google API Key

### Create Google API Project

1. Go to https://aistudio.google.com/app/apikey
2. If prompted to create a project, click **Create project**
3. Name it `rag-demo` and click **Create**

### Generate API Key

1. Once in Google AI Studio, click **Get API key** (top button)
2. Click **Create API key in new Google Cloud project**
3. Copy the API key that appears
4. Paste it as `GOOGLE_API_KEY`

**Example value** (yours will be different):
```
GOOGLE_API_KEY=AIzaSy1234567890abcdefghijk...
```

The app uses `gemini-embedding-2` at 1536 dimensions for resume and query vectors. The `/api/debug` endpoint checks the returned dimension.

**Verify the key works** (optional, but recommended):

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=YOUR_GOOGLE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "content": {"parts": [{"text": "title: none | text: test embedding"}]},
  "outputDimensionality": 1536
  }'
```

If you get a response (not 401/403 error), the key is valid.

## Step 3: Create `.env.local` File

Create a file at `/home/bacancy/Desktop/Work/rag-demo/.env.local` (note: this file is gitignored, so it won't be committed):

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://xyzabc123.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Google API Configuration
# Gemini Embeddings
GOOGLE_API_KEY=AIzaSy1234567890abcdefghijk...

# Groq Chat and Agent
GROQ_API_KEY=gsk_1234567890abcdefghijk...
GROQ_CHAT_MODEL=llama-3.3-70b-versatile
```

**Important**:
- Replace the values with your actual credentials
- Keep this file secret (it's already in `.gitignore`)
- Never commit this file to git
- Never share this file or the keys with anyone

## Step 4: Verify Credentials

Once `.env.local` is in place:

```bash
cd /home/bacancy/Desktop/Work/rag-demo

# Start the dev server
pnpm dev

# In another terminal, test the candidates API
curl http://localhost:3000/api/candidates
```

Expected response:
```json
{
  "candidates": []
}
```

(Empty array is fine - no resumes uploaded yet)

**If you get errors**:
- **Cannot find module 'NEXT_PUBLIC_SUPABASE_URL'**: Check `.env.local` syntax (no spaces around `=`)
- **401/403 Supabase error**: Check Supabase URL and keys are correct
- **401/403 Google error**: Check `GOOGLE_API_KEY` is correct and not revoked
- **401/403 Groq error**: Check `GROQ_API_KEY` is correct and not revoked

## Troubleshooting

### Supabase errors

**Error: "Invalid API key"**
- Go back to Supabase → Settings → API
- Copy the exact keys again (sometimes copy/paste drops trailing characters)
- Verify no extra spaces before/after the key

**Error: "Not authenticated"**
- You're using an invalid `SUPABASE_SERVICE_ROLE_KEY`
- Double-check you copied the "service_role" key, not the "anon" key

**Error: "Unknown table candidates"**
- The `schema.sql` migration hasn't been run yet
- Go to Supabase → SQL Editor and re-run the migration

### Google errors

**Error: "Invalid API key"**
- Go to https://aistudio.google.com/app/apikey
- Copy the exact key again
- Verify it's a Gemini API key, not a Google Cloud API key

**Error: "Quota exceeded"**
- Free tier has a rate limit; wait a few minutes and retry
- Or upgrade to a paid plan

**Error: "API not enabled"**
- Google API might not be enabled for your project
- Go to https://console.cloud.google.com and ensure "Generative Language API" is enabled

## Security Best Practices

- [ ] `.env.local` is in `.gitignore` (already done)
- [ ] Never share `SUPABASE_SERVICE_ROLE_KEY` or `GOOGLE_API_KEY` in chat, emails, or public repos
- [ ] If a key is accidentally committed or shared, regenerate it immediately:
  - **Supabase**: Settings → API → regenerate keys
  - **Google**: Go to https://aistudio.google.com/app/apikey and delete the key
- [ ] Before deploying, set new keys in Vercel dashboard (never reuse local keys)

## Next Steps

Once credentials are configured:

1. Run Phase 7 E2E tests: see `PHASE7_E2E_TESTING.md`
2. Deploy to Vercel: see `PHASE8_DEPLOYMENT.md`
3. Share production URL with stakeholders
