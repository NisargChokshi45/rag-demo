# Custom Query Guide: How It Works

## Example Query: "How many years of experience does the candidate have?"

The RAG pipeline is **specifically designed** to handle custom, specific queries. Here's how:

---

## 📊 Complete Flow Diagram

```
User Query
│
├─ "How many years of experience?"
├─ "What Java frameworks has this person used?"
├─ "Does the candidate have cloud architecture experience?"
├─ "How many projects have they led?"
│
▼

┌──────────────────────────────────────────────┐
│ 1. EMBED QUERY SEMANTICALLY                  │
│ ─────────────────────────────────────────────│
│ Input: "How many years of experience?"       │
│                                              │
│ Format: task: search result | query: ...     │
│ Output: 1536-dimensional vector              │
│         (captures semantic meaning, not just │
│          keywords)                           │
└──────────────────────────────────────────────┘
                     │
                     ▼

┌────────────────────────────────────────────────┐
│ 2. VECTOR SIMILARITY SEARCH                    │
│ ───────────────────────────────────────────────│
│ Algorithm: Cosine similarity                   │
│                                                │
│ Resume Chunk 1 (Experience section)            │
│   "8+ years of experience in ERP systems"      │
│   Similarity: 94.2% ✓ (Strong match)           │
│                                                │
│ Resume Chunk 2 (Skills section)                │
│   "SAP, Oracle, Salesforce implementation"     │
│   Similarity: 78.5% ✓ (Good match)             │
│                                                │
│ Resume Chunk 3 (Education)                     │
│   "Bachelor's in Computer Science, 2015"       │
│   Similarity: 45.1% (Weak match)               │
│                                                │
│ Top 15 chunks retrieved (all > 40% similarity) │
└────────────────────────────────────────────────┘
                     │
                     ▼

┌───────────────────────────────────────────┐
│ 3. LLM RERANKING (CLAUDE)                 │
│ ──────────────────────────────────────────│
│ For each candidate's chunks:              │
│                                           │
│ Prompt: "Given query: 'How many years of  │
│         experience?', rate these chunks:  │
│                                           │
│         [top 3 chunks from vector search] │
│                                           │
│         Rate relevance 0-10:"             │
│                                           │
│ Claude Response: 9                        |
│ (Expert human judgment, not just math)    │
│                                           │
│ Output: Top 5 candidates reranked         │
└───────────────────────────────────────────┘
                     │
                     ▼

┌───────────────────────────────────────────────┐
│ 4. GROQ (LLAMA) ANALYZES TOP CHUNKS           |
│ ──────────────────────────────────────────────│
│ Chunk 1 (94.2% similar):                      │
│ "Results-driven Business Systems Analyst      │
│  with 8+ years of experience in enterprise    │
│  resource planning (ERP) systems..."          |
│                                               │
│ Chunk 2 (78.5% similar):                      │
│ "PROFESSIONAL EXPERIENCE                      │
│  Senior Systems Analyst at TechCorp (2015-    |
│  Present, 9 years)..."                        │
│                                               │
│ Chunk 3 (72.1% similar):                      │
│ "Technical expertise spanning 8+ years across │
│  multiple business domains..."                │
│                                               │
│ Groq/Llama's Analysis:                        │
│ ✓ All chunks mention experience duration      │
│ ✓ Consistent: 8-9 years mentioned             │
│ ✓ Clear evidence in professional history      │
│                                               │
│ Final Answer: "8-9 years of experience"       │
│ Confidence: HIGH                              │
└───────────────────────────────────────────────┘
                     │
                     ▼

┌─────────────────────────────────────────┐
│ 5. OPTIONAL: FETCH FULL RESUME          │
│ ────────────────────────────────────────│
│ If chunks aren't sufficient:            │
│ - Claude can call get_full_resume tool  │
│ - Analyzes complete resume if needed    │
│ - More comprehensive answer             │
│ - Limited to 8 candidates per screening │
│   (for token efficiency)                │
└─────────────────────────────────────────┘
                     │
                     ▼

Result: "8-9 years of direct ERP experience"
+ Supporting Evidence + Confidence Score
+ Links to specific resume sections
```

---

## 🎯 How Different Queries Work

### Query 1: Specific Numbers
```
Q: "How many years of experience does the candidate have?"

Search finds chunks with:
  • "8+ years"
  • "2015 to present"
  • "15 years of industry experience"
  • Date ranges in employment history

Claude extracts: "8-15 years"
Confidence: Very High (explicit mention)
```

### Query 2: Skills/Technologies
```
Q: "What Java frameworks has this person used?"

Search finds chunks with:
  • "Spring, Hibernate, Maven"
  • "Java development for 5 years"
  • "Framework experience: Spring Boot"
  • Technical stack descriptions

Claude extracts: "Spring, Hibernate, Maven"
Confidence: High (explicitly mentioned)
```

### Query 3: Soft/Implied Information
```
Q: "How good is this candidate at system design?"

Search finds chunks with:
  • "Architecture design"
  • "System scalability solutions"
  • "Led infrastructure projects"
  • "Technical leadership"

Claude infers: "Strong - implied by project scope"
Confidence: Medium (requires interpretation)
```

### Query 4: Broad Requirements
```
Q: "Is this person a good fit for our cloud platform team?"

Search finds chunks with:
  • Cloud technologies (AWS, Azure, GCP)
  • Distributed systems
  • Microservices
  • DevOps experience
  • Team leadership

Claude scores: "8/10 fit"
Reasoning: "3/5 required skills, 2 years cloud, team lead"
```

---

## 💡 Why Vector Search + LLM is Powerful

### Example: Naive vs RAG Approach

**Without RAG (Keyword Search):**
```
Query: "How many years of experience?"

Keyword matches:
  ✗ "years" appears 47 times
  ✗ "experience" appears 23 times
  ✗ Can't distinguish experience type
  ✗ False positives (e.g., "years of study")
  ✗ Manual review needed

Conclusion: FAILS
```

**With RAG (Vector + LLM):**
```
Query: "How many years of experience?"

Vector search:
  ✓ Finds chunks about duration/experience
  ✓ Semantic match, not keyword matching
  ✓ Ignores irrelevant mentions

LLM reranking:
  ✓ Claude understands context
  ✓ Confirms all matches are relevant
  ✓ Extracts specific numbers
  ✓ Provides confidence level

Conclusion: SUCCESS with "8-9 years"
```

---

## 🔧 Code: How Queries Are Processed

### In Agent Tools (lib/agent-tools.ts)

```typescript
// Tool 1: search_chunks
async function searchChunks({ query }: { query: string }) {
  // Step 1: Embed query semantically
  const queryEmbedding = await embedQuery(query);

  // Step 2: Find similar chunks (pgvector search)
  const chunks = await searchChunks(queryEmbedding, 15);

  // Step 3: Group by candidate
  const chunksByCandidate = groupBy(chunks, 'candidate_id');

  // Step 4: LLM reranking
  for (const [candidateId, data] of Object.entries(chunksByCandidate)) {
    const rerankerPrompt = `
      Query: "${query}"

      Resume chunks:
      ${data.chunks.slice(0, 3).join('\n---\n')}

      Rate relevance 0-10:
    `;

  const score = await claude.invoke(rerankerPrompt);
    rerankedCandidates.push({
      candidateId,
      score,
      chunks: data.chunks.slice(0, 3)
    });
  }

  // Step 5: Return top 5
  return rerankedCandidates.sort((a, b) => b.score - a.score).slice(0, 5);
}

// Tool 2: get_full_resume (fallback)
async function getFullResume({ candidateId }: { candidateId: string }) {
  // If chunks aren't enough, Claude can fetch complete resume
  const fullText = await getFullResumeById(candidateId);
  return { candidateId, fullResume: fullText };
}
```

---

## 📈 Example Output for Your Query

```
Query: "How many years of experience does the candidate have?"

Candidate: Krishna Business Systems Analyst
────────────────────────────────────────────

Relevance Score: 9/10

Top Matching Sections:
  1. "Results-driven Business Systems Analyst with 8+ years of
     experience in enterprise resource planning (ERP) systems,
     business process improvement, and cross-functional stakeholder
     management." (94.2% semantic match)

  2. "PROFESSIONAL EXPERIENCE
     Business Systems Analyst at TechCorp Solutions (2018-Present,
     9 years)" (88.7% semantic match)

  3. "Technical expertise spanning 8+ years across multiple
     business domains including finance, manufacturing, and retail."
     (82.1% semantic match)

Answer Extracted by Claude:
─────────────────────────────
Years of Experience: 8-9 years
Primary Domain: Business Systems & ERP
Related: Finance, Manufacturing, Retail

Evidence Quality: HIGH
  ✓ Consistent mention of 8-9 years
  ✓ Multiple experience indicators
  ✓ Clear professional timeline
  ✓ Specific domain expertise

Confidence: 95%
```

---

## 🚀 Real-World Queries You Can Ask

```
Experience-based:
  • "How many years of Java development?"
  • "What's their experience with microservices?"
  • "Do they have startup experience?"
  • "Project management years?"

Skills-based:
  • "What cloud platforms have they used?"
  • "Which databases are they proficient in?"
  • "Do they know Kubernetes?"
  • "Machine learning experience?"

Leadership-based:
  • "Have they led teams? How big?"
  • "Experience with mentoring?"
  • "Any incident response experience?"
  • "How many reports have they managed?"

Domain-based:
  • "FinTech experience?"
  • "Healthcare software background?"
  • "E-commerce platform work?"
  • "Gaming industry?"

Soft skills:
  • "Evidence of strong communication?"
  • "Agile methodology experience?"
  • "Cross-functional collaboration?"
  • "Problem-solving examples?"
```

All these queries will be:
1. **Semantically embedded** (understood, not just keyword matched)
2. **Vector searched** (find relevant resume sections)
3. **LLM reranked** (Claude scores relevance)
4. **Answered with context** (Claude extracts from chunks or fetches full resume)

---

## 📊 Performance Characteristics

| Query Type | Accuracy | Speed | Effort |
|-----------|----------|-------|--------|
| Explicit facts (years, dates) | Very High | Fast | 1 vector search |
| Technical skills | High | Fast | 1-2 vector searches |
| Soft skills/Culture fit | Medium-High | Medium | May need full resume |
| Comparative (vs job requirements) | High | Medium | Full resume recommended |

---

## 🔗 Integration with Screening

When you ask a custom query on the screening page:

1. **Frontend** (app/screen/page.tsx)
   - You type your query
   - Click "Assess Candidates"

2. **Backend** (LangGraph Agent with Groq)
   - Calls `search_chunks` tool with your query
   - Gets top candidates + matching resume sections
   - Scores each candidate using Groq/Llama reasoning
   - Returns results

3. **Optional**
   - If Groq needs more info: calls `get_full_resume`
   - Analyzes complete resume
   - Provides comprehensive assessment

4. **Output**
   - Score for each candidate
   - Evidence (specific resume sections)
   - Unknowns (what couldn't be determined)
   - Reasoning from Groq (llama-3.3-70b-versatile)

---

## 💾 Stored for Later

All queries and assessments are saved to Supabase:
- Screening history
- Assessment scores
- Evidence citations
- Comparative analytics

This lets you:
- Run multiple queries against same candidate pool
- Compare candidates across different criteria
- Build score matrices
- Generate hiring recommendations

---

## Test It Yourself

Try the test script to see custom queries in action:

```bash
# Requires GOOGLE_API_KEY for embeddings
export GOOGLE_API_KEY="your-key"

# Run the custom query test
pnpm tsx scripts/test-custom-query.ts
```

This will:
1. Load a real resume
2. Embed your query
3. Score all chunks
4. Show top matches
5. Simulate Claude's answer extraction

---

**Key Takeaway:** The pipeline handles ANY custom query—specific facts, skills, soft skills, requirements matching. It combines vector search's semantic understanding with Claude's reasoning to find accurate answers buried in resumes.
