# Resume RAG Pipeline Demo

This folder contains demonstration files that show the complete resume ingestion and screening pipeline:

```
Resume PDF → Parse → Chunk → Embed → Store → Query → Chat
```

## Files

### 1. `demo-pipeline.ts` (Interactive Node.js Script)

A fully functional TypeScript script that demonstrates the complete pipeline end-to-end with a real resume from the `resumes/` folder.

**What it does:**
- Loads the first PDF resume
- Parses it to text
- Chunks the text (800 chars, 100 char overlap)
- Embeds all chunks using Gemini API
- Simulates chat queries over the chunks
- Shows cosine similarity scoring

**To run:**
```bash
nvm use 24
pnpm tsx scripts/demo-pipeline.ts
```

**Requirements:**
- `GOOGLE_API_KEY` environment variable set (for Gemini embeddings)
- A resume PDF in the `resumes/` folder

**Output:**
- Shows chunk creation and embedding progress
- Simulates 3 sample queries
- Returns top-3 most similar chunks for each query with similarity scores

---

### 2. `demo-pipeline.html` (Visual Browser Demo)

A beautifully designed HTML page that visualizes the complete pipeline with a sample resume (Krishna Business Systems Analyst).

**What it shows:**
- 6-stage pipeline diagram with code examples
- Live example with real resume text
- Chunked segments visualization
- Sample query → retrieval flow with similarity scores
- Architecture flow diagram
- Key features and integration points

**To view:**
```bash
# Option 1: Open directly in browser
open scripts/demo-pipeline.html

# Option 2: Serve via local server
python3 -m http.server 8000
# Then visit: http://localhost:8000/scripts/demo-pipeline.html
```

**No external dependencies** - pure HTML/CSS, works offline.

---

## Pipeline Overview

### Stage 1: Upload & Parse
```typescript
// Input: PDF file (from Supabase Storage)
const buffer = fs.readFileSync(resumePath);
const fullText = await parsePDF(buffer);
// Output: Extracted text (12,000+ characters)
```

### Stage 2: Chunking
```typescript
// Input: Full resume text
const chunks = chunkText(fullText);
// Output: Array of ~4-8 overlapping chunks (800 chars each, 100 char overlap)
```

### Stage 3: Embedding
```typescript
// Input: Each chunk
for (const chunk of chunks) {
  const embedding = await embedDocument(chunk);
  // Output: 1536-dimensional vector from Gemini API
}
```

### Stage 4: Storage
```typescript
// Chunks and embeddings stored in Supabase
INSERT INTO resume_chunks (candidate_id, chunk_index, content, embedding)
VALUES (...)
// Plus pgvector HNSW index for fast similarity search
```

### Stage 5: Query Embedding
```typescript
// User asks: "What skills does this candidate have?"
const queryEmbedding = await embedQuery(query);
// Output: 1536-dimensional query vector
```

### Stage 6: Similarity Search
```typescript
// Find top-3 most similar chunks
SELECT * FROM resume_chunks
WHERE candidate_id = $1
ORDER BY embedding <-> $2 LIMIT 3
// <-> is pgvector cosine distance operator
```

### Stage 7: LLM Assessment
```typescript
// Top chunks sent to Claude via LangGraph agent
const assessment = await screeningAgent.invoke({
  jobDescription: jobContext,
  resumeChunks: topChunks,
  query: userQuestion
});
// Output: Structured screening assessment
```

---

## Key Components

### `lib/pdf.ts`
Parses PDF files using the `unpdf` library.

### `lib/chunk.ts`
Splits text into overlapping chunks for better semantic coverage.

### `lib/embeddings.ts`
Generates 1536-dimensional embeddings using Google's Gemini API.
- `embedDocument(text)` - embeds resume chunks
- `embedQuery(text)` - embeds user queries

### `lib/db.ts`
Database operations via Supabase.
- `insertCandidate()` - stores resume metadata
- `insertChunks()` - stores chunks with embeddings
- Vector search via pgvector

### `app/api/ingest/route.ts`
Express route that orchestrates the full pipeline.
- Downloads PDF from Supabase Storage
- Parses, chunks, and embeds
- Stores in database
- Returns ingestion summary

---

## Data Schema

```sql
-- Candidates table
CREATE TABLE candidates (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  role_guess TEXT,
  storage_path TEXT,
  original_filename TEXT,
  full_text TEXT,
  created_at TIMESTAMP
);

-- Resume chunks with embeddings
CREATE TABLE resume_chunks (
  id UUID PRIMARY KEY,
  candidate_id UUID REFERENCES candidates(id),
  chunk_index INT,
  content TEXT,
  embedding vector(1536),
  created_at TIMESTAMP
);

-- Create HNSW index for fast similarity search
CREATE INDEX ON resume_chunks USING hnsw (embedding vector_cosine_ops);

-- Screenings table (from database persistence feature)
CREATE TABLE screenings (
  id UUID PRIMARY KEY,
  job_id UUID REFERENCES jobs(id),
  candidate_id UUID REFERENCES candidates(id),
  status TEXT,
  created_at TIMESTAMP
);

-- Screening assessments
CREATE TABLE screening_assessments (
  id UUID PRIMARY KEY,
  screening_id UUID REFERENCES screenings(id),
  scores JSONB,
  reasoning TEXT,
  created_at TIMESTAMP
);
```

---

## Try It Yourself

### Quick Test (Browser Demo)
1. Open `scripts/demo-pipeline.html` in your browser
2. Read through the pipeline visualization
3. See example queries and their retrieval results

### Full Pipeline Test (Node.js)
1. Set up environment: `cp .env.example .env.local`
2. Add `GOOGLE_API_KEY` for Gemini embeddings
3. Run: `pnpm tsx scripts/demo-pipeline.ts`
4. Watch the pipeline process a real resume end-to-end

### Real Application Flow
1. Visit `http://localhost:3000/upload`
2. Upload a resume PDF
3. View extracted text and chunk count
4. Go to `http://localhost:3000/screen`
5. Select the job and candidate
6. Ask screening questions
7. Get AI-powered assessments based on retrieved chunks

---

## How the RAG Works

### Why Chunking?
- Resumes are 1-2 pages, but embeddings work best on focused text
- Overlapping chunks ensure no important context is lost between boundaries
- 800 chars ~= 150-200 words, a good semantic unit for a skills section or job bullet

### Why Embeddings?
- Keyword search ("java" vs "python") misses semantic similarity
- Embeddings find conceptually related chunks even without exact keyword match
- 1536 dimensions (Gemini) provides rich semantic representation

### Why pgvector HNSW?
- Linear search (comparing all embeddings) is O(n) and slow at scale
- HNSW (Hierarchical Navigable Small World) is O(log n), enabling instant search
- Cosine distance (`<->` operator) measures semantic similarity

### Why LangGraph Agent?
- Simple retrieval alone doesn't reason about job fit
- LangGraph can orchestrate multi-step workflows:
  1. Retrieve relevant chunks
  2. Rerank if needed
  3. Summarize candidate background
  4. Score against job requirements
  5. Generate reasoning
- Claude's intelligence + vector search precision = accurate assessments

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    Upload Interface                     │
│              (app/upload/page.tsx)                      │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
         ┌─────────────────────────────┐
         │  app/api/ingest/route.ts    │
         │  (Orchestration)            │
         └──────────────┬──────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
        ▼               ▼               ▼
   ┌────────┐      ┌────────┐     ┌────────┐
   │ Parse  │      │ Chunk  │     │ Embed  │
   │ (PDF)  │      │(800c)  │     │Gemini) │
   └────────┘      └────────┘     └────────┘
        │               │               │
        └───────────────┼───────────────┘
                        │
                        ▼
              ┌──────────────────┐
              │   Supabase DB    │
              │ ┌──────────────┐ │
              │ │  candidates  │ │
              │ ├──────────────┤ │
              │ │resume_chunks │◄─── embeddings
              │ │w/ pgvector   │ │
              │ └──────────────┘ │
              └──────────────────┘
                        ▲
                        │
        ┌───────────────┴───────────────┐
        │                               │
    ┌───────────┐               ┌──────────────┐
    │  Screening│               │  LangGraph   │
    │Interface  │────query────► │  Agent       │
    └───────────┘               └──────────────┘
                                        │
                                        ▼
                              ┌──────────────────┐
                              │  Vector Search   │
                              │  (pgvector)      │
                              └────────┬─────────┘
                                       │
                                       ▼
                              ┌──────────────────┐
                              │ Top-3 Chunks     │
                              │ + Claude API     │
                              └────────┬─────────┘
                                       │
                                       ▼
                              ┌──────────────────┐
                              │ Assessment       │
                              │ (Stored in DB)   │
                              └──────────────────┘
```

---

## Troubleshooting

### `GOOGLE_API_KEY is missing`
Set your Gemini API key:
```bash
export GOOGLE_API_KEY=your_key_here
pnpm tsx scripts/demo-pipeline.ts
```

### `No PDF files found in resumes folder`
Ensure the `resumes/` folder exists with at least one PDF:
```bash
ls resumes/ | head
# krishna_business_systems_analyst.pdf
# srivatsan_project_manager.pdf
# ...
```

### Embedding API timeouts
Gemini API has rate limits. The script includes exponential backoff (1s → 2s → 4s).
If still failing, increase `BATCH_DELAY` in `app/api/ingest/route.ts`.

### pgvector search is slow
Ensure HNSW index is created:
```sql
CREATE INDEX ON resume_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 200);
```

---

## Next Steps

- **Add PDF chunk highlighting**: Show which chunks matched in the resume modal
- **Implement semantic reranking**: Use Claude to rerank top-5 chunks before final assessment
- **Add multi-job filtering**: Scope search to specific job requirements
- **Build comparison dashboard**: Rank candidates by assessment scores
- **Export reports**: Generate PDF or CSV with assessment details

---

## References

- [Gemini Embedding API](https://ai.google.dev/gemini-api/docs/embeddings)
- [Supabase pgvector](https://supabase.com/docs/guides/database/extensions/pgvector)
- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/)
- [Cosine Similarity](https://en.wikipedia.org/wiki/Cosine_similarity)
- [HNSW Algorithm](https://arxiv.org/abs/1802.02413)
