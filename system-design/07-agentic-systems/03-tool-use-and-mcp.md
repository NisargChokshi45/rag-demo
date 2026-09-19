# Tool Use and MCP (March 2026)

Tools are the "hands" of an agent. The industry has standardized on the **Model Context Protocol (MCP)**, which replaces fragmented custom tool definitions with a unified, local-first communication layer. MCP saw major updates in 2025-2026, including Streamable HTTP transport and native computer-use tools.

## Table of Contents

- [The Tool-Use Mechanism](#mechanism)
- [Model Context Protocol (MCP)](#mcp)
- [MCP 2.0: Streamable HTTP & Auth (2026)](#mcp-updates)
- [Computer-Use Tools (Anthropic)](#computer-use)
- [Defining High-Precision Tools](#precision)
- [MCP vs. OpenAI Function Calling](#mcp-vs-openai)
- [Context7: Live Documentation MCP](#context7)
- [Streaming Tool Calls](#streaming)
- [Interview Questions](#interview-questions)
- [References](#references)

---

## The Tool-Use Mechanism

Tool use occurs in a 3-step cycle:
1. **Schema Presentation**: The model is given a JSON schema of the tools.
2. **Intent & Extraction**: The model outputs a "Call" (e.g., `{"tool": "get_weather", "args": {"city": "Tokyo"}}`).
3. **Execution & Contextualization**: The system runs the function and feeds the result back into the prompt.

**2025 Nuance**: We no longer "hardcode" tool definitions into the system prompt. We use **Dynamic Manifests** that fetch only necessary tools based on the user's intent.

---

## Model Context Protocol (MCP)

Developed by Anthropic and adopted as an industry standard in 2025, MCP allows models to interact with data and tools regardless of where they live.

- **MCP Client**: The AI application (e.g., your agent code).
- **MCP Server**: A standalone process that exposes Tools (Functions), Resources (Data), and Prompts (Templates).
- **Communication**: Uses JSON-RPC over stdio or HTTP.

### Why MCP?
- **Security**: Tools run in their own process, not in the model logic.
- **Portability**: Write a "Postgres Tool" once, use it in Claude, GPT, or Llama.
- **Discoverability**: Standardized `list_tools` and `get_resource` commands.

---

## Defining High-Precision Tools

A 2025 "Production-Quality" tool must include:

1. **Strict Type Validation**: Use Pydantic or Zod to enforce schemas before the model even sees the call.
2. **Detailed Docstrings**: Describe *when NOT* to use the tool.
3. **Confidence Thresholds**: Require the model to output a `confidence` score for the tool call.

```python
# MCP Server Example (Conceptual)
@server.tool()
class ExecuteSQL(PydanticModel):
    """Executes a Read-Only SQL query. DO NOT use for DROP/DELETE."""
    query: str = Field(..., description="The SELECT query to run.")

    async def run(self):
        # Implementation here...
        pass
```

---

## MCP vs. OpenAI Function Calling

| Feature | OpenAI Native | MCP |
|---------|---------------|-----|
| **Coupling** | High (OpenAI specific) | Low (Agnostic) |
| **Transport** | JSON in API body | JSON-RPC (Local/Remote) |
| **Data Access**| No native data "Resource" | Native `Resources` support |
| **Best For** | Prototyping | Enterprise Orchestration |

---

## Streaming Tool Calls

Frontier models support **Partial Tool Speculation**.
Instead of waiting for the full JSON to generate, the system starts "prefetching" tool results as soon as the tool name and critical IDs are visible in the stream. This reduces perceived latency by **400-800ms**.

---

## MCP 2.0: Streamable HTTP & Auth (2026)

The MCP 2.0 specification (ratified March 2026) introduced two major changes:

### 1. Streamable HTTP Transport
Previous MCP used `stdio` or basic HTTP with SSE. MCP 2.0 adds **Streamable HTTP** — a single long-lived HTTP connection that handles bidirectional streaming:

```
[MCP Client] ←── Streamable HTTP POST /mcp ──→ [MCP Server]
                  (with SSE response stream)
```

- Enables MCP servers deployed as cloud microservices (not just local processes)
- Allows multiple simultaneous tool calls over one connection
- Backwards compatible with stdio transport

### 2. OAuth 2.1 Authorization
Remote MCP servers can now require proper auth:

```json
{
  "type": "oauth2",
  "grant_type": "client_credentials",
  "scopes": ["tools:read", "resources:documents"]
}
```

This enables enterprise MCP servers with fine-grained access control per tenant.

---

## Computer-Use Tools (Anthropic)

Claude 3.5+ introduced native **computer-use** tools — the model can directly control a desktop or web browser. These are available via the Anthropic API:

| Tool | Capability | Notes |
|------|------------|-------|
| `bash` | Run shell commands | Persistent session across turns |
| `text_editor` | Read/write/edit files | Supports view, create, str_replace commands |
| `computer` | Mouse, keyboard, screenshot | Full desktop GUI control |

```python
import anthropic

client = anthropic.Anthropic()

response = client.beta.messages.create(
    model="claude-3-7-sonnet-20250219",
    max_tokens=4096,
    tools=[
        {"type": "bash_20250124", "name": "bash"},
        {"type": "text_editor_20250124", "name": "str_replace_based_edit_tool"},
        {"type": "computer_20251022", "name": "computer",
         "display_width_px": 1280, "display_height_px": 800}
    ],
    messages=[{"role": "user", "content": "Open Firefox, go to GitHub, and clone my repo."}],
    betas=["computer-use-2024-10-22", "interleaved-thinking-2025-05-14"]
)
```

**Production safety rules for computer-use:**
1. Always run in a sandboxed VM (Docker + VNC, or E2B cloud)
2. Screenshot-validate critical state before destructive actions
3. Use HITL (Human-in-the-Loop) for irreversible actions (file deletion, form submission)
4. Set `ANTHROPIC_MAX_COMPUTER_TOKENS` to cap runaway loops

---

## Context7: Live Documentation MCP

One of the most practical MCP servers in 2026 is **Context7** — it resolves the "stale training data" problem for coding agents:

```
# Without Context7:
Agent: "I'll use langchain's `create_openai_tools_agent` function..."
(This function was deprecated 6 months ago)

# With Context7 MCP:
Agent → MCP: list_resources("langchain")
MCP → Agent: Returns current v0.3.x docs
Agent: "I'll use the new `create_react_agent` interface..."
```

**Setup in Claude Desktop / Claude Code:**
```json
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"]
    }
  }
}
```

Claude automatically calls `resolve-library-id` and `get-library-docs` before writing code that uses the library.

---

## Interview Questions

### Q: How does MCP solve the "Too Many Tools" problem (Schema Overload)?

**Strong answer:**
In 2023, giving a model 50 tools would degrade performance because the prompt became too long. MCP solves this through **Dynamic Resource Discovery**. Instead of loading 50 tool schemas into the prompt, the agent sends a `list_resources` call to the MCP server. It then only "attaches" the specific tools relevant to the current `Resource` context. This keeps the prompt lean and the context window focused on reasoning rather than parsing unused schemas.

### Q: Why is it important to separate "Tool Logic" from the "Agent App" using MCP servers?

**Strong answer:**
Separation of concerns. If the tool logic (e.g., a Python scraper) lives in a separate MCP server, I can scale the scraping infrastructure independently of the LLM orchestrator. More importantly, it provides a **Security Sandbox**. If a model tries to perform an injection through a tool argument, it only affects the MCP server process, which can be containerized with zero network access to the core Agent state.

---

## References
- Anthropic. "The Model Context Protocol Specification" (2025)
- JSON-RPC 2.0 Specification.
- Pydantic v3.0 Documentation.

---

*Next: [Multi-Agent Orchestration](04-multi-agent-orchestration.md)*
