import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  listCandidates,
  searchChunks,
  getFullResumeById,
} from "./db";
import { embedQuery } from "./embeddings";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

interface ToolContext {
  fetchedCandidates: Set<string>;
}

function getGoogleModel() {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Google API key is missing. Set GOOGLE_GENERATIVE_AI_API_KEY or GOOGLE_API_KEY in .env.local"
    );
  }

  return new ChatGoogleGenerativeAI({
    apiKey,
    model: "gemini-2.5-flash",
    temperature: 0,
  });
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

        const model = getGoogleModel();
        const rerankedCandidates = await Promise.all(
          Object.entries(chunksByCandidate).map(
            async ([candidateId, data]) => {
              const chunkSummary = data.chunks.slice(0, 3).join("\n---\n");
              const rerankerPrompt = `Given the search query: "${query}"

Here are chunks from a resume:
${chunkSummary}

Rate how relevant this candidate is to the query on a scale of 0-10. Return only the number.`;

              const response = await model.invoke(rerankerPrompt);
              const score = parseInt(response.content as string) || 0;
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

        return JSON.stringify({
          results: topCandidates.map((c) => ({
            candidateId: c.candidateId,
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
