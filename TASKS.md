# Agentic Resume-Screening RAG — Task Checklist

## Current status

This repo is now build-verified, but the live end-to-end verification is still pending.

Verified in this workspace:
- [x] Next.js app scaffolded and dependencies installed
- [x] Project builds successfully with Node 24 (`pnpm build` passes)
- [x] Core code for ingestion, retrieval, agent loop, and UI is implemented

Not yet proven in a live environment:
- [ ] Supabase project is active and configured with the `vector` extension, tables, and storage bucket
- [ ] `.env.local` contains valid runtime secrets for Supabase, Google, and Groq
- [ ] Sample resumes can be ingested and queried successfully against the real database
- [ ] The three notebook test queries pass end-to-end
- [ ] Production deployment works on Vercel

---

## 0. Credentials Setup 📋 DOCUMENTED (do this before live testing)

See **CREDENTIALS_SETUP.md** for the exact setup flow.

- [ ] Confirm `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Confirm `GOOGLE_API_KEY` for Gemini Embedding 2
- [ ] Confirm `GROQ_API_KEY` for chat, tool-calling, and structured output
- [ ] Create/update `.env.local` with all required variables
- [ ] Run a smoke check against `/api/candidates` after the app starts

---

## 1. Setup and environment verification

- [x] Create Next.js project with TypeScript and App Router
- [x] Initialize git repository and `.gitignore`
- [x] Install dependencies with pnpm
- [x] Verify the app compiles under Node 24
- [ ] Provision Supabase project and enable `vector` extension
- [ ] Run `supabase/schema.sql` in the live Supabase SQL editor
- [ ] Create the `resumes` Storage bucket
- [ ] Confirm the runtime secrets are valid and usable from the app

---

## 2. Test Data

- [x] Sample PDF folder exists in `/resumes` in the workspace
- [ ] Confirm the sample PDFs are valid and uploadable to the live Supabase bucket
- [ ] Prepare a small batch for upload testing before running the full E2E set

---

## 3. Ingestion Pipeline

Code is implemented and build-checked:
- [x] Implement `lib/pdf.ts` with `unpdf`
- [x] Implement `lib/chunk.ts` with a 800/100 splitter
- [x] Implement `lib/embeddings.ts` with Gemini embedding validation at 1536 dimensions
- [x] Implement `lib/db.ts` for candidate/chunk insert and vector search
- [x] Implement `app/api/upload-url/route.ts` for signed uploads
- [x] Implement `app/api/ingest/route.ts` with `runtime = "nodejs"` and `maxDuration`

Live verification still pending:
- [ ] Upload a real PDF through the app and confirm ingestion succeeds
- [ ] Verify `resume_chunks` row counts are reasonable for the sample set
- [ ] Confirm the first run reports the expected 1536-dim embeddings via live data
- [ ] Confirm rollback/deletion behavior works if chunk insertion fails

---

## 4. Candidates Page

- [x] Implement `lib/supabase/client.ts`
- [x] Implement `lib/supabase/server.ts`
- [x] Implement `app/api/candidates/route.ts`
- [x] Implement `app/candidates/page.tsx`
- [ ] Validate the page works against a real Supabase dataset
- [ ] Confirm ingested candidates display their name, role guess, and chunk count correctly

---

## 5. Agent Route

- [x] Implement `lib/schema.ts` for the screening report schema
- [x] Implement `lib/agent-tools.ts` for `list_all_candidates`, `search_chunks`, and `get_full_resume`
- [x] Implement `app/api/agent/route.ts` with a tool-calling agent loop and structured final output
- [ ] Run the agent against a live candidate database
- [ ] Verify the tool trace includes intended search and candidate-fetch calls
- [ ] Confirm the final report is valid against the Zod schema and grounded in retrieved data

---

## 6. Screen Page UI

- [x] Implement `app/screen/page.tsx`
- [x] Stream tool-call events and render the final structured report
- [ ] Test the page with a live query using valid credentials
- [ ] Confirm the job description is preserved in browser state as required by the plan
- [ ] Confirm the tool trace is readable and useful during the screening flow

---

## 7. End-to-End Validation (blocked until live environment is working)

The three notebook-style queries should be run in order:
- [ ] Query #1: direct Java/AWS match → confirm the correct candidate is selected
- [ ] Query #2: fragmented Mahesh healthcare experience → confirm the model uses `get_full_resume`
- [ ] Query #3: PM/Scrum-master shortlist → confirm `list_all_candidates` is used and coverage is improved beyond naive RAG
- [ ] Verify chunk counts are in the expected ballpark for the sample set
- [ ] Review the live tool trace for retrieval coverage and evidence grounding

---

## 8. Deploy to Vercel

- [ ] Push the repo to GitHub
- [ ] Link the project in Vercel
- [ ] Add production environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_API_KEY`, `GROQ_API_KEY`, optional `GROQ_CHAT_MODEL`
- [ ] Deploy successfully
- [ ] Smoke-test the production URL with the three example queries
- [ ] Confirm the service-role key never appears in client-side bundles or logs

---

## Verification Checklist

- [x] `pnpm build` completes successfully on Node 24
- [ ] Sample resumes are ingested and chunk counts are reasonable
- [ ] Three notebook queries pass live against the app
- [ ] Live tool trace shows retrieval and coverage behavior as expected
- [ ] Production deployment passes the final smoke test
- [ ] Service-role key is not exposed to the browser

---

## Known implementation gaps to fix before the full E2E pass

These are the next concrete items to iterate on:
- [ ] Use `sessionStorage` instead of `localStorage` for the job description, to match the plan requirement
- [ ] Fix the `get_full_resume` fetch cap logic so duplicate candidate IDs do not circumvent the 8-candidate limit
- [ ] Re-check the model/tool prompt flow for the final report to ensure it stays grounded in observed tool output
- [ ] Confirm the agent uses candidate fetching in a way that matches the desired retrieval pattern for coverage-heavy questions

---

## Recommended next iteration order

1. Configure the live Supabase + Google + Groq environment
2. Run one real ingestion test
3. Validate candidate listing from the database
4. Run one small agent query and inspect the trace
5. Run the three notebook E2E checks
6. Deploy and smoke-test production

This ordering keeps the work focused on the highest-value gaps: live environment correctness first, then retrieval quality, then deployment.
