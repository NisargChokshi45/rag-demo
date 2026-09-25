export const maxDuration = 300;
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { chunkText } from '@/lib/chunk';
import { embedDocument } from '@/lib/embeddings';
import { insertChunks } from '@/lib/db';
import { validateEnv, getMissingEnvMessage } from '@/lib/env';

interface ReindexRequest {
  candidateId: string;
  jobId?: string;
}

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: NextRequest) {
  try {
    const { candidateId, jobId }: ReindexRequest = await request.json();

    if (!candidateId) {
      return NextResponse.json(
        { error: 'candidateId is required' },
        { status: 400 }
      );
    }

    console.log(`[REINDEX] Starting reindexing for candidate: ${candidateId}`);

    const envCheck = validateEnv('server');
    if (!envCheck.valid) {
      return NextResponse.json(
        { error: getMissingEnvMessage(envCheck.missing) },
        { status: 500 }
      );
    }

    const client = createServiceClient();

    // Fetch the candidate's resume text
    const { data: candidate, error: candidateError } = await client
      .from('candidates')
      .select('id, name, full_text, job_id')
      .eq('id', candidateId)
      .single();

    if (candidateError || !candidate) {
      return NextResponse.json(
        { error: `Candidate not found: ${candidateError?.message}` },
        { status: 404 }
      );
    }

    console.log(`[REINDEX] Found candidate: ${candidate.name}`);

    // Delete old chunks
    const { error: deleteChunksError } = await client
      .from('resume_chunks')
      .delete()
      .eq('candidate_id', candidateId);

    if (deleteChunksError) {
      console.error('[REINDEX] Error deleting old chunks:', deleteChunksError);
      return NextResponse.json(
        { error: `Failed to delete old chunks: ${deleteChunksError.message}` },
        { status: 500 }
      );
    }

    console.log(`[REINDEX] Deleted old chunks for candidate: ${candidateId}`);

    // Update candidate job_id if provided
    if (jobId && jobId !== candidate.job_id) {
      const { error: updateError } = await client
        .from('candidates')
        .update({ job_id: jobId })
        .eq('id', candidateId);

      if (updateError) {
        console.error('[REINDEX] Error updating job_id:', updateError);
        return NextResponse.json(
          { error: `Failed to update job_id: ${updateError.message}` },
          { status: 500 }
        );
      }

      console.log(
        `[REINDEX] Updated candidate job_id to: ${jobId}`
      );
    }

    // Chunk the text
    const textChunks = chunkText(candidate.full_text);
    if (textChunks.length === 0) {
      return NextResponse.json(
        { error: 'Resume produced no text chunks after reindexing' },
        { status: 400 }
      );
    }

    console.log(`[REINDEX] Created ${textChunks.length} chunks`);

    // Re-embed chunks with retry logic
    const MAX_RETRIES = 3;
    const BATCH_DELAY = 500;
    const chunks = [];

    for (let i = 0; i < textChunks.length; i++) {
      const chunk = textChunks[i];
      let embedding: number[] | null = null;
      let lastError: Error | null = null;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          embedding = await embedDocument(chunk);
          break;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          if (attempt < MAX_RETRIES - 1) {
            await delay(1000 * (attempt + 1));
          }
        }
      }

      if (!embedding) {
        const errorMsg =
          lastError?.message || 'Failed to embed chunk after retries';
        console.error(`[REINDEX] Embedding failed for chunk ${i}:`, errorMsg);
        return NextResponse.json(
          { error: `Failed to embed chunk ${i}: ${errorMsg}` },
          { status: 500 }
        );
      }

      chunks.push({ content: chunk, embedding });

      if ((i + 1) % 5 === 0) {
        console.log(`[REINDEX] Embedded ${i + 1}/${textChunks.length} chunks`);
        await delay(BATCH_DELAY);
      }
    }

    // Insert new chunks
    try {
      await insertChunks(candidateId, chunks);
      console.log(
        `[REINDEX] Successfully reindexed ${chunks.length} chunks for candidate: ${candidateId}`
      );
      return NextResponse.json({
        success: true,
        message: `Successfully reindexed candidate ${candidate.name} with ${chunks.length} chunks`,
        candidateId,
        chunksCreated: chunks.length,
        jobId: jobId || candidate.job_id,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[REINDEX] Error inserting new chunks:', errorMsg);
      return NextResponse.json(
        { error: `Failed to insert new chunks: ${errorMsg}` },
        { status: 500 }
      );
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[REINDEX] Unexpected error:', errorMsg);
    return NextResponse.json(
      { error: `Reindexing failed: ${errorMsg}` },
      { status: 500 }
    );
  }
}
