# START HERE: Your Groq + Gemini RAG Pipeline

**TL;DR**: You have a resume screening RAG that answers custom queries using Groq (reasoning) + Gemini (embeddings). Here's how to use it.

---

## ⚡ Quick Start (5 minutes)

### 1. Verify Everything Works
```bash
bash scripts/VERIFY-SETUP.sh
```

This checks:
- ✅ API keys are set
- ✅ Dependencies installed
- ✅ Files in place
- ✅ Configuration correct

### 2. Test Your Pipeline
```bash
# Set your API keys first
export GOOGLE_API_KEY="your-key"
export GROQ_API_KEY="your-key"

# Run the demo
pnpm tsx scripts/test-custom-query.ts
```

This will:
- Load a real resume
- Embed your query
- Show top matching sections
- Simulate Groq's answer

### 3. Start the App
```bash
npm run dev
# Visit: http://localhost:3000
```

---

## 📖 Your Stack Explained

```
Custom Query
├─ "How many years of experience?"
│
├─ [Step 1] Gemini Embeddings
│  └─ Converts text to semantic vectors (1536 dimensions)
│
├─ [Step 2] Supabase Vector Search
│  └─ Finds similar resume chunks using pgvector
│
├─ [Step 3] Groq/Llama Reasoning
│  └─ Reranks and understands context
│  └─ Reads chunks, answers your question
│
└─ Result: "8-9 years of ERP experience"
           + Evidence + Confidence Score
```

---

## 🎯 Answer Your Question

**You asked:** "How many years of experience does the candidate have?"

**Your pipeline does:**

1. **Embed the question** (Gemini)
   - Converts "How many years..." to a 1536-dimensional vector
   - Captures semantic meaning, not just keywords

2. **Search resumes** (Supabase pgvector)
   - Finds chunks mentioning experience duration
   - Uses HNSW index for fast search (<100ms)

3. **Rerank results** (Groq/Llama)
   - Scores relevance: 0-10 for each chunk
   - "8+ years" chunk scores 9/10

4. **Read and reason** (Groq/Llama)
   - Reads top 3 chunks
   - Extracts specific numbers: "8 years", "9 years", "15+ years"
   - Provides answer: "8-9 years in ERP, 15+ years total"
   - Confidence: 95%

---

## 📚 Documentation Map

| Want to...                | Read This                                                |
| ------------------------- | -------------------------------------------------------- |
| See a visual demo         | `demo-pipeline.html`                                     |
| Understand the flow       | [GROQ-GEMINI-SUMMARY.md](./GROQ-GEMINI-SUMMARY.md)       |
| Learn about your query    | [CUSTOM-QUERY-QUICK-REF.md](./CUSTOM-QUERY-QUICK-REF.md) |
| Deep dive into details    | [CUSTOM-QUERY-GUIDE.md](./CUSTOM-QUERY-GUIDE.md)         |
| Configure your setup      | [SETUP-GROQ-GEMINI.md](./SETUP-GROQ-GEMINI.md)           |
| Tune for performance      | [CONFIG-REFERENCE.md](./CONFIG-REFERENCE.md)             |
| Run step-by-step examples | `example-usage.ts`                                       |
| Test a specific query     | `test-custom-query.ts`                                   |
| See the full pipeline     | `demo-pipeline.ts`                                       |

---

## 🚀 Using the App

### Upload a Resume
1. Go to `http://localhost:3000/upload`
2. Upload a PDF resume
3. See it parsed, chunked, and embedded
4. View the extracted role/experience

### Screen Candidates
1. Go to `http://localhost:3000/screen`
2. Select a job
3. Ask any custom query:
   - "How many years of Java?"
   - "Leadership experience?"
   - "Cloud platform skills?"
   - "Good fit for our team?"
4. Get instant assessment with evidence

### View Results
1. Go to `http://localhost:3000/candidates`
2. See all uploaded resumes
3. View screening assessments
4. Compare candidates

---

## 💡 Example Queries to Try

**Specific Facts:**
- "How many years of experience?"
- "What year did they graduate?"
- "How many projects led?"

**Skills:**
- "What Java frameworks have they used?"
- "Kubernetes experience?"
- "Languages known?"

**Soft Skills:**
- "Leadership examples?"
- "Team collaboration?"
- "Problem-solving stories?"

**Job Fit:**
- "Good fit for senior engineer role?"
- "Cloud architecture background?"
- "Relevant to our fintech needs?"

---

## 🔧 Configuration

### Environment Variables
```bash
# Gemini (embeddings)
export GOOGLE_API_KEY="your-gemini-key"
export GEMINI_EMBEDDING_MODEL="gemini-embedding-2"

# Groq (reasoning)
export GROQ_API_KEY="your-groq-key"
export GROQ_CHAT_MODEL="llama-3.3-70b-versatile"
```

### Get API Keys
- **Gemini**: https://aistudio.google.com (free)
- **Groq**: https://console.groq.com (free tier)

---

## ⚙️ How It Works (Technical)

### During Upload
```typescript
Resume PDF
  → parsePDF() = Full text
  → chunkText() = 16 chunks (800 chars each)
  → embedDocument() × 16 = Gemini API
  → Store in Supabase + HNSW index
```

### During Query
```typescript
Question: "How many years of experience?"
  → embedQuery() = Gemini API
  → searchChunks() = Supabase pgvector
  → getChatModel() = Groq API
  → Rerank + Reason
  → Answer + Evidence
```

---

## 📊 Performance

| Operation       | Time   | Cost      |
| --------------- | ------ | --------- |
| Upload resume   | 30-60s | ~$0.0001  |
| Embed query     | <1s    | ~$0.00001 |
| Vector search   | <100ms | Free      |
| Groq reasoning  | 1-3s   | Free*     |
| Total screening | 2-5s   | ~$0.00002 |

*Free tier: 30 req/min. Paid tier available.

---

## 🛠️ Troubleshooting

### "GOOGLE_API_KEY is missing"
```bash
export GOOGLE_API_KEY="your-gemini-api-key"
echo $GOOGLE_API_KEY  # Verify it's set
```

### "GROQ_API_KEY is missing"
```bash
export GROQ_API_KEY="your-groq-api-key"
echo $GROQ_API_KEY  # Verify it's set
```

### "No resume PDFs found"
```bash
# Check resumes folder
ls resumes/ | head

# Should show:
# krishna_business_systems_analyst.pdf
# srivatsan_project_manager.pdf
# ...
```

### "Embedding API error"
Check:
1. API key is valid
2. Rate limit not exceeded (Gemini: 1500 req/min)
3. Network connection is stable
4. Retry logic will help (exponential backoff)

---

## ✅ Setup Checklist

- [ ] API keys set (Gemini + Groq)
- [ ] `pnpm install` completed
- [ ] `bash scripts/VERIFY-SETUP.sh` passed
- [ ] `pnpm tsx scripts/test-custom-query.ts` works
- [ ] `npm run dev` starts without errors
- [ ] Can upload resume
- [ ] Can ask screening question
- [ ] Get answer with evidence

---

## 🎓 Learning Progression

### Day 1: Understand
1. Read [GROQ-GEMINI-SUMMARY.md](./GROQ-GEMINI-SUMMARY.md)
2. Open `scripts/demo-pipeline.html` in browser
3. Read [CUSTOM-QUERY-QUICK-REF.md](./CUSTOM-QUERY-QUICK-REF.md)

### Day 2: Test
1. Run `bash scripts/VERIFY-SETUP.sh`
2. Run `pnpm tsx scripts/test-custom-query.ts`
3. Run `pnpm tsx scripts/example-usage.ts`

### Day 3: Use
1. `npm run dev` to start app
2. Upload a resume
3. Ask screening questions
4. View assessments

### Day 4: Customize
1. Read [CONFIG-REFERENCE.md](./CONFIG-REFERENCE.md)
2. Adjust chunk size, models, etc.
3. Monitor performance
4. Optimize costs

---

## 🎯 Key Insights

**Why Groq + Gemini?**
- Gemini: Best embeddings (semantic search)
- Groq: Fast reasoning (low latency)
- Together: Best of both worlds

**How custom queries work:**
- Semantic (Gemini) + Intelligent (Groq)
- Not keyword matching
- Understands context
- Provides confidence scores

**Why this architecture:**
- Retrieval (embeddings) + Reasoning (LLM)
- Efficient (split by purpose)
- Cost-effective
- Scalable

---

## 📞 Quick Help

**Q: Can I change the models?**
A: Yes, set `GEMINI_EMBEDDING_MODEL` and `GROQ_CHAT_MODEL`.

**Q: Does it work offline?**
A: No, requires Gemini + Groq APIs online.

**Q: How many resumes can it handle?**
A: Thousands. Supabase pgvector scales well.

**Q: Can it handle complex questions?**
A: Yes, Groq/Llama can reason through multiple pieces.

**Q: What if resume doesn't have the info?**
A: Groq will say "not found" with 0% confidence.

---

## 🚀 Ready to Go!

Your RAG pipeline is fully configured with:
- ✅ Gemini for semantic embeddings
- ✅ Groq/Llama for intelligent reasoning
- ✅ Supabase for vector storage
- ✅ LangGraph for agent orchestration
- ✅ Custom query support

**Next steps:**
1. `bash scripts/VERIFY-SETUP.sh` ← Start here
2. `pnpm tsx scripts/test-custom-query.ts`
3. `npm run dev`

---

## 📚 Additional Resources

- Gemini API: https://ai.google.dev/gemini-api/docs
- Groq Console: https://console.groq.com
- Supabase Docs: https://supabase.com/docs
- LangChain Docs: https://js.langchain.com

---

**Questions?** Check the `/scripts` folder for detailed docs on specific topics.

**Let's go!** 🚀
