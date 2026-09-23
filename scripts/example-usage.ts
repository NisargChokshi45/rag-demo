/**
 * Example Usage: Resume RAG Pipeline Components
 *
 * This file shows how to use each part of the pipeline separately.
 * Useful for understanding each component and debugging.
 */

import { parsePDF } from '@/lib/pdf';
import { chunkText } from '@/lib/chunk';
import { embedDocument, embedQuery } from '@/lib/embeddings';
import { insertCandidate, insertChunks } from '@/lib/db';
import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// EXAMPLE 1: Parse a PDF Resume
// =============================================================================
async function example1_parsePDF() {
  console.log('\n📖 Example 1: Parse PDF Resume\n');

  const resumePath = path.join(
    process.cwd(),
    'resumes',
    'krishna_business_systems_analyst.pdf'
  );
  const buffer = fs.readFileSync(resumePath);

  // Parse PDF to text
  const fullText = await parsePDF(buffer);

  console.log(`✓ Successfully parsed ${resumePath}`);
  console.log(`  Total characters: ${fullText.length}`);
  console.log(`  First 200 chars:\n  "${fullText.substring(0, 200)}..."\n`);

  return fullText;
}

// =============================================================================
// EXAMPLE 2: Chunk Text into Overlapping Segments
// =============================================================================
function example2_chunkText(fullText: string) {
  console.log('✂️  Example 2: Chunk Text\n');

  const chunks = chunkText(fullText);

  console.log(
    `✓ Created ${chunks.length} chunks from ${fullText.length} characters`
  );
  console.log(`  Chunk size: 800 chars, Overlap: 100 chars\n`);

  // Show first 3 chunks
  chunks.slice(0, 3).forEach((chunk, i) => {
    console.log(`  Chunk ${i}:`);
    console.log(`    Length: ${chunk.length} chars`);
    console.log(`    Preview: "${chunk.substring(0, 80)}..."\n`);
  });

  return chunks;
}

// =============================================================================
// EXAMPLE 3: Embed a Single Chunk
// =============================================================================
async function example3_embedChunk(chunk: string) {
  console.log('🧮 Example 3: Embed a Chunk\n');

  const embedding = await embedDocument(chunk);

  console.log(`✓ Successfully embedded chunk`);
  console.log(`  Embedding dimensions: ${embedding.length}`);
  console.log(
    `  First 10 values: [${embedding
      .slice(0, 10)
      .map((v) => v.toFixed(4))
      .join(', ')}...]`
  );
  console.log(
    `  Vector magnitude: ${Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0)).toFixed(4)}\n`
  );

  return embedding;
}

// =============================================================================
// EXAMPLE 4: Embed a Query (for comparison)
// =============================================================================
async function example4_embedQuery(queryText: string) {
  console.log('💬 Example 4: Embed a Query\n');

  const queryEmbedding = await embedQuery(queryText);

  console.log(`✓ Successfully embedded query: "${queryText}"`);
  console.log(`  Embedding dimensions: ${queryEmbedding.length}`);
  console.log(
    `  First 10 values: [${queryEmbedding
      .slice(0, 10)
      .map((v) => v.toFixed(4))
      .join(', ')}...]`
  );
  console.log(
    `  Vector magnitude: ${Math.sqrt(queryEmbedding.reduce((sum, v) => sum + v * v, 0)).toFixed(4)}\n`
  );

  return queryEmbedding;
}

// =============================================================================
// EXAMPLE 5: Compute Cosine Similarity Between Vectors
// =============================================================================
function example5_cosineSimilarity(vecA: number[], vecB: number[]) {
  console.log('🔍 Example 5: Compute Cosine Similarity\n');

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    magnitudeA += vecA[i] * vecA[i];
    magnitudeB += vecB[i] * vecB[i];
  }

  const similarity =
    dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));

  console.log(`✓ Computed cosine similarity`);
  console.log(`  Similarity score: ${similarity.toFixed(6)}`);
  console.log(`  As percentage: ${(similarity * 100).toFixed(2)}%`);
  console.log(
    `  Interpretation: ${
      similarity > 0.8
        ? 'Very similar (good match)'
        : similarity > 0.6
          ? 'Moderately similar (good candidate)'
          : similarity > 0.4
            ? 'Somewhat similar (fair candidate)'
            : 'Not very similar (poor match)'
    }\n`
  );

  return similarity;
}

// =============================================================================
// EXAMPLE 6: Search for Similar Chunks
// =============================================================================
async function example6_similaritySearch(chunks: string[], queryText: string) {
  console.log('🔎 Example 6: Find Most Similar Chunks to Query\n');

  console.log(`  Query: "${queryText}"\n`);

  // Embed query
  const queryEmbedding = await embedQuery(queryText);

  // Embed all chunks and score
  const scored = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunkEmbedding = await embedDocument(chunks[i]);

    // Compute cosine similarity
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let j = 0; j < chunkEmbedding.length; j++) {
      dotProduct += chunkEmbedding[j] * queryEmbedding[j];
      magnitudeA += chunkEmbedding[j] * chunkEmbedding[j];
      magnitudeB += queryEmbedding[j] * queryEmbedding[j];
    }

    const similarity =
      dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
    scored.push({
      index: i,
      similarity,
      chunk: chunks[i],
    });
  }

  // Sort by similarity (descending)
  scored.sort((a, b) => b.similarity - a.similarity);

  // Show top 3
  console.log(`✓ Top 3 most similar chunks:\n`);
  scored.slice(0, 3).forEach((result, i) => {
    console.log(`  ${i + 1}. Chunk ${result.index}`);
    console.log(`     Similarity: ${(result.similarity * 100).toFixed(2)}%`);
    console.log(`     Content: "${result.chunk.substring(0, 70)}..."\n`);
  });

  return scored;
}

// =============================================================================
// EXAMPLE 7: Insert to Database (requires Supabase)
// =============================================================================
async function example7_insertToDatabase(fullText: string, chunks: string[]) {
  console.log('💾 Example 7: Insert to Supabase Database\n');

  try {
    // Extract candidate name from full text (simplified)
    const candidateName = 'Krishna Business Systems Analyst';

    console.log(`  Inserting candidate: ${candidateName}`);

    // Insert candidate
    const candidateId = await insertCandidate(
      candidateName,
      'Business Systems Analyst',
      'krishna_business_systems_analyst.pdf',
      'krishna_business_systems_analyst.pdf',
      fullText
    );

    console.log(`  ✓ Candidate inserted with ID: ${candidateId}\n`);

    // Embed and insert chunks
    console.log(`  Embedding and inserting ${chunks.length} chunks...`);
    const chunksWithEmbedding = [];

    for (let i = 0; i < chunks.length; i++) {
      const embedding = await embedDocument(chunks[i]);
      chunksWithEmbedding.push({
        content: chunks[i],
        embedding,
      });
      console.log(`    ✓ Chunk ${i + 1}/${chunks.length} embedded`);
    }

    await insertChunks(candidateId, chunksWithEmbedding);

    console.log(`  ✓ All ${chunks.length} chunks inserted\n`);
    return candidateId;
  } catch (error) {
    console.log(`  ⚠️  Database insertion failed (this is OK for demo):`);
    console.log(
      `     ${error instanceof Error ? error.message : String(error)}\n`
    );
  }
}

// =============================================================================
// EXAMPLE 8: Full End-to-End Flow
// =============================================================================
async function example8_fullPipeline() {
  console.log('\n🚀 Example 8: Full End-to-End Pipeline\n');

  console.log('Step 1/4: Parse resume...');
  const fullText = await example1_parsePDF();

  console.log('Step 2/4: Chunk text...');
  const chunks = example2_chunkText(fullText);

  console.log('Step 3/4: Embed chunks and find similar ones to query...');
  const queryText = "What is the candidate's experience with ERP systems?";
  const scoredChunks = await example6_similaritySearch(chunks, queryText);

  console.log('Step 4/4: Show top result...');
  const topChunk = scoredChunks[0];
  console.log(
    `✅ Best match (similarity: ${(topChunk.similarity * 100).toFixed(2)}%)`
  );
  console.log(`   "${topChunk.chunk}"\n`);

  return { fullText, chunks, scoredChunks };
}

// =============================================================================
// RUN ALL EXAMPLES
// =============================================================================
async function main() {
  console.log(
    '═══════════════════════════════════════════════════════════════'
  );
  console.log('   Resume RAG Pipeline - Usage Examples');
  console.log(
    '═══════════════════════════════════════════════════════════════'
  );

  try {
    // Example 1: Parse PDF
    const fullText = await example1_parsePDF();

    // Example 2: Chunk text
    const chunks = example2_chunkText(fullText);

    // Example 3: Embed a chunk
    const chunkEmbedding = await example3_embedChunk(chunks[0]);

    // Example 4: Embed a query
    const queryEmbedding = await example4_embedQuery(
      "What are the candidate's skills?"
    );

    // Example 5: Compute similarity
    example5_cosineSimilarity(chunkEmbedding, queryEmbedding);

    // Example 6: Find similar chunks
    await example6_similaritySearch(
      chunks,
      'Tell me about project management experience'
    );

    // Example 7: Database insertion (optional, requires Supabase)
    // await example7_insertToDatabase(fullText, chunks);

    // Example 8: Full pipeline
    // await example8_fullPipeline();

    console.log(
      '═══════════════════════════════════════════════════════════════'
    );
    console.log('   ✅ All examples completed!');
    console.log(
      '═══════════════════════════════════════════════════════════════\n'
    );
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main();
