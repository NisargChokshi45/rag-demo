The never-written "agentic" ending is what this project needs to actually build, natively in TypeScript, using a LangGraph tool-calling agent loop.
# Agentic Resume-Screening RAG — TypeScript MVP (1-day build)

## Context

The working directory currently contains a single file: `Agentic_Resume_Screening_RAG_Trial (1).ipynb`, a Python/LangChain notebook meant as a teaching tour of RAG (naive → small-to-big retrieval → structured output → LLM reranking → "adaptive/corrective/agentic"). On inspection, **the notebook is incomplete**: it stops right after Part 6 (reranking). The intro's promised Parts 7–9 — adaptive RAG, corrective RAG, and the final LangGraph agent — were never written. The `resumes/` PDF folder, `.env`, and `cache/` it references also don't exist in this directory; only the `.ipynb` is here.

The notebook is being used **as a spec, not as code to port 1:1**. Its real content is proof of three concrete failure modes in naive RAG (fragmentation, coverage, hallucinated/ungrounded answers) and three concrete fixes (small-to-big retrieval, structured/grounded output, LLM-based reranking). The never-written "agentic" ending is what this project needs to actually build, natively in TypeScript, using a tool-calling agent loop instead of LangGraph.

Goal: ship a working MVP today — a Next.js app (React + Node, one Vercel project) where a recruiter uploads resumes and a job description, then asks free-form screening questions and gets back a grounded, structured report, with an agent that decides for itself which resumes to search and fetch in full.

### Notebook → TypeScript mapping

| Notebook part              | What it proved                                    | TS equivalent                                                                                     |
| -------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Part 1 — Load resumes      | PDF → text                                        | `lib/pdf.ts` (`unpdf`), run during ingestion                                                      |
| Part 2 — Basic RAG         | Chunk (800/100) + embed + vector search           | `lib/chunk.ts` + `lib/embeddings.ts` + Supabase pgvector                                          |
| Part 3 — Where it breaks   | Fragmentation / coverage / hallucination are real | Motivates the tool design below, not ported directly                                              |
| Part 4 — Small-to-big      | Search chunks, answer with full resume            | `get_full_resume` tool                                                                            |
| Part 5 — Structured output | Zod-equivalent schema with `unknowns` field       | `lib/schema.ts` (`ScreeningReport`)                                                               |
| Part 6 — Reranking         | Over-fetch + LLM rerank fixes precision           | folded into `search_chunks` tool                                                                  |
| Parts 7–9 (never written)  | Adaptive / corrective / LangGraph agent           | Subsumed by the tool-calling agent loop (see below) — not ported, because there's nothing to port |

## Locked-in decisions (from requirements interview)

- **Scope**: general tool — recruiter uploads resumes + JD at runtime (not the fixed 25-resume demo set).
- **Framework**: Next.js (App Router), one Vercel project, React frontend + Node route handlers.
- **Models**: Gemini Embedding 2 via `GOOGLE_API_KEY` for document/query embeddings, and Groq via `GROQ_API_KEY` for chat, reranking, tool calling, and structured report generation.
- **Storage**: Supabase — Postgres + pgvector for chunk embeddings, Supabase Storage for raw PDFs. Neither is provisioned yet; provisioning is step 1.
- **Auth**: none for the MVP.
- **UI**: multi-page — Upload, Candidates, Screen (chat).
- **Agent depth**: LangGraph `createReactAgent` tool-calling loop with a server-side recursion limit of 10. Tools: `list_all_candidates`, `search_chunks` (vector search + Groq rerank), `get_full_resume`. Final answer is a separate LangChain structured-output call over the accumulated tool-call history — no `submit_report` tool, to keep the loop and the live trace UI simple.
2. **Embedding vector dimension**: Gemini Embedding 2 defaults to 3072 dimensions and supports 768, 1536, and 3072 output dimensions. Use **1536** because it is within Supabase pgvector's standard `vector` limit while preserving strong retrieval quality. The embedding wrapper checks the returned length on every call and fails before writing a mismatched vector.
3. **Embedding task prompts**: Gemini Embedding 2 does not use the older `taskType` parameter. `embedDocument` formats `title: none | text: ...`; `embedQuery` formats `task: search result | query: ...`. Both use the same `gemini-embedding-2` model and `GOOGLE_API_KEY`.
4. **Free tier**: embed chunks sequentially with retry/backoff, and rerank candidates sequentially through Groq to avoid request bursts.
9. **Secrets**: Supabase **service role key**, `GOOGLE_API_KEY`, and `GROQ_API_KEY` are server-only. `.env.local` must be gitignored. The job description is kept in browser session storage for the MVP because there is deliberately no jobs table; it is sent with each screening request and is not used during resume ingestion.
  embedding vector(1536),
  screen/page.tsx        chat UI — job description, question box, live tool trace, report cards
  api/ingest/route.ts       POST {storagePath} -> parse/chunk/embed/insert (nodejs, maxDuration set)
  api/agent/route.ts        POST -> LangGraph tool loop + final structured report
  embeddings.ts        embedDocument() / embedQuery() wrapping Gemini Embedding 2 with task prompts
  models.ts            Groq chat-model factory for agent, reranker, and report generation
LangChain and LangGraph own the agent, tools, chat model, and structured output. The splitter remains hand-rolled rather than pulling in `@langchain/textsplitters` for one function. No Vercel AI SDK dependency is used.
1. **Setup (≈45 min)**: create Supabase project, enable `vector` extension, run `schema.sql`, create a `resumes` Storage bucket; create Google and Groq API keys; install LangChain/LangGraph, `@langchain/groq`, `@supabase/supabase-js`, `unpdf`, and `zod`.
3. **Ingestion pipeline (≈2 hr)**: signed-upload flow, `api/ingest` (parse → reject empty text → chunk → sequential Gemini embed with retry/backoff → insert candidate + chunks). The route inserts nothing until all embeddings succeed and deletes the candidate if chunk insertion fails. Verify 1536-dimensional vectors and row counts in Supabase.
5. **Agent route (≈2 hr)**: implement the three LangChain tools, the LangGraph tool loop with a recursion limit of 10, then the final structured-output call against `ScreeningReport`. Test with `curl`/a script before wiring the UI.
- **Candidate pool**: single global pool, no `jobs`/sessions table. Deliberate MVP cut — flag to user if they want per-job isolation later.
- **Tool visibility**: the Screen page streams a live trace of tool calls (search/rerank/fetch), not just the final report — this is the notebook's central lesson (make retrieval failures visible) carried into the product.

## Hard technical constraints (verified, not assumed)

1. **Vercel request body cap is 4.5MB.** A batch of resume PDFs will blow past this in one POST. Uploads must go **client → Supabase Storage directly via a signed URL**, then a server route ingests by storage path. Never POST raw PDF bytes to a Next.js API route.
2. **Embedding vector dimension**: Gemini Embedding 2 defaults to 3072 dimensions and supports 768, 1536, and 3072 output dimensions. Use **1536** because it is within Supabase pgvector's standard `vector` limit. The wrapper validates the returned length before writing a vector.
3. **Embedding task prompts**: Gemini Embedding 2 does not use the older `taskType` parameter. `embedDocument` formats `title: none | text: ...`; `embedQuery` formats `task: search result | query: ...`.
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
  embedding vector(1536),
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
  screen/page.tsx        chat UI — job description, question box, live tool trace, report cards
  api/upload-url/route.ts   POST -> Supabase Storage signed upload URL(s)
  api/ingest/route.ts       POST {storagePath} -> parse/chunk/embed/insert (nodejs, maxDuration set)
  api/candidates/route.ts   GET -> list candidates
  api/agent/route.ts        POST -> LangGraph tool loop + final structured report
lib/
  supabase/client.ts   browser client (anon key)
  supabase/server.ts   server client (service role key) — server-only
  pdf.ts               unpdf wrapper
  chunk.ts             hand-rolled splitter, chunkSize=800/overlap=100 (ported constants from the notebook)
  embeddings.ts        embedDocument() / embedQuery() wrapping Gemini Embedding 2 with task prompts
  models.ts            Groq chat-model factory for agent, reranker, and report generation
  db.ts                insertCandidate, insertChunks, searchChunks, getFullResumeById, listCandidates
  agent-tools.ts        list_all_candidates / search_chunks / get_full_resume tool() defs, with fetch-cap closure
  schema.ts             Zod ScreeningReport / CandidateAssessment (ported from notebook Part 5)
supabase/schema.sql      the DDL above
```

## Build order (time-boxed, ~1 day)

1. **Setup (≈45 min)**: create Supabase project, enable `vector` extension, run `schema.sql`, create a `resumes` Storage bucket; create Google and Groq API keys; install LangChain/LangGraph, `@langchain/groq`, `@supabase/supabase-js`, `unpdf`, and `zod`.
2. **Test data (≈15 min)**: pull a handful of sample resume PDFs (notebook-cited dataset or your own) into a local scratch folder for manual upload testing.
3. **Ingestion pipeline (≈2 hr)**: signed-upload flow, `api/ingest` (parse → reject empty text → chunk → sequential Gemini embed with retry/backoff → insert candidate + chunks). The route inserts nothing until all embeddings succeed and deletes the candidate if chunk insertion fails. Existing databases must run `supabase/migrations/002_gemini_embedding_2.sql` and re-ingest because embedding spaces are not compatible.
4. **Candidates page (≈30 min)** — checkpoint: upload → see candidates listed.
5. **Agent route (≈2 hr)**: implement the three LangChain tools, the LangGraph tool loop with a recursion limit of 10, then the final structured-output call against `ScreeningReport`.
6. **Screen page UI (≈1 hr)**: render streamed tool-call parts as a live trace, render the final structured report as candidate cards (score / evidence / unknowns), and preserve the JD in browser session storage for each request.
7. **End-to-end test (≈30 min)**: replay the notebook's three example questions (direct Java/AWS match; Mahesh years-of-experience + healthcare client; PM/Scrum-master shortlist) and confirm the agent, unlike the notebook's naive pipeline, achieves real coverage on the shortlist question via `list_all_candidates`.
8. **Deploy (≈30 min)**: push to GitHub, `vercel link`, set `GOOGLE_API_KEY`, `GROQ_API_KEY`, `GROQ_CHAT_MODEL`, and Supabase keys in the Vercel dashboard, deploy, re-run the three test questions against the production URL.

**Cut-line if time runs short**, in this order: (1) simplify the live tool-call trace to a bare "Searching... / Retrieved N chunks" status line instead of a full structured trace, (2) collapse Candidates + Screen into one page, (3) drop the LLM rerank step inside `search_chunks` and use plain top-k vector search (documented as a known limitation, matching the notebook's own Part 3 problem).

## Verification

- Ingest the sample resumes; confirm `resume_chunks` row count is in the same ballpark as the notebook's 666-chunks-from-25-resumes ratio for however many you test with.
- Run the three notebook example queries against `/screen` and confirm: (a) the direct-match query cites the right candidate, (b) the fragmentation query gets both facts about one candidate via `get_full_resume`, (c) the shortlist query's coverage is visibly better than the notebook's 4/25 — check the live trace shows `list_all_candidates` being used.
- `next build` locally with no type errors before deploying.
- Confirm the Supabase service-role key never appears in client-side bundles (check Network tab / build output).
- Re-run the three test queries against the deployed Vercel URL as the final smoke test.
