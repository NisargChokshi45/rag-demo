import { NextRequest, NextResponse } from "next/server";
import { embedDocument } from "@/lib/embeddings";

export async function GET(_request: NextRequest) {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY;

  const response: any = {
    hasGoogleGenerativeAiKey: !!process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    hasGoogleApiKey: !!process.env.GOOGLE_API_KEY,
    apiKeyUsed: process.env.GOOGLE_GENERATIVE_AI_API_KEY ? "GOOGLE_GENERATIVE_AI_API_KEY" : (process.env.GOOGLE_API_KEY ? "GOOGLE_API_KEY" : "NONE"),
    maskedKey: apiKey ? apiKey.substring(0, 20) + "..." : null,
    connectionTest: null as any,
  };

  if (!apiKey) {
    return NextResponse.json({
      ...response,
      connectionTest: { status: "FAILED", error: "No API key found in GOOGLE_GENERATIVE_AI_API_KEY or GOOGLE_API_KEY" },
    });
  }

  try {
    const testResult = await embedDocument("test");
    response.connectionTest = {
      status: "SUCCESS",
      embeddingLength: testResult.length,
      message: "Google Generative AI API is working correctly",
    };
  } catch (error) {
    response.connectionTest = {
      status: "FAILED",
      error: error instanceof Error ? error.message : String(error),
      hint:
        error instanceof Error && error.message.includes("Not Found")
          ? "API key may be invalid, expired, or the billing account is not set up"
          : error instanceof Error && error.message.includes("permission")
          ? "API key doesn't have permission to access embeddings"
          : "Unknown error - check API key validity",
    };
  }

  return NextResponse.json(response);
}
