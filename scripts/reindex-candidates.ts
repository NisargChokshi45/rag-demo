#!/usr/bin/env node
/**
 * Reindex candidates with updated job_id associations
 *
 * Usage:
 *   npx ts-node scripts/reindex-candidates.ts          # Reindex all candidates
 *   npx ts-node scripts/reindex-candidates.ts <jobId>  # Reindex candidates for specific job
 */

import { createServiceClient } from '../lib/supabase/server';
import { chunkText } from '../lib/chunk';
import { embedDocument } from '../lib/embeddings';
import { insertChunks } from '../lib/db';

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function reindexCandidate(candidateId: string, candidateName: string) {
  const client = createServiceClient();

  console.log(`\n📄 Reindexing: ${candidateName} (${candidateId})`);

  // Fetch candidate
  const { data: candidate, error: candidateError } = await client
    .from('candidates')
    .select('id, name, full_text, job_id')
    .eq('id', candidateId)
    .single();

  if (candidateError || !candidate) {
    console.error(`  ❌ Failed to fetch candidate: ${candidateError?.message}`);
    return false;
  }

  // Delete old chunks
  const { error: deleteError } = await client
    .from('resume_chunks')
    .delete()
    .eq('candidate_id', candidateId);

  if (deleteError) {
    console.error(`  ❌ Failed to delete chunks: ${deleteError.message}`);
    return false;
  }

  console.log(`  🗑️  Deleted old chunks`);

  // Chunk and embed
  const textChunks = chunkText(candidate.full_text);
  console.log(`  📦 Created ${textChunks.length} chunks`);

  const chunks = [];
  const MAX_RETRIES = 3;

  for (let i = 0; i < textChunks.length; i++) {
    const chunk = textChunks[i];
    let embedding: number[] | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        embedding = await embedDocument(chunk);
        break;
      } catch (err) {
        if (attempt < MAX_RETRIES - 1) {
          await delay(1000 * (attempt + 1));
        }
      }
    }

    if (!embedding) {
      console.error(`  ❌ Failed to embed chunk ${i}`);
      return false;
    }

    chunks.push({ content: chunk, embedding });

    if ((i + 1) % 10 === 0) {
      console.log(`  ⚙️  Embedded ${i + 1}/${textChunks.length}`);
      await delay(500);
    }
  }

  // Insert new chunks
  try {
    await insertChunks(candidateId, chunks);
    console.log(`  ✅ Reindexed with ${chunks.length} chunks`);
    if (candidate.job_id) {
      console.log(`     Job ID: ${candidate.job_id}`);
    }
    return true;
  } catch (err) {
    console.error(`  ❌ Failed to insert chunks:`, err);
    return false;
  }
}

async function main() {
  const jobIdArg = process.argv[2];

  console.log('🔄 Candidate Reindexing Script');
  console.log('================================\n');

  const client = createServiceClient();

  // Fetch candidates to reindex
  let query = client
    .from('candidates')
    .select('id, name, job_id')
    .not('full_text', 'is', null)
    .not('job_id', 'is', null); // Only reindex candidates with job_id set

  if (jobIdArg) {
    query = query.eq('job_id', jobIdArg);
    console.log(`📋 Fetching candidates for job: ${jobIdArg}\n`);
  } else {
    console.log(`📋 Fetching all candidates with job_id set\n`);
  }

  const { data: candidates, error } = await query.order('name');

  if (error) {
    console.error('❌ Failed to fetch candidates:', error.message);
    process.exit(1);
  }

  if (!candidates || candidates.length === 0) {
    console.log('⚠️  No candidates found to reindex');
    process.exit(0);
  }

  console.log(`Found ${candidates.length} candidate(s) to reindex\n`);

  let successCount = 0;
  let failureCount = 0;

  for (const candidate of candidates) {
    const success = await reindexCandidate(candidate.id, candidate.name);
    if (success) {
      successCount++;
    } else {
      failureCount++;
    }
    await delay(1000);
  }

  console.log('\n================================');
  console.log(`✅ Success: ${successCount}`);
  console.log(`❌ Failed: ${failureCount}`);
  console.log('================================\n');

  process.exit(failureCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
