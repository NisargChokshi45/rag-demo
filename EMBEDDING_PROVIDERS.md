# Embedding Providers Configuration

This project supports multiple embedding providers. You can switch between them by configuring environment variables.

## Quick Switch

Add these to your `.env.local` file:

### Option 1: Groq (Default)
```env
EMBEDDING_PROVIDER=groq
EMBEDDING_MODEL=nomic-embed-text-v1_5
GROQ_API_KEY=your_groq_api_key_here
```

### Option 2: Google Generative AI
```env
EMBEDDING_PROVIDER=google
EMBEDDING_MODEL=embedding-001
GOOGLE_GENERATIVE_AI_API_KEY=your_google_api_key_here
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `EMBEDDING_PROVIDER` | No | `groq` | Which provider to use: `groq` or `google` |
| `EMBEDDING_MODEL` | No | Provider-specific | Model identifier for the chosen provider |
| `GROQ_API_KEY` | Only if provider=groq | - | API key for Groq API |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Only if provider=google | - | API key for Google Generative AI |
| `GOOGLE_API_KEY` | Only if provider=google | - | Fallback for Google API key |

## Supported Models

### Groq
- **Model**: `nomic-embed-text-v1_5`
- **Dimensions**: 768
- **Use Case**: Fast, cost-effective embeddings

### Google Generative AI
- **Model**: `embedding-001`
- **Dimensions**: 768 (typically)
- **Use Case**: High-quality embeddings with Google models

## How to Switch Providers

1. **Update `.env.local`**:
   ```bash
   # Switch to Groq
   EMBEDDING_PROVIDER=groq
   GROQ_API_KEY=your_key
   
   # OR switch to Google
   EMBEDDING_PROVIDER=google
   GOOGLE_GENERATIVE_AI_API_KEY=your_key
   ```

2. **Restart the dev server**:
   ```bash
   npm run dev
   ```

3. **Test with `/api/debug` endpoint**:
   ```bash
   curl http://localhost:3000/api/debug
   ```

## Architecture

The `lib/embeddings.ts` module automatically:
- Reads the provider configuration from environment variables
- Creates the appropriate embedder client
- Provides a consistent API regardless of provider

### Public API
```typescript
import { embedDocument, embedQuery } from "@/lib/embeddings";

// Works with any configured provider
const embedding = await embedDocument("sample text");
const queryEmbedding = await embedQuery("search query");
```

## Troubleshooting

**"API key is missing" error**:
- Verify the correct API key environment variable is set for your chosen provider
- Ensure the key is not expired or revoked

**"Unsupported embedding provider" error**:
- Check that `EMBEDDING_PROVIDER` is either `groq` or `google`

**Timeout errors**:
- Check your internet connection
- Verify your API key has quota remaining
- Try increasing the timeout (currently 60 seconds)

## Performance Comparison

| Provider | Speed | Cost | Quality |
|----------|-------|------|---------|
| Groq | Very Fast ⚡ | Low $ | Good ✓ |
| Google | Fast | Higher $$ | Excellent ✓✓ |

Choose based on your priorities: Groq for speed/cost, Google for quality.
