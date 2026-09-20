import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";

let embedder: HuggingFaceTransformersEmbeddings | null = null;

async function getEmbedder(): Promise<HuggingFaceTransformersEmbeddings> {
  if (!embedder) {
    embedder = new HuggingFaceTransformersEmbeddings({
      model: process.env.EMBEDDING_MODEL || "Xenova/all-MiniLM-L6-v2",
    });
  }
  return embedder;
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
    const embedder = await getEmbedder();
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
    const embedder = await getEmbedder();
    const embedding = await withTimeout(embedder.embedQuery(text), 60000);
    return embedding;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("[EMBEDDINGS] Failed to embed:", err.message);
    throw err;
  }
}
