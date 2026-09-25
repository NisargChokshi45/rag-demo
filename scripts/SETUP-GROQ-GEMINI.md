# Setup Guide: Groq + Gemini Stack

Your RAG pipeline is configured to use:
- **Embeddings**: Google Gemini API (gemini-embedding-2)
- **Chat/Reasoning**: Groq with Llama 3.3 70B

This document explains the setup and configuration.

---

## 📋 Current Configuration

### lib/models.ts
```typescript
import { ChatGroq } from "@langchain/groq";

export function getChatModel(temperature = 0) {
  const apiKey = process.env.GROQ_API_KEY;

  return new ChatGroq({
    apiKey,
    model: process.env.GROQ_CHAT_MODEL || "llama-3.3-70b-versatile",
    temperature,
  });
}
```

### lib/embeddings.ts
```typescript
const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-2";

async function embed(text: string, kind: "document" | "query"): Promise<number[]> {
  const apiKey = process.env.GOOGLE_API_KEY;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${encodeURIComponent(apiKey)}`,
    { /* ... */ }
  );
}
```

---

## 🔧 Environment Setup

### Required Environment Variables

```bash
# Gemini API (for embeddings)
export GOOGLE_API_KEY="your-gemini-api-key"
export GEMINI_EMBEDDING_MODEL="gemini-embedding-2"

# Groq API (for chat/reasoning)
export GROQ_API_KEY="your-groq-api-key"
export GROQ_CHAT_MODEL="llama-3.3-70b-versatile"
```

### .env.local Example

```bash
# Google Gemini
GOOGLE_API_KEY=gsk_xxxxxxxxxxxxx

# Groq
GROQ_API_KEY=gsk_xxxxxxxxxxxxx

# (Optional) Override models
GEMINI_EMBEDDING_MODEL=gemini-embedding-2
GROQ_CHAT_MODEL=llama-3.3-70b-versatile
```

---

## 🚀 Getting API Keys

### Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com)
2. Click "Get API Key"
3. Create new API key
4. Copy to `GOOGLE_API_KEY`

**Note:** Free tier included with Google account

### Groq API Key

1. Go to [Groq Console](https://console.groq.com)
2. Sign up / Log in
3. Go to API Keys section
4. Create new API key
5. Copy to `GROQ_API_KEY`

**Note:** Free tier available with usage limits

---

## 🔄 Pipeline Architecture

```
User Query
    ↓
[Gemini Embedding API]
    ├─ Embeds query to 1536 dimensions
    └─ Embeds resume chunks (during ingestion)
    ↓
[Supabase pgvector]
    ├─ Stores chunk embeddings
    └─ Performs cosine similarity search
    ↓
[LangGraph Agent]
    ├─ Retrieves top-15 chunks
    └─ Groups by candidate
    ↓
[Groq (llama-3.3-70b)]
    ├─ Reranks chunks by relevance (0-10)
    ├─ Selects top-5 candidates
    ├─ Reads chunk content
    ├─ Answers your specific question
    └─ Provides confidence score
    ↓
Result + Evidence
```

---

## 📊 Model Comparison

### Gemini (Embedding)

| Aspect | Details |
|--------|---------|
| Model | gemini-embedding-2 |
| Dimensions | 1536 |
| Cost | ~$0.02 per 1M tokens |
| Speed | Fast (~100ms per chunk) |
| Quality | Excellent semantic understanding |
| Rate Limit | 1500 req/min (free tier) |

### Groq Llama (Chat/Reasoning)

| Aspect | Details |
|--------|---------|
| Model | llama-3.3-70b-versatile |
| Context | 8K tokens |
| Cost | Free tier available |
| Speed | Very fast (~50-100 tokens/sec) |
| Quality | Excellent reasoning |
| Rate Limit | 30 req/min (free tier) |

---

## 💡 Why This Combination?

### Strengths
✅ **Gemini**: Best-in-class embeddings for semantic search
✅ **Groq**: Fast, free/cheap inference for reasoning
✅ **Complementary**: Embeddings for retrieval, LLM for understanding
✅ **Cost-effective**: Both have generous free tiers

### Trade-offs
⚠️ **Multi-provider**: Two API keys to manage
⚠️ **Free tier limits**: May need paid plans at scale

---

## 🔄 How Each Model Is Used

### Gemini (During Ingestion)

```typescript
// app/api/ingest/route.ts

// For each resume chunk
const embedding = await embedDocument(chunk);
// Calls Gemini API → 1536-dim vector → Supabase

// Gemini Usage:
// - Called once per chunk during upload
// - Embedded vectors stored permanently
// - Not called again unless resume is re-indexed
```

### Groq (During Screening)

```typescript
// lib/agent-tools.ts

// Step 1: Search with embeddings
const queryEmbedding = await embedQuery(query);  // Gemini
const chunks = await searchChunks(queryEmbedding, 15);

// Step 2: Rerank with Groq
const model = getChatModel(0);  // Groq
const score = await model.invoke(
  `Given query: "${query}"\n\nChunks:\n${chunks}\n\nRate 0-10:`
);

// Groq Usage:
// - Called during screening (interactive)
// - Reranks search results
// - Answers specific questions
// - Provides reasoning
```

---

## 📈 Cost Example

Assume 25 resumes, average 16 chunks, 50 screenings with 3 queries each:

### Gemini Costs
```
Ingestion: 25 resumes × 16 chunks = 400 embeddings
  400 × ~50 tokens = 20,000 tokens
  Cost: ~$0.0004

Screening: 50 × 3 queries = 150 queries
  150 × ~10 tokens = 1,500 tokens
  Cost: ~$0.00003

Total Gemini: ~$0.0005 (practically free)
```

### Groq Costs
```
Reranking: 50 screenings × ~1000 tokens = 50,000 tokens
  Free tier: ~30,000 tokens/month included
  Additional: ~$0.10/million tokens

Total Groq: Free (within free tier)
```

**Total Cost: <$0.01 for full pipeline**

---

## 🛠️ Troubleshooting

### "GOOGLE_API_KEY is missing"
```bash
export GOOGLE_API_KEY="your-key"
echo $GOOGLE_API_KEY  # Verify it's set
```

### "GROQ_API_KEY is missing"
```bash
export GROQ_API_KEY="your-key"
echo $GROQ_API_KEY  # Verify it's set
```

### Gemini API Rate Limit Exceeded
```
Error: 429 Too Many Requests

Fix: Increase BATCH_DELAY in app/api/ingest/route.ts
const BATCH_DELAY = 1000;  // Increase from 500ms
```

### Groq API Rate Limit Exceeded
```
Error: 429 Too Many Requests

Fix: Free tier has 30 req/min limit
- Upgrade to paid tier
- Reduce concurrent screenings
- Implement request queuing
```

### Embeddings Look Wrong
```
Problem: Query embeddings don't match chunk embeddings well

Check:
1. Both using same model: gemini-embedding-2?
2. Same embedding dimensions: 1536?
3. Formatting consistent: task: search result | query:?

Fix in lib/embeddings.ts:
function formatEmbeddingInput(text: string, kind: "document" | "query") {
  return kind === "document"
    ? `title: none | text: ${text}`  // ← For chunks
    : `task: search result | query: ${text}`;  // ← For queries
}
```

---

## 🔧 Advanced Configuration

### Use Different Groq Model

```bash
# Available models on Groq
export GROQ_CHAT_MODEL="llama-3.1-8b-instant"   # Faster, smaller
export GROQ_CHAT_MODEL="mixtral-8x7b-32768"     # Larger context
```

### Use Different Gemini Embedding Model

```bash
# Available Gemini models
export GEMINI_EMBEDDING_MODEL="text-embedding-004"  # Newer
```

### Adjust Temperature for Groq

```typescript
// In lib/agent-tools.ts
const model = getChatModel(0.2);  // 0 = deterministic, 1 = creative

// Default is 0 (deterministic)
// For more creative answers, increase to 0.5-0.7
```

---

## 📊 Performance Monitoring

### Track Gemini Usage
```bash
# Check token counts in logs
grep "INGEST" logs/*
# Look for: "Embedding chunk X of Y"

# Monitor API calls
# Visit: https://aistudio.google.com (check quota)
```

### Track Groq Usage
```bash
# Check response times in logs
# Look for: Model response time in ms

# Monitor API calls
# Visit: https://console.groq.com (check usage dashboard)
```

---

## 🚀 Optimization Tips

### For Faster Embeddings
```typescript
// lib/chunk.ts
const CHUNK_SIZE = 1200;  // Larger chunks = fewer API calls
const OVERLAP = 100;
```

### For Faster Reasoning
```bash
# Use smaller/faster Groq model
export GROQ_CHAT_MODEL="llama-3.1-8b-instant"

# Or reduce context
const TOP_K = 3;  # Instead of 15
```

### For Lower Costs
```typescript
// Cache embeddings (don't re-embed same text)
// Batch ingestion (fewer API calls)
// Reuse query embeddings
```

---

## 📚 References

- [Gemini API Docs](https://ai.google.dev/gemini-api/docs)
- [Groq API Docs](https://console.groq.com/docs)
- [LangChain Groq Integration](https://js.langchain.com/docs/integrations/llms/groq)
- [LangChain Google Generative AI](https://js.langchain.com/docs/integrations/vectorstores/google_generative_ai)

---

## ✅ Verify Setup

Run this to confirm everything is configured:

```bash
# 1. Check environment variables
echo "Gemini API Key: ${GOOGLE_API_KEY:0:10}..."
echo "Groq API Key: ${GROQ_API_KEY:0:10}..."

# 2. Test embeddings
pnpm tsx scripts/example-usage.ts

# 3. Test with real resume
export GOOGLE_API_KEY="your-key"
export GROQ_API_KEY="your-key"
pnpm tsx scripts/demo-pipeline.ts

# 4. Start the app
npm run dev
```

---

**You're all set!** Your pipeline is ready to handle custom queries with Groq reasoning + Gemini embeddings. 🚀
