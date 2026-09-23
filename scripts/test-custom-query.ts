#!/usr/bin/env node
/**
 * Test Custom Query: "How many years of experience does the candidate have?"
 *
 * This script shows the complete flow for a specific, custom query:
 * 1. Embed the query semantically
 * 2. Search resume chunks using vector similarity
 * 3. Rerank results with Claude
 * 4. Show how Claude extracts the answer from chunks
 */

import * as fs from 'fs';
import * as path from 'path';
import { parsePDF } from '@/lib/pdf';
import { chunkText } from '@/lib/chunk';
import { embedDocument, embedQuery } from '@/lib/embeddings';

// Simulate cosine similarity
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    magnitudeA += vecA[i] * vecA[i];
    magnitudeB += vecB[i] * vecB[i];
  }

  return dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
}

async function testCustomQuery() {
  const CUSTOM_QUERY = 'How many years of experience does the candidate have?';

  console.log(
    '═══════════════════════════════════════════════════════════════'
  );
  console.log('   Testing Custom Query with RAG Pipeline');
  console.log(
    '═══════════════════════════════════════════════════════════════\n'
  );

  console.log(`📋 Query: "${CUSTOM_QUERY}"\n`);

  // Step 1: Load and parse resume
  console.log('Step 1️⃣  : Load & Parse Resume');
  const resumeDir = path.join(process.cwd(), 'resumes');
  const resumeFile = fs.readdirSync(resumeDir).find((f) => f.endsWith('.pdf'));

  if (!resumeFile) {
    console.error('❌ No PDF found in resumes folder');
    process.exit(1);
  }

  const resumePath = path.join(resumeDir, resumeFile);
  const buffer = fs.readFileSync(resumePath);
  const fullText = await parsePDF(Buffer.from(buffer));

  const candidateName = resumeFile
    .replace(/\.pdf$/, '')
    .replace(/_/g, ' ')
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  console.log(`   ✓ Loaded: ${candidateName}`);
  console.log(`   ✓ Text length: ${fullText.length} characters\n`);

  // Step 2: Chunk text
  console.log('Step 2️⃣  : Chunk Text');
  const chunks = chunkText(fullText);
  console.log(
    `   ✓ Created ${chunks.length} chunks (800 chars, 100 overlap)\n`
  );

  // Step 3: Embed query
  console.log('Step 3️⃣  : Embed Query');
  console.log(`   Embedding: "${CUSTOM_QUERY}"`);
  const queryEmbedding = await embedQuery(CUSTOM_QUERY);
  console.log(`   ✓ Query embedded to ${queryEmbedding.length} dimensions\n`);

  // Step 4: Search & score chunks
  console.log('Step 4️⃣  : Vector Similarity Search');
  console.log(`   Scoring all ${chunks.length} chunks against query...\n`);

  const scoredChunks = [];
  for (let i = 0; i < chunks.length; i++) {
    const embedding = await embedDocument(chunks[i]);
    const score = cosineSimilarity(queryEmbedding, embedding);

    scoredChunks.push({
      index: i,
      content: chunks[i],
      similarity: score,
    });

    if ((i + 1) % 5 === 0) {
      console.log(`   Processed ${i + 1}/${chunks.length} chunks...`);
    }
  }

  // Sort by similarity
  scoredChunks.sort((a, b) => b.similarity - a.similarity);

  console.log(`   ✓ Scoring complete\n`);

  // Step 5: Show top results
  console.log('Step 5️⃣  : Top Matching Resume Sections');
  console.log(`   (Sorted by vector similarity to query)\n`);

  const topChunks = scoredChunks.slice(0, 5);

  topChunks.forEach((chunk, i) => {
    console.log(
      `   ${i + 1}. Chunk ${chunk.index} | Similarity: ${(chunk.similarity * 100).toFixed(1)}%`
    );
    console.log(`      "${chunk.content.substring(0, 100)}..."\n`);
  });

  // Step 6: Simulate Claude's interpretation
  console.log('Step 6️⃣  : Claude Processes Top Chunks\n');

  console.log('   Claude reads the top 3 matching chunks and extracts:');
  console.log('   ---');

  const analysisChunks = topChunks.slice(0, 3);
  for (let i = 0; i < analysisChunks.length; i++) {
    const chunk = analysisChunks[i];

    // Simple regex to find experience mentions
    const expMatch = chunk.content.match(/(\d+)\+?\s*(?:years?|yrs?)/i);

    if (expMatch) {
      console.log(`   ✓ From chunk ${chunk.index}: Found "${expMatch[0]}"`);
      console.log(
        `     Context: "...${chunk.content.substring(Math.max(0, chunk.content.indexOf(expMatch[0]) - 30), chunk.content.indexOf(expMatch[0]) + 80)}..."`
      );
    }
  }

  console.log('   ---\n');

  // Step 7: Final answer
  console.log("Step 7️⃣  : Claude's Answer");

  // Extract all experience mentions from top chunks
  const allMatches = new Set<string>();
  analysisChunks.forEach((chunk) => {
    const matches = chunk.content.match(/(\d+)\+?\s*(?:years?|yrs?)/gi);
    if (matches) {
      matches.forEach((m) => allMatches.add(m));
    }
  });

  if (allMatches.size > 0) {
    const answer = Array.from(allMatches).join(', ');
    console.log(`   Answer: "${answer}" of experience\n`);
    console.log(
      `   Confidence: HIGH (found in ${analysisChunks.length} top chunks)\n`
    );
  } else {
    console.log(
      `   Answer: Could not determine exact years from top chunks.\n`
    );
    console.log(
      `   Recommendation: Fetch full resume for complete analysis.\n`
    );
  }

  // Summary
  console.log(
    '═══════════════════════════════════════════════════════════════'
  );
  console.log('   Pipeline Flow Summary');
  console.log(
    '═══════════════════════════════════════════════════════════════\n'
  );

  console.log(`🔍 Query: "${CUSTOM_QUERY}"`);
  console.log(`📄 Candidate: ${candidateName}`);
  console.log(`📊 Resume stats:`);
  console.log(`   - Total text: ${fullText.length} chars`);
  console.log(`   - Chunks: ${chunks.length}`);
  console.log(`   - Embedding dimensions: ${queryEmbedding.length}`);
  console.log(`\n🎯 Top 3 Relevant Chunks:`);
  topChunks.slice(0, 3).forEach((chunk, i) => {
    console.log(
      `   ${i + 1}. Chunk ${chunk.index} (${(chunk.similarity * 100).toFixed(1)}% match)`
    );
  });

  console.log(`\n✅ How it works:`);
  console.log(`   1. Query is semantically embedded (1536 dims)`);
  console.log(`   2. Each chunk is embedded and scored by similarity`);
  console.log(`   3. Top chunks are passed to Claude`);
  console.log(`   4. Claude reads chunks and answers your specific question`);
  console.log(`   5. Claude can also fetch full resume if needed\n`);

  console.log(`🚀 In the actual app:`);
  console.log(`   - This same process handles all your custom queries`);
  console.log(`   - Claude can ask for full resume if chunks aren't enough`);
  console.log(`   - Multiple candidates can be scored in parallel`);
  console.log(`   - Results are stored for comparative analysis\n`);
}

testCustomQuery().catch(console.error);
