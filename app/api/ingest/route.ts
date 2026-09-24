export const maxDuration = 300;
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { parsePDF } from '@/lib/pdf';
import { chunkText } from '@/lib/chunk';
import { embedDocument } from '@/lib/embeddings';
import {
  deleteCandidate,
  getJobById,
  insertCandidate,
  insertChunks,
} from '@/lib/db';
import { validateEnv, getMissingEnvMessage } from '@/lib/env';

interface IngestRequest {
  storagePath: string;
  jobId?: string;
}

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: NextRequest) {
  try {
    const body: IngestRequest = await request.json();
    const { storagePath, jobId } = body;

    console.log(`[INGEST] Starting ingestion for: ${storagePath}`);

    const envCheck = validateEnv('server');
    if (!envCheck.valid) {
      return NextResponse.json(
        { error: getMissingEnvMessage(envCheck.missing) },
        { status: 500 }
      );
    }

    if (!storagePath) {
      return NextResponse.json(
        { error: 'storagePath is required' },
        { status: 400 }
      );
    }

    // Download PDF from Supabase Storage
    console.log(`[INGEST] Downloading from Supabase Storage...`);
    const client = createServiceClient();
    const { data, error: downloadError } = await client.storage
      .from('resumes')
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
    const fullText = (await parsePDF(buffer)).trim();
    if (!fullText) {
      throw new Error('PDF did not contain extractable text');
    }

    // Extract candidate name from filename (e.g., "123-john_doe.pdf" → "John Doe")
    const filename = storagePath.split('/').pop() || '';
    const nameFromFile = filename
      .replace(/^\d+-/, '')
      .replace(/\.pdf$/, '')
      .replace(/_/g, ' ')
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    const roleGuess = jobId ? (await getJobById(jobId)).title : 'Unknown';

    // Chunk text
    const textChunks = chunkText(fullText);
    if (textChunks.length === 0) {
      throw new Error('PDF produced no text chunks');
    }

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
          console.log(
            `[INGEST] Embedding chunk ${i}/${textChunks.length} (attempt ${attempt + 1}/${MAX_RETRIES})`
          );
          embedding = await embedDocument(chunk);
          console.log(
            `[INGEST] ✓ Chunk ${i} embedded successfully (${embedding.length} dimensions)`
          );
          break; // Success, exit retry loop
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          console.error(
            `[INGEST] ✗ Chunk ${i} embedding failed (attempt ${attempt + 1}): ${lastError.message}`
          );
          if (attempt < MAX_RETRIES - 1) {
            // Exponential backoff: 1s, 2s, 4s
            const backoffMs = Math.pow(2, attempt) * 1000;
            console.log(`[INGEST] Retrying in ${backoffMs}ms...`);
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
        console.log(
          `[INGEST] Completed batch of 5 chunks, pausing for ${BATCH_DELAY}ms`
        );
        await delay(BATCH_DELAY);
      }
    }

    // Insert only after parsing and embedding have completed successfully.
    const candidateId = await insertCandidate(
      nameFromFile,
      roleGuess,
      storagePath,
      filename,
      fullText,
      jobId
    );

    try {
      console.log(
        `[INGEST] Inserting ${chunks.length} chunks into database...`
      );
      await insertChunks(candidateId, chunks);
    } catch (error) {
      await deleteCandidate(candidateId);
      throw error;
    }

    console.log(`[INGEST] ✓ Ingestion complete for ${nameFromFile}`);
    return NextResponse.json({
      success: true,
      candidateId,
      name: nameFromFile,
      role: roleGuess,
      chunkCount: textChunks.length,
      textLength: fullText.length,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[INGEST] ✗ Ingestion failed: ${errorMsg}`);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
