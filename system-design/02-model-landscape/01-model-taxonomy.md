# Model Taxonomy

This chapter provides a comprehensive guide to the model landscape as of **March 2026**, covering model families, capabilities, and selection criteria for production systems.

## Table of Contents

- [Model Categories](#model-categories)
- [Frontier Models (March 2026)](#frontier-models)
- [Reasoning Models](#reasoning-models)
- [Open Source Models](#open-source-models)
- [Specialized Models](#specialized-models)
- [Embedding Models](#embedding-models)
- [Model Selection Framework & Semantic Routing](#model-selection-framework)
- [Sovereign AI & Data Residency](#sovereign-ai-and-data-residency)
- [Capability Comparison](#capability-comparison)
- [Interview Questions](#interview-questions)
- [References](#references)

---

## Model Categories

### By Capability Level (March 2026 Reality)

| Tier | Characteristics | Examples | Use Case |
|------|-----------------|----------|----------|
| **Frontier** | State-of-the-art reasoning, agentic mastery | Claude 3.7 Sonnet, GPT-4.5, o3, Grok 3 | Complex reasoning, coding, production agents |
| **Fast/Efficient** | Sub-200ms, cost-optimized | Gemini 2.0 Flash, Claude 3.5 Haiku, o3-mini | High-volume streaming, UI, real-time |
| **Battle-Tested** | Mature, widely-deployed, stable | GPT-4o, Claude 3.5 Sonnet | Enterprise production workloads |
| **Small/Edge** | Private, edge, specialized | Llama 3.3 8B, Phi-4, Gemma 3 | Local privacy, on-device |
| **Reasoning-Heavy** | Extended internal CoT | o3, DeepSeek-R1, Claude 3.7 (thinking) | Math, code debug, multi-step logic |

### By Reasoning Mode (2025–2026)

| Mode | Capability | Models | Use Case |
|------|------------|--------|----------|
| **Standard** | Fast, intuitive response | GPT-4o, Claude 3.5 Sonnet | Chat, simple extraction |
| **Extended Thinking** | Internal scratchpad CoT before output | Claude 3.7 Sonnet, o3, DeepSeek-R1 | Math, code debugging, planning |
| **Hybrid** | User-controllable reasoning depth | Claude 3.7 Sonnet | Variable complexity tasks |

---

## Frontier Models (March 2026)

### Claude 3.7 Sonnet (Anthropic)

| Attribute | Value |
|-----------|-------|
| Context Window | 200K tokens |
| Input Cost | $3.00 / 1M tokens |
| Output Cost | $15.00 / 1M tokens |
| Extended Thinking | Native (configurable budget_tokens) |
| Multimodal | Text + Vision |
| Highlights | Top SWE-bench Verified; best production coding model |
| Released | February 2025 |

**Best for:** Autonomous software engineering, Claude Code agent, complex reasoning.
**Considerations:** Enable Extended Thinking for hard tasks; use standard mode for high-volume.

### GPT-4.5 (OpenAI)

| Attribute | Value |
|-----------|-------|
| Context Window | 128K tokens |
| Input Cost | $75.00 / 1M tokens |
| Output Cost | $150.00 / 1M tokens |
| Multimodal | Text, Vision |
| Highlights | Highest EQ/creativity scores; strong instruction following |
| Released | February 2025 |

**Best for:** Creative tasks, customer-facing chat, nuanced role-following.
**Considerations:** Expensive; not the top choice for heavy reasoning or volume.

### o3 (OpenAI)

| Attribute | Value |
|-----------|-------|
| Context Window | 200K tokens |
| Input Cost | $10.00 / 1M tokens |
| Output Cost | $40.00 / 1M tokens |
| Reasoning | High-compute internal CoT (configurable effort: low/medium/high) |
| Highlights | #1 on most reasoning benchmarks (ARC-AGI, SWE-bench, AIME) |
| Released | January 2025 |

**Best for:** Autonomous tool use, complex math/science, agentic tasks requiring deep reasoning.
**Considerations:** Cost scales dramatically on "high" effort; use o3-mini for volume.

### o3-mini (OpenAI)

| Attribute | Value |
|-----------|-------|
| Context Window | 200K tokens |
| Input Cost | $1.10 / 1M tokens |
| Output Cost | $4.40 / 1M tokens |
| Reasoning | Lightweight reasoning (effort: low/medium/high) |
| Highlights | Best cost/reasoning tradeoff in its tier |
| Released | January 2025 |

**Best for:** High-volume reasoning tasks, coding assistance, STEM Q&A.

### Gemini 2.0 Flash (Google)

| Attribute | Value |
|-----------|-------|
| Context Window | 1M tokens |
| Input Cost | $0.10 / 1M tokens |
| Output Cost | $0.40 / 1M tokens |
| Multimodal | Native: Text, Vision, Audio, Video |
| Highlights | Fastest frontier model; Live API for real-time multimodal |
| Released | December 2024 |

**Best for:** Real-time multimodal apps, high-volume pipelines, long-context RAG.

### Gemini 2.0 Pro (Google)

| Attribute | Value |
|-----------|-------|
| Context Window | 1M tokens |
| Input Cost | $3.50 / 1M tokens |
| Output Cost | $10.50 / 1M tokens |
| Highlights | Best Google model for complex tasks; leads on MMLU |
| Released | January 2025 |

### Grok 3 (xAI)

| Attribute | Value |
|-----------|-------|
| Context Window | 131K tokens |
| Input Cost | $3.00 / 1M tokens (API preview) |
| Highlights | Competitive with claude/o3 on reasoning; DeepSearch for real-time web |
| Released | February 2026 |

**Best for:** Live web research, reasoning-heavy tasks, frontier alternative.

### Model Comparison: Frontier Tier (March 2026)

| Model | Reasoning | Coding | Context | Agentic | Cost |
|-------|-----------|--------|---------|---------|------|
| o3 | ★★★★★ | ★★★★★ | ★★★★ | ★★★★★ | $$$$ |
| Claude 3.7 Sonnet | ★★★★★ | ★★★★★ | ★★★★ | ★★★★★ | $$$ |
| GPT-4.5 | ★★★★ | ★★★★ | ★★★ | ★★★★ | $$$$$ |
| Gemini 2.0 Flash | ★★★ | ★★★ | ★★★★★ | ★★★ | $ |
| Grok 3 | ★★★★ | ★★★★ | ★★★ | ★★★★ | $$$ |

### Production Heritage & Maturity

While frontier models lead on benchmarks, many enterprise systems rely on **battle-tested** models:

| Model Family | Production Since | Maturity Note |
|--------------|------------------|---------------|
| **GPT-4o** | May 2024 | Most mature ecosystem; lowest latency variance; highest rate limits. |
| **Claude 3.5 Sonnet** | June 2024 | Gold standard for tool-use reliability and structured output. |
| **Gemini 1.5 Pro** | May 2024 | Pioneer of mass-scale context; highly stable for long-document analysis. |
| **o1** | Sept 2024 | First production reasoning model; well-understood failure modes. |

**Why stay on "older" frontier models?**
1. **Consistency**: New models have "release-window" latency spikes and behavior shifts.
2. **Cost Efficiency**: Previous generation is often 50-80% cheaper after a new release.
3. **Guardrail Tuning**: Security and moderation layers are more refined.

---

## Open Source Models

### Llama 3.3 Family (Meta)

| Model | Parameters | Context | License | Notes |
|-------|------------|---------|---------|-------|
| Llama 3.3 8B | 8B | 128K | Llama 3.3 | Best-in-class small model (March 2026) |
| Llama 3.3 70B | 70B | 128K | Llama 3.3 | Strongest open-weight general model |
| Llama 3.1 405B | 405B | 128K | Llama 3.1 | Largest Meta model; frontier-competitive |

**Strengths:**
- Native multimodality across sizes (Llama 3.2 vision variants)
- Excellent tool-use and JSON following
- Largest open community and tooling ecosystem

### DeepSeek Family

| Model | Parameters | Status | Notes |
|-------|------------|--------|-------|
| DeepSeek-V3 | 671B (MoE) | Frontier | GPT-4o level at a fraction of training cost; open weights |
| DeepSeek-R1 | 671B (MoE) | Reasoning | Matches o1 on math/code; first open-source reasoning model |
| DeepSeek-R1-Distill | 7B–70B | Reasoning | Distilled to smaller models; cost-efficient reasoning |

**Key 2026 context**: DeepSeek shocked the industry by demonstrating frontier-level performance at dramatically lower training costs. Open weights available on Hugging Face.

### Qwen 2.5 Family (Alibaba)

| Model | Parameters | Notes |
|-------|------------|-------|
| Qwen2.5-Coder-32B | 32B | Top open coding model; rivals GPT-4o on HumanEval |
| Qwen2.5-72B | 72B | Best multilingual open model; strong CJK support |
| Qwen2.5-7B | 7B | Efficient self-hosted option |

### Mistral Family

| Model | Parameters | Notes |
|-------|------------|-------|
| Mistral Large 2 | 123B | Strong reasoning; permissive license |
| Mistral Small 3 | 24B | Ultra-efficient; matches 7B quality at less compute |
| Mixtral 8x22B | 141B (MoE) | Best open MoE for throughput |

---

## Specialized Models

### Coding Mastery (March 2026)

| Model | Specialization | Why it wins |
|-------|----------------|-------------|
| **Claude 3.7 Sonnet** | Software Engineering | Highest SWE-bench Verified score; powers Claude Code |
| **o3** | Algorithmic reasoning | Best at complex multi-step code logic; USACO problems |
| **Qwen2.5-Coder-32B** | Open-source coding | Best price-to-performance for self-hosted IDEs |
| **DeepSeek-R1-Distill-70B** | Open reasoning+code | Best open reasoning model for coding at 70B |

### Reasoning & Math

| Model | Approach | Best For |
|-------|----------|----------|
| **o3** | High-compute internal CoT | ARC-AGI, competition math, autonomous agents |
| **Claude 3.7 Sonnet (thinking)** | Extended Thinking mode | Software planning, complex logic |
| **DeepSeek-R1** | RL-based thinking | Open-source logical inference, competitive math |
| **Grok 3 (DeepSearch)** | Web-grounded reasoning | Research tasks needing live information |

### Long Context (1M+)

| Model | Window | Recall Performance |
|-------|--------|-------------------|
| **Gemini 2.0 Flash** | 1M | 99%+ Needle-in-a-Haystack (verified) |
| **Gemini 2.0 Pro** | 1M | Best quality at 1M context |
| **Claude 3.7 Sonnet** | 200K | Reliable, high-quality long context |

---

## Embedding Models

### API Embedding Models (March 2026)

| Model | Dimensions | Max Tokens | MTEB Score | Cost/1M |
|-------|------------|------------|------------|---------|
| OpenAI text-embedding-3-large | 3072 | 8191 | 64.6 | $0.13 |
| OpenAI text-embedding-3-small | 1536 | 8191 | 62.3 | $0.02 |
| Voyage-3 | 1024 | 32000 | 67.8 | $0.06 |
| Cohere embed-v3 | 1024 | 512 | 66.4 | $0.10 |
| Google text-embedding-004 | 768 | 2048 | 66.1 | $0.025 |

### Open Source Embedding Models

| Model | Dimensions | Max Tokens | MTEB | Notes |
|-------|------------|------------|------|-------|
| BGE-large-en-v1.5 | 1024 | 512 | 63.9 | Instruction-tuned |
| E5-mistral-7b-instruct | 4096 | 32768 | 66.6 | Strong with instructions |
| Nomic-embed-text-v1.5 | 768 | 8192 | 62.3 | Long context, open |
| GTE-Qwen2-7B | 3584 | 32K | 72.1 | State-of-the-art open embedding |

### Embedding Selection Guide

| Requirement | Recommended | Why |
|-------------|-------------|-----|
| Best quality | Voyage-3 or text-embedding-3-large | Highest MTEB |
| Cost-efficient | text-embedding-3-small | $0.02/1M |
| Self-hosted | GTE-Qwen2-7B | Best open MTEB |
| Long documents | Nomic or Voyage-3 | 8K+ context |
| Multilingual | Cohere embed-v3 | Built for multilingual |

---

## Model Selection Framework

### Decision Tree

```
What is your primary constraint?

├── Cost → Use smaller model, consider open source
│   ├── Very cost sensitive → o3-mini, Claude 3.5 Haiku, Gemini 2.0 Flash
│   └── Moderate budget → Claude 3.7 Sonnet, o3-mini
│
├── Quality + Reasoning → Use frontier models
│   ├── Highest reasoning → o3 (high effort)
│   └── Coding + reasoning → Claude 3.7 Sonnet (Extended Thinking)
│
├── Latency → Use fast models
│   ├── <100ms response → Gemini 2.0 Flash, GPT-4o-mini
│   └── <500ms response → Claude 3.5 Haiku, o3-mini (low)
│
├── Self-hosting → Use open models
│   ├── Maximum capability → Llama 3.1 405B, DeepSeek-V3
│   ├── Good balance → Llama 3.3 70B, Qwen2.5-72B
│   └── Edge/mobile → Llama 3.2 3B, Phi-4
│
└── Privacy → Self-host or use on-prem
    └── Choose open models with appropriate license
```

### Semantic Routing

In 2025-26, static decision trees are being replaced by **Semantic Routers**:
- **How it works**: A small, fast embedding model vectorises the query. If it matches a "known easy" cluster → cheap model (e.g., Gemini 2.0 Flash). If it hits an "agentic/logic" cluster → o3 or Claude 3.7.
- **Benefit**: Automates cost-optimization without hardcoded rules.
- **Implementation**: Tools like `semantic-router` (Python) or custom Weaviate/Pinecone classifiers.

---

## Sovereign AI and Data Residency

**The 2026 Regulatory Reality:**
Enterprises must comply with GDPR (EU), DPDPA (India), Saudi Arabia PDPL, and sectoral rules. "Sovereign AI" is now a product category.

| Solution | Provider | Use Case |
|----------|----------|----------|
| **Azure Government/Sovereign** | Microsoft | Dedicated infra in 40+ regions; approved for US Gov/EU NIS2 |
| **AWS Sovereign Cloud** | Amazon | Physically isolated VPCs; GDPR-safe EU regions |
| **Google Distributed Cloud** | Google | Air-gapped on-prem Gemini deployment |
| **Private Llama 3.3** | Meta (self-host) | Maximum data sovereignty; open weights |
| **DeepSeek (self-host)** | DeepSeek (open) | Open weights; no data leaves your infra |

**Tradeoff**: Sovereign clouds carry a **20-30% premium** over standard global regions but are mandatory for finance and government.

### Cost Comparison at Scale (March 2026)

Assume 1M requests/day, 1K input + 500 output tokens:

| Model | Input Cost/Day | Output Cost/Day | Total/Month |
|-------|----------------|-----------------|-------------|
| GPT-4o | $2,500 | $5,000 | $225,000 |
| Claude 3.7 Sonnet | $3,000 | $7,500 | $315,000 |
| o3-mini | $1,100 | $2,200 | $99,000 |
| Gemini 2.0 Flash | $100 | $200 | $9,000 |
| Self-hosted Llama 3.3 70B* | — | — | ~$50,000 |

*Self-hosted assumes 4× H100 GPUs

---

## Capability Comparison

### Benchmark Performance (March 2026, Verified)

| Model | MMLU | HumanEval | SWE-bench Verified | AIME 2025 |
|-------|------|-----------|--------------------|-----------|
| **o3 (high)** | 91.6 | 96.7 | 71.7% | 96.7% |
| **Claude 3.7 Sonnet** | 90.5 | 93.6 | 70.3% | 80.0% |
| **GPT-4.5** | 89.4 | 86.8 | 38.0% | 36.7% |
| **Grok 3** | 90.2 | 88.9 | — | 93.3% |
| **DeepSeek-R1** | 90.8 | 92.6 | 49.2% | 79.8% |
| **Llama 3.1 405B** | 88.6 | 89.0 | — | — |
| **Gemini 2.0 Flash** | 85.5 | 83.0 | — | — |

*Source: Respective technical reports and LMSYS Chatbot Arena, March 2026. Always verify with current leaderboards.*

### Task-Specific Recommendations (March 2026)

| Task | Recommended Models | Why |
|------|--------------------|-----|
| **Autonomous Coding Agent** | Claude 3.7 Sonnet | Powers Claude Code; best SWE-bench + tool reliability |
| **Complex Reasoning** | o3, DeepSeek-R1, Claude 3.7 (thinking) | Extended Thinking / internal CoT |
| **High-Volume API** | Gemini 2.0 Flash, o3-mini | Lowest cost per token in class |
| **Long Context RAG** | Gemini 2.0 Flash (1M), Claude 3.7 (200K) | Verified long-range recall |
| **Multimodal Real-time** | Gemini 2.0 Flash Live API | Real-time audio/video/text native |
| **Private Production** | Llama 3.3 70B, Qwen2.5-72B | High capability with local control |
| **Open-source Coding** | Qwen2.5-Coder-32B, DeepSeek-R1-Distill | Self-hosted, top HumanEval |
| **Creative/Chat** | GPT-4.5 | Top EQ scores; best conversation quality |

---

## Interview Questions

### Q: How would you select a model for a production RAG system?

**Strong answer:**
I evaluate across these dimensions:

**1. Quality requirements:**
- Test on representative queries from the actual domain
- Measure answer correctness, hallucination rate, citation accuracy

**2. Cost analysis:**
```
Monthly cost = requests/day × 30 × avg_tokens × rate
```
Always calculate for top 2-3 candidates.

**3. Latency requirements:**
- If <200ms TTFT needed: Gemini 2.0 Flash, Claude 3.5 Haiku, o3-mini (low)
- If quality is paramount: Accept 2-3s with Claude 3.7 or o3

**4. Operational requirements:**
- Self-hosting: Llama 3.3, DeepSeek-V3
- Compliance / data residency: Azure Sovereign or self-hosted

**5. Practical selection:**
- Start with Claude 3.7 Sonnet or GPT-4o for prototyping
- A/B test Gemini 2.0 Flash for 80% of queries (cost)
- Keep frontier on hard queries via semantic routing

### Q: Explain the tradeoffs between proprietary and open source models.

**Strong answer:**
| Factor | Proprietary (OpenAI, Anthropic) | Open Source (Llama, DeepSeek) |
|--------|--------------------------------|-----------------------------|
| Quality | Generally higher (slightly) | Catching up rapidly |
| Cost | Per-token pricing | Compute + ops |
| Control | Limited | Full |
| Privacy | Data goes to provider | Stays on-prem |
| Updates | Automatic | Manual |
| Customization | Limited fine-tuning | Full fine-tuning |
| Ops overhead | None | Significant |

**Key insight (2026)**: DeepSeek-V3 and R1 changed this conversation — open models now match GPT-4o on benchmarks. The gap is real but narrower than ever.

### Q: What is the difference between o3 and Claude 3.7's Extended Thinking?

**Strong answer:**
Both use internal chain-of-thought, but the mechanics differ:

- **o3**: OpenAI's compute-scaling approach. Allocates variable compute effort (low/medium/high). Internal thoughts are never exposed. Single API parameter: `reasoning_effort`.
- **Claude 3.7 Extended Thinking**: Returns thinking tokens in a separate `<thinking>` block. Configurable `budget_tokens` (1024–100K). You can inspect the reasoning chain for debugging, though it's not shown to end users.

**Production choice**: For debugging and trust-building, Claude's visible thinking is more transparent. For simple high-accuracy tasks, o3-mini on medium effort is most cost-effective.

---

## References

- Anthropic: https://anthropic.com/claude/claude-3-7-sonnet
- OpenAI Platform: https://platform.openai.com/docs/models
- Google AI: https://ai.google.dev/
- Meta Llama: https://llama.meta.com/
- DeepSeek: https://api-docs.deepseek.com/
- LMSYS Chatbot Arena: https://chat.lmsys.org/
- Hugging Face Open LLM Leaderboard: https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard

---

*Next: [Capability Assessment](02-capability-assessment.md)*
