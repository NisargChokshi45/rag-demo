# RAG Resume Screening Features

This document tracks all features for the LangChain-based resume screening RAG system. Features are organized by status and priority.

## Legend
- ✅ **Implemented** - Feature is complete and tested
- 🔄 **In Progress** - Feature is actively being developed
- 📋 **Planned** - Feature is next in the backlog
- 💭 **Proposed** - Feature idea, not yet prioritized
- ⚠️ **Known Limitation** - Deferred by design (MVP cut)
- 🚫 **Blocked** - Waiting on external dependency or prerequisite

---

## [PLAN.md](./PLAN.md) Implementation Checklist

Derived directly from [PLAN.md](./PLAN.md). Checked items are verified against current code (not against this document's own status labels below, which had drifted in places - see "Deviations" at the end of this section).

### Build Order

**1. Setup**
- [x] Supabase project with `vector` extension enabled (`supabase/schema.sql`)
- [x] `schema.sql` covers candidates, resume_chunks, jobs, screenings, screening_assessments
- [ ] `resumes` Storage bucket - not verifiable from code (Supabase dashboard config)
- [x] LangChain/LangGraph, `@langchain/groq`, `@supabase/supabase-js`, `unpdf`, `zod` installed (`package.json`)

**2. Test data**
- [x] Sample resume PDFs present in `resumes/` (e.g. `adelina_project_manager.pdf`, `anudeep_java_developer.pdf`, …)

**3. Ingestion pipeline**
- [x] Signed-upload flow (`app/api/upload-url/route.ts`, `app/upload/page.tsx`)
- [x] `api/ingest`: parse → reject empty text → chunk → sequential embed with retry/backoff → insert
- [x] Sequential embedding with exponential backoff (`app/api/ingest/route.ts:107-120`, 1s/2s/4s via `Math.pow(2, attempt) * 1000`)
- [x] Batch delay between embedding calls (`app/api/ingest/route.ts:136-139`)
- [x] Candidate rolled back (`deleteCandidate`) if chunk insertion fails (`app/api/ingest/route.ts:156`)
- [x] `runtime = "nodejs"`, `maxDuration = 300` set on ingest route
- [x] `002_gemini_embedding_2.sql` migration exists (`supabase/migrations/`)

**4. Candidates page**
- [x] Upload → candidates listed (`app/candidates/page.tsx`, `app/api/candidates/route.ts`)

**5. Agent route**
- [x] Three tools implemented: `list_all_candidates`, `search_chunks`, `get_full_resume` (`lib/agent-tools.ts`)
- [x] LangGraph `createReactAgent` tool loop with recursion limit 10 (`app/api/agent/route.ts:68`)
- [x] Final structured-output call via `withStructuredOutput(ScreeningReportSchema)` (`app/api/agent/route.ts:131`)
- [x] `runtime = "nodejs"`, `maxDuration = 300` set on agent route

**6. Screen page UI**
- [x] Streamed tool-call trace and structured report cards (`app/screen/page.tsx`)
- [ ] Job description in browser session storage - **deviation**, see below

**7. End-to-end test**
- [ ] Replayed the three example queries against `/screen` - not verified this session

**8. Deploy**
- [ ] Pushed to GitHub / `vercel link` / env vars set in Vercel dashboard - not verifiable from code
- [ ] Production smoke test of the three queries - not verified this session

### Hard Technical Constraints

- [x] 1. Uploads go client → Supabase Storage via signed URL, never raw POST to a Next.js route
- [x] 2. Embedding dimension is 1536, validated on every call (`lib/embeddings.ts:37-41`)
- [x] 3. Task-prompt formatting (`title: none | text: ...` / `task: search result | query: ...`) (`lib/embeddings.ts:5-9`)
- [x] 4. Sequential embedding with retry/backoff, not `Promise.all` fan-out (`app/api/ingest/route.ts`)
- [x] 5. `maxDuration` + `runtime = "nodejs"` set on both `ingest` and `agent` routes
- [x] 6. PDF parsing uses `unpdf`, not `pdf-parse` (`lib/pdf.ts`)
- [x] 7. `get_full_resume` capped at 8 distinct candidates per run (`lib/agent-tools.ts:146`)
- [x] 8. Sample resume PDFs present in `resumes/`
- [x] 9. Service-role key server-only (`lib/supabase/server.ts`), `.env`/`.env.local` gitignored (`.gitignore:20-22`)

### Verification (replaces the old "Verification Checklist (Before Production)" section below)

- [ ] Ingest sample resumes; confirm `resume_chunks` row count is in a reasonable ratio to resume count
- [ ] Run the example queries against `/screen` and confirm correct behavior
- [ ] `next build` passes locally with no type errors - not re-run this session against current working tree (auth and other files changed since the last known-good build)
- [ ] Confirm Supabase service-role key never appears in client-side bundles
- [ ] Re-run the three test queries against the deployed Vercel URL

### Deviations from [PLAN.md](./PLAN.md) (intentional, not gaps)

- **Jobs table + dropdown instead of session-storage JD.** PLAN.md explicitly said "no jobs table" and job description in `sessionStorage`. The implementation instead added a `jobs` table (`supabase/migrations/003_jobs.sql`) with `app/jobs/`, `GET`/`POST /api/jobs`, and a job-selection dropdown on `/screen`. No `sessionStorage` usage exists.
- **Screening persistence added.** PLAN.md's MVP had no screening history; `screenings` + `screening_assessments` tables (`004_screenings.sql`) and `createScreening`/`getScreeningsByJob`/`getAssessmentsByCandidate` (`lib/db.ts`) were added beyond the MVP scope.
- **Feature-flagged auth added.** PLAN.md said "no auth for MVP"; a complete Supabase Auth implementation exists (`lib/auth.ts`, `middleware.ts`, `app/login/`, `app/api/auth/`) but is disabled by default via `NEXT_PUBLIC_AUTH_ENABLED`.
- **`app/api/debug` route exists**, not mentioned in PLAN.md's app structure.

### Known Gaps (not in PLAN.md's cut-line, but real)

- [ ] Job-scoped search: `search_chunks`/`list_all_candidates` don't accept or filter by `jobId` (0 matches in `lib/agent-tools.ts`) - candidate pool is global regardless of selected job
- [ ] No `/api/jobs/[id]` route (no GET-one/PUT/DELETE for a single job)
- [ ] No `/api/screenings` route despite persistence functions existing in `lib/db.ts`

---

## Core Features (MVP - Phase 1)

### Resume Ingestion Pipeline

#### ✅ PDF Upload with Signed URLs
- **Status:** Implemented
- **Description:** Users upload resume PDFs via Supabase Storage signed upload URLs (client-side, avoids 4.5MB POST limit)
- **Files:** `app/upload/page.tsx`, `app/api/upload-url/route.ts`
- **Verified:** PDF successfully downloads from Supabase Storage in ingest route

#### ✅ PDF Parsing
- **Status:** Implemented
- **Description:** Extract text from PDFs using `unpdf` library (not `pdf-parse` due to serverless bundler issues)
- **Files:** `lib/pdf.ts`
- **Features:**
  - Handles both string and array text output
  - Rejects empty text with clear error message
  - Proper error logging and propagation

#### ✅ Text Chunking
- **Status:** Implemented
- **Description:** Hand-rolled sliding-window text splitter with configurable chunk size and overlap
- **Files:** `lib/chunk.ts`
- **Spec:**
  - Chunk size: 800 characters
  - Overlap: 100 characters
  - No external dependencies (@langchain/textsplitters not used per [PLAN.md](./PLAN.md) design)

#### ✅ Embedding Generation (Gemini)
- **Status:** Implemented
- **Description:** Generate embeddings for chunks using Google Generative AI's Gemini Embedding 2
- **Files:** `lib/embeddings.ts`
- **Spec:**
  - Model: `gemini-embedding-2`
  - Dimensions: 1536 (validated on every call)
  - Task prompt formatting: `title: none | text: ...` for documents, `task: search result | query: ...` for queries
  - Sequential embedding with exponential backoff (1s, 2s, 4s)
  - Batch delay: 500ms between every 5 chunks
  - Retry logic: 3 attempts per chunk

#### ✅ Vector Storage (Supabase pgvector)
- **Status:** Implemented
- **Description:** Store embeddings in Supabase Postgres with pgvector extension and HNSW indexing
- **Files:** `supabase/schema.sql`, `lib/db.ts`
- **Schema:**
  - `candidates` table: name, role_guess, storage_path, original_filename, full_text
  - `resume_chunks` table: content, embedding (vector(1536)), candidate_id, chunk_index
  - `jobs` table: title, description, experience, skills[]
  - HNSW index on embeddings for cosine similarity search
  - Cascade delete on candidate removal

#### ✅ Candidate Management
- **Status:** Implemented
- **Description:** Track ingested candidates with metadata and chunk counts
- **Files:** `app/candidates/page.tsx`, `app/api/candidates/route.ts`, `lib/db.ts`
- **Features:**
  - List all candidates with chunk counts
  - View full resume text
  - Delete candidate (cascades to chunks)
  - Auto-detect role from resume content (Java/Python/PM/QA/DevOps/etc.)
  - Extract name from filename

---

### AI-Powered Screening

#### ✅ Agent Loop (LangGraph)
- **Status:** Implemented
- **Description:** Agentic reasoning loop using LangGraph's `createReactAgent` for tool calling
- **Files:** `app/api/agent/route.ts`, `lib/agent-tools.ts`, `lib/models.ts`
- **Spec:**
  - Model: Groq `llama-3.3-70b-versatile` (or configurable via `GROQ_CHAT_MODEL`)
  - Tool calling loop with 10-step recursion limit (per [PLAN.md](./PLAN.md))
  - Streaming events with `version: "v2"`
  - Temperature: 0.2 for agent reasoning

#### ✅ Agent Tools (3 Core Tools)
- **Status:** Implemented
- **Description:** Three LangChain tools for agent reasoning
- **Files:** `lib/agent-tools.ts`

**Tool 1: `list_all_candidates`**
- Lists all ingested candidates with ID, name, role, and chunk count
- Used by agent to explore full candidate pool
- No parameters

**Tool 2: `search_chunks` (Vector Search + Reranking)**
- Search resume chunks by vector similarity
- Parameters: `query` (string)
- Returns: Top 5 candidates with relevance scores (0-10)
- Reranking: Uses Groq LLM to rate relevance of each chunk group
- Returns candidate ID, name, relevance score, and top 3 chunks per candidate

**Tool 3: `get_full_resume`**
- Retrieve complete resume text for a specific candidate
- Parameters: `candidateId` (string)
- Returns: Full resume text
- Fetch cap: Max 8 distinct candidates per agent run (enforced in tool implementation)

#### ✅ LLM Reranking
- **Status:** Implemented
- **Description:** Groq LLM reranking inside `search_chunks` tool to improve relevance scoring
- **Files:** `lib/agent-tools.ts:66-74`, `lib/models.ts`
- **Process:**
  - Vector search returns top 15 chunks
  - Group by candidate
  - For each candidate, use Groq to rate relevance on 0-10 scale
  - Return top 5 candidates sorted by score
  - Sequential processing (not parallelized)

#### ✅ Structured Screening Reports
- **Status:** Implemented
- **Description:** Generate structured candidate assessment reports using Zod schemas and LLM structured output
- **Files:** `lib/schema.ts`, `app/api/agent/route.ts:118-119`
- **Schema:**
  ```typescript
  {
    query: string
    assessments: [
      {
        candidateId: string
        candidateName: string
        score: 0-100
        evidence: string[]
        unknowns: string[]
      }
    ]
    summary: string
  }
  ```
- **Process:**
  - Agent loop completes
  - Collect all tool call history
  - Call Groq with structured output schema
  - Generate final report with assessments for each candidate

#### ✅ Job Context Integration
- **Status:** Implemented (Partial)
- **Description:** Include job criteria in agent reasoning
- **Files:** `app/api/agent/route.ts:36-43`, `app/screen/page.tsx:48-49`
- **Features:**
  - Job selection dropdown on screening page
  - Job description, experience, and skills passed to agent system prompt
  - Agent uses job context to reason about candidate fit
- **⚠️ Limitation:** Search not job-scoped (searches all candidates globally; see Issue #1 in review)

---

### User Interface

#### ✅ Upload Page
- **Status:** Implemented
- **Description:** Multi-file resume upload interface
- **Files:** `app/upload/page.tsx`
- **Features:**
  - Textarea for job description
  - Multi-file picker for resumes
  - Signed URL generation via `api/upload-url`
  - Upload progress indicator
  - Validation: file type, size checks
  - Error handling and user feedback

#### ✅ Candidates Page
- **Status:** Implemented
- **Description:** List and explore ingested candidates
- **Files:** `app/candidates/page.tsx`, `app/api/candidates/route.ts`
- **Features:**
  - List all candidates with name, role guess, chunk count
  - View full resume in modal
  - Delete candidate
  - Link to screening page
  - Job filter (if job selected via query param)

#### ✅ Screening Page (Chat UI)
- **Status:** Implemented
- **Description:** Main screening interface with live tool traces and reports
- **Files:** `app/screen/page.tsx`
- **Features:**
  - Query input box
  - Job selection dropdown
  - Live tool-call trace (streaming NDJSON)
  - Screening history sidebar (localStorage)
  - Candidate assessment cards with scores and evidence
  - Load from history
  - Clear history button
  - Responsive layout (mobile-friendly)

#### ✅ Responsive Navigation
- **Status:** Implemented
- **Description:** Top navigation bar linking all pages
- **Files:** `app/layout.tsx`, global styles
- **Features:**
  - Links to Upload, Candidates, Screen pages
  - Responsive on mobile (hamburger menu if needed)

---

## Phase 2 Features (In Progress / Planned)

### Authentication (Feature-Flagged, Disabled by Default)

#### ✅ Supabase Auth Integration
- **Status:** Implemented (Disabled by default)
- **Description:** Complete authentication system using Supabase Auth with feature flags
- **Files:** `lib/auth.ts`, `lib/supabase/server.ts`, `lib/supabase/middleware.ts`, `middleware.ts`
- **Features:**
  - ✅ Login/Logout routes (`/api/auth/login`, `/api/auth/logout`, `/api/auth/signup`)
  - ✅ Login page with sign up toggle (`/login`)
  - ✅ Session management via `@supabase/ssr`
  - ✅ Middleware for session refresh
  - ✅ Optional auth checks on API routes (controlled by `NEXT_PUBLIC_AUTH_ENABLED`)
  - ✅ Auth hook for client components (`lib/hooks/useAuth.ts`)
  - ✅ Auth helper functions (`lib/auth.ts`)

**Enabling:**
1. Set `NEXT_PUBLIC_AUTH_ENABLED=true` in `.env.local`
2. Restart dev server
3. Login page appears at `/login`

**Documentation:** See [AUTH_SETUP.md](./AUTH_SETUP.md) for complete setup guide

#### 📋 User Data Isolation (Requires Auth)
- **Status:** Planned
- **Description:** Scope all queries to user's own data when `NEXT_PUBLIC_USER_DATA_ISOLATION=true`
- **Requires:** `NEXT_PUBLIC_AUTH_ENABLED=true` + schema changes
- **Schema changes needed:**
  - Add `user_id UUID` to candidates, jobs, screenings tables
  - Create RLS policies on each table
- **Code changes needed:**
  - Update `lib/db.ts` to filter by user_id
  - Update agent tools to accept userId parameter
  - Update RPC function `match_resume_chunks` to filter by user

### Job Management

#### 🔄 Job CRUD Operations
- **Status:** In Progress - Create/List implemented, Read-one/Update/Delete missing
- **Description:** Full Create, Read, Update, Delete for job postings
- **Implemented:**
  - `app/jobs/page.tsx` (list jobs)
  - `app/api/jobs/route.ts` (`GET` all jobs, `POST` create)
- **Still needed:**
  - `app/jobs/[id]/page.tsx` (view job details)
  - `app/api/jobs/[id]/route.ts` (GET one, PUT, DELETE)
  - Edit job details
  - Delete job (soft delete recommended to preserve screenings)

#### 📋 Job Selection Enforcement
- **Status:** Planned
- **Description:** Scope candidate pool and screening to specific jobs
- **Files:** `lib/agent-tools.ts`, `lib/db.ts`, `supabase/schema.sql`
- **Changes:**
  - Add `jobId` parameter to `search_chunks` and `list_all_candidates` tools
  - Filter candidates by job in RPC function (requires job_candidates relationship table or job_id on candidates)
  - Update system prompt to restrict search to job-specific candidates
- **Prerequisite:** Decide on data model (option A: add job_id to candidates; option B: create job_candidates join table)
- **Impact:** Resolves Issue #1 from review (job-scoped filtering)

---

### Screening Management & Persistence

#### 🔄 Screening History Database
- **Status:** In Progress - Persistence implemented, no API route or export yet
- **Description:** Persist screening queries and reports to database (not just localStorage)
- **Implemented:**
  - `supabase/migrations/004_screenings.sql` - `screenings` + `screening_assessments` tables
  - `lib/db.ts`: `createScreening`, `getScreeningsByJob`, `getAssessmentsByCandidate`
  - `app/api/agent/route.ts` calls `createScreening` after report generation
- **Still needed:**
  - `app/api/screenings/route.ts` (GET, DELETE) - no route currently exposes `getScreeningsByJob`
  - Delete screening
  - Export screening report as JSON/CSV
- **Impact:** Resolves Issue #2 from review (history persistence); enables auditing

#### 📋 Screening Comparison
- **Status:** Planned
- **Description:** Side-by-side comparison of multiple screening reports
- **Files:** `app/screenings/compare/page.tsx`
- **Features:**
  - Select 2-3 screenings from history
  - Display candidate assessments side-by-side
  - Highlight differences in scores/evidence
  - Show tool call divergence

#### 📋 Screening Export
- **Status:** Planned
- **Description:** Export screening reports in multiple formats
- **Files:** `app/api/screenings/[id]/export/route.ts`
- **Formats:**
  - JSON (raw data)
  - CSV (candidate assessments table)
  - PDF (formatted report for sharing)
- **Features:**
  - Include query, job context, and assessments
  - Timestamp and metadata

---

### Advanced Search & Analytics

#### 💭 Candidate Search Filters
- **Status:** Proposed
- **Description:** Filter candidates by extracted metadata (role, skills, experience)
- **Files:** `app/candidates/page.tsx`, `lib/db.ts`
- **Features:**
  - Filter by detected role
  - Filter by presence of keywords
  - Sort by chunk count, upload date
  - Full-text search on resume content

#### 💭 Screening Analytics Dashboard
- **Status:** Proposed
- **Description:** View screening metrics and trends
- **Files:** `app/analytics/page.tsx`
- **Features:**
  - Total screenings run
  - Average candidate scores per job
  - Most common tool calls
  - Screening time trends
  - Candidate pool size

#### 💭 Re-screening History
- **Status:** Proposed
- **Description:** Track same query across different candidate pool snapshots
- **Files:** TBD (requires schema changes)
- **Use Case:** See how new resume uploads affect screening results for the same job

---

## Optimization & Performance (Phase 3)

#### 💭 Batch Embedding Optimization
- **Status:** Proposed
- **Description:** Optimize embedding generation with batching
- **Current State:** Sequential single-chunk embedding with 500ms batch delay
- **Proposed:**
  - Batch multiple chunks per API call (if Gemini API supports it)
  - Parallel embedding with rate limiting (2-3 concurrent requests)
  - Reduce batch delay to 200ms after profiling
- **Impact:** Reduce ingest time by 50-70%
- **Risk:** May hit API rate limits; requires testing

#### 💭 Search Result Caching
- **Status:** Proposed
- **Description:** Cache embedding search results for common queries
- **Implementation:**
  - Redis cache layer for query embeddings
  - TTL: 1 hour or manual invalidation on candidate upload
  - Key: hash(query_embedding)
- **Impact:** Reduce API calls for repeated screening questions

#### 💭 Reranking Optimization
- **Status:** Proposed
- **Description:** Optimize reranking step (currently sequential Groq calls)
- **Current State:** 1 Groq call per candidate group (5-15 calls per search)
- **Proposed:**
  - Batch reranking: 2-3 candidate groups per Groq prompt
  - Use token counting to optimize prompt length
  - Consider cheaper/faster model for reranking vs. final report
- **Impact:** Reduce agent loop time by 30-40%

---

## Data & Privacy (Phase 4)

#### 💭 User Authentication & Authorization
- **Status:** Proposed
- **Description:** Add multi-user support with auth
- **Components:**
  - User accounts (NextAuth.js or Supabase Auth)
  - Per-user candidate pools and job listings
  - Screening access control (shared/private)
- **Schema Changes:**
  - Add user_id to candidates, jobs, screenings tables
  - Row-level security (RLS) policies in Supabase

#### 💭 Resume Data Privacy
- **Status:** Proposed
- **Description:** Encrypt sensitive resume data at rest
- **Components:**
  - Encrypt full_text in candidates table
  - Decrypt only when needed (authenticated users)
  - Audit log for access

#### 💭 GDPR Compliance
- **Status:** Proposed
- **Description:** Data export and deletion for privacy regulations
- **Features:**
  - Export user data (all screenings, candidates, jobs)
  - Delete user data cascade
  - Privacy policy and consent flow

---

## Integrations (Future)

#### 💭 ATS Integration
- **Status:** Proposed
- **Description:** Connect to Applicant Tracking Systems
- **Targets:** Workable, Lever, Bamboo HR
- **Features:**
  - Import candidate resumes from ATS
  - Push screening results back to ATS
  - Sync job postings

#### 💭 Email Notifications
- **Status:** Proposed
- **Description:** Notify recruiters of screening completion
- **Features:**
  - Email when screening complete
  - Email digest of high-scoring candidates
  - Configurable notification preferences

#### 💭 Slack Bot
- **Status:** Proposed
- **Description:** Run screenings and view reports from Slack
- **Features:**
  - `/screen <query>` command
  - Async results in thread
  - Export report directly to Slack

---

## Known Limitations (MVP Cuts - By Design)

### ⚠️ Single Global Candidate Pool
- **Status:** Known Limitation
- **Reason:** MVP design simplification (PLAN.md line 47)
- **Impact:** Cannot isolate candidates per job without job-scoped filtering (Phase 2 feature)
- **Workaround:** Use job context in screening prompt (implemented); true filtering deferred
- **Migration Path:** Phase 2 job enforcement feature will address this

### ⚠️ Auth Disabled by Default
- **Status:** Known Limitation
- **Reason:** MVP scope; auth is implemented (see Phase 2) but off by default via `NEXT_PUBLIC_AUTH_ENABLED`
- **Impact:** Single shared candidate pool and jobs (no multi-tenancy) unless auth + `NEXT_PUBLIC_USER_DATA_ISOLATION` are both enabled
- **Migration Path:** Enable the existing flags; see [AUTH_SETUP.md](./AUTH_SETUP.md). Per-user data isolation (RLS, user_id columns) is still Planned

### ⚠️ No Streaming Resume Download
- **Status:** Known Limitation
- **Reason:** Vercel 4.5MB POST limit requires signed URLs (implementation complete)
- **Status:** Actually resolved - signed URL flow implemented ✅

### ⚠️ Reranking Sequential Only
- **Status:** Performance limitation
- **Current:** 1 Groq call per candidate in search results
- **Impact:** Search slow for large candidate pools (100+)
- **Migration Path:** Phase 3 batch reranking optimization

---

*Verification checklist moved to "[PLAN.md](./PLAN.md) Implementation Checklist" near the top of this document.*

## Backlog (Long-term Ideas)

- [ ] Fine-tuning embeddings for specific domains (healthcare, finance)
- [ ] Custom LLM prompt templates for different job types
- [ ] Resume standardization/normalization before chunking
- [ ] Skill extraction and taxonomy tagging
- [ ] Salary range negotiation insights
- [ ] Candidate fit timeline analysis
- [ ] Bias detection in screening (fairness audit)

---

## Glossary

- **RAG:** Retrieval-Augmented Generation (combine vector search with LLM reasoning)
- **pgvector:** Postgres extension for vector similarity search
- **HNSW:** Hierarchical Navigable Small World (fast approximate nearest neighbor search)
- **LangChain:** Python/JS library for building LLM applications
- **LangGraph:** LangChain's framework for agentic AI loops
- **Signed URL:** Time-limited upload URL from Supabase (avoids POST size limits)
- **Embedding:** Numerical vector representation of text (used for semantic search)
- **Reranking:** Re-scoring search results with an LLM for better relevance

---

## Documents: Advanced RAG Hands-On (`/documents`)

Long-form PDF Q&A across three document shapes: narrative text (GPO annual report), long chapter-structured reports (World Bank Global Economic Prospects) and visual reports with tables and footnotes (Apple iMac environmental report). Sample questions and source PDFs live in `documents/`.

- [x] Layout-aware parsing with `unpdf` item positions: lines, cells, font-size headings, multi-column reading order (`lib/documents/layout.ts`, `structure.ts`)
- [x] Three chunking strategies: `narrative`, `long_structured` (section rows plus child windows), `element_rich` (tables, footnotes, figure captions as their own chunks) (`lib/documents/chunk.ts`)
- [x] Chunking fixes from the Advanced RAG field guide: abbreviation- and decimal-aware sentence splitter (the old regex dropped text before "6.3"), sentence-level overlap of ~240 chars in every strategy, `long_structured` parents of ~3,300 chars that each child points to, footnote markers linked to their note text in `element_rich`, NFKC ligature repair, and subsection headings detected by font family (`lib/documents/chunk.ts`, `layout.ts`, `structure.ts`)
- [x] Documents: re-parse existing uploads with their current strategy (`scripts/reparse-documents.ts`, `reparseDocument` in `lib/documents/ingest.ts`, `POST /api/documents/[id]/reparse`, "Re-parse all" button and per-card "Re-parse" button on `app/documents/page.tsx`). Old chunks are replaced only after the PDF parses.
- [x] Documents: vision descriptions for chart pages. Pages with bright filled shapes are cut out with `pdf-lib` and read by Gemini (`GEMINI_VISION_MODEL`, default `gemini-3.8-flash`, cap `VISION_MAX_PAGES`, default 60). Each description is cached per page in `document_figures` and stored as a `figure` chunk. Resumable and time-budgeted (`lib/documents/vision.ts`, migration `018`). Checked offline on the iMac bar chart (page 2): totals 445 kg, -99 kg and 346 kg read correctly
- [x] Documents: rebuild tables drawn as shaded cells. Filled rectangles come from the pdf.js operator list; a cluster with a dark header bar is a table, and rows follow the cell edges (`lib/documents/drawings.ts`). Checked offline on iMac pages 10 and 12, and GPO/GEP chunk text unchanged
- [x] Documents: "Te" for "The" ligature loss not reproduced with `unpdf` on the GEP PDF (0 "Te" words, 504 "The", "conflict" intact), so no repair was added. The field guide's extractor dropped it; re-open only if a document shows it (checked offline)
- [x] Migration `016_documents.sql`: `documents`, `document_chunks`, HNSW + GIN indexes, `search_document_chunks` hybrid RPC (vector + keyword, reciprocal rank fusion)
- [x] Upload flow parses, chunks and embeds during upload; embedding is resumable in time-budgeted steps (`lib/documents/ingest.ts`, `app/api/documents/[id]/embed`)
- [x] LangGraph answer pipeline on the shared Groq chat model: retrieve → rerank → expand → generate → verify, with one rewrite-and-retry when ungrounded (`lib/documents/graph.ts`)
- [x] Citations restricted to retrieved passages; numbers not found in cited passages are flagged
- [x] `/documents` list and upload page, `/documents/[id]` chat with source panel and retrieval trace
- [x] `/documents` "Add Document" modal with multi-file upload, per-file title and shared document shape; list has title search, sort and grid/list view, and per-document "View document" (PDF) and "View parsed document" (stored chunks) modals (`app/documents/page.tsx`, `listDocuments` / `listDocumentChunks` in `lib/db.ts`, `app/api/documents/[id]` `?view=pdf|parsed`)
- [x] Embedding failures show as "Paused" (not "Failed") on the list card. Re-parse rebuilds the chunks and embeds them again; quota errors show a live countdown to the stored `retry_at` time (`app/api/documents/[id]/embed`, `lib/embeddings.ts`, `app/documents/page.tsx`, migration `020`)
- [x] `/screen` asks what to screen (candidates for a job or documents). Document sessions answer through `/api/documents/[id]/chat` with cited answers and are saved with `screening_type` and `document_id` (`supabase/migrations/017_screening_documents.sql`). Existing sessions stay job screenings. History can be filtered by type
- [ ] Verified against live Supabase: migration 017 applied, then a document screening saved, reloaded from history and checked after its document is deleted
- [ ] Verified against live Supabase and Gemini/Groq: migration applied, upload end-to-end, eval pass rate (run `npx tsx --env-file=.env.local scripts/eval-documents.ts documents/`)
- [x] Charts without text labels (iMac bar charts drawn as vector graphics) are read by the vision pass above
- [x] `element_rich` notes: a footnote is a note only when it opens with its number, a symbol or a Note/Source label. Wrapped lines stay with their note, numbers run together on one line are split, and the "Endnotes" running title is dropped, so iMac notes 1–19 come out whole. Raised digits that pdf.js joins onto their word ("achieved7") link to the note when the number names an existing note, and `[Note n]` text is up to 700 characters. Only `element_rich` uses the new rules; GPO and GEP chunk output is byte-identical to before (`lib/documents/structure.ts` `richNotes`, `chunk.ts`)
- [x] `element_rich` callouts: a large line with a figure (pull quote or stat value) is a `callout` chunk, and the small labels under a stat value join it. Stored under `kind = 'callout'` (migration `019`), a reserved slot in rerank. Vision figure chunks now carry their section path (`lib/db.ts`, `vision.ts`)
- [x] `element_rich` stat rows: value and label cells side by side (iMac page 1) become one `callout` chunk per stat, and wrapped label lines join their stat. Raised markers are placed on their own text item, so they stay in place in short cells and in headings (`lib/documents/layout.ts`, `structure.ts`)
- [x] `element_rich` chart labels: short labels on a chart page become one `figure` chunk per page ("Chart labels on page N: …"), kept apart from the vision description chunk. Labels that wrap onto the next line join their label (`structure.ts`)
- [x] `element_rich` note markers on headings move to the next paragraph, so their notes link to the claim that follows (`structure.ts`)
- [x] `element_rich` stat panels: a bold heading over a column of stat values becomes one callout chunk, "<heading>: <stat> - <stat>", with wrapped label lines included. iMac page 1 gives "Progress toward our 2030 goal: More than 15% recycled content - Over 20% of manufacturing electricity sourced from renewable energy" and the "Packaging" panel. Stat cells must be column-width and lines have at most two cells, so table rows are not taken (`structure.ts` `buildStatPanels`)
- [ ] `element_rich` iMac note 6 has no marker in the body text: the one raised "6" on page 1 is the page number
- [x] Vision stays on Gemini (`GEMINI_VISION_MODEL`). Groq takes images, not PDFs, so a Groq backend would need a page rasteriser, which is not installed
- [x] Chapter and region metadata on every chunk, from the report's own headings (`lib/documents/regions.ts`, `chunk.ts`). Questions that name a chapter, a region or its abbreviation are filtered; a place name (e.g. Pakistan) routes to the region whose tagged passages mention it most. Thin filtered results widen to the whole document (`lib/documents/routing.ts`, migration `018`)
- [x] Keyword leg ORs the question terms (was AND via `websearch_to_tsquery`), and the vector leg uses an iterative HNSW scan so the document filter does not starve it (migration `018_document_retrieval.sql`)
- [x] Rerank strategy selected by `RERANK_MODE` (`none`, `llm`, `cross-encoder`). Unset, the default follows the document shape: `element_rich` uses `none`, the others use `llm`. The LLM reranker sees full passage text and reserves a slot for tables and figures. The cross-encoder (`Xenova/ms-marco-MiniLM-L-6-v2` via `@huggingface/transformers`) loads and scores pairs in this sandbox; its quality is not yet measured (`lib/documents/rerank.ts`)
- [x] Document shape reaches the answer graph (chat route and eval pass `strategy`). Routing runs only for `long_structured`; `long_structured` answers from the parent sections of the reranked children, in rank order, with no neighbour windows; `narrative` and `element_rich` keep hit plus neighbour expansion (`lib/documents/graph.ts`)
- [x] Parent sections (`kind = 'section'`) are excluded from `search_document_chunks` in migration `018`, so only children compete in search. Offline parse check: GEP gives 413 parents and 1,174 children with none orphaned; GPO 285 narrative chunks; iMac 72 chunks in `element_rich` (5 table, 21 footnote, 36 text, 8 callout, 1 figure, plus 18 of 19 notes linked)
- [x] Bold headings and single-pass extraction: `lib/documents/items.ts` reads positioned text and the bold flag (from the font's PostScript name, which unpdf does not expose) in one pdf.js pass, and joins letter-spaced titles ("A U D I T" to "AUDIT"). A bold, short, single-cell line at body size is a subsection heading when it has two or more words, sits clear of the header and footer bands, and has a paragraph-sized gap above it. Bold lines in the header or footer band that repeat on an adjacent page are running headers and are dropped (`layout.ts`, `structure.ts`). Offline check against the original code: GPO gains 3 real titles and no memo labels or running headers; iMac gains 2; GEP gains 29 subsections (two of them, pages 196-197, are footer titles that may be running headers) and drops 8 running headers. Existing documents need a re-parse to pick this up
- [ ] Parent sections are still embedded at ingest (413 extra calls on GEP) though search never reads them. Skip them in the embed loop and its pending count to save quota
- [x] Eval harness compares rerank modes on the same chunks (`--cache` skips re-ingest), with recall@20, hit@6 and MRR, plus a Pakistan (region routing) and two iMac table questions (`scripts/eval-documents.ts`)
- [ ] Verified against live Supabase: migration `018` applied and `refresh` metadata backfill run (`npx tsx --env-file=.env.local scripts/reparse-documents.ts --metadata`), or a full re-parse for documents whose text changed
- [ ] Eval run against live services to choose RERANK_MODE: `npx tsx --env-file=.env.local scripts/eval-documents.ts documents/ --cache .eval-documents.json`
- [ ] Per-user isolation for documents when `NEXT_PUBLIC_USER_DATA_ISOLATION` is on (`user_id` is stored; list queries do not filter yet)
