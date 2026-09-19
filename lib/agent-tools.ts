import { tool } from "ai";
import { z } from "zod";
import {
  listCandidates,
  searchChunks,
  getFullResumeById,
} from "./db";
import { embedQuery } from "./embeddings";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";

interface ToolContext {
  fetchedCandidates: Set<string>;
}

export function createAgentTools(context: ToolContext) {
  return {
    list_all_candidates: tool({
      description:
        "List all ingested candidates with their names and roles. Use this to explore the full candidate pool.",
      parameters: z.object({}),
      execute: async () => {
        const candidates = await listCandidates();
        return {
          candidates: candidates.map((c) => ({
            id: c.id,
            name: c.name,
            role: c.role_guess,
            chunkCount: c.chunk_count,
          })),
        };
      },
    }),

    search_chunks: tool({
      description:
        "Search resume chunks using vector similarity. Returns chunks from most relevant resumes. " +
        "After searching, use get_full_resume with the candidate ID to retrieve the complete resume text.",
      parameters: z.object({
        query: z.string().describe("The search query"),
      }),
      execute: async ({ query }: { query: string }) => {
        const queryEmbedding = await embedQuery(query);
        const chunks = await searchChunks(queryEmbedding, 15);

        const chunksByCandidate: Record<
          string,
          { candidateName?: string; chunks: string[] }
        > = {};
        chunks.forEach(
          (chunk: {
            candidate_id: string;
            content: string;
            similarity: number;
          }) => {
            if (!chunksByCandidate[chunk.candidate_id]) {
              chunksByCandidate[chunk.candidate_id] = { chunks: [] };
            }
            chunksByCandidate[chunk.candidate_id].chunks.push(chunk.content);
          }
        );

        const rerankedCandidates = await Promise.all(
          Object.entries(chunksByCandidate).map(
            async ([candidateId, data]) => {
              const chunkSummary = data.chunks.slice(0, 3).join("\n---\n");
              const rerankerPrompt = `Given the search query: "${query}"

Here are chunks from a resume:
${chunkSummary}

Rate how relevant this candidate is to the query on a scale of 0-10. Return only the number.`;

              const response = await generateText({
                model: google("gemini-2.5-flash"),
                prompt: rerankerPrompt,
                temperature: 0,
              });

              const score = parseInt(response.text.trim()) || 0;
              return {
                candidateId,
                score,
                chunks: data.chunks.slice(0, 3),
              };
            }
          )
        );

        const topCandidates = rerankedCandidates
          .sort((a, b) => b.score - a.score)
          .slice(0, 5);

        return {
          results: topCandidates.map((c) => ({
            candidateId: c.candidateId,
            relevanceScore: c.score,
            topChunks: c.chunks,
          })),
        };
      },
    }),

    get_full_resume: tool({
      description:
        "Retrieve the complete resume text for a specific candidate. Use after search_chunks to get the full context.",
      parameters: z.object({
        candidateId: z.string().describe("The candidate ID"),
      }),
      execute: async ({ candidateId }: { candidateId: string }) => {
        if (context.fetchedCandidates.size >= 8) {
          return {
            error: "Maximum candidate fetch limit reached (8). Cannot fetch more full resumes.",
          };
        }

        context.fetchedCandidates.add(candidateId);
        const fullText = await getFullResumeById(candidateId);

        return {
          candidateId,
          fullResume: fullText,
        };
      },
    }),
  };
}
