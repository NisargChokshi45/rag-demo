# Agentic Resume Screening RAG - TypeScript MVP

A production-ready Next.js application that uses an agentic RAG (Retrieval-Augmented Generation) loop to screen resumes against job descriptions. Features real-time tool tracing, LLM-based reranking, and grounded structured reports.

## What It Does

1. **Upload**: Recruiters upload resume PDFs and job descriptions
2. **Parse & Ingest**: PDFs are parsed, chunked, embedded, and indexed in Postgres (pgvector)
3. **Screen**: Free-form questions about candidates are answered via an agent loop:
   - `list_all_candidates` - fetch full candidate pool for coverage
   - `search_chunks` - vector search + LLM reranking
   - `get_full_resume` - fetch full resume text to overcome fragmentation
4. **Report**: Structured report with scored candidates, evidence quotes, and unknowns

**Key insight from the notebook**: Three failure modes of naive RAG (fragmentation, coverage, hallucination) → Three fixes (full-resume fetch, agent loop, LLM reranking) → shipped in production.

## Tech Stack

- **Framework**: Next.js 15 (App Router, TypeScript)
- **Models**: Gemini Embedding 2 via `GOOGLE_API_KEY` (1536-dim vectors), Groq via `GROQ_API_KEY` (chat, tool calling, reranking, and reports)
- **Database**: Supabase (Postgres + pgvector for embeddings)
- **Storage**: Supabase Storage (raw PDFs)
- **Agent framework**: LangChain + LangGraph
- **PDF Parsing**: unpdf (robust for serverless)
- **Validation**: Zod (structured schema)
- **Package Manager**: pnpm

## Project Status

🛠️ **Phases 1–6 Implemented** (runtime E2E validation remains)
- Phase 1: Next.js + pnpm setup
- Phase 2: Test data (25 sample resumes)
- Phase 3: Ingestion pipeline (PDF → chunks → embeddings → DB)
- Phase 4: Candidates page (listing ingested resumes)
- Phase 5: Agent route (tool-calling loop with streaming)
- Phase 6: Screen page UI (live tool trace, structured report)

⏳ **Phase 7: E2E Testing** (blocked on credentials)
📋 **Phase 8: Deployment** (documented, ready to deploy)

## Quick Start

### 1. Get Credentials

Follow **CREDENTIALS_SETUP.md** to:
- Create a Supabase project (free tier)
- Get Google API key (free tier)
- Create `.env.local` with four env vars

### 2. Install & Run

```bash
cd /home/bacancy/Desktop/Work/rag-demo

# Install deps (if not already done)
pnpm install

# Start dev server
pnpm dev
```

Visit:
- **Upload**: http://localhost:3000/upload
- **Candidates**: http://localhost:3000/candidates
- **Screen**: http://localhost:3000/screen

### 3. Run E2E Tests

Follow **PHASE7_E2E_TESTING.md** for three test queries:
1. **Direct skill match** (Java + AWS)
2. **Fragmentation coverage** (full-resume fetch for Mahesh)
3. **Shortlist** (all PMs/Scrum Masters via `list_all_candidates`)

### 4. Deploy

Follow **PHASE8_DEPLOYMENT.md** to:
- Push to GitHub
- Link Vercel project
- Set production env vars
- Verify security (no secrets in bundles)

## File Structure

```
app/
  upload/page.tsx             JD + resume uploader
  candidates/page.tsx         List ingested candidates
  screen/page.tsx             Chat UI with tool trace & report
  api/
    upload-url/route.ts       Generate signed upload URLs
    ingest/route.ts           Parse → chunk → embed → insert
    candidates/route.ts       List candidates
    agent/route.ts            Tool-calling loop + final report

lib/
  supabase/
    client.ts                 Browser client (anon key)
    server.ts                 Server client (service-role key)
  pdf.ts                      unpdf wrapper
  chunk.ts                    800/100 sliding-window splitter
  embeddings.ts               Gemini embeddings with task types
  db.ts                       DB queries (insert, search, fetch)
  agent-tools.ts              Tool definitions (list, search, fetch)
  schema.ts                   Zod schemas (ScreeningReport, etc.)

supabase/
  schema.sql                  DDL: candidates, resume_chunks, RPC function

resumes/                      25 sample resume PDFs (test data)

CREDENTIALS_SETUP.md          Step-by-step: obtain & configure env vars
PHASE7_E2E_TESTING.md         Complete E2E test guide (3 queries)
PHASE8_DEPLOYMENT.md          Vercel deployment walkthrough
PLAN.md                       Original design doc + constraints
TASKS.md                      Task checklist (Phases 0–8)
```

## Key Design Decisions

### 1. **LangGraph Tool-Calling Agent**
- Transparent LangGraph `createReactAgent` loop with a recursion limit of 10
| Gemini Embedding 2 dims | Request and validate 1536 dimensions; stored as `vector(1536)` |
| Google/Groq free-tier limits | Sequential embedding and reranking with retry/backoff |
- Traces streamed live to UI (every tool call visible)
- Cap: 10 steps per query (Vercel's 300s timeout is sufficient)

### 2. **LLM Reranking Inside `search_chunks` Tool**
- After vector search retrieves 15 chunks, Groq ranks top 5 by relevance
- Fixes precision without separate UI logic
- Cost: ~1 extra generate call per query

### 3. **Full-Resume Fetch Over Re-Chunking**
- `get_full_resume` fetches full resume text (up to 8 candidates per query)
- Avoids chunking artifacts (dates split across chunks, etc.)
- Simpler than adaptive chunking; trades compute for accuracy

### 4. **No Per-Job Isolation (MVP Cut)**
- All resumes in one global pool
- Deliberate scope cut; flag for Phase 9 if needed
- Query: "Filter by job ID: X" would require schema change

### 5. **Supabase for Simplicity**
- Postgres + pgvector cover the entire stack
- No orchestration (no Airflow, Celery, etc.)
- Serverless (Next.js route handlers → Supabase SQL)
- Free tier covers MVP workload

## Known Constraints & Workarounds

| Constraint | Workaround |
|---|---|
| Vercel 4.5MB body limit | Signed upload URLs → Supabase Storage |
| Gemini Embedding 2 dims | Request and validate 1536 dimensions; stored as `vector(1536)` |
| Free-tier rate limits | Batch embed calls with backoff, not `Promise.all` |
| Google/Groq free-tier limits | Sequential embedding and reranking with retry/backoff |
| Supabase free tier (500 MB DB) | 25 resumes = ~625 KB; 8+ resume fetches = ~200 KB; all OK |

## Security

- ✅ Service-role key stored server-only (route handlers)
- ✅ Google API key stored server-only (no client-side JS)
- ✅ Public keys (`NEXT_PUBLIC_*`) only in browser
- ✅ `.env.local` in `.gitignore` (never committed)
- ✅ Supabase Storage bucket permissions: signed URLs only
- ⚠️ MVP has no user auth (add via Supabase Auth if multi-tenant needed)

## Performance Targets

| Operation | Target | Notes |
|---|---|---|
| Upload 5 PDFs | <30s | Parsing + chunking + batch embed |
| Vector search | <2s | HNSW index on pgvector |
| Full agent query (3 tools) | <5s | Streaming; includes Gemini latency |
| Final structured report | <1s | `generateObject` over tool history |

## Troubleshooting

**Upload fails**:
- Check `.env.local` has valid Supabase URL/keys
- Verify `resumes` Storage bucket exists and is public
- Check Google API quota

**Agent query hangs**:
- Verify `GOOGLE_API_KEY` is for Gemini (not Google Cloud)
- Check free-tier quota (15 req/min; wait if hit)
- Review logs: `pnpm dev` console or Vercel logs on production

**Chunk count too high/low**:
- High: chunkSize param wrong (should be 800)
- Low: batch embedding failed (check `api/ingest` logs)
- Expected: 20–30 chunks per resume

See **PHASE7_E2E_TESTING.md** for detailed troubleshooting.

## Next Steps (Phase 9+)

- [ ] Multi-tenant: per-job-id candidate isolation
- [ ] Advanced filtering: skills, years, education, location
- [ ] Batch screening: upload CSV of queries, export results
- [ ] User authentication: Supabase Auth or OAuth
- [ ] Candidate notes: recruiters can annotate screening results
- [ ] Resume comparison: side-by-side view of top candidates
- [ ] Custom models: OpenAI, Claude, local LLMs

## License

MIT (or your choice)

## Support

For questions or issues:
1. Check **PHASE7_E2E_TESTING.md** troubleshooting section
2. Review logs: `pnpm dev` or Vercel dashboard
3. Verify credentials in `.env.local`
4. Open an issue on GitHub

---

**Build status**: ✅ Clean  
**Last updated**: 2026-09-19  
**Current phase**: ⏳ Awaiting credentials for Phase 7 E2E testing
