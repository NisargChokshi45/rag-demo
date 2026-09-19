export const maxDuration = 300;
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { parsePDF } from "@/lib/pdf";
import { chunkText } from "@/lib/chunk";
import { embedDocument } from "@/lib/embeddings";
import { insertCandidate, insertChunks } from "@/lib/db";

interface IngestRequest {
  storagePath: string;
  jobDescription?: string;
}

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: NextRequest) {
  try {
    const body: IngestRequest = await request.json();
    const { storagePath } = body;

    if (!storagePath) {
      return NextResponse.json(
        { error: "storagePath is required" },
        { status: 400 }
      );
    }

    // Download PDF from Supabase Storage
    const client = createServerClient();
    const { data, error: downloadError } = await client.storage
      .from("resumes")
      .download(storagePath);

    if (downloadError) {
      return NextResponse.json(
        { error: `Failed to download PDF: ${downloadError.message}` },
        { status: 500 }
      );
    }

    const pdfBuffer = await data.arrayBuffer();
    const buffer = Buffer.from(pdfBuffer);

    // Parse PDF to text
    const fullText = await parsePDF(buffer);

    // Extract candidate name from filename (e.g., "123-john_doe.pdf" → "John Doe")
    const filename = storagePath.split("/").pop() || "";
    const nameFromFile = filename
      .replace(/^\d+-/, "")
      .replace(/\.pdf$/, "")
      .replace(/_/g, " ")
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

    // Simple role detection from content
    let roleGuess = "Unknown";
    const lowerText = fullText.toLowerCase();
    if (lowerText.includes("java")) roleGuess = "Java Developer";
    else if (lowerText.includes("python")) roleGuess = "Python Developer";
    else if (lowerText.includes("project manager"))
      roleGuess = "Project Manager";
    else if (lowerText.includes("scrum master"))
      roleGuess = "Scrum Master";
    else if (lowerText.includes("business analyst"))
      roleGuess = "Business Analyst";
    else if (lowerText.includes("qa")) roleGuess = "QA Engineer";
    else if (lowerText.includes("devops")) roleGuess = "DevOps Engineer";
    else if (lowerText.includes("hadoop")) roleGuess = "Hadoop Developer";
    else if (lowerText.includes("php")) roleGuess = "PHP Developer";

    // Insert candidate
    const candidateId = await insertCandidate(
      nameFromFile,
      roleGuess,
      storagePath,
      filename,
      fullText
    );

    // Chunk text
    const textChunks = chunkText(fullText);

    // Embed chunks with retry logic and batching
    const MAX_RETRIES = 3;
    const BATCH_DELAY = 500; // milliseconds between batch calls
    const chunks = [];

    for (let i = 0; i < textChunks.length; i++) {
      const chunk = textChunks[i];
      let embedding: number[] | null = null;
      let lastError: Error | null = null;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          embedding = await embedDocument(chunk);
          break; // Success, exit retry loop
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          if (attempt < MAX_RETRIES - 1) {
            // Exponential backoff: 1s, 2s, 4s
            const backoffMs = Math.pow(2, attempt) * 1000;
            await delay(backoffMs);
          }
        }
      }

      if (!embedding && lastError) {
        throw new Error(
          `Failed to embed chunk ${i} after ${MAX_RETRIES} retries: ${lastError.message}`
        );
      }

      chunks.push({
        content: chunk,
        embedding: embedding!,
      });

      // Add delay between batches to avoid rate limiting
      if ((i + 1) % 5 === 0) {
        await delay(BATCH_DELAY);
      }
    }

    // Insert chunks
    await insertChunks(candidateId, chunks);

    return NextResponse.json({
      success: true,
      candidateId,
      name: nameFromFile,
      role: roleGuess,
      chunkCount: textChunks.length,
      textLength: fullText.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
