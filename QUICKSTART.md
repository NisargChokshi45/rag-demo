# Quick Start — 5 Minutes to Screening

Once credentials are configured, follow this 5-minute guide to see the app in action.

## Prerequisites

✅ `.env.local` file with four credentials:
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
GOOGLE_API_KEY=...
```

✅ Supabase: production project credentials configured and `resumes` Storage bucket created

## Set Up the Database

Install the [Supabase CLI](https://supabase.com/docs/guides/cli) and log in:

```bash
supabase login
pnpm db:setup
```

`pnpm db:setup` supports either of these production connection methods:

```bash
# Recommended when you have the database connection string.
export SUPABASE_DB_URL='postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres'

# Or let the script link the project through the Supabase CLI.
export SUPABASE_PROJECT_REF=YOUR_PROJECT_REF
export SUPABASE_DB_PASSWORD=YOUR_DATABASE_PASSWORD
```

`pnpm db:setup` applies all migrations and seeds the three default jobs:
`Java Developer`, `MERN stack developer`, and `Project Manager`.

To remove application data from the production project while leaving migration
history intact, run `pnpm db:cleanup`; run `pnpm db:seed` afterward to restore
the default jobs. The scripts never start or target local Supabase.

## Start Dev Server

```bash
cd /home/bacancy/Desktop/Work/rag-demo
pnpm dev
```

Server starts at `http://localhost:3000`. Leave this running in a terminal.

## 1. Upload Resumes (2 min)

1. Open http://localhost:3000/upload
2. Leave "Job Description" blank (optional)
3. Click the file box and select **5–10 PDFs** from `/home/bacancy/Desktop/Work/rag-demo/resumes/`
   - Suggested: `anudeep_java_developer.pdf`, `chetan_java_developer.pdf`, `mahesh_java_developer.pdf`, `adhi_scrum_master.pdf`, `adelina_project_manager.pdf`
4. Watch progress bars fill (uploading → ingesting → done)
5. Auto-redirects to `/candidates` when done

**What's happening**: PDFs are parsed, chunked (800-char sliding window), embedded with Gemini, and inserted into Postgres.

## 2. See Candidates (1 min)

At `http://localhost:3000/candidates`, you'll see a list:
- **Name** (parsed from resume)
- **Role guess** (inferred from resume)
- **Chunk count** (how many text chunks for this resume)

Each row has a **Screen** button (we'll use it next).

## 3. Ask a Question (2 min)

Click **Screen** on any candidate, or go directly to http://localhost:3000/screen

**Query #1** (easiest, quickest):
```
Job Description: Senior Java Developer with AWS experience
Query: Find candidates with strong Java and AWS skills
```

Expected:
- Left panel shows **tool trace** in real-time (blue badges: `list_all_candidates`, `search_chunks`, `get_full_resume`)
- Right panel shows **live streaming** of the agent thinking
- Below: **Structured report** with scored candidates, evidence quotes, unknowns

**Verification**:
- ✅ Java developers appear in the report
- ✅ Evidence includes quotes like "5 years Java" or "AWS Lambda"
- ✅ Tool calls are visible (agent is transparent)
- ✅ No hallucinations (all claims are from the resumes)

---

**Query #2** (tests full-resume fetch):
```
Job Description: (leave blank)
Query: I need someone named Mahesh with healthcare experience. How many years of relevant IT experience does he have?
```

Expected:
- Agent searches for "Mahesh healthcare"
- If chunks are fragmentary, calls `get_full_resume` (visible in trace)
- Final answer includes **exact years** from Mahesh's full resume
- Evidence cites both healthcare AND Java/IT skills

---

**Query #3** (tests coverage):
```
Job Description: Project Manager or Scrum Master
Query: Give me a shortlist of all candidates who have PM or Scrum Master experience. Show me everyone.
```

Expected:
- **Immediately** calls `list_all_candidates()` (visible in trace, first tool)
- Then searches over the full pool (not just top-k)
- Final report shows **8+ PM/Scrum Masters** (e.g., adelina, avinash, murali, rajan, ravi, srivatsan, etc.)

**Why this is special**: Naive RAG (vector search only) would return top-5 matches. Agentic RAG uses `list_all_candidates` to get the full pool, then the agent reasons over all of them. This is the key innovation from the notebook.

## 4. Check the Build (1 min)

```bash
# In a new terminal
pnpm build
```

Should complete with:
```
✓ Compiled successfully
```

No type errors = ready to deploy.

## What Just Happened?

1. **Uploaded**: PDF → text (unpdf) → chunks (800/100 split) → embeddings (Gemini) → Postgres
2. **Listed**: `/candidates` queried `SELECT candidates, COUNT(chunks)...` from Supabase
3. **Searched**: Query → embedding (Gemini) → vector similarity search → top-20 chunks from HNSW index
4. **Reranked**: Gemini re-ranked chunks for relevance (LLM reranking)
5. **Full-resume**: For top candidates, fetch full resume text (20k chars each, max 8 per query)
6. **Streamed**: All tool calls sent as NDJSON to browser in real-time
7. **Structured**: Final `generateObject` call produced Zod schema with scores, evidence, unknowns

## Troubleshooting (1 min)

**Upload fails**: Check `.env.local` (Supabase URL/keys) and `resumes` bucket exists
**Query errors**: Check `GOOGLE_API_KEY` is valid; wait if free-tier quota hit (15 req/min)
**Tool trace empty**: Verify streaming is working (Network tab shows `/api/agent` streaming NDJSON)
**No candidates**: Verify `schema.sql` was run in Supabase (check SQL editor for `candidates` table)

See **PHASE7_E2E_TESTING.md** for detailed troubleshooting.

## Next Steps

- **Full E2E tests**: Follow **PHASE7_E2E_TESTING.md** for comprehensive test suite
- **Deploy**: Follow **PHASE8_DEPLOYMENT.md** to push to Vercel
- **Documentation**: See **README.md** for architecture, **PLAN.md** for design constraints

---

**Ready?** Upload 5 resumes and run a query — should take 2 minutes total. 🚀
