# Resume RAG Pipeline Demo - Quick Start

## 📁 Files Created

### 1. **demo-pipeline.html** ⭐ Start Here
A visual, interactive HTML demonstration of the complete pipeline.
- **No setup required** - just open in browser
- Shows real resume example (Krishna Business Systems Analyst)
- Visualizes: chunking → embedding → search → retrieval
- Includes sample queries and similarity scores
- Perfect for understanding the architecture at a glance

```bash
open scripts/demo-pipeline.html
# or
python3 -m http.server 8000  # then visit http://localhost:8000/scripts/demo-pipeline.html
```

---

### 2. **demo-pipeline.ts** ⚡ Run Full Pipeline
Executable TypeScript script that runs the complete pipeline end-to-end with a real resume.
- Loads first PDF from `resumes/` folder
- Parses, chunks, and embeds the resume
- Simulates chat queries
- Shows similarity scoring with cosine distance

```bash
nvm use 24
pnpm tsx scripts/demo-pipeline.ts
```

**Requirements:**
- `GOOGLE_API_KEY` environment variable (for Gemini embeddings)
- Resume PDFs in `resumes/` folder

**Output:**
- Chunk extraction progress
- Embedding vectors (1536 dimensions)
- Sample queries with top-3 matching chunks
- Similarity scores for each match

---

### 3. **example-usage.ts** 📚 Learn by Example
Step-by-step examples showing how to use each component individually.
- 8 separate examples, each demonstrating one aspect
- Can run them all or uncomment specific examples
- Great for debugging or learning one piece at a time

```bash
pnpm tsx scripts/example-usage.ts
```

**Covered examples:**
1. Parse PDF resume
2. Chunk text into overlapping segments
3. Embed a single chunk
4. Embed a query
5. Compute cosine similarity between vectors
6. Find similar chunks to a query
7. Insert to Supabase database
8. Full end-to-end flow

---

### 4. **README.md** 📖 Full Documentation
Comprehensive guide covering:
- How the pipeline works (all 7 stages)
- Code examples for each component
- Data schema and database setup
- Architecture diagram
- Troubleshooting tips
- Integration points in the app

```bash
cat scripts/README.md
```

---

## 🎯 Quick Flow Diagram

```
Resume PDF
    ↓
1. Parse PDF → Full Text (12,000+ chars)
    ↓
2. Chunk Text → Chunks Array (800 chars, 100 overlap)
    ↓
3. Embed Chunks → Vectors (1536 dimensions each)
    ↓
4. Store in DB → Supabase resume_chunks table
    ↓
5. Embed Query → Query Vector (1536 dimensions)
    ↓
6. Search → Top-3 Similar Chunks (cosine similarity)
    ↓
7. Chat → Claude API via LangGraph Agent
    ↓
Store Assessment → Supabase screenings table
```

---

## 🚀 Getting Started (3 Ways)

### Way 1: Visual Learning (Recommended First)
```bash
# Open the HTML demo in your browser
open scripts/demo-pipeline.html

# See the pipeline visually with sample resume and queries
# No coding, no setup required!
```

### Way 2: Run Real Pipeline
```bash
# Set up environment
export GOOGLE_API_KEY="your-gemini-api-key"

# Run the pipeline with a real resume from resumes/ folder
nvm use 24
pnpm tsx scripts/demo-pipeline.ts

# Watch the process:
# 1. Load resume PDF
# 2. Extract text
# 3. Create chunks
# 4. Embed each chunk
# 5. Run sample queries
# 6. Show similar chunks
```

### Way 3: Learn Step-by-Step
```bash
# Run individual examples
pnpm tsx scripts/example-usage.ts

# Uncomment specific examples in the file to learn one at a time
# Great for understanding vectors, similarity scoring, embeddings
```

---

## 💡 What You'll Learn

### Understanding the Components
- **PDF Parsing** (`lib/pdf.ts`) - Extract text from resumes
- **Chunking** (`lib/chunk.ts`) - Split text into semantic units
- **Embeddings** (`lib/embeddings.ts`) - Convert text to vectors
- **Vector Search** (`lib/db.ts`) - Find similar chunks with pgvector
- **LLM Integration** - Screen candidates with Claude

### Key Concepts
- Why resumes are chunked (800 char units with overlap)
- How embeddings capture meaning (1536 dimensions)
- Why cosine similarity works for search
- pgvector's HNSW index for fast retrieval
- LangGraph agents for intelligent screening

### Real Application Flow
The demo shows exactly what happens when you:
1. Upload a resume on `http://localhost:3000/upload`
2. View it on `http://localhost:3000/candidates`
3. Run screening on `http://localhost:3000/screen`

---

## 📊 Example Output

### From demo-pipeline.ts

```
📄 Resume RAG Pipeline Demo

1. Loading resume: krishna_business_systems_analyst.pdf

📖 Parsing PDF (145.3 KB)...
✓ Extracted 12,847 characters

👤 Candidate: Krishna Business Systems Analyst

2. Chunking text (800 chars, 100 overlap)...
✓ Created 16 chunks

3. Embedding 16 chunks with Gemini API...
   Embedding chunk 1/16...
   ✓ Chunk 1 embedded (1536 dimensions)
   [... more chunks ...]

4. Simulating chat queries...

💬 Query: "What is the candidate's primary experience?"
🔍 Embedding query...
📚 Top 3 relevant chunks:
   1. (chunk 0, similarity: 94.2%)
      "KRISHNA Business Systems Analyst... Results-driven..."
   2. (chunk 1, similarity: 88.7%)
      "experience in enterprise resource planning (ERP)..."
   3. (chunk 4, similarity: 82.1%)
      "PROFESSIONAL EXPERIENCE Business Systems..."

✅ Demo complete!
```

---

## 🔧 Tech Stack

| Component | Technology |
|-----------|-----------|
| PDF Parsing | `unpdf` library |
| Text Chunking | Custom (800 chars, overlap) |
| Embeddings | Google Gemini API (1536-dim) |
| Vector Search | Supabase pgvector (HNSW index) |
| Database | Supabase PostgreSQL |
| Chat/Assessment | Claude API via LangGraph |
| Frontend | Next.js + React |

---

## 📝 Important Notes

### Environment Setup
```bash
# Required for embedding
export GOOGLE_API_KEY="your-key-here"

# Optional: Override model
export GEMINI_EMBEDDING_MODEL="gemini-embedding-2"

# Optional: Override chunk size
# Edit lib/chunk.ts to change CHUNK_SIZE or OVERLAP
```

### Resume Requirements
- Must be PDF format
- Should contain extractable text (no scanned images)
- Will be processed even with formatting issues
- Named like: `name_role.pdf` (e.g., `krishna_business_systems_analyst.pdf`)

### Embedding Limits
- Gemini API: Rate limited (usually 1500 queries/min free tier)
- Each resume chunk = 1 embedding API call
- Retry logic with exponential backoff included in `app/api/ingest/route.ts`

---

## 🎓 Next Steps

1. **Explore the HTML demo** - Understand the flow visually
2. **Run the TypeScript script** - See it working with real data
3. **Read the README** - Learn the technical details
4. **Check the integration points** - See how it connects to the app
5. **Try the full app** - Upload, screen, and assess real candidates

---

## ❓ Questions?

Refer to:
- `scripts/README.md` - Comprehensive documentation
- `scripts/example-usage.ts` - Code examples for each step
- `app/api/ingest/route.ts` - Real implementation
- `PLAN.md` - Original project planning document

---

**Happy exploring!** 🚀
