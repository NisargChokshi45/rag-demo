# Your RAG Stack: Groq + Gemini Summary

Your resume screening application uses a **hybrid AI architecture**:

```
┌─────────────────────────────────────────────────────┐
│              Your RAG Stack                         │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Embeddings: 🔍 Gemini API (gemini-embedding-2)     │
│  └─ Purpose: Convert text to 1536-dim vectors       │
│  └─ Used during: Resume ingestion + query embedding │
│  └─ Cost: ~$0.02 per 1M tokens                      │
│                                                     │
│  Chat/Reasoning: 💬 Groq Llama 3.3 70B              │
│  └─ Purpose: Intelligent reasoning & reranking      │
│  └─ Used during: Screening + candidate assessment   │
│  └─ Cost: Free tier available                       │
│                                                     │
│  Vector DB: 🗄️ Supabase pgvector (HNSW)             │
│  └─ Purpose: Store & search embeddings              │
│  └─ Used: Semantic similarity search                │
│  └─ Cost: Included with Supabase                    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## ⚡ Quick Start

### 1. Verify Setup
```bash
bash scripts/VERIFY-SETUP.sh
```

### 2. Set Environment Variables
```bash
export GOOGLE_API_KEY="your-gemini-key"
export GROQ_API_KEY="your-groq-key"
```

### 3. Test the Pipeline
```bash
# Option A: Visual demo (no setup needed)
open scripts/demo-pipeline.html

# Option B: Test custom query
pnpm tsx scripts/test-custom-query.ts

# Option C: Step-by-step examples
pnpm tsx scripts/example-usage.ts
```

### 4. Start the App
```bash
npm run dev
```

---

## 🔄 Complete Pipeline Flow

### During Upload (Ingestion)

```
Resume PDF
    ↓ [parsePDF]
Full Text (12,000+ chars)
    ↓ [chunkText]
Chunks (16 chunks, 800 chars each)
    ↓ [Gemini Embeddings API]
Chunk vectors (16 × 1536 dimensions)
    ↓ [Supabase pgvector]
Stored in resume_chunks table
+ HNSW index for fast search
```

### During Screening (Query)

```
"How many years of experience?"
    ↓ [Gemini Embeddings API]
Query vector (1536 dimensions)
    ↓ [Supabase pgvector similarity search]
Top 15 chunks (cosine similarity)
    ↓ [Group by candidate]
Candidates with their top chunks
    ↓ [Groq/Llama reranking]
Rate relevance: 0-10 for each
    ↓ [Top 5 candidates selected]
    ↓ [Groq/Llama reasoning]
Read chunks, answer your question
    ↓ [Optionally fetch full resume]
    ↓ [LangGraph agent orchestration]
Final assessment with evidence
```

---

## 📊 Model Usage Breakdown

### Gemini (Embeddings Only)

| When       | What                     | Example                                   |
| ---------- | ------------------------ | ----------------------------------------- |
| **Upload** | Embed each resume chunk  | 400 chunks × 50 tokens = 20K tokens       |
| **Query**  | Embed screening question | "How many years?" × 10 tokens = 10 tokens |
| **Cost**   | ~$0.02 per 1M tokens     | 30K tokens = ~$0.0006                     |

### Groq/Llama (Reasoning Only)

| When       | What                  | Example                                 |
| ---------- | --------------------- | --------------------------------------- |
| **Rerank** | Score chunk relevance | 50 screening × 1000 tokens = 50K tokens |
| **Reason** | Answer the question   | Read chunks + extract answer            |
| **Cost**   | Free tier or paid     | 50K tokens = Free (within free tier)    |

**Total Cost: <$0.01** for entire pipeline (ingestion + 50 screenings)

---

## 🎯 What Each Model Does

### Gemini (The Indexer)

```
Input: "Business Systems Analyst with 8+ years in ERP"
       ↓ Semantic understanding
Output: [0.234, -0.567, 0.891, ..., 0.123] (1536 values)

Why: Creates "semantic fingerprint" of text
     Enables finding similar chunks via vector math
```

### Groq/Llama (The Reasoner)

```
Input: Query + Top 3 chunks
       "How many years of experience?"
       Chunk 1: "8+ years in ERP systems"
       Chunk 2: "2015-Present (9 years)"
       Chunk 3: "Over 8+ years in software"
       ↓ Intelligent reasoning
Output: "8-9 years of experience"
        Confidence: 95%
        Evidence: All chunks confirm

Why: Understands context, not just keyword matching
     Combines multiple data points intelligently
     Provides confidence scores
```

---

## 💡 Why This Combination Works

### ✅ Gemini Strengths
- Best-in-class semantic embeddings
- Fast inference
- Reliable API
- Works in 40+ languages

### ✅ Groq Strengths
- Extremely fast (50-100 tokens/sec)
- Open model (Llama) = transparency
- Free tier available
- Great for reasoning tasks

### ✅ Together
- Retrieval (Gemini) + Reasoning (Groq)
- Cost-effective
- High-quality results
- Minimal latency

---

## 📚 Documentation Files

You now have:

| File                                                     | Purpose                        |
| -------------------------------------------------------- | ------------------------------ |
| [INDEX.md](./INDEX.md)                                   | Overview of all demo files     |
| [README.md](./README.md)                                 | Complete technical guide       |
| [CUSTOM-QUERY-GUIDE.md](./CUSTOM-QUERY-GUIDE.md)         | How custom queries work        |
| [CUSTOM-QUERY-QUICK-REF.md](./CUSTOM-QUERY-QUICK-REF.md) | Quick reference for your query |
| [CONFIG-REFERENCE.md](./CONFIG-REFERENCE.md)             | Tuning & configuration guide   |
| [SETUP-GROQ-GEMINI.md](./SETUP-GROQ-GEMINI.md)           | Your exact stack setup         |
| `demo-pipeline.html`                                     | Visual interactive demo        |
| `demo-pipeline.ts`                                       | Executable pipeline script     |
| `test-custom-query.ts`                                   | Test your specific query       |
| `example-usage.ts`                                       | Step-by-step learning          |
| `VERIFY-SETUP.sh`                                        | Verify everything works        |

---

## 🚀 Example: Your Query

**You asked:** "How many years of experience does the candidate have?"

**How it works:**

```
1. Your query arrives
   "How many years of experience?"

2. Gemini embeds it (1536 values)
   [0.123, -0.456, 0.789, ...]

3. Supabase searches vector index
   Finds 15 chunks mentioning experience
   Best match: "8+ years" (98% similar)

4. Groq reranks the 15 chunks
   Scores: 9/10, 8/10, 7/10, etc.

5. Groq reads top 3 chunks
   Chunk 1: "8+ years of experience in ERP"
   Chunk 2: "2015 to Present (9 years)"
   Chunk 3: "15+ years in software"

6. Groq reasons
   "Most recent is 8-9 years in ERP specifically
    But also 15 years total in software.
    Answer: 8-9 years in ERP, 15+ total."

7. Returns to you
   Answer: "8-9 years of ERP experience"
   Confidence: 95%
   Evidence: ["8+ years mentioned in summary",
              "2015-Present in current role",
              "15+ years total experience"]
```

---

## 🎓 Learning Path

1. **Start**: Open `scripts/demo-pipeline.html` (visual understanding)
2. **Learn**: Read [CUSTOM-QUERY-QUICK-REF.md](./CUSTOM-QUERY-QUICK-REF.md) (how your query works)
3. **Explore**: Read [CUSTOM-QUERY-GUIDE.md](./CUSTOM-QUERY-GUIDE.md) (detailed explanation)
4. **Try**: Run `pnpm tsx scripts/test-custom-query.ts` (real execution)
5. **Understand**: Read [SETUP-GROQ-GEMINI.md](./SETUP-GROQ-GEMINI.md) (your exact stack)
6. **Deep Dive**: Read [CONFIG-REFERENCE.md](./CONFIG-REFERENCE.md) (tuning & optimization)
7. **Implement**: Use `/screen` page in the app (production usage)

---

## ✅ Verify Your Setup

Run this to check everything is configured:

```bash
bash scripts/VERIFY-SETUP.sh

# Should output:
# ✓ GOOGLE_API_KEY is set
# ✓ GROQ_API_KEY is set
# ✓ lib/models.ts uses ChatGroq
# ✓ lib/embeddings.ts uses Gemini embeddings
# ✓ Found 25 resume PDFs
# ... (more checks)
# ✓ Setup verification passed!
```

---

## 🔧 Configuration Checklist

- [ ] Set `GOOGLE_API_KEY` (Gemini)
- [ ] Set `GROQ_API_KEY` (Groq)
- [ ] Run `pnpm install` (install dependencies)
- [ ] Run `bash scripts/VERIFY-SETUP.sh` (verify setup)
- [ ] Test: `pnpm tsx scripts/test-custom-query.ts`
- [ ] Start app: `npm run dev`
- [ ] Visit `http://localhost:3000/screen`

---

## 📖 Model References

**Gemini Embedding:**
- Model: `gemini-embedding-2` (default)
- Alternative: `gemini-embedding-004` (newer)
- Docs: https://ai.google.dev/gemini-api/docs/embeddings

**Groq/Llama:**
- Model: `llama-3.3-70b-versatile` (default)
- Alternatives:
  - `llama-3.1-8b-instant` (faster, smaller)
  - `mixtral-8x7b-32768` (larger context)
- Docs: https://console.groq.com/docs

---

## 💬 Common Questions

**Q: Why not just use Claude for everything?**
A: Groq is faster and cheaper for reasoning, Gemini is best-in-class for embeddings.

**Q: Can I change the models?**
A: Yes! Set `GEMINI_EMBEDDING_MODEL` and `GROQ_CHAT_MODEL` env vars.

**Q: What if I need Claude for reasoning?**
A: Replace `lib/models.ts` to use Claude instead of Groq.

**Q: How much does it cost?**
A: ~$0.01 for ingestion + 50 screenings (mostly free tier usage).

**Q: Can it handle more resumes?**
A: Yes, scales to thousands. Supabase pgvector with HNSW enables fast search.

---

## 🎯 Next Steps

1. **Today**: Verify setup with `bash scripts/VERIFY-SETUP.sh`
2. **Today**: Test with `pnpm tsx scripts/test-custom-query.ts`
3. **Today**: Open the app with `npm run dev`
4. **Tomorrow**: Upload real resumes and test screening
5. **Later**: Customize models and tune for your needs

---

**Your RAG pipeline is ready!** 🚀

For questions, check the `/scripts` folder documentation or run the verification script.
