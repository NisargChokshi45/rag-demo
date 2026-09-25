# Agentic Resume-Screening RAG - Task Checklist

## Current status

**Build Status**: ✅ Production-build verified
**Code Coverage**: ~95% implemented against [PLAN.md](./PLAN.md)
**Live Environment**: Agent has run successfully with real Groq calls (per session history Sep 25)

### Not yet verified:
- [ ] Full E2E of the three notebook test queries (query #1, #2, #3)
- [ ] Per-message feedback UI fully tested in live environment

---

## 0. Credentials Setup 📋 DOCUMENTED (verified for the current app)

See **[CREDENTIALS_SETUP.md](./CREDENTIALS_SETUP.md)** for the exact setup flow.

- [x] Confirm the required Supabase keys are present: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`
- [x] Confirm `GOOGLE_API_KEY` is configured for Gemini Embedding 2 at 1536 dimensions
- [x] Confirm `GROQ_API_KEY` is configured for chat/tool-calling and structured output
- [x] Create/update `.env.local` with the required variables, including the optional `GROQ_CHAT_MODEL` override when needed
- [x] Start the app and smoke-test `/api/candidates` to confirm the environment loads without credential/runtime errors

---

## 1. Setup and environment verification

- [x] Create the Next.js app with TypeScript and App Router
- [x] Initialize the repo and `.gitignore`
- [x] Install dependencies with `pnpm`
- [x] Verify the app builds successfully under Node 24 (`pnpm build` passes)
- [x] Provision the Supabase project and enable the `vector` extension
- [x] Run migrations in order (11 migrations total: 001_initial_schema → 011_screening_message_feedback)
- [x] Create the `resumes` storage bucket for upload/ingestion flows
- [x] Confirm the runtime secrets are valid and usable by the server-side app code
- [x] Verify the app starts cleanly with live Supabase connection
- [x] Create `.gitignore` with `.env.local` excluded (verified in git status)

---

## 2. Test Data

- [x] Sample PDF folder exists in `/resumes` in the workspace
- [x] Confirm the sample PDFs are valid PDF files and the app accepts multi-file PDF uploads
- [x] Prepare a small batch (3 resumes) for upload testing before running the full E2E set

---

## 3. Ingestion Pipeline

**Code Implementation**: ✅ Fully implemented and build-verified

- [x] `lib/pdf.ts` with `unpdf` for PDF parsing
- [x] `lib/chunk.ts` with hand-rolled 800/100 sliding-window splitter (verified constants)
- [x] `lib/embeddings.ts` with Gemini embedding validation: **1536 dimensions** enforced (validation logs dimension mismatch)
- [x] `lib/db.ts` functions: `insertCandidate`, `insertChunks`, `searchChunks`, `getFullResumeById`, `listCandidates`, `deleteCandidate`
- [x] `app/api/upload-url/route.ts` generates signed upload URLs for Supabase Storage
- [x] `app/api/ingest/route.ts`: `runtime = "nodejs"`, `maxDuration = 300` (Vercel Fluid Compute)
  - Parses PDF → chunks → embeds sequentially (respects Google free-tier limits)
  - **Rollback on failure**: deleteCandidate called at line 159 if chunk insertion fails
  - Job-scoped ingestion: populates candidate.job_id if provided

**Live Verification**: ✅ Partial (agent logs confirm real ingestion occurred Sep 25)

- [x] Ingestion endpoint tested with real PDFs (session history shows successful Groq calls with get_full_resume returning resume text)
- [ ] Chunk count ballpark vs. notebook's 666/25 ratio (sample set uploaded, not counted yet)
- [ ] Rollback behavior tested on chunk insertion failure
- [x] 1536-dim embeddings validated by the wrapper on every call

**Notes**:
- `/resumes` folder contains PDF corpus for smoke-test uploads.
- Fetch cap for get_full_resume is **2 candidates per screening** (hard-coded in agent-tools.ts line 148, using Set to avoid duplicate candidate IDs).
- Embeddings are embedded sequentially with retry/backoff to respect Google Gemini free-tier TPM limits.

---

## 4. Candidates Page & Upload Flow

**Code Implementation**: ✅ Fully implemented

- [x] `lib/supabase/client.ts` (browser anon client)
- [x] `lib/supabase/server.ts` (server service-role client)
- [x] `app/api/candidates/route.ts` returns candidates with name, role_guess, chunk_count, and filtering by job (if jobId provided)
- [x] `app/candidates/page.tsx`:
  - Fetches candidates from `/api/candidates?jobId=...`
  - Displays name, role, original filename, indexed state, and **chunk count**
  - Upload modal integrated directly (no separate upload page)
  - Drag-and-drop file selection, progress tracking, and ingest status per file
- [x] `app/api/upload-url/route.ts` returns signed URLs for client-side Supabase Storage upload
- [x] Upload flow: browser → Supabase Storage (signed URL) → server ingest API → parse/chunk/embed/insert

**Live Verification**: ⚠️ Code verified, live upload UI not yet tested in session

- [ ] Test upload of 3-5 resume PDFs through the UI
- [ ] Confirm candidates appear in list with correct name, role, and chunk count
- [ ] Test filtering by jobId (if switching between jobs)
- [ ] Verify chunk counts are in expected ballpark (25 resumes → ~666 chunks in notebook; test set ratio TBD)

**Deviations from PLAN**:
- **Upload merged into candidates page** (not a separate `app/upload/page.tsx`). The PLAN anticipated a dedicated page; implementation chose to co-locate upload with candidate listing for UX simplicity.
- Job-scoped candidate listing supported (filters by job_id).

---

## 5. Agent Route & Tool-Calling Loop

**Code Implementation**: ✅ Fully implemented with LangGraph

- [x] `lib/schema.ts`: `ScreeningReportSchema` with `CandidateAssessmentSchema` and `CitationSchema` (zod-validated)
- [x] `lib/agent-tools.ts` implements three tools:
  - **`list_all_candidates`**: returns all candidates (optionally filtered by jobId)
  - **`search_chunks`**: vector search + LLM rerank (retrieves top 10 chunks, reranks with Groq, returns top 3 with citations)
  - **`get_full_resume`**: retrieves full resume text for a candidate by ID (fetch cap: **2 candidates per screening**, enforced via Set<string> to prevent duplicate-ID bypass)
- [x] `app/api/agent/route.ts`: LangGraph `createReactAgent` with:
  - **Recursion limit**: 25 (higher than PLAN's 10 to allow agentic exploration)
  - Streams tool events (`on_tool_start`, `on_tool_end`)
  - Final structured-output call via `withStructuredOutput(ScreeningReportSchema)`
  - Conversation history support (multi-turn screenings)

**Live Verification**: ✅ Agent has successfully executed (Sep 25 session history shows real Groq calls)

- [x] Agent route tested against live Supabase database with real candidates
- [x] Tool trace visible in real runs (get_full_resume calls logged, token usage tracked)
- [x] Final report generated and stored in screenings table
- [x] Fetch cap (2) enforced: agent logs show only 2 distinct candidates fetched full-text per screening
- [x] Job-scoped retrieval working: jobId passed from route → searchChunks → match_resume_chunks SQL filter

**Technical Details**:
- Groq model (default `mixtral-8x7b-32768`; override with `GROQ_CHAT_MODEL` env var)
- Output dimensions match 1536-dim embeddings (Gemini Embedding 2)
- Sequential token-limit checks to prevent 413 overflows
- Conversation history persisted per sessionId (for multi-turn support)

---

## 6. Screen Page UI & Screening Flow

**Code Implementation**: ✅ Fully implemented with real-time streaming

- [x] `app/screen/page.tsx` (1632 lines):
  - Job selector dropdown (loads from `/api/jobs`)
  - Query input box with real-time tool-trace rendering
  - Live tool-event stream display (search_chunks, get_full_resume, list_all_candidates with status updates)
  - Final report cards: candidate assessments with score, evidence, unknowns, and citations
  - **Per-message feedback**: like/dislike/copy/retry buttons with per-message state (messageFeedback Map, not global scalar)
  - Screening history sidebar: previous screenings per job, clickable to load conversation history
  - Session persistence: conversationHistory + messageFeedback hydrated on page load

**Job Description Storage**:
- **Current**: JD stored in `jobs` table (database-backed, not sessionStorage)
- Loaded via selectedJobId → fetched from jobs list → passed to agent as context
- Deviates from PLAN's sessionStorage approach but provides better multi-session persistence

**Live Verification**: ✅ Code verified, full UI interaction not yet tested in session

- [x] Agent streaming works (tool events received and displayed)
- [x] Report schema validated against Zod
- [x] Per-message feedback UI implemented with messageIndex tracking
- [ ] Test full screening flow: select job → enter query → observe live tool trace → review final report → click like/retry
- [ ] Confirm job selection filters candidates in search results
- [ ] Verify screening history loads and displays correctly

**UI Features**:
- Live tool-call trace with candidate results preview (search_chunks shows candidate names + similarity scores)
- Citation excerpts displayed inline in assessment cards
- Thinking/reasoning process visible in the report (if generated by agent)
- Dark/light theme support via Tailwind
- Responsive grid layout for candidate assessment cards

---

## 7. End-to-End Validation Against PLAN's Notebook Queries

**Prerequisite**: Sample resumes uploaded and indexed (resume_chunks table populated)

The three notebook test queries from PLAN Section 7.7 should be run in order:

- [ ] **Query #1**: "Find candidates with strong Java and AWS experience"
  - Expected: Agent identifies 1–2 specific candidates by name
  - Success criteria: Tool trace shows search_chunks retrieved relevant chunks, agent grounded answer in specific citations
- [ ] **Query #2**: "Tell me about Mahesh's healthcare consulting experience"
  - Expected: Agent uses get_full_resume to stitch fragmented healthcare-related facts from multiple resume chunks
  - Success criteria: Tool trace shows search_chunks → get_full_resume → evidence combines multiple chunks from one candidate
- [ ] **Query #3**: "Give me a shortlist of PM/Scrum-master candidates suitable for this role"
  - Expected: Agent uses list_all_candidates to scan full pool, not just top-k vector hits
  - Success criteria: Tool trace shows list_all_candidates called, coverage beats naive RAG (find ≥3 qualified candidates)

**Coverage Verification**:
- [ ] Chunk counts are in expected ballpark: (sample set size) resumes → ~26 chunks/resume (using PLAN's 25-resume → 666 chunks ratio)
- [ ] Live tool trace confirms retrieval pattern: search_chunks → rerank → get_full_resume for coverage questions
- [ ] Citations are grounded in actual resume text (not hallucinated)
- [ ] Agent reasoning visible in screening_assessments.evidence array

**Notes**:
- These queries are designed to stress-test the three documented failure modes from PLAN Part 3: fragmentation (Q2), coverage (Q3), and direct matching (Q1).
- Session history (Sep 25) confirms agent has run against live database with real candidates, so live infrastructure is ready.
- Admin routes (`/api/admin/*`) currently have no auth protection; add Supabase RLS or middleware auth before production if needed

---

## Verification Checklist

- [x] `pnpm build` completes successfully on Node 24
- [x] Service-role key not exposed in client bundles (server-only in `lib/supabase/server.ts`)
- [x] Fetch cap logic fixed: uses `Set<string>` to prevent duplicate-ID bypass (line 148 in agent-tools.ts)
- [x] Agent loop recursion limit set (25, higher than PLAN's minimum 10)
- [x] Embeddings fixed to 1536 dimensions with validation on every call
- [x] Chunk size 800 with 100-char overlap (constants verified in chunk.ts)
- [x] 11 migrations applied successfully to Supabase
- [ ] Sample resumes ingested and chunk counts in expected ballpark
- [ ] Three notebook queries pass end-to-end
- [ ] Production deployment smoke-tested on Vercel

---

## Implementation Deviations from PLAN

These deviations were made for better product fit or to address discovered constraints:

### Architecture & Scope
1. **Auth Added** (not in PLAN's MVP scope)
   - Login/signup/logout routes implemented (`app/api/auth/*`)
   - Auth middleware created (`lib/supabase/middleware.ts`)
   - Candidate list filtered by user (job_id scoping)

2. **Upload Flow Merged into Candidates Page** (PLAN anticipated separate upload page)
   - Upload UI integrated into `app/candidates/page.tsx` (modal with drag-and-drop)
   - `/app/upload` directory exists but is empty (can be deleted)
   - Reduces page count; UX benefit of co-locating upload with candidate list

3. **Job Scoping Implemented** (PLAN noted as "single global pool, deliberate MVP cut")
   - `jobs` table created with CRUD (`createJob`, `updateJob`, `listJobs`, `getJobById`)
   - Candidates linked to jobs via `job_id` foreign key
   - Retrieval scoped by jobId: `searchChunks`, `listCandidates`, `match_resume_chunks` SQL all support job filtering
   - Jobs page created (`app/jobs/page.tsx`) to manage job descriptions and titles

### Persistence & Storage
4. **JD Storage: Database Instead of SessionStorage**
   - PLAN: "JD kept in sessionStorage because there's no jobs table"
   - Current: JD stored in `jobs` table, loaded by selectedJobId
   - Benefit: Multi-session persistence, job reuse, better than losing JD on page refresh

5. **Screening Persistence** (beyond PLAN's scope)
   - `screenings` table stores query, report, tool_calls, metadata
   - `screening_assessments` table stores per-candidate scores, evidence, unknowns
   - `screening_citations` table stores citations (resume excerpts) with tool source attribution
   - `screening_message_feedback` table stores per-message like/dislike reactions
   - Enables history sidebar, report replay, analytics

### Tooling & Operations
6. **Admin & Debugging Tools** (PLAN mentioned reindex as a future concern)
   - `/api/admin/reindex` endpoint for bulk resume chunk reindexing (POST `{candidateId, jobId}`)
   - `/api/admin/migrations` endpoint to run pending migrations
   - `scripts/reindex-candidates.ts` CLI tool for bulk reindexing
   - `tsconfig.scripts.json` created to support ts-node script execution
   - Helps recover from embedding model changes or job-scoping schema updates

### UI & Insights
7. **Architecture Diagram on Homepage** (nice-to-have, not in PLAN)
   - SVG flow diagram added to `app/page.tsx` showing end-to-end pipeline

8. **Per-Message Feedback** (PLAN didn't specify, but useful for UX)
   - Like/dislike/copy/retry buttons per message (not per report)
   - Feedback stored per messageIndex, not globally
   - Allows targeted iteration on specific agent outputs

### Model Configuration
9. **Recursion Limit Set to 25** (PLAN specified "capped at 10")
   - Allows agentic exploration with more tool calls
   - Trade-off: higher latency, more Groq tokens, but better coverage on complex queries

10. **Fetch Cap Reduced to 2** (PLAN specified "max 8")
    - Stricter constraint on full-resume fetches to prevent token overflow
    - Fixed duplicate-ID bypass: uses Set<string> for distinct candidate tracking

---

## Still To-Do Before Production

- [ ] Remove empty `/app/upload` directory (obsoleted by candidates-page upload)
- [ ] Add auth protection to admin routes (`/api/admin/*`) — currently open
- [ ] Test full E2E with notebook's three test queries
- [ ] Verify chunk count ratio for sample set (target: ~26 chunks/resume)
- [ ] Smoke-test on Vercel with production credentials

---

## Recommended Next Steps (Prioritized)

**Immediate** (required before production):
1. **Cleanup**: Delete empty `/app/upload` directory (no longer used)
2. **E2E Testing**: Run the three notebook test queries against `/screen`:
   - Query #1 (direct match)
   - Query #2 (fragmentation test)
   - Query #3 (coverage test with list_all_candidates)
3. **Verification**: Inspect live tool traces to confirm:
   - Query #1: relevant chunks appear in search_chunks results
   - Query #2: get_full_resume called and used to stitch answer
   - Query #3: list_all_candidates called, coverage > naive RAG
4. **Security**: Add auth to admin routes or document that they're dev-only

**Before Deployment**:
5. **Vercel Setup**: Link repo, set env vars, test production URL
6. **Final Smoke Test**: Run Query #1 against production; verify tool trace and report

**Nice-to-Have** (post-MVP):
7. Remove admin routes auth check and replace with Supabase RLS or Next.js middleware auth
8. Migrate JD back to sessionStorage if multi-job session isolation is desired (current: one JD per page load)
9. Set recursion limit to 10 if token usage is high (currently 25)
10. Implement per-job candidates pooling in UI (currently global filter)

---

## Quick Reference: Architecture Overview

```
┌─ Recruiter ────────────────────────────────────────────────────────┐
│                                                                    │
│  1. Upload Resumes                                                 │
│     ├─ app/candidates/page.tsx → drag-drop files                   │
│     ├─ POST /api/upload-url → signed Supabase Storage URL          │
│     └─ POST /api/ingest → parse/chunk/embed/insert to DB           │
│                                                                    │
│  2. Screen Candidates                                              │
│     ├─ app/screen/page.tsx → select job, enter query               │
│     ├─ POST /api/agent → LangGraph tool loop (25 recursion limit)  │
│     │   ├─ Tool: list_all_candidates (job-scoped)                  │
│     │   ├─ Tool: search_chunks (vector search + rerank)            │
│     │   └─ Tool: get_full_resume (fetch limit: 2)                  │
│     └─ Final structured report: ScreeningReportSchema (Zod)        │
│                                                                    │
│  3. Iterate & Persist                                              │
│     ├─ Like/dislike/retry per message (per-message feedback)       │
│     ├─ Screening history persisted to screenings table             │
│     └─ Citations stored in screening_citations                     │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘

Database (Supabase):
  - candidates (name, role_guess, job_id, full_text, storage_path)
  - resume_chunks (content, embedding[1536], candidate_id, job_id filter in SQL)
  - jobs (title, description, experience, skills)
  - screenings (job_id, query, report, tool_calls, metadata)
  - screening_assessments (candidate_id, score, evidence, unknowns)
  - screening_citations (content, tool source, candidate_name)
  - screening_message_feedback (messageIndex, feedback type, screening_id)

Key Constraints:
  - Embedding: 1536 dimensions (Gemini Embedding 2)
  - Chunk size: 800 chars, 100-char overlap
  - Fetch cap: 2 candidates per screening
  - Recursion limit: 25 (tool calls max)
  - Groq model: mixtral-8x7b-32768 (configurable)
```
