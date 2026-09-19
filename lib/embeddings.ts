import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";

function getGoogleClient() {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Google API key is missing. Set GOOGLE_GENERATIVE_AI_API_KEY or GOOGLE_API_KEY in .env.local"
    );
  }

  return new GoogleGenerativeAIEmbeddings({
    apiKey,
    model: "models/embedding-001",
  });
}

export async function embedDocument(text: string): Promise<number[]> {
  const embedder = getGoogleClient();
  const embedding = await embedder.embedQuery(text);
  return embedding;
}

export async function embedQuery(text: string): Promise<number[]> {
  const embedder = getGoogleClient();
  const embedding = await embedder.embedQuery(text);
  return embedding;
}
