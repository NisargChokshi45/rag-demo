import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  listCandidates,
  searchChunks,
  getFullResumeById,
} from "./db";
import { embedQuery } from "./embeddings";
import { getChatModel } from "./models";

interface ToolContext {
  fetchedCandidates: Set<string>;
}

export function createAgentTools(context: ToolContext) {
  return [
    tool(
      async () => {
        const candidates = await listCandidates();
        return JSON.stringify({
          candidates: candidates.map((c) => ({
            id: c.id,
            name: c.name,
            role: c.role_guess,
            chunkCount: c.chunk_count,
          })),
        });
      },
      {
        name: "list_all_candidates",
        description:
          "List all ingested candidates with their names and roles. Use this to explore the full candidate pool.",
        schema: z.object({}),
      }
    ),

    tool(
      async ({ query }: { query: string }) => {
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

        const model = getChatModel(0);
        const candidates = await listCandidates();
        const candidateNames = new Map(candidates.map((candidate) => [candidate.id, candidate.name]));
        const rerankedCandidates = [];

        for (const [candidateId, data] of Object.entries(chunksByCandidate)) {
          const chunkSummary = data.chunks.slice(0, 3).join("\n---\n");
          const rerankerPrompt = `Given the search query: "${query}"

Here are chunks from a resume:
${chunkSummary}

Rate how relevant this candidate is to the query on a scale of 0-10. Return only the number.`;

          const response = await model.invoke(rerankerPrompt);
          const score = Number.parseInt(String(response.content), 10) || 0;
          rerankedCandidates.push({
            candidateId,
            candidateName: candidateNames.get(candidateId) || "Unknown candidate",
            score,
            chunks: data.chunks.slice(0, 3),
          });
        }

        const topCandidates = rerankedCandidates
          .sort((a, b) => b.score - a.score)
          .slice(0, 5);

        return JSON.stringify({
          results: topCandidates.map((c) => ({
            candidateId: c.candidateId,
            candidateName: c.candidateName,
            relevanceScore: c.score,
            topChunks: c.chunks,
          })),
        });
      },
      {
        name: "search_chunks",
        description:
          "Search resume chunks using vector similarity. Returns chunks from most relevant resumes. " +
          "After searching, use get_full_resume with the candidate ID to retrieve the complete resume text.",
        schema: z.object({
          query: z.string().describe("The search query"),
        }),
      }
    ),

    tool(
      async ({ candidateId }: { candidateId: string }) => {
        if (context.fetchedCandidates.has(candidateId)) {
          const fullText = await getFullResumeById(candidateId);
          return JSON.stringify({ candidateId, fullResume: fullText });
        }

        if (context.fetchedCandidates.size >= 8) {
          return JSON.stringify({
            error: "Maximum candidate fetch limit reached (8). Cannot fetch more full resumes.",
          });
        }

        context.fetchedCandidates.add(candidateId);
        const fullText = await getFullResumeById(candidateId);

        return JSON.stringify({
          candidateId,
          fullResume: fullText,
        });
      },
      {
        name: "get_full_resume",
        description:
          "Retrieve the complete resume text for a specific candidate. Use after search_chunks to get the full context.",
        schema: z.object({
          candidateId: z.string().describe("The candidate ID"),
        }),
      }
    ),
  ];
}
