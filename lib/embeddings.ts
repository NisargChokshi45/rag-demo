import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { Embeddings } from "@langchain/core/embeddings";
import Groq from "groq-sdk";

type EmbeddingProvider = "google" | "groq";

interface EmbeddingConfig {
  provider: EmbeddingProvider;
  model: string;
  apiKey: string;
}

function getConfig(): EmbeddingConfig {
  const provider = (process.env.EMBEDDING_PROVIDER || "groq") as EmbeddingProvider;

  if (provider === "google") {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Google API key is missing. Set GOOGLE_GENERATIVE_AI_API_KEY or GOOGLE_API_KEY in .env.local"
      );
    }
    return {
      provider: "google",
      model: process.env.EMBEDDING_MODEL || "embedding-001",
      apiKey,
    };
  }

  if (provider === "groq") {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Groq API key is missing. Set GROQ_API_KEY in .env.local"
      );
    }
    return {
      provider: "groq",
      model: process.env.EMBEDDING_MODEL || "nomic-embed-text-v1_5",
      apiKey,
    };
  }

  throw new Error(`Unsupported embedding provider: ${provider}`);
}

class GroqEmbedder extends Embeddings {
  private groq: Groq;
  private model: string;

  constructor(apiKey: string, model: string) {
    super({ maxRetries: 3 });
    this.groq = new Groq({ apiKey });
    this.model = model;
  }

  async embedQuery(text: string): Promise<number[]> {
    const response = await this.groq.embeddings.create({
      model: this.model,
      input: text,
    });
    const embedding = response.data[0].embedding;
    return Array.isArray(embedding) ? embedding : JSON.parse(embedding as string);
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const response = await this.groq.embeddings.create({
      model: this.model,
      input: texts,
    });
    return response.data.map((item) => {
      const embedding = item.embedding;
      return Array.isArray(embedding) ? embedding : JSON.parse(embedding as string);
    });
  }
}

function createEmbedder(config: EmbeddingConfig): Embeddings {
  if (config.provider === "google") {
    return new GoogleGenerativeAIEmbeddings({
      apiKey: config.apiKey,
      model: config.model,
    });
  }

  if (config.provider === "groq") {
    return new GroqEmbedder(config.apiKey, config.model);
  }

  throw new Error(`Unsupported embedding provider: ${config.provider}`);
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
    const config = getConfig();
    const embedder = createEmbedder(config);
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
    const config = getConfig();
    const embedder = createEmbedder(config);
    const embedding = await withTimeout(embedder.embedQuery(text), 60000);
    return embedding;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("[EMBEDDINGS] Failed to embed:", err.message);
    throw err;
  }
}
