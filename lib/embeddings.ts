import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { embed } from "ai";

function getGoogleClient() {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Google API key is missing. Set GOOGLE_GENERATIVE_AI_API_KEY or GOOGLE_API_KEY in .env.local"
    );
  }

  return createGoogleGenerativeAI({ apiKey });
}

export async function embedDocument(text: string): Promise<number[]> {
  const google = getGoogleClient();

  const result = await embed({
    model: google.textEmbedding("text-embedding-004"),
    value: text,
  });

  return result.embedding;
}

export async function embedQuery(text: string): Promise<number[]> {
  const google = getGoogleClient();

  const result = await embed({
    model: google.textEmbedding("text-embedding-004"),
    value: text,
  });

  return result.embedding;
}
