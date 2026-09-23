import { NextRequest, NextResponse } from "next/server";
import { EMBEDDING_DIMENSIONS, embedDocument } from "@/lib/embeddings";

export async function GET(_request: NextRequest) {
  const apiKey = process.env.GOOGLE_API_KEY;

  const response: any = {
    hasGoogleApiKey: !!apiKey,
    hasGroqApiKey: !!process.env.GROQ_API_KEY,
    embeddingModel: process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-2",
    expectedEmbeddingLength: EMBEDDING_DIMENSIONS,
    connectionTest: null as any,
  };

  if (!apiKey) {
    return NextResponse.json({
      ...response,
      connectionTest: { status: "FAILED", error: "GOOGLE_API_KEY is missing" },
    });
  }

  try {
    const testResult = await embedDocument("test");
    response.connectionTest = {
      status: "SUCCESS",
      embeddingLength: testResult.length,
      message: "Gemini Embedding 2 is working correctly",
    };
  } catch (error) {
    response.connectionTest = {
      status: "FAILED",
      error: error instanceof Error ? error.message : String(error),
      hint:
        error instanceof Error && error.message.includes("Not Found")
          ? "Model name may be invalid or the billing account is not set up"
          : error instanceof Error && error.message.includes("permission")
          ? "API key doesn't have permission to access embeddings"
          : "Unknown error - check API key validity and model name",
    };
  }

  return NextResponse.json(response);
}
