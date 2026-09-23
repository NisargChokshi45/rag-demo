# Phase 7: End-to-End Testing Guide

**Status**: Ready to execute once `.env.local` credentials are configured.

**Prerequisites**:
- `.env.local` file with valid credentials:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `GOOGLE_API_KEY`
   - `GROQ_API_KEY`
- Supabase project with `schema.sql` executed (tables: `candidates`, `resume_chunks`, RPC function `match_resume_chunks`)
- Supabase Storage bucket named `resumes` created

## Quick Start

```bash
cd /home/bacancy/Desktop/Work/rag-demo

# Start dev server
pnpm dev

# In another terminal, verify build passes
pnpm build
```

The app will run at `http://localhost:3000`.

## Test Sequence

### Step 1: Ingest Sample Resumes (Upload Phase)

**Objective**: Verify PDF parsing, chunking, embeddings, and database ingestion.

**Flow**:
1. Navigate to `http://localhost:3000/upload`
2. Leave "Job Description" blank (optional field)
3. Click file selector and upload 5–10 PDFs from `/resumes/` (e.g., Java developers: `anudeep_java_developer.pdf`, `chetan_java_developer.pdf`, `mahesh_java_developer.pdf`, `pavan_java_developer.pdf`, `sharath_java_developer.pdf`)
4. Monitor upload progress until all show "done" status
5. System will auto-redirect to `/candidates`

**Verification**:
- [ ] Upload page displays file upload progress
- [ ] No network errors in browser console
- [ ] Progress states show: `pending` → `uploading` → `ingesting` → `done`
- [ ] All files complete without errors

**What's happening**:
- `api/upload-url` generates signed URLs to Supabase Storage (Vercel's 4.5MB body limit avoided)
- `api/ingest` parses PDFs via `unpdf`, chunks with 800/100 split, embeds with Gemini, inserts candidate + chunks into Postgres

### Step 2: View Ingested Candidates

**Objective**: Verify candidate list page and database queries.

**Flow**:
1. Auto-redirected to `http://localhost:3000/candidates`, or navigate there directly
2. Review candidate list (name, role, chunk count)

**Verification**:
- [ ] All uploaded candidates appear in the list
- [ ] Each shows a chunk count (typically 20–40 chunks per resume at 800/100 split)
- [ ] "Screen" button is clickable for each candidate
- [ ] Overall chunk count ≈ 20–30 chunks per resume ingested

**Expected ballpark**: For 5 resumes, expect ~100–150 chunks total (166 chunks per resume × 5 = 830 ÷ 5 ≈ 166).

**What's happening**:
- `api/candidates` lists all candidates from the `candidates` table with join-aggregated chunk count

### Step 3: Run Three E2E Test Queries

Upload at least **12 candidates** (two Java devs, one PM, one Scrum Master, one Hadoop dev, one Business Analyst, and others) before running queries to ensure good coverage.

#### **Query #1: Direct Skill Match (Java + AWS)**

**Objective**: Verify vector search finds the right candidates.

**UI**:
1. Click "Screen" from candidates page, or navigate to `http://localhost:3000/screen`
2. Enter Job Description (optional):
   ```
   Senior Java Developer with AWS experience
   Must have: Java, Spring Boot, AWS (EC2, S3, Lambda), 5+ years
   ```
3. Enter Query:
   ```
   Find candidates with strong Java and AWS experience
   ```

**Verification**:
- [ ] Agent streams tool calls in the left panel in real-time
- [ ] `search_chunks` tool is called with "Java" and "AWS" queries
- [ ] Top candidates cited include Java developers (e.g., `anudeep_java_developer`, `chetan_java_developer`, `mahesh_java_developer`)
- [ ] Final report shows 2–4 candidate scores with "✓ evidence" sections citing Java + AWS skills
- [ ] Evidence excerpts are direct quotes from resumes
- [ ] No hallucinated skills (e.g., "Python" if not present in resume)

**Expected tool trace**:
```
list_all_candidates()
search_chunks(query="Java AWS experience")    [reranked by Gemini]
search_chunks(query="Spring Boot cloud")      [additional context]
get_full_resume(candidate_id=<uuid>)          [for top 1–2 matches]
```

---

#### **Query #2: Fragmentation Coverage (Mahesh + Healthcare)**

**Objective**: Verify `get_full_resume` overcomes chunk fragmentation.

**UI**:
1. Keep same Job Description or clear it
2. Enter Query:
   ```
   I need someone named Mahesh with healthcare experience and strong Java skills. How many years of relevant experience does he have?
   ```

**Verification**:
- [ ] Agent searches for "Mahesh healthcare Java"
- [ ] If only chunk matches are insufficient, `get_full_resume` is called (visible in tool trace)
- [ ] Final report shows **exact year numbers** from Mahesh's full resume (not guessed)
- [ ] Evidence section cites both healthcare AND Java from the full resume
- [ ] Answer is grounded (e.g., "Mahesh has 7 years in healthcare IT") with specific cite

**Expected tool trace**:
```
list_all_candidates()
search_chunks(query="Mahesh healthcare experience")
[agent sees chunks are fragmentary, calls:]
get_full_resume(candidate_id=<mahesh_uuid>)
[final answer synthesizes full context]
```

---

#### **Query #3: Shortlist Coverage (PM/Scrum Master)**

**Objective**: Verify `list_all_candidates` solves the "shortlist" problem (naive RAG gets 4/25; agentic RAG should get 8+).

**UI**:
1. Clear previous query
2. Enter Job Description:
   ```
   Looking for Project Manager or Scrum Master with leadership experience
   ```
3. Enter Query:
   ```
   Give me a shortlist of all candidates who have Project Manager or Scrum Master experience, with brief role descriptions. I want the full list, not just top-k.
   ```

**Verification**:
- [ ] Agent immediately calls `list_all_candidates()` (visible in tool trace)
- [ ] Then searches across the full candidate pool (not just top-k vector matches)
- [ ] Final report shows **at least 8+ PMs/Scrum Masters** (e.g., `adelina_project_manager`, `avinash_project_manager`, `murali_pm_qa`, `rajan_pm_scrum_master`, `ravi_pm_devops`, `srivatsan_project_manager`, etc.)
- [ ] Each has a score and brief evidence (e.g., "Project Manager with 6+ years, strong Agile background")
- [ ] Tool trace shows `list_all_candidates()` was used

**Key difference from naive RAG**: 
- **Without agents**: Vector search for "PM" might return only top 5 (naive RAG limitation)
- **With agents**: `list_all_candidates()` + agentic loop finds all PMs, the agent reasons over the full pool

**Expected tool trace**:
```
list_all_candidates()              [fetches all 12+ candidates]
search_chunks(query="PM Scrum experience")
search_chunks(query="leadership agile")
search_chunks(query="team management")
[agent iterates with multiple searches to cover all PMs in the pool]
```

---

## Verification Checklist

After running all three queries:

- [ ] **Chunk count ratio**: Total chunks ingested ÷ resume count ≈ 20–30 chunks per resume (sanity check)
- [ ] **Query #1 coverage**: Java + AWS candidates cited (direct match works)
- [ ] **Query #2 fragmentation**: Mahesh full resume fetched, exact years cited (get_full_resume solves fragmentation)
- [ ] **Query #3 shortlist**: 8+ PMs/Scrum Masters in final report, list_all_candidates visible in trace (agentic coverage beats naive RAG)
- [ ] **No hallucinations**: All evidence quotes are real (spot-check 2–3 excerpts in browser → PDF)
- [ ] **Streaming works**: Tool trace updates live as queries execute (not batched at the end)
- [ ] **Build passes**: `pnpm build` completes with no type errors
- [ ] **No secrets leaked**: Open DevTools → Network tab, inspect `/api/agent` response - should NOT contain `SUPABASE_SERVICE_ROLE_KEY` or `GOOGLE_API_KEY`

## Troubleshooting

### **Upload fails with "network error"**
- Check `.env.local` has valid Supabase credentials
- Verify Supabase Storage bucket `resumes` exists and is public (or has appropriate policies)
- Check Supabase project is not on pause

### **Candidates page shows 0 candidates**
- Verify `schema.sql` was executed in Supabase (check SQL editor for `candidates` table)
- Check `api/ingest` logs - should show PDF parse → chunk → embed → insert steps
- Verify embeddings are being stored (query `SELECT COUNT(*) FROM resume_chunks` in Supabase SQL editor)

### **Agent queries hang or return errors**
- Check `.env.local` has valid `GOOGLE_API_KEY` and `GROQ_API_KEY`
- Verify API key is for Gemini (not older models)
- Check Google API quota (free tier allows ~10k calls/min; 25 resumes × 3 queries × multiple chunks = hundreds of calls total)
- Review `/api/agent` network response for error details

### **Tool trace shows empty or incomplete**
- Verify `maxSteps: 10` is high enough (three queries may need 5–8 steps each)
- Check stream is not timing out (Vercel Fluid Compute gives 300s default; set via `export const maxDuration = 300`)

### **Chunk count is very high (1000+) or very low (10)**
- High: `chunkSize` or overlap params wrong (check `lib/chunk.ts`)
- Low: PDF parsing failed or batch embedding failed (check `api/ingest` logs)
- Expected: 20–30 chunks per resume

## Final Smoke Test (Before Deployment)

Once Phase 7 passes locally:

1. **`pnpm build`** – Confirm no type errors
2. **DevTools Network check** – Confirm no service-role key in bundles
3. **Three queries** – Rerun the three test queries to confirm stable behavior

Then proceed to Phase 8 (Deploy).
