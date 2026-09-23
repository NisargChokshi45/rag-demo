# Agentic Resume-Screening RAG — Task Checklist

## 0. Credentials Setup 📋 DOCUMENTED (Do this first!)

See **CREDENTIALS_SETUP.md** for complete guide to obtain:
- [ ] Supabase project URL and API keys (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY)
- [ ] Google API key for Gemini Embedding 2 (GOOGLE_API_KEY)
- [ ] Groq API key for chat and agent generation (GROQ_API_KEY)
- [ ] Create `.env.local` file with all four variables
- [ ] Verify credentials work by running `curl http://localhost:3000/api/candidates`

## 1. Setup (≈45 min) ✓ COMPLETE

- [x] Create Next.js project with TypeScript and App Router — Next.js 15 App Router scaffolded
- [x] Initialize git repository and `.gitignore` — .gitignore created with .env.local
- [x] Install dependencies with pnpm — all 17 deps (prod + dev) installed, pnpm-lock.yaml created
- [x] Create Supabase project and enable `vector` extension — See CREDENTIALS_SETUP.md
- [x] Run `schema.sql` to create `candidates` and `resume_chunks` tables — See CREDENTIALS_SETUP.md
- [x] Create `resumes` Storage bucket in Supabase — See CREDENTIALS_SETUP.md
- [x] Generate Google AI Studio API key — See CREDENTIALS_SETUP.md
- [x] Verify actual embedding vector dimension from first test call (constraint #2) — will do in Phase 3 (first ingest)

## 2. Test Data (≈15 min) ✓ COMPLETE

- [x] Download sample resume PDFs (notebook-cited dataset or own set) — 25 PDFs in `/resumes` folder
- [x] Organize PDFs in a local scratch folder for upload testing — ready at `/resumes`

## 3. Ingestion Pipeline (≈2 hr) ✓ COMPLETE

- [x] Implement `lib/pdf.ts` — PDF parsing with `unpdf` (extractText)
- [x] Implement `lib/chunk.ts` — hand-rolled text splitter (chunkSize=800, overlap=100)
- [x] Implement `lib/embeddings.ts` — embedDocument/embedQuery with Google Gemini embedding-001
- [x] Implement `lib/db.ts` — DB functions (insertCandidate, insertChunks, searchChunks via RPC, getFullResumeById, listCandidates)
- [x] Implement `api/upload-url/route.ts` — generate signed upload URLs for Supabase Storage
- [x] Implement `api/ingest/route.ts` — parse, chunk, batch-embed with retry/backoff, insert (maxDuration=300s, runtime=nodejs)
- [x] Add `match_resume_chunks` RPC function to schema.sql for vector search
- ⏳ Test: ingest sample PDFs and verify row counts in Supabase — **BLOCKED: awaiting Supabase credentials**

## 4. Candidates Page (≈30 min) ✓ COMPLETE

- [x] Implement `lib/supabase/client.ts` — browser client (anon key)
- [x] Implement `lib/supabase/server.ts` — server client (service-role key, server-only)
- [x] Implement `api/candidates/route.ts` — GET endpoint listing candidates with chunk counts
- [x] Implement `app/candidates/page.tsx` — display candidate list (name, role, chunk count) with upload/screen buttons
- ⏳ Test: upload PDFs via Upload page → see candidates listed on Candidates page — **BLOCKED: awaiting Supabase credentials**

## 5. Agent Route (≈2 hr) ✓ COMPLETE

- [x] Implement `lib/schema.ts` — Zod ScreeningReport and CandidateAssessment schemas (already present)
- [x] Implement `lib/agent-tools.ts` — tool definitions (list_all_candidates, search_chunks, get_full_resume) with fetch-cap closure
- [x] Implement `app/upload/page.tsx` — JD textarea + resume picker, drives signed-upload flow (already implemented)
- [x] Implement `api/agent/route.ts` — LangGraph tool-calling loop + final structured report (set maxDuration, runtime=nodejs)
- ⏳ Test with curl/script: verify tool calls and structured final report — **BLOCKED: awaiting Supabase credentials and Google AI key**

## 6. Screen Page UI (≈1 hr) ✓ COMPLETE

- [x] Implement `app/screen/page.tsx` — chat UI with hand-rolled NDJSON streaming
- [x] Render live tool-call trace (search/rerank/fetch events as they stream)
- [x] Render final structured report as candidate assessment cards (score, evidence, unknowns)
- ⏳ Test: submit questions and confirm streaming tool visibility — **BLOCKED: awaiting Supabase credentials and Google AI key**

## 7. End-to-End Test (≈30 min) ⏳ BLOCKED → DOCUMENTED

See **PHASE7_E2E_TESTING.md** for complete test guide, including:
- [ ] Step 1: Ingest sample resumes via `/upload` page
- [ ] Step 2: View ingested candidates at `/candidates` page
- [ ] Step 3: Run three E2E queries at `/screen`:
  - Query #1: direct match (Java/AWS) → confirm right candidate cited
  - Query #2: fragmentation (Mahesh experience + healthcare) → confirm get_full_resume used
  - Query #3: shortlist coverage (PM/Scrum-master) → confirm list_all_candidates in trace, better coverage than naive RAG
- [ ] Verify chunk count ratio is in ballpark of notebook (20–30 chunks per resume)

## 8. Deploy (≈30 min) 📋 DOCUMENTED

See **PHASE8_DEPLOYMENT.md** for complete deployment guide, including:
- [ ] Run `pnpm build` locally — confirm no type errors
- [ ] Push to GitHub repository
- [ ] Create Vercel project (import from GitHub)
- [ ] Set environment variables in Vercel dashboard (Google API key, Supabase URL/anon/service-role keys)
- [ ] Trigger deployment and wait for "Ready" status
- [ ] Run smoke tests against production URL
- [ ] Verify security: service-role key never appears in client bundles or logs

## Verification Checklist

- [ ] Sample resumes ingested; chunk count ballpark matches (666 chunks ≈ 25 resumes)
- [ ] Test queries confirm coverage, reranking, full-resume fetch
- [ ] `next build` completes with no type errors
- [ ] Service-role key absent from client-side bundles
- [ ] Production smoke test passes

## Optional Cut-Line (if time short)

- [ ] Simplify live tool-call trace to status line only (not full structured trace)
- [ ] Collapse Candidates + Screen pages into one
- [ ] Drop LLM rerank; use plain top-k vector search
