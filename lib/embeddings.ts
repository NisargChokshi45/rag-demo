import { google } from "@ai-sdk/google";
import { embed } from "ai";

export async function embedDocument(text: string): Promise<number[]> {
  const result = await embed({
    model: google.textEmbedding("models/embedding-001"),
    value: text,
  });

  return result.embedding;
}

export async function embedQuery(text: string): Promise<number[]> {
  const result = await embed({
    model: google.textEmbedding("models/embedding-001"),
    value: text,
  });

  return result.embedding;
}
