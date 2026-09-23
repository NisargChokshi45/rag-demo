# RAG Resume Screening System - Setup & Configuration

## Quick Start (5 minutes)

### 1. Environment Setup
Copy `.env.example` or create `.env.local`:

```bash
# Supabase (get from Supabase dashboard)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx...
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...

# Embeddings (Google Generative AI)
GOOGLE_API_KEY=AIzaSyxxx...
GEMINI_EMBEDDING_MODEL=gemini-embedding-2

# LLM (Groq)
GROQ_API_KEY=gsk_xxx...
GROQ_CHAT_MODEL=llama-3.3-70b-versatile
```

### 2. Install & Build
```bash
nvm use 24
pnpm install
pnpm build
```

### 3. Start Dev Server
```bash
pnpm dev
# Open http://localhost:3000
```

## Detailed Setup Guide

### Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up
2. Create new project
3. Wait for database provisioning (~1 minute)
4. Get credentials from **Settings → API** (copy in `.env.local`)

### Step 2: Set Up Database

#### A. Run Migrations

In Supabase dashboard, go to **SQL Editor** and run migrations in order:

```bash
# 1. Enable vector extension
create extension if not exists vector;

# 2. Create base tables (from migrations/001_initial_schema.sql)
# Copy full content from that file

# 3. Update embedding dimensions (from migrations/002_gemini_embedding_2.sql)
# Copy full content from that file

# 4. Create jobs table (from migrations/003_jobs.sql)
# Copy full content from that file

# 5. Create screening tables (from migrations/004_screenings.sql)
# Copy full content from that file
```

Or use Supabase CLI:
```bash
supabase link --project-ref YOUR_PROJECT_ID
supabase push
```

#### B. Create Storage Bucket

1. Go to **Storage** in Supabase dashboard
2. Create new bucket: `resumes`
3. Set to **Public** for testing (enable **Authenticated** for production)
4. Set RLS policies if needed (optional for MVP)

#### C. Verify Database

Run in SQL Editor:
```sql
SELECT COUNT(*) FROM candidates;  -- Should be 0
SELECT COUNT(*) FROM jobs;        -- Should be 0
SELECT COUNT(*) FROM screenings;  -- Should be 0
```

### Step 3: Get API Keys

#### Google Generative AI (Embeddings)

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create new project (or use existing)
3. Enable **Google Generative AI API**
4. Create API key in **Credentials**
5. Copy to `GOOGLE_API_KEY` in `.env.local`

**Test connection:**
```bash
curl http://localhost:3000/api/debug
# Should show: hasGoogleApiKey: true, connectionTest.status: SUCCESS
```

#### Groq (LLM)

1. Go to [console.groq.com](https://console.groq.com)
2. Sign up with GitHub/Google/email
3. Create API key in **Settings**
4. Copy to `GROQ_API_KEY` in `.env.local`
5. Verify model availability: `llama-3.3-70b-versatile` (default)

**Test connection:** Already tested in debug endpoint above

### Step 4: Install Dependencies

```bash
nvm use 24     # Use Node 24
pnpm install   # Install packages
pnpm build     # Full build (verifies everything)
```

### Step 5: Run Locally

```bash
pnpm dev
# Open http://localhost:3000
```

Verify all pages load:
- `/` - Home page
- `/upload` - Resume upload
- `/jobs` - Job management
- `/candidates` - Candidate list
- `/screen` - Screening chat

## Testing the System

### Data Setup

1. **Get Sample Resumes**
   - Option A: Download from [Hungreeee/Resume-Screening-RAG-Pipeline](https://github.com/Hungreeee/Resume-Screening-RAG-Pipeline) on GitHub
   - Option B: Create 3-5 test PDFs with diverse roles (Java, Python, PM, QA, DevOps)

2. **Upload Resumes**
   - Go to `/upload`
   - Optionally add job description
   - Select PDF files (multiple OK)
   - Wait for "Complete" status

3. **Verify Ingestion**
   - Check `/candidates` page - should list all uploads
   - Check Supabase:
     ```sql
     SELECT COUNT(*) FROM candidates;
     SELECT COUNT(*) FROM resume_chunks;
     -- Ratio should be ~25-30 chunks per resume
     ```

### Run Test Queries

1. **Create a Job** (optional, but recommended)
   - Go to `/jobs`
   - Create job with title, description, experience, skills
   - Note the job ID

2. **Screen Candidates**
   - Go to `/screen`
   - Select job (if created) or leave blank
   - Enter test query

3. **Example Test Queries**

   **Query 1: Direct Match**
   ```
   Find candidates with Java and AWS experience
   ```
   Expected: High relevance match to Java developer

   **Query 2: Combination**
   ```
   Who has healthcare industry experience and 5+ years?
   ```
   Expected: Tool uses search_chunks + get_full_resume

   **Query 3: Exploration**
   ```
   Create a shortlist of potential project managers
   ```
   Expected: Tool uses list_all_candidates first

4. **Verify Results**
   - Check tool trace shows tool calls
   - Verify report shows candidate scores and evidence
   - Check Supabase screenings table populated:
     ```sql
     SELECT * FROM screenings ORDER BY created_at DESC LIMIT 1;
     SELECT * FROM screening_assessments 
     WHERE screening_id = 'xxx' ORDER BY score DESC;
     ```

## Environment Variables Reference

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | - | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | - | Client-side key (safe public) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | - | Server-only key (sensitive) |
| `GOOGLE_API_KEY` | ✅ | - | Embedding API key |
| `GROQ_API_KEY` | ✅ | - | LLM inference API key |
| `GEMINI_EMBEDDING_MODEL` | ❌ | `gemini-embedding-2` | Embedding model name |
| `GROQ_CHAT_MODEL` | ❌ | `llama-3.3-70b-versatile` | LLM model name |
| `NODE_ENV` | ❌ | `development` | Environment mode |

## Troubleshooting

### Build Fails
```bash
# Clear cache and reinstall
rm -rf node_modules pnpm-lock.yaml .next
nvm use 24
pnpm install
pnpm build
```

### "GOOGLE_API_KEY is missing"
- Check `.env.local` has `GOOGLE_API_KEY=...`
- Verify it's not in `.env` (which might be gitignored)
- Test: `curl http://localhost:3000/api/debug`

### "Failed to download PDF"
- Check resumes bucket exists in Supabase
- Check file was uploaded (check Storage in Supabase)
- Verify storage path is correct format

### "embedding returned 0 dimensions"
- Check `GOOGLE_API_KEY` is valid and active
- Verify API billing is enabled on Google Cloud
- Try test query on `/api/debug`

### "Maximum recursion depth exceeded"
- Agent made >10 tool calls
- Try more specific query or smaller candidate pool
- Check agent loop recursion limit in `app/api/agent/route.ts`

### Screenings not saved
- Check `jobId` is being sent to `/api/agent`
- Verify `SUPABASE_SERVICE_ROLE_KEY` is correct
- Check service role key has write permissions in Supabase

### Empty search results
- Try exact keyword from resume
- Check candidate was indexed (candidates page shows chunk count)
- Verify embeddings completed successfully

## Performance Notes

- **Embedding**: ~1-2s per resume (depends on chunk count + API latency)
- **Search**: ~500-1000ms (vector search + LLM rerank)
- **Report**: ~1-2s (structured output generation)
- **Full ingest**: 30-50s for 25 resumes sequentially

## Production Deployment

### Vercel (Recommended)

1. Push code to GitHub
2. Link to Vercel: `vercel link`
3. Set environment variables in Vercel dashboard:
   - All variables from `.env.local`
   - **Important**: `SUPABASE_SERVICE_ROLE_KEY` is server-only, never client
4. Deploy: `vercel`

### Self-Hosted

1. Ensure Node 24+
2. Set environment variables (systemd, docker, etc.)
3. `pnpm install --prod`
4. `pnpm build`
5. `pnpm start`
6. Proxy through nginx/apache on port 3000

### Database Backup

```bash
# Backup Supabase database
pg_dump "postgresql://xxx:xxx@db.xxx.supabase.co:5432/postgres" > backup.sql

# Backup storage files
# Download from Supabase Storage or use gsutil
```

## Next Steps

1. ✅ Set up Supabase and run migrations
2. ✅ Configure API keys
3. ✅ Upload sample resumes
4. ✅ Test screening workflow
5. 📋 Deploy to production (Vercel)
6. 📊 Set up monitoring/logging
7. 👥 Create user documentation

## Support

- Check `/api/debug` for diagnostic info
- Review server logs: `pnpm dev` shows ingest/agent output
- Check browser DevTools Network tab for API responses
- Verify SQL in Supabase dashboard: `SELECT * FROM candidates;`

## Further Reading

- [PLAN.md](./PLAN.md) - Original architecture plan
- [FEATURES.md](./FEATURES.md) - Feature set and limitations
- [lib/agent-tools.ts](./lib/agent-tools.ts) - Agent tool definitions
- [app/api/agent/route.ts](./app/api/agent/route.ts) - Agent streaming implementation
