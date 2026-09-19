# Agentic Resume-Screening RAG — Task Checklist

## 1. Setup (≈45 min) ✓ COMPLETE

- [x] Create Next.js project with TypeScript and App Router — Next.js 15 App Router scaffolded
- [x] Initialize git repository and `.gitignore` — .gitignore created with .env.local
- [x] Install dependencies with pnpm — all 17 deps (prod + dev) installed, pnpm-lock.yaml created
- [ ] Create Supabase project and enable `vector` extension — awaiting user Supabase account
- [ ] Run `schema.sql` to create `candidates` and `resume_chunks` tables — awaiting Supabase setup
- [ ] Create `resumes` Storage bucket in Supabase — awaiting Supabase setup
- [ ] Generate Google AI Studio API key — awaiting user to create key
- [ ] Verify actual embedding vector dimension from first test call (constraint #2) — will do in Phase 3 (first ingest)

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
- [x] Implement `api/agent/route.ts` — tool-calling loop (streamText) + final generateObject call (set maxDuration, runtime=nodejs)
- ⏳ Test with curl/script: verify tool calls and structured final report — **BLOCKED: awaiting Supabase credentials and Google AI key**

## 6. Screen Page UI (≈1 hr) ✓ COMPLETE

- [x] Implement `app/screen/page.tsx` — chat UI with hand-rolled NDJSON streaming
- [x] Render live tool-call trace (search/rerank/fetch events as they stream)
- [x] Render final structured report as candidate assessment cards (score, evidence, unknowns)
- ⏳ Test: submit questions and confirm streaming tool visibility — **BLOCKED: awaiting Supabase credentials and Google AI key**

## 7. End-to-End Test (≈30 min)

- [ ] Run test query #1: direct match (Java/AWS) → confirm right candidate cited
- [ ] Run test query #2: fragmentation (Mahesh experience + healthcare) → confirm get_full_resume used
- [ ] Run test query #3: shortlist coverage (PM/Scrum-master) → confirm list_all_candidates in trace, better coverage than naive RAG
- [ ] Verify chunk count ratio is in ballpark of notebook (666 chunks from 25 resumes)

## 8. Deploy (≈30 min)

- [ ] Run `pnpm build` locally — confirm no type errors
- [ ] Push to GitHub
- [ ] Link Vercel project (`vercel link`)
- [ ] Set environment variables in Vercel dashboard (Google API key, Supabase URL/anon/service-role keys)
- [ ] Deploy to production
- [ ] Re-run three test queries against production URL
- [ ] Verify service-role key never appears in client bundles (Network tab / build output)

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
