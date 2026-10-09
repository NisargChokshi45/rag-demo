- Use "nvm use 24".
- The development server is already up and running. Do not run it yourself.
- Never run "git commit" command.
- Never create arficats.
- Never store markdowns in scratchpad under the root .claude folder.

## Project Overview

Agentic resume-screening RAG demo. Recruiters create jobs and upload candidate resume PDFs. Each PDF is parsed, chunked, embedded and stored in Postgres (pgvector). Screening questions are answered by a LangGraph tool-calling agent that searches the job's candidate pool and returns a structured, cited report.

## Tech Stack

- **Framework**: Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 3
- **Chat / agent / reranking / reports**: Groq via `@langchain/groq` and LangGraph (`GROQ_CHAT_MODEL`, default `openai/gpt-oss-120b`)
- **Embeddings**: Google Gemini (`GEMINI_EMBEDDING_MODEL`, default `gemini-embedding-2`), fixed at 1536 dimensions
- **Database / storage / auth**: Supabase (Postgres + pgvector, Storage for PDFs, Auth behind a feature flag)
- **PDF parsing**: `unpdf`. **Validation**: Zod
- **Package manager**: pnpm (see `pnpm-workspace.yaml`)

## Commands

Run `nvm use 24` first. The dev server is already running, so don't start it.

- `pnpm install`: install dependencies
- `pnpm build`: production build (type-checks the app)
- `pnpm format` / `pnpm format:check`: Prettier over `ts`, `tsx`, `json`, `css`
- `pnpm lint`: `next lint`. There is no ESLint config committed yet, so Next will prompt for one.
- `pnpm reindex`: re-embed candidates via `scripts/reindex-candidates.ts`
- `pnpm db:setup`, `pnpm db:seed`, `pnpm db:cleanup`, `pnpm db:migrate`: Supabase helpers in `scripts/`

## Environment Variables

Required (`lib/env.ts`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_API_KEY`, `GROQ_API_KEY`.

Optional: `GROQ_CHAT_MODEL`, `GEMINI_EMBEDDING_MODEL`, `NEXT_PUBLIC_AUTH_ENABLED` (default off), `NEXT_PUBLIC_USER_DATA_ISOLATION` (only effective when auth is on).

Secrets live in `.env.local`, which is git-ignored. Never commit it or paste its values into code or docs.

## Code Layout

- `app/`: pages (`jobs`, `candidates`, `screen`, `login`) and `app/api/*/route.ts` handlers (`agent`, `ingest`, `upload-url`, `jobs`, `candidates`, `screenings`, `auth`, `admin/migrations`, `admin/reindex`, `debug`)
- `app/components/`: shared UI (`AuthHeader.tsx`)
- `lib/db.ts`: main Supabase query layer (jobs, candidates, chunks, screenings)
- `lib/agent-tools.ts`: LangChain tools `list_all_candidates`, `search_chunks`, `get_full_resume`, built from a `ToolContext` that carries `jobId`
- `lib/embeddings.ts`: Gemini embedding calls. Documents and queries use different input prefixes.
- `lib/chunk.ts`: 800-character windows with 100-character overlap
- `lib/pdf.ts`, `lib/scoring.ts`, `lib/job-hash.ts`, `lib/screenings-api.ts`, `lib/schema.ts` (Zod report schemas)
- `lib/config.ts`: feature flags and the chat model factory. `lib/env.ts`: env validation.
- `lib/auth.ts`: `validateAuth()` and `getUserId()` for route handlers
- `lib/supabase/`: `client.ts` (browser), `server.ts` (service-role and authenticated server clients), `middleware.ts` (session refresh)
- `lib/hooks/useAuth.ts`: client auth hook
- `middleware.ts`: root Supabase session middleware
- `supabase/`: `schema.sql`, `migrations/001`–`015`, `seed.sql`, `cleanup.sql`
- `scripts/`: reindex, migration, and Supabase helper scripts, plus demo pipeline and custom-query tools
- `resumes/`: 25 sample resume PDFs (test data)
- Root `*.md` files: setup, auth, screening, and deployment guides. `PLAN.md`, `TASKS.md`, and `FEATURES.md` track status.

## Conventions

- **Server-only secrets**: the service-role key and API keys are used only in route handlers and `lib/` server code. Only `NEXT_PUBLIC_*` values may reach the browser.
- **DB access**: use `createServiceClient()` / `createAuthenticatedServerClient()` from `lib/supabase/server.ts`, and prefer putting new queries in `lib/db.ts` over writing them inline in route files.
- **Auth in routes**: call `validateAuth()` from `lib/auth.ts` at the top of a handler. It is a no-op unless `NEXT_PUBLIC_AUTH_ENABLED=true`.
- **Feature flags**: `FEATURE_FLAGS` in `lib/config.ts`. Deletion of jobs and screenings and query edit or retry are intentionally disabled. Don't enable them without asking.
- **Job scoping**: agent tools and searches must filter by `jobId`. Each job has its own candidate pool.
- **Embedding calls are sequential**: use retry with exponential backoff (1s, 2s, 4s) and no `Promise.all`, to respect free-tier rate limits.
- **Dimension sync**: `resume_chunks.embedding` is `vector(1536)` (migration 002). Keep `EMBEDDING_DIMENSIONS` in `lib/embeddings.ts` in step with it.
- **Schema changes**: add a new numbered file in `supabase/migrations/` (the next is `016`). Don't edit migrations that have already been applied.
- **Formatting** (`.prettierrc`): single quotes, semicolons, `trailingComma: es5`, 80 columns, 2-space indent, LF line endings. Run `pnpm format` on changed `ts`/`tsx` files.
- **Agent limits**: `app/api/agent/route.ts` sets `maxDuration = 300` and `runtime = 'nodejs'`. The agent loop has a recursion limit of 25. `get_full_resume` is capped per screening in `lib/agent-tools.ts`, and tool results are truncated in the trace.
- **Docs**: when a task changes status, update the matching checkbox in `FEATURES.md` / `TASKS.md`.

## Do Not

- Don't run the dev server, and don't run `pnpm dev` or `next dev`.
- Don't run `git commit`. Leave commits to the user.
- Don't create artifacts.
- Don't store markdown files in the scratchpad under the root `.claude` folder.
- Don't commit `.env.local` or any secret values.