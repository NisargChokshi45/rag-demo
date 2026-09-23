#!/usr/bin/env node
/**
 * Demo: Resume Upload → Chunk → Embed → Chat Pipeline
 *
 * This script demonstrates the complete RAG flow:
 * 1. Parse a resume PDF from the resumes folder
 * 2. Chunk the text (800 chars with 100 char overlap)
 * 3. Embed chunks using Gemini API
 * 4. Simulate chat queries over the embedded content
 */

import * as fs from 'fs';
import * as path from 'path';
import { parsePDF } from '@/lib/pdf';
import { chunkText } from '@/lib/chunk';
import {
  embedDocument,
  embedQuery,
  EMBEDDING_DIMENSIONS,
} from '@/lib/embeddings';

const RESUMES_DIR = path.join(process.cwd(), 'resumes');

// Simulate vector similarity (cosine)
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

// Simple in-memory "database" for demo
interface ChunkRecord {
  id: string;
  content: string;
  embedding: number[];
  index: number;
}

async function runDemo() {
  console.log('📄 Resume RAG Pipeline Demo\n');

  // Pick first resume (krishna_business_systems_analyst.pdf)
  const resumeFile = fs
    .readdirSync(RESUMES_DIR)
    .find((f) => f.endsWith('.pdf'));
  if (!resumeFile) {
    console.error('❌ No PDF files found in resumes folder');
    process.exit(1);
  }

  const resumePath = path.join(RESUMES_DIR, resumeFile);
  console.log(`1️⃣  Loading resume: ${resumeFile}\n`);

  // Parse PDF
  const buffer = fs.readFileSync(resumePath);
  console.log(`📖 Parsing PDF (${(buffer.length / 1024).toFixed(1)} KB)...`);
  const fullText = await parsePDF(Buffer.from(buffer));
  console.log(`✓ Extracted ${fullText.length} characters\n`);

  // Extract candidate name
  const nameFromFile = resumeFile
    .replace(/\.pdf$/, '')
    .replace(/_/g, ' ')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  console.log(`👤 Candidate: ${nameFromFile}\n`);

  // Chunk text
  console.log(`2️⃣  Chunking text (800 chars, 100 overlap)...`);
  const chunks = chunkText(fullText);
  console.log(`✓ Created ${chunks.length} chunks\n`);
  console.log(`   Sample chunk 0: "${chunks[0].substring(0, 80)}..."\n`);

  // Embed chunks
  console.log(`3️⃣  Embedding ${chunks.length} chunks with Gemini API...`);
  const chunksWithEmbedding: ChunkRecord[] = [];

  for (let i = 0; i < chunks.length; i++) {
    try {
      console.log(`   Embedding chunk ${i + 1}/${chunks.length}...`);
      const embedding = await embedDocument(chunks[i]);
      chunksWithEmbedding.push({
        id: `chunk-${i}`,
        content: chunks[i],
        embedding,
        index: i,
      });
      console.log(
        `   ✓ Chunk ${i + 1} embedded (${embedding.length} dimensions)`
      );
    } catch (error) {
      console.error(`   ✗ Failed to embed chunk ${i + 1}:`, error);
      process.exit(1);
    }
  }
  console.log(`✓ All ${chunksWithEmbedding.length} chunks embedded\n`);

  // Simulate chat interactions
  console.log(`4️⃣  Simulating chat queries (Groq will process results)...\n`);

  const queries = [
    "What is the candidate's primary experience?",
    'What programming languages does this candidate know?',
    "List the candidate's key skills",
  ];

  for (const query of queries) {
    console.log(`💬 Query: "${query}"`);
    console.log(`🔍 Embedding query (Gemini API)...`);
    const queryEmbedding = await embedQuery(query);

    // Find top-3 most similar chunks
    const scored = chunksWithEmbedding.map((chunk) => ({
      ...chunk,
      score: cosineSimilarity(queryEmbedding, chunk.embedding),
    }));

    const topChunks = scored.sort((a, b) => b.score - a.score).slice(0, 3);

    console.log(`📚 Top 3 relevant chunks (will be sent to Groq/Llama):`);
    topChunks.forEach((chunk, i) => {
      console.log(
        `   ${i + 1}. (chunk ${chunk.index}, similarity: ${(chunk.score * 100).toFixed(1)}%)`
      );
      console.log(`      "${chunk.content.substring(0, 70)}..."\n`);
    });
  }

  console.log(`✅ Demo complete!\n`);
  console.log(`📊 Summary:`);
  console.log(`   - Candidate: ${nameFromFile}`);
  console.log(`   - Resume length: ${fullText.length} chars`);
  console.log(`   - Chunks created: ${chunks.length}`);
  console.log(`   - Embedding dimensions: ${EMBEDDING_DIMENSIONS}`);
  console.log(`   - Storage: In-memory (DB integration via lib/db.ts)`);
}

runDemo().catch(console.error);
