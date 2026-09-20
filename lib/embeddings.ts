import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { Embeddings } from "@langchain/core/embeddings";

function getEmbedder(): Embeddings {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Google API key is missing. Set GOOGLE_GENERATIVE_AI_API_KEY or GOOGLE_API_KEY in environment"
    );
  }

  const model = process.env.EMBEDDING_MODEL || "embedding-001";
  return new GoogleGenerativeAIEmbeddings({
    apiKey,
    model,
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number = 60000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Embedding request timeout after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

export async function embedDocument(text: string): Promise<number[]> {
  try {
    const embedder = getEmbedder();
    const embedding = await withTimeout(embedder.embedQuery(text), 60000);
    return embedding;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("[EMBEDDINGS] Failed to embed:", err.message);
    throw err;
  }
}

export async function embedQuery(text: string): Promise<number[]> {
  try {
    const embedder = getEmbedder();
    const embedding = await withTimeout(embedder.embedQuery(text), 60000);
    return embedding;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("[EMBEDDINGS] Failed to embed:", err.message);
    throw err;
  }
}
