import { tool } from "ai";
import { z } from "zod";

// TODO: Implement tool definitions for agent
// Expected tools:
// - list_all_candidates: list all ingested candidates
// - search_chunks: vector search with LLM reranking
// - get_full_resume: fetch full resume text for a candidate

export const tools = {
  list_all_candidates: tool({
    description: "List all ingested candidates",
    parameters: z.object({}),
    execute: async () => {
      throw new Error("Not implemented");
    },
  }),

  search_chunks: tool({
    description: "Search resume chunks with vector search and LLM reranking",
    parameters: z.object({
      query: z.string().describe("The search query"),
    }),
    execute: async (_params) => {
      throw new Error("Not implemented");
    },
  }),

  get_full_resume: tool({
    description: "Get the full resume text for a candidate",
    parameters: z.object({
      candidateId: z.string().describe("The candidate ID"),
    }),
    execute: async (_params) => {
      throw new Error("Not implemented");
    },
  }),
};
