# Context Engineering

Context engineering is the science of filling the LLM's finite "working memory" with the most valuable tokens. In 2025-2026, with context windows reaching 1M+ tokens and models gaining Extended Thinking, the focus has shifted from "fitting data" to "ranking relevance" and "managing compute budget."

## Table of Contents

- [The Long Context Paradigm (1M+ Tokens)](#long-context)
- [Extended Thinking & Budget Tokens (2026)](#extended-thinking)
- [Lost-in-the-Middle (2026 Update)](#lost-in-the-middle)
- [Context Budgeting & Token Awareness](#budgeting)
- [Prompt Caching Economics](#prompt-caching)
- [Contextual Compression (RAD-L)](#compression)
- [Interview Questions](#interview-questions)
- [References](#references)

---

## The Long Context Paradigm (1M+ Tokens)

Models like Gemini 2.0 Flash (1M) and Claude 3.7 Sonnet (200K) have massive context windows.

**2026 Insight**: "Context is the new RAG."
For datasets under 100,000 documents, it is often more accurate and faster to put the entire dataset in the context window than to use an external vector database. This is called **"In-Context RAG."**

---

## Extended Thinking & Budget Tokens (2026)

In 2026, two frontier models offer **controllable internal reasoning** before generating a response:

### Claude 3.7 Sonnet — Extended Thinking

```python
response = client.messages.create(
    model="claude-3-7-sonnet-20250219",
    max_tokens=16000,
    thinking={
        "type": "enabled",
        "budget_tokens": 10000  # max internal reasoning tokens
    },
    messages=[{"role": "user", "content": "Refactor this codebase to be async..."}]
)

# Response has two blocks:
# 1. thinking block (visible for debug, not shown to user)
# 2. text block (the actual answer)
for block in response.content:
    if block.type == "thinking":
        print("[THINKING]", block.thinking)
    elif block.type == "text":
        print("[ANSWER]", block.text)
```

**Key parameters:**
- `budget_tokens`: 1,024 → 100,000. Higher = better accuracy, higher cost.
- Thinking tokens billed at standard rates. A 10K thinking budget = +$0.15 per request.
- Streaming works — thinking blocks stream before text.

### o3 (OpenAI) — Reasoning Effort

```python
response = client.chat.completions.create(
    model="o3",
    reasoning_effort="medium",  # "low" | "medium" | "high"
    messages=[{"role": "user", "content": "Prove P=NP or disprove it."}]
)
# Reasoning tokens are invisible — o3 never exposes its internal chain
```

**Effort levels vs cost (approx.):**
| Effort | Speed | Cost multiplier | Best for |
|--------|-------|-----------------|----------|
| low | Fast | 1x | Simple logic, quick lookups |
| medium | Medium | 3-5x | Coding, analysis |
| high | Slow | 8-20x | PhD-level problems, ARC-AGI |

### When to Enable Thinking / Reasoning

| Condition | Recommendation |
|-----------|----------------|
| Complex multi-step code refactoring | ✅ Enable (budget: 8K-20K) |
| Simple Q&A / extraction | ❌ Disable — adds cost & latency |
| STEM / math problems | ✅ Enable (o3-mini medium) |
| High-volume chatbot | ❌ Disable — use standard mode |
| Security-critical decision | ✅ Enable — extra reasoning catches edge cases |

**Production pattern**: Use a complexity classifier to gate Extended Thinking. If query complexity score < 0.5, skip thinking mode entirely (saves 60-80% on reasoning-heavy workloads).

```python
def smart_generate(query: str) -> str:
    complexity = classifier.predict(query)  # 0-1 score
    
    if complexity > 0.7:
        # Enable Extended Thinking for hard problems
        return claude_with_thinking(query, budget_tokens=8000)
    else:
        # Standard fast mode for simple tasks
        return claude_standard(query)
```

---

## Lost-in-the-Middle (2026 Update)

In 2023, models lost accuracy for information in the middle of the prompt.
**The 2026 Status**: Frontier models (Claude 3.7 Sonnet, Gemini 2.0 Flash) perform significantly better, but the **Attention Gradient** still exists.
- **Best Practice**: Place critical instructions and gold-standard examples at the **very beginning** and **very end** of your prompt. Middle = raw data/knowledge chunks.
- **Use chunk ordering**: Rerank retrieved documents so most relevant are first and last.

---

## Context Budgeting & Token Awareness

Every token costs money and increases TTFT (Time to First Token).

| Component | Budget (Tokens) | Why? |
|-----------|-----------------|------|
| **System Prompt** | 500 - 1,000 | Core logic and persona. |
| **History** | 2,000 - 5,000 | Conversational "State." |
| **Data/Search** | 10k - 1M | Depends on task depth. |
| **Output Reserve**| 1,000 - 4,000 | Must reserve space for reasoning. |

---

## Prompt Caching Economics

In late 2025, almost all major providers (OpenAI, DeepSeek, Anthropic) support **Prefix Caching**.

- **The Crossover**: If you reuse a 100k token context (e.g., a codebase) for more than 2 requests, the caching discount effectively makes it cheaper than RAG.
- **Cache Hits**: $0.05 / 1M tokens.
- **Cache Misses**: $5.00 / 1M tokens.

**The Architectural Choice**: Design your system to keep the "System Prompt + Base Knowledge" static to maintain a 100% cache hit rate.

---

## Contextual Compression (RAD-L)

For extremely long contexts (10M+), we use **Reasoning-Aware Deletion (RAD-L)**.
- **How**: A tiny auxiliary model (0.1B) scans the text and removes "filler" words, common linguistic patterns, and irrelevant sections *before* the prompt is sent to the giant frontier model.
- **Benefit**: Reduces prompt size by 20-50% with <1% drop in accuracy.

---

## Interview Questions

### Q: When would you choose Long Context over RAG in 2025?

**Strong answer:**
I choose Long Context when high-fidelity retrieval and cross-document reasoning are critical. RAG suffers from "Retrieval Gap"—if your vector search misses the relevant chunk, the model never sees it. Long Context (up to 2M tokens) provides 100% recall. Specifically, I'd use it for codebase analysis, legal document review, and multi-file financial auditing. I'd stick to RAG for dynamic web-scale data or billion-document datasets that exceed any context window.

### Q: How do you handle the high TTFT associated with million-token prompts?

**Strong answer:**
The primary solution is **Context Caching**. By caching the heavy document on the GPU cluster, the model doesn't have to "re-read" (prefill) the entire 1M tokens for every turn. The TTFT for a cached prompt is nearly the same as for a 1k token prompt. Additionally, for non-cached requests, I would use **Streaming Prefill**, where the model generates an initial summary or "Thought" while it is still processing the latter half of the massive context.

---

## References
- Liu et al. "Lost in the Middle" (2023/2024 update)
- Anthropic. "Extended Thinking: Technical Guide" (2025) — https://docs.anthropic.com/
- OpenAI. "o3 and o3-mini System Card" (2025)
- Google. "Gemini 2.0 Flash: Technical Report" (2024)

---

*Next: [Structured Generation](06-structured-generation.md)*
