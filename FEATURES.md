# RAG Resume Screening Features

This document tracks all features for the LangChain-based resume screening RAG system. Features are organized by status and priority.

## Legend
- ✅ **Implemented** — Feature is complete and tested
- 🔄 **In Progress** — Feature is actively being developed
- 📋 **Planned** — Feature is next in the backlog
- 💭 **Proposed** — Feature idea, not yet prioritized
- ⚠️ **Known Limitation** — Deferred by design (MVP cut)
- 🚫 **Blocked** — Waiting on external dependency or prerequisite

---

## Core Features (MVP — Phase 1)

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
  - No external dependencies (@langchain/textsplitters not used per PLAN.md design)

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
  - Tool calling loop with 10-step recursion limit (per PLAN.md)
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

## Phase 2 Features (Planned)

### Job Management

#### 📋 Job CRUD Operations
- **Status:** Planned
- **Description:** Full Create, Read, Update, Delete for job postings
- **Required Files:**
  - `app/jobs/page.tsx` (list jobs)
  - `app/jobs/[id]/page.tsx` (view job details)
  - `app/api/jobs/route.ts` (GET all jobs)
  - `app/api/jobs/[id]/route.ts` (GET, PUT, DELETE)
- **Schema:** id, title, description, experience, skills[], created_at
- **Features:**
  - Create new job posting
  - Edit job details
  - Delete job (soft delete recommended to preserve screenings)
  - Display job details on screening page

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

#### 📋 Screening History Database
- **Status:** Planned
- **Description:** Persist screening queries and reports to database (not just localStorage)
- **Required Files:**
  - `supabase/migrations/XXX_screenings_table.sql` (new migration)
  - `lib/db.ts` (new functions: saveScreening, getScreenings, deleteScreening)
  - `app/api/screenings/route.ts` (GET, POST, DELETE)
- **Schema:**
  ```sql
  CREATE TABLE screenings (
    id UUID PRIMARY KEY,
    job_id UUID REFERENCES jobs(id),
    query TEXT NOT NULL,
    report_json JSONB,
    tool_calls_json JSONB,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
  )
  ```
- **Features:**
  - Save screening after report generation
  - Retrieve screening history (with filters by job, date range)
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

## Known Limitations (MVP Cuts — By Design)

### ⚠️ Single Global Candidate Pool
- **Status:** Known Limitation
- **Reason:** MVP design simplification (PLAN.md line 47)
- **Impact:** Cannot isolate candidates per job without job-scoped filtering (Phase 2 feature)
- **Workaround:** Use job context in screening prompt (implemented); true filtering deferred
- **Migration Path:** Phase 2 job enforcement feature will address this

### ⚠️ No User Authentication
- **Status:** Known Limitation
- **Reason:** MVP scope; focus on core RAG pipeline
- **Impact:** Single shared candidate pool and jobs (no multi-tenancy)
- **Migration Path:** Phase 4 auth feature will address this

### ⚠️ No Streaming Resume Download
- **Status:** Known Limitation
- **Reason:** Vercel 4.5MB POST limit requires signed URLs (implementation complete)
- **Status:** Actually resolved — signed URL flow implemented ✅

### ⚠️ Reranking Sequential Only
- **Status:** Performance limitation
- **Current:** 1 Groq call per candidate in search results
- **Impact:** Search slow for large candidate pools (100+)
- **Migration Path:** Phase 3 batch reranking optimization

---

## Verification Checklist (Before Production)

### Testing
- [ ] End-to-end ingest test with 5+ sample resumes
- [ ] Chunk count validation (expect ~666 chunks per 25 resumes ratio)
- [ ] Run three notebook example queries and validate results
- [ ] Verify tool calls stream correctly to UI
- [ ] Verify structured report generation
- [ ] Test with different job contexts

### Build & Deployment
- [ ] `next build` passes with no TypeScript errors
- [ ] Verify Supabase service-role key not in client bundles
- [ ] Environment variables configured in Vercel dashboard
- [ ] Deploy to Vercel and run smoke tests
- [ ] Verify embeddings dimension matches schema (1536)

### Security
- [ ] GOOGLE_API_KEY and GROQ_API_KEY not logged
- [ ] Signed URLs working for all resume uploads
- [ ] RLS policies configured on Supabase (if multi-user)
- [ ] No hardcoded secrets in git history

---

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
