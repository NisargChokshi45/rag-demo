# Agentic Resume Screening RAG - TypeScript MVP

A Next.js application with two RAG (Retrieval-Augmented Generation) features: screening resumes against job descriptions and custom questions, and answering questions over long-form PDF documents with citations. Screening streams a live trace of each retrieval step and produces a grounded structured report.

## What It Does

1. **Jobs**: Recruiters create Jobs and upload candidate resume PDFs (resumes stored globally, keyed by job)
2. **Parse & Ingest**: PDFs are parsed, chunked, embedded, and indexed in Postgres (pgvector)
3. **Screen**: Free-form questions about candidates run a fixed pipeline in `app/api/agent/route.ts` (job-specific candidate pool):
   - **`search_chunks`** - vector search over the job's chunks (top 15), grouped by candidate, with a score boost for chunks that mention the job's required skills (top 5 kept)
   - **`get_full_resume`** - full resume text for the top 3 candidates, to overcome fragmentation
   - One Groq call turns the evidence into the structured report
4. **Report**: Structured report with scored candidates, evidence quotes, and unknowns
5. **Documents** (`/documents`): upload long PDFs (narrative, chapter-structured, or table and chart heavy). They are parsed into typed chunks and answered through a LangGraph pipeline (retrieve, rerank, expand, generate, verify). `/screen` can screen a job's candidates or a document.

**Key insight**: Three failure modes of naive RAG (fragmentation, coverage, hallucination) → fixes: full-resume fetch for the top candidates, job-scoped search with skill-aware ranking, and a report prompt restricted to retrieved evidence. (The original design used a tool-calling agent loop; screening was later simplified to a fixed pipeline for predictable token use. `lib/agent-tools.ts` still holds the old tools but nothing calls it.)

## Tech Stack

- **Framework**: Next.js 15 (App Router, TypeScript)
- **Models**: Gemini Embedding 2 via **`GOOGLE_API_KEY`** (1536-dim vectors), Groq via **`GROQ_API_KEY`** (chat, tool calling, reranking, and reports)
- **Database**: Supabase (Postgres + pgvector for embeddings)
- **Storage**: Supabase Storage (raw PDFs)
- **Orchestration**: LangChain; LangGraph for the document answer pipeline
- **PDF Parsing**: unpdf (robust for serverless)
- **Validation**: Zod (structured schema)
- **Package Manager**: pnpm

## Quick Start

### 1. Get Credentials

Follow **[CREDENTIALS_SETUP.md](./CREDENTIALS_SETUP.md)** to:
- Create a Supabase project (free tier)
- Get Google API key (free tier)
- Create **`.env.local`** with the five required env vars (Supabase URL, anon key and service-role key, `GOOGLE_API_KEY`, `GROQ_API_KEY`)

### 2. Install & Run

```bash
cd /home/bacancy/Desktop/Work/rag-demo

# Install deps (if not already done)
pnpm install

# Start dev server
pnpm dev
```

Visit:
- **Jobs**: http://localhost:3000/jobs
- **Candidates**: http://localhost:3000/candidates
- **Screen**: http://localhost:3000/screen

### 3. Run E2E Tests

Follow **[PHASE7_E2E_TESTING.md](./PHASE7_E2E_TESTING.md)** for three test queries:
1. **Direct skill match** (Java + AWS)
2. **Fragmentation coverage** (full-resume fetch for Mahesh)
3. **Shortlist** (all PMs/Scrum Masters via **`list_all_candidates`**)

### 4. Deploy

Follow **[PHASE8_DEPLOYMENT.md](./PHASE8_DEPLOYMENT.md)** to:
- Push to GitHub
- Link Vercel project
- Set production env vars
- Verify security (no secrets in bundles)

## File Structure

```
app/
  jobs/page.tsx               Jobs
  candidates/page.tsx         Candidates, resume upload and re-score
  documents/page.tsx          Document list, upload, parsed/PDF viewers
  documents/[id]/page.tsx     Document chat with sources and trace
  screen/page.tsx             Chat UI with tool trace & report (jobs or documents)
  api/
    upload-url/route.ts       Generate signed upload URLs
    ingest/route.ts           Parse → chunk → embed → insert
    candidates/route.ts       List candidates
    jobs/, screenings/        Job and saved-session CRUD
    agent/route.ts            Fixed screening pipeline + final report
    documents/                List, upload-url, [id], chat, embed, reparse

lib/
  supabase/
    client.ts                 Browser client (anon key)
    server.ts                 Server client (service-role key)
  pdf.ts                      unpdf wrapper
  chunk.ts                    800/100 sliding-window splitter
  embeddings.ts               Gemini embeddings with task types
  db.ts                       DB queries (insert, search, fetch)
  agent-tools.ts              Tool definitions (unused by the current route)
  documents/                  Document parsing, chunking, retrieval, LangGraph answer pipeline
  schema.ts                   Zod schemas (ScreeningReport, etc.)

supabase/
  schema.sql                  DDL: candidates, resume_chunks, RPC function
  migrations/                 001–020 (documents added in 016–020)

resumes/                      25 sample resume PDFs (test data)

CREDENTIALS_SETUP.md          Step-by-step: obtain & configure env vars
PHASE7_E2E_TESTING.md         Complete E2E test guide (3 queries)
PHASE8_DEPLOYMENT.md          Vercel deployment walkthrough
PLAN.md                       Original design doc + constraints
TASKS.md                      Task checklist (Phases 0–8)
```

## Key Design Decisions

### 1. **Fixed Screening Pipeline**
- `app/api/agent/route.ts` runs search → rank → fetch full resumes → report in a fixed order, with no agent loop
- Predictable cost: one embedding call, one vector search, up to 3 resume fetches, one Groq call
- Each step is streamed to the UI as a tool-call/tool-result event, so retrieval is visible
- Document Q&A is the part that uses LangGraph (`lib/documents/graph.ts`)

### 2. **Skill-Boosted Ranking**
- Vector search retrieves 15 chunks, grouped by candidate; relevance is the best chunk similarity
- Candidates whose chunks mention the job's skills get +3 per skill (max +15); the top 5 are kept
- No LLM rerank in screening (document Q&A has one, selected by `RERANK_MODE`)

### 3. **Full-Resume Fetch Over Re-Chunking**
- Full resume text is fetched for the top 3 candidates per screening (route-level cap); the report prompt sees each cut to 1,000 characters
- Avoids chunking artifacts (dates split across chunks, etc.)
- Simpler than adaptive chunking; trades compute for accuracy

### 4. **Job-Specific Candidate Filtering**
- Candidates are filtered by job_id during screening (search and listing respect job scope)
- All resumes indexed globally; queries filter to relevant job's pool
- Enables multi-job workflows without candidate isolation overhead

### 5. **Supabase for Simplicity**
- Postgres + pgvector cover the entire stack
- No orchestration (no Airflow, Celery, etc.)
- Serverless (Next.js route handlers → Supabase SQL)
- Free tier covers MVP workload

## Known Constraints & Workarounds

| Constraint                     | Workaround                                                     |
| ------------------------------ | -------------------------------------------------------------- |
| Vercel 4.5MB body limit        | Signed upload URLs → Supabase Storage                          |
| Gemini Embedding 2 dims        | Request and validate 1536 dimensions; stored as **`vector(1536)`** |
| Free-tier rate limits          | Batch embed calls with backoff, not **`Promise.all`**              |
| Google/Groq free-tier limits   | Sequential embedding and reranking with retry/backoff          |
| Supabase free tier (500 MB DB) | 25 resumes = ~625 KB; 8+ resume fetches = ~200 KB; all OK      |

## Security

- ✅ Service-role key stored server-only (route handlers)
- ✅ Google API key stored server-only (no client-side JS)
- ✅ Public keys (**`NEXT_PUBLIC_*`**) only in browser
- ✅ **`.env.local`** in **`.gitignore`** (never committed)
- ✅ Supabase Storage bucket permissions: signed URLs only
- ✅ POST **`/api/admin/reindex`** protected with **`validateAuth()`** middleware
- ✅ React hydration mismatch errors fixed (mounted guards + suppressHydrationWarning on html root)
- ⚠️ Supabase Auth is implemented but off by default (`NEXT_PUBLIC_AUTH_ENABLED`). Document lists are not yet filtered per user

## Performance Targets

| Operation                  | Target | Notes                              |
| -------------------------- | ------ | ---------------------------------- |
| Upload 5 PDFs              | <30s   | Parsing + chunking + batch embed   |
| Vector search              | <2s    | HNSW index on pgvector             |
| Full agent query (3 tools) | <5s    | Streaming; includes Gemini latency |
| Final structured report    | <1s    | One Groq call over the gathered evidence |

## Troubleshooting

**Upload fails**:
- Check **`.env.local`** has valid Supabase URL/keys
- Verify the Storage bucket exists (uploads and document viewing use signed URLs)
- Check Google API quota

**Screening query hangs**:
- Verify **`GOOGLE_API_KEY`** is for Gemini (not Google Cloud)
- Check free-tier quota (15 req/min; wait if hit)
- Review logs: **`pnpm dev`** console or Vercel logs on production

**Chunk count too high/low**:
- High: chunkSize param wrong (should be 800)
- Low: batch embedding failed (check **`api/ingest`** logs)
- Expected: 20–30 chunks per resume

See **[PHASE7_E2E_TESTING.md](./PHASE7_E2E_TESTING.md)** for detailed troubleshooting.

## Next Steps (Phase 9+)

- [ ] Multi-tenant: per-user isolation for documents
- [ ] Advanced filtering: skills, years, education, location
- [ ] Batch screening: upload CSV of queries, export results
- [ ] Candidate notes: recruiters can annotate screening results
- [ ] Resume comparison: side-by-side view of top candidates
- [ ] Custom models: OpenAI, Claude, local LLMs

## Support

For questions or issues:
1. Check **[PHASE7_E2E_TESTING.md](./PHASE7_E2E_TESTING.md)** troubleshooting section
2. Review logs: **`pnpm dev`** or Vercel dashboard
3. Verify credentials in **`.env.local`**
4. Open an issue on GitHub

---

**Last updated**: 2026-10-24 (docs synced with the fixed screening pipeline and the Documents feature)
