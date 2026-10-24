## Project Overview

RAG demo with two parts. **Resume screening**: recruiters create jobs and upload candidate resume PDFs. Each PDF is parsed, chunked, embedded and stored in Postgres (pgvector). A screening question runs a fixed pipeline in `app/api/agent/route.ts` (vector search over the job's pool, skill-boost ranking, full-resume fetch for the top 3, one Groq call for the structured report). It is not a tool-calling agent. **Documents** (`/documents`): long-form PDFs are parsed into typed chunks and answered through a LangGraph pipeline (retrieve, rerank, expand, generate, verify) with citations. `/screen` can target either a job or a document.

## Tech Stack

- **Framework**: Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 3
- **Chat / reranking / reports**: Groq via `@langchain/groq` (`GROQ_CHAT_MODEL`). LangGraph is used only for the document answer pipeline (`lib/documents/graph.ts`). `lib/models.ts` passes `GROQ_CHAT_MODEL` straight through with no fallback, so set it; the `openai/gpt-oss-120b` default exists only in `lib/env.ts`, which nothing calls.
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

Optional: `GROQ_CHAT_MODEL`, `GEMINI_EMBEDDING_MODEL`, `NEXT_PUBLIC_AUTH_ENABLED` (default off), `NEXT_PUBLIC_USER_DATA_ISOLATION` (only effective when auth is on), `NEXT_PUBLIC_DISABLE_SESSION_DELETE` (disables the session delete button on `/screen`). Documents: `RERANK_MODE` (unset: `llm`, or `none` for `element_rich` documents; or set `none` / `llm` / `cross-encoder` to force one), `CROSS_ENCODER_MODEL`, `GEMINI_VISION_MODEL` (default `gemini-3.8-flash`), `VISION_MAX_PAGES` (default 60).

Secrets live in `.env.local`, which is git-ignored. Never commit it or paste its values into code or docs.

## Code Layout

- `app/`: pages (`jobs`, `candidates`, `documents`, `documents/[id]`, `screen`, `login`) and `app/api/*/route.ts` handlers (`agent`, `ingest`, `upload-url`, `jobs`, `candidates`, `screenings`, `documents` (list, `upload-url`, `[id]`, `[id]/chat`, `[id]/embed`, `[id]/reparse`), `auth`, `admin/migrations`, `admin/reindex`, `debug`)
- `app/components/`: shared UI (`AuthHeader`, `SiteHeader`, `ThemeToggle`, `Modal`, `ui`)
- `lib/db.ts`: main Supabase query layer (jobs, candidates, chunks, screenings)
- `lib/documents/`: document pipeline. `ingest.ts` (parse, chunk, resumable embed, re-parse), `layout.ts` / `items.ts` / `structure.ts` / `drawings.ts` (layout-aware parsing), `chunk.ts` (three strategies), `regions.ts` / `routing.ts` (chapter and region filters), `rerank.ts`, `vision.ts` (chart pages via Gemini), `graph.ts` (LangGraph answer pipeline)
- `lib/agent-tools.ts`: LangChain tools `list_all_candidates`, `search_chunks`, `get_full_resume`. Currently unused: nothing imports it, and `app/api/agent/route.ts` runs its own fixed pipeline.
- `lib/client-progress.ts`: client-side store that keeps re-score progress across navigation
- `lib/embeddings.ts`: Gemini embedding calls. Documents and queries use different input prefixes.
- `lib/chunk.ts`: 800-character windows with 100-character overlap
- `lib/pdf.ts`, `lib/scoring.ts`, `lib/job-hash.ts`, `lib/screenings-api.ts`, `lib/schema.ts` (Zod report schemas)
- `lib/config.ts`: feature flags. `lib/models.ts`: Groq chat model factory. `lib/env.ts`: env validation.
- `lib/auth.ts`: `validateAuth()` and `getUserId()` for route handlers
- `lib/supabase/`: `client.ts` (browser), `server.ts` (service-role and authenticated server clients), `middleware.ts` (session refresh)
- `lib/hooks/useAuth.ts`: client auth hook
- `middleware.ts`: root Supabase session middleware
- `supabase/`: `schema.sql`, `migrations/001`–`020`, `seed.sql`, `cleanup.sql`
- `scripts/`: reindex, migration, and Supabase helper scripts, plus demo pipeline and custom-query tools
- `resumes/`: 25 sample resume PDFs (test data)
- Root `*.md` files: setup, auth, screening, and deployment guides. `PLAN.md`, `TASKS.md`, and `FEATURES.md` track status.

## Conventions

- **Server-only secrets**: the service-role key and API keys are used only in route handlers and `lib/` server code. Only `NEXT_PUBLIC_*` values may reach the browser.
- **DB access**: use `createServiceClient()` / `createAuthenticatedServerClient()` from `lib/supabase/server.ts`, and prefer putting new queries in `lib/db.ts` over writing them inline in route files.
- **Auth in routes**: call `validateAuth()` from `lib/auth.ts` at the top of a handler. It is a no-op unless `NEXT_PUBLIC_AUTH_ENABLED=true`.
- **Feature flags**: `FEATURE_FLAGS` in `lib/config.ts`. Deletion of jobs and screenings and query edit or retry are intentionally disabled. Don't enable them without asking.
- **Job scoping**: candidate searches and listings must filter by `jobId` (`searchChunks`, `listCandidates` in `lib/db.ts`). Each job has its own candidate pool.
- **Embedding calls are sequential**: use retry with exponential backoff (1s, 2s, 4s) and no `Promise.all`, to respect free-tier rate limits.
- **Dimension sync**: `resume_chunks.embedding` is `vector(1536)` (migration 002). Keep `EMBEDDING_DIMENSIONS` in `lib/embeddings.ts` in step with it.
- **Schema changes**: add a new numbered file in `supabase/migrations/` (the next is `021`). Don't edit migrations that have already been applied.
- **Formatting** (`.prettierrc`): single quotes, semicolons, `trailingComma: es5`, 80 columns, 2-space indent, LF line endings. Run `pnpm format` on changed `ts`/`tsx` files.
- **Screening limits**: `app/api/agent/route.ts` sets `maxDuration = 300` and `runtime = 'nodejs'`, as does `app/api/ingest/route.ts`. The `/api/documents/*` routes set neither. The screening pipeline fetches full resumes for at most 3 candidates (route-level cap), sends each resume to the report prompt cut to 1,000 characters, and caps the job description at 300 characters. The trace streams full resume text untruncated.
- **Docs**: when a task changes status, update the matching checkbox in `FEATURES.md` / `TASKS.md`.

## Do Not

- Don't run the dev server, and don't run `pnpm dev` or `next dev`.
- Don't run `git commit`. Leave commits to the user.
- Don't use "Co-Authored by: Claude" signature in the git commit message and description.
- Don't create artifacts.
- Don't store markdown files in the scratchpad under the root `.claude` folder.
- Don't commit `.env.local` or any secret values.