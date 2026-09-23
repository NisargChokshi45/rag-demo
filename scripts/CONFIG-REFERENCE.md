# Pipeline Configuration Reference

This guide explains how to customize the RAG pipeline components.

## 1. Chunking Strategy

**File:** `lib/chunk.ts`

```typescript
const CHUNK_SIZE = 800;      // Characters per chunk
const OVERLAP = 100;          // Overlap between chunks
```

### Why These Values?

- **800 chars** ≈ 150-200 words (good semantic unit)
  - Large enough: Contains full context (skills, job descriptions)
  - Small enough: Stays focused on one topic
  - Trade-off: Smaller chunks = more calls to embedding API

- **100 char overlap** ≈ 20 words
  - Prevents breaking important concepts at chunk boundaries
  - Ensures context flows between chunks

### Experiment With:

```typescript
// Larger chunks (more context, fewer API calls)
const CHUNK_SIZE = 1200;
const OVERLAP = 150;

// Smaller chunks (more precise, more API calls)
const CHUNK_SIZE = 400;
const OVERLAP = 50;

// No overlap (faster, may miss context)
const CHUNK_SIZE = 800;
const OVERLAP = 0;
```

### When to Adjust

| Scenario | Setting | Why |
|----------|---------|-----|
| Long resumes (3-4 pages) | Increase chunk size to 1200-1500 | Better context retention |
| Short resumes (1 page) | Keep at 800 or reduce to 600 | Avoid redundancy |
| Budget-conscious | Increase chunk size | Fewer embedding API calls |
| High accuracy needed | Reduce chunk size to 400-600 | More focused chunks |

---

## 2. Embedding Configuration

**File:** `lib/embeddings.ts`

```typescript
export const EMBEDDING_DIMENSIONS = 1536;
const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-2";
```

### Environment Variables

```bash
# Override embedding model
export GEMINI_EMBEDDING_MODEL="gemini-embedding-004"

# API key (required)
export GOOGLE_API_KEY="your-key-here"
```

### Available Gemini Models

| Model | Dimensions | Speed | Cost | Quality |
|-------|-----------|-------|------|---------|
| `gemini-embedding-2` | 768 | Fastest | Cheapest | Good |
| `gemini-embedding-001` | 1536 | Fast | Standard | Better |
| `gemini-embedding-004` | 1536 | Fast | Standard | Best |

### Embedding Input Format

The pipeline formats text before embedding:

```typescript
// For documents (resumes)
`title: none | text: ${text}`

// For queries (screening questions)
`task: search result | query: ${text}`
```

**Why?** This tells Gemini the context, improving embedding quality.

### Cost Example

Assume 25 resumes, average 16 chunks each:

```
Total embeddings = 25 × 16 = 400 embeddings

Cost estimate:
- Gemini Embedding API: ~$0.02 per 1M tokens
- 400 embeddings × avg 50 tokens = 20,000 tokens
- Cost ≈ $0.0004 per full batch
```

---

## 3. Similarity Search Parameters

**File:** `app/api/screening/route.ts` (or wherever search is called)

### Key Parameters

```typescript
// Number of chunks to retrieve
const TOP_K = 3;  // Adjust based on needs

// Similarity threshold (0-1)
const SIMILARITY_THRESHOLD = 0.5;  // Only return if above this
```

### Tuning Guide

```typescript
// High precision (fewer but better matches)
const TOP_K = 3;
const SIMILARITY_THRESHOLD = 0.75;

// High recall (more potential matches)
const TOP_K = 10;
const SIMILARITY_THRESHOLD = 0.4;

// Balanced
const TOP_K = 5;
const SIMILARITY_THRESHOLD = 0.6;
```

### Why Cosine Similarity?

Vector similarity score ranges from -1 to +1:
- `1.0` = identical vectors (perfect match)
- `0.8` = very similar (excellent candidate)
- `0.6` = similar (good candidate)
- `0.4` = loosely related (fair candidate)
- `0.0` = orthogonal (unrelated)

---

## 4. Vector Index Configuration

**File:** Database (Supabase)

The pgvector index affects search speed and accuracy:

```sql
-- Current HNSW index
CREATE INDEX ON resume_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 200);

-- Parameters explained:
-- m = 16           : Connections per node (higher = better recall, more memory)
-- ef_construction  : Search width during build (higher = better quality)
```

### HNSW Tuning

```sql
-- For smaller datasets (< 10,000 chunks)
WITH (m = 8, ef_construction = 100)

-- For medium datasets (10k - 100k chunks)
WITH (m = 16, ef_construction = 200)  ← Current setting

-- For large datasets (> 100k chunks)
WITH (m = 32, ef_construction = 300)
```

**Cost/Performance Trade-off:**
- Higher `m` and `ef_construction` = Better accuracy, More memory
- Lower values = Faster, Less memory

---

## 5. LangGraph Agent Configuration

**File:** `app/api/screening/route.ts`

### Agent Parameters

```typescript
// Model for assessment
const MODEL = "claude-3-5-sonnet-20241022";

// Temperature (0 = deterministic, 1 = creative)
const TEMPERATURE = 0.3;  // Low for consistent assessments

// Max output tokens
const MAX_TOKENS = 2000;

// Tool definitions (screening tools)
const TOOLS = [
  {
    name: "evaluate_skill",
    description: "Check if candidate has required skill"
  },
  {
    name: "extract_experience",
    description: "Extract years/type of experience"
  },
  {
    name: "score_fit",
    description: "Score candidate fit for job"
  }
];
```

### Assessment Scoring

```typescript
// Scoring schema
{
  overall_score: 1-10,           // Final fit score
  skill_match: 0-100,            // % of required skills present
  experience_match: 0-100,       // % of required experience
  strengths: string[],           // Top 3-5 strengths
  gaps: string[],                // Top gaps vs job requirements
  recommendations: string        // Hire/Interview/Reject recommendation
}
```

---

## 6. API Rate Limiting

**File:** `app/api/ingest/route.ts`

### Gemini Embedding API Limits

```typescript
// Current settings
const MAX_RETRIES = 3;           // Failed requests retry up to 3 times
const BATCH_DELAY = 500;         // Pause between every 5 chunks (500ms)

// Retry backoff: 1s → 2s → 4s (exponential)
const backoffMs = Math.pow(2, attempt) * 1000;
```

### Recommended Adjustments

```typescript
// For production (higher rate limits)
const MAX_RETRIES = 5;
const BATCH_DELAY = 200;  // Faster batching

// For free tier (lower limits)
const MAX_RETRIES = 3;
const BATCH_DELAY = 1000;  // Slower batching

// For development (fastest)
const MAX_RETRIES = 1;
const BATCH_DELAY = 100;
```

### Cost vs Speed

| Config | Speed | API Calls | Cost |
|--------|-------|-----------|------|
| Aggressive (BATCH_DELAY=100) | Fast | Fewer retries | Lowest |
| Moderate (BATCH_DELAY=500) | Normal | Balanced | Low |
| Conservative (BATCH_DELAY=1000) | Slow | More retries | Higher |

---

## 7. Feature Flags

**File:** `lib/config.ts`

```typescript
export const FEATURE_FLAGS = {
  AUTH_ENABLED: false,           // Require Supabase auth
  USER_DATA_ISOLATION: false,    // Scope data by user
  SEMANTIC_RERANKING: false,    // Rerank results with LLM
  CACHED_EMBEDDINGS: false,     // Cache embedding results
};
```

### Enable Features

```typescript
// To enable auth
FEATURE_FLAGS.AUTH_ENABLED = true;
// Requires: Supabase Auth configuration

// To enable per-user isolation
FEATURE_FLAGS.USER_DATA_ISOLATION = true;
// Impact: Filter by user_id in all queries

// To enable semantic reranking
FEATURE_FLAGS.SEMANTIC_RERANKING = true;
// Impact: Rerank top-10 results with Claude (slower, better)

// To cache embeddings
FEATURE_FLAGS.CACHED_EMBEDDINGS = true;
// Impact: Skip embedding API for same text
```

---

## 8. Database Schema Customization

### Current Schema

```sql
-- Candidates
CREATE TABLE candidates (
  id UUID PRIMARY KEY,
  name TEXT,
  role_guess TEXT,
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

-- Screenings
CREATE TABLE screenings (
  id UUID PRIMARY KEY,
  job_id UUID REFERENCES jobs(id),
  candidate_id UUID REFERENCES candidates(id),
  status TEXT,
  created_at TIMESTAMP
);

-- Assessments
CREATE TABLE screening_assessments (
  id UUID PRIMARY KEY,
  screening_id UUID REFERENCES screenings(id),
  scores JSONB,
  reasoning TEXT,
  created_at TIMESTAMP
);
```

### Extension Suggestions

```sql
-- Add candidate source tracking
ALTER TABLE candidates
ADD COLUMN source TEXT DEFAULT 'web-upload';

-- Add screening history
ALTER TABLE screenings
ADD COLUMN updated_at TIMESTAMP;

-- Add assessment metadata
ALTER TABLE screening_assessments
ADD COLUMN model_used TEXT DEFAULT 'claude-3-5-sonnet';
ADD COLUMN generation_time_ms INT;
```

---

## 9. Performance Optimization

### Bottleneck 1: Embedding API Calls
**Problem:** Slow when uploading large resumes
**Solution:**
- Increase chunk size (fewer chunks = fewer API calls)
- Cache embeddings (skip re-embedding identical text)
- Use faster embedding model

```typescript
// In lib/chunk.ts
const CHUNK_SIZE = 1200;  // Instead of 800
```

### Bottleneck 2: Vector Search
**Problem:** Slow with large resume collections
**Solution:**
- Ensure HNSW index is created
- Tune index parameters
- Add query caching

```sql
-- Check index exists
SELECT indexname FROM pg_indexes WHERE tablename='resume_chunks';

-- Rebuild if needed
REINDEX INDEX CONCURRENTLY resume_chunks_embedding_idx;
```

### Bottleneck 3: LLM Processing
**Problem:** Slow screening assessments
**Solution:**
- Reduce TOP_K chunks (fewer to process)
- Reduce MAX_TOKENS output
- Use faster model

```typescript
const TOP_K = 3;          // Process fewer chunks
const MAX_TOKENS = 1500;  // Shorter output
const MODEL = "claude-3-5-haiku";  // Faster model
```

---

## 10. Troubleshooting Configurations

### Issue: High API Costs
```bash
# ✅ Fix: Increase chunk size
CHUNK_SIZE=1500   # Fewer chunks = fewer embeddings

# ✅ Fix: Enable caching
FEATURE_FLAGS.CACHED_EMBEDDINGS = true
```

### Issue: Poor search results
```bash
# ✅ Fix: Reduce chunk size
CHUNK_SIZE=400    # Smaller, more focused chunks

# ✅ Fix: Enable reranking
FEATURE_FLAGS.SEMANTIC_RERANKING = true

# ✅ Fix: Increase TOP_K
const TOP_K = 10  # Return more candidates
```

### Issue: Slow vector search
```bash
# ✅ Fix: Check index exists
SELECT indexname FROM pg_indexes WHERE tablename='resume_chunks';

# ✅ Fix: Rebuild index
REINDEX INDEX CONCURRENTLY resume_chunks_embedding_idx;

# ✅ Fix: Increase ef_construction
WITH (m = 32, ef_construction = 400)
```

### Issue: Memory usage high
```bash
# ✅ Fix: Reduce index parameters
WITH (m = 8, ef_construction = 100)

# ✅ Fix: Batch ingestion
Process fewer resumes at a time
```

---

## Quick Reference Cheat Sheet

| Config | File | Change | Effect |
|--------|------|--------|--------|
| Chunk size | `lib/chunk.ts` | CHUNK_SIZE | API calls, relevance |
| Embedding model | `.env` | GEMINI_EMBEDDING_MODEL | Quality, speed, cost |
| Search depth | `app/api/screening` | TOP_K | Recall vs speed |
| Retry attempts | `app/api/ingest` | MAX_RETRIES | Reliability vs time |
| Index quality | Supabase | m, ef_construction | Accuracy vs memory |
| Assessment model | `app/api/screening` | MODEL | Quality vs cost |
| Rate limiting | `app/api/ingest` | BATCH_DELAY | Speed vs quota |

---

## Testing Your Configuration

```bash
# Test embedding with custom settings
pnpm tsx scripts/example-usage.ts

# Test ingest pipeline with monitoring
pnpm tsx scripts/demo-pipeline.ts

# Test search quality
# Use scripts/example-usage.ts example 6: similarity search

# Profile performance
# Add timing logs before/after each stage
console.time("embedding");
const embedding = await embedDocument(chunk);
console.timeEnd("embedding");
```

---

## Production Configuration Template

```bash
# .env.production
GOOGLE_API_KEY=your-production-key
GEMINI_EMBEDDING_MODEL=gemini-embedding-004

# lib/chunk.ts (production)
const CHUNK_SIZE = 1000;
const OVERLAP = 100;

# lib/config.ts (production)
export const FEATURE_FLAGS = {
  AUTH_ENABLED: true,
  USER_DATA_ISOLATION: true,
  SEMANTIC_RERANKING: true,
  CACHED_EMBEDDINGS: true,
};

# app/api/ingest/route.ts (production)
const MAX_RETRIES = 5;
const BATCH_DELAY = 300;
```

---

**💡 Tip:** Start with defaults, measure performance, then adjust based on your specific needs (cost, accuracy, speed).
