# Agentic Resume-Screening RAG — TypeScript MVP (1-day build)

## Context

The working directory currently contains a single file: `Agentic_Resume_Screening_RAG_Trial (1).ipynb`, a Python/LangChain notebook meant as a teaching tour of RAG (naive → small-to-big retrieval → structured output → LLM reranking → "adaptive/corrective/agentic"). On inspection, **the notebook is incomplete**: it stops right after Part 6 (reranking). The intro's promised Parts 7–9 — adaptive RAG, corrective RAG, and the final LangGraph agent — were never written. The `resumes/` PDF folder, `.env`, and `cache/` it references also don't exist in this directory; only the `.ipynb` is here.

The notebook is being used **as a spec, not as code to port 1:1**. Its real content is proof of three concrete failure modes in naive RAG (fragmentation, coverage, hallucinated/ungrounded answers) and three concrete fixes (small-to-big retrieval, structured/grounded output, LLM-based reranking). The never-written "agentic" ending is what this project needs to actually build, natively in TypeScript, using a tool-calling agent loop instead of LangGraph.

Goal: ship a working MVP today — a Next.js app (React + Node, one Vercel project) where a recruiter uploads resumes and a job description, then asks free-form screening questions and gets back a grounded, structured report, with an agent that decides for itself which resumes to search and fetch in full.

### Notebook → TypeScript mapping

| Notebook part | What it proved | TS equivalent |
|---|---|---|
| Part 1 — Load resumes | PDF → text | `lib/pdf.ts` (`unpdf`), run during ingestion |
| Part 2 — Basic RAG | Chunk (800/100) + embed + vector search | `lib/chunk.ts` + `lib/embeddings.ts` + Supabase pgvector |
| Part 3 — Where it breaks | Fragmentation / coverage / hallucination are real | Motivates the tool design below, not ported directly |
| Part 4 — Small-to-big | Search chunks, answer with full resume | `get_full_resume` tool |
| Part 5 — Structured output | Zod-equivalent schema with `unknowns` field | `lib/schema.ts` (`ScreeningReport`) |
| Part 6 — Reranking | Over-fetch + LLM rerank fixes precision | folded into `search_chunks` tool |
| Parts 7–9 (never written) | Adaptive / corrective / LangGraph agent | Subsumed by the tool-calling agent loop (see below) — not ported, because there's nothing to port |

## Locked-in decisions (from requirements interview)

- **Scope**: general tool — recruiter uploads resumes + JD at runtime (not the fixed 25-resume demo set).
- **Framework**: Next.js (App Router), one Vercel project, React frontend + Node route handlers.
- **Models**: Google Gemini for everything (free tier) via the Vercel AI SDK's `@ai-sdk/google` — `gemini-2.5-flash` for generation/tool-calling, `gemini-embedding-001` for embeddings. Code stays provider-agnostic (swap via env var), Google is just today's default.
- **Storage**: Supabase — Postgres + pgvector for chunk embeddings, Supabase Storage for raw PDFs. Neither is provisioned yet; provisioning is step 1.
- **Auth**: none for the MVP.
- **UI**: multi-page — Upload, Candidates, Screen (chat).
- **Agent depth**: tool-calling loop (not a hand-rolled adaptive/corrective state machine). Tools: `list_all_candidates`, `search_chunks` (vector search + internal LLM rerank), `get_full_resume`. Final answer is a separate structured (`generateObject`) call over the accumulated tool-call history — no `submit_report` tool, to keep the loop and the live trace UI simple.
- **Candidate pool**: single global pool, no `jobs`/sessions table. Deliberate MVP cut — flag to user if they want per-job isolation later.
- **Tool visibility**: the Screen page streams a live trace of tool calls (search/rerank/fetch), not just the final report — this is the notebook's central lesson (make retrieval failures visible) carried into the product.

## Hard technical constraints (verified, not assumed)

1. **Vercel request body cap is 4.5MB.** A batch of resume PDFs will blow past this in one POST. Uploads must go **client → Supabase Storage directly via a signed URL**, then a server route ingests by storage path. Never POST raw PDF bytes to a Next.js API route.
2. **Embedding vector dimension**: `gemini-embedding-001` defaults to 3072-dim; it supports `outputDimensionality` truncation (recommended: 768/1536/3072) via `providerOptions.google` in `@ai-sdk/google`. **Known open issue**: `outputDimensionality` has been reported not to take effect in some `@ai-sdk/google` versions (vercel/ai#8033) — verify the actual returned vector length on the first real embed call before writing the `vector(N)` column type. If truncation doesn't work, just declare the column as `vector(3072)` and move on; it still works, just bigger.
3. **Task-type asymmetry**: Gemini embeddings support `taskType: RETRIEVAL_DOCUMENT` (for indexing chunks) vs `RETRIEVAL_QUERY` (for the search query) — unlike OpenAI's symmetric embeddings in the notebook. Use the right one in `lib/embeddings.ts` (`embedDocument` vs `embedQuery`) or retrieval quality degrades silently.
4. **Free tier**: embedding TPM is generous (~10M/min per current docs), but batch embed calls (multiple chunk texts per request) and do them **sequentially with retry/backoff**, not `Promise.all` fan-out — a burst of 600+ parallel calls will trip per-minute limits regardless of the TPM headroom.
5. **`maxDuration`**: set explicitly on the `ingest` and `agent` route handlers (`export const maxDuration = ...`). Vercel Fluid Compute gives 300s by default even on Hobby — enough if the agent loop's step count is capped (see below). Both routes must run on `runtime = 'nodejs'` (not edge) — PDF parsing and the Supabase service-role client need Node APIs.
6. **PDF parsing**: use `unpdf`, not `pdf-parse` — `pdf-parse` has known import-time file-read issues under Next.js/serverless bundlers.
7. **Coverage vs. cost**: the agent can freely call `get_full_resume` and stuff 8+ full resumes (~20k chars each) into context, the way the notebook's `search_full_resumes` does. Cap it server-side (e.g. max 8 distinct candidates fetched full-text per run) — enforced inside the tool implementation via a per-request counter, not left to model discretion.
8. **No test data exists**: this directory has no `resumes/` folder. Before ingestion can be tested, obtain sample resume PDFs — either the notebook-cited public dataset (`Hungreeee/Resume-Screening-RAG-Pipeline` on GitHub) or a handful of your own — as an explicit first step, not something to discover at hour 8.
9. **Secrets**: Supabase **service role key** is server-only (used in route handlers via `lib/supabase/server.ts`), never shipped to the client. `.env.local` must be gitignored. This repo isn't a git repo yet — `git init` + `.gitignore` is part of setup, not an afterthought.

## Data model (Supabase)

```sql
create extension if not exists vector;

create table candidates (
  id uuid primary key default gen_random_uuid(),
  name text,
  role_guess text,
  storage_path text not null,
  original_filename text not null,
  full_text text not null,
  created_at timestamptz default now()
);

create table resume_chunks (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references candidates(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  embedding vector(768), -- adjust to actual dim per constraint #2 above
  created_at timestamptz default now()
);

create index on resume_chunks using hnsw (embedding vector_cosine_ops);
```

A Postgres function (`match_resume_chunks(query_embedding, match_count)`) or a plain `ORDER BY embedding <=> $1 LIMIT k` query via `@supabase/supabase-js`/`pg` covers `search_chunks`.

## App structure

```
app/
  upload/page.tsx        JD textarea + multi-file resume picker, drives signed-upload flow
  candidates/page.tsx    lists ingested candidates (name, role guess, chunk count)
  screen/page.tsx        chat UI (useChat) — question box, live tool trace, report cards
  api/upload-url/route.ts   POST -> Supabase Storage signed upload URL(s)
  api/ingest/route.ts       POST {storagePaths[]} -> parse/chunk/embed/insert (nodejs, maxDuration set)
  api/candidates/route.ts   GET -> list candidates
  api/agent/route.ts        POST -> tool loop (streamText) + final generateObject report
lib/
  supabase/client.ts   browser client (anon key)
  supabase/server.ts   server client (service role key) — server-only
  pdf.ts               unpdf wrapper
  chunk.ts             hand-rolled splitter, chunkSize=800/overlap=100 (ported constants from the notebook)
  embeddings.ts        embedDocument() / embedQuery() wrapping google.textEmbedding with taskType
  db.ts                insertCandidate, insertChunks, searchChunks, getFullResumeById, listCandidates
  agent-tools.ts        list_all_candidates / search_chunks / get_full_resume tool() defs, with fetch-cap closure
  schema.ts             Zod ScreeningReport / CandidateAssessment (ported from notebook Part 5)
supabase/schema.sql      the DDL above
```

No LangChain/LangGraph dependency — the AI SDK's `tools` + `stopWhen` covers the agent loop, and the splitter is small enough to hand-roll rather than pull in `@langchain/textsplitters` for one function.

## Build order (time-boxed, ~1 day)

1. **Setup (≈45 min)**: create Supabase project, enable `vector` extension, run `schema.sql`, create a `resumes` Storage bucket; create a Google AI Studio API key; `npx create-next-app` (TS, App Router); `git init` + `.gitignore` (incl. `.env.local`); install `ai`, `@ai-sdk/google`, `@supabase/supabase-js`, `unpdf`, `zod`.
2. **Test data (≈15 min)**: pull a handful of sample resume PDFs (notebook-cited dataset or your own) into a local scratch folder for manual upload testing.
3. **Ingestion pipeline (≈2 hr)**: signed-upload flow, `api/ingest` (parse → chunk → batch-embed with `RETRIEVAL_DOCUMENT` taskType → insert candidate + chunks). Verify actual embedding vector length against constraint #2 before finalizing the column type. Test by ingesting the sample PDFs and checking row counts in Supabase.
4. **Candidates page (≈30 min)** — checkpoint: upload → see candidates listed.
5. **Agent route (≈2 hr)**: implement the three tools, the `generateText` tool loop with `stopWhen`/step cap, then the final `generateObject` call against `ScreeningReport`. Test with `curl`/a script before wiring the UI.
6. **Screen page UI (≈1 hr)**: `useChat`, render streamed tool-call parts as a live trace, render the final structured report as candidate cards (score / evidence / unknowns).
7. **End-to-end test (≈30 min)**: replay the notebook's three example questions (direct Java/AWS match; Mahesh years-of-experience + healthcare client; PM/Scrum-master shortlist) and confirm the agent, unlike the notebook's naive pipeline, achieves real coverage on the shortlist question via `list_all_candidates`.
8. **Deploy (≈30 min)**: push to GitHub, `vercel link`, set env vars (Google API key, Supabase URL/anon/service-role keys) in the Vercel dashboard, deploy, re-run the three test questions against the production URL.

**Cut-line if time runs short**, in this order: (1) simplify the live tool-call trace to a bare "Searching... / Retrieved N chunks" status line instead of a full structured trace, (2) collapse Candidates + Screen into one page, (3) drop the LLM rerank step inside `search_chunks` and use plain top-k vector search (documented as a known limitation, matching the notebook's own Part 3 problem).

## Verification

- Ingest the sample resumes; confirm `resume_chunks` row count is in the same ballpark as the notebook's 666-chunks-from-25-resumes ratio for however many you test with.
- Run the three notebook example queries against `/screen` and confirm: (a) the direct-match query cites the right candidate, (b) the fragmentation query gets both facts about one candidate via `get_full_resume`, (c) the shortlist query's coverage is visibly better than the notebook's 4/25 — check the live trace shows `list_all_candidates` being used.
- `next build` locally with no type errors before deploying.
- Confirm the Supabase service-role key never appears in client-side bundles (check Network tab / build output).
- Re-run the three test queries against the deployed Vercel URL as the final smoke test.
