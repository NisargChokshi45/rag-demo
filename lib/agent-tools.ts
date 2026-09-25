import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { listCandidates, searchChunks, getFullResumeById } from './db';
import { embedQuery } from './embeddings';

interface ToolContext {
  fetchedCandidates: Set<string>;
  jobId?: string;
}

export function createAgentTools(context: ToolContext) {
  return [
    tool(
      async () => {
        try {
          const candidates = await listCandidates({ jobId: context.jobId });
          return JSON.stringify({
            candidates: candidates.map((c) => ({
              id: c.id,
              name: c.name,
              role: c.role_guess,
              chunkCount: c.chunk_count,
            })),
            totalCount: candidates.length,
            message: `Found ${candidates.length} candidate(s) in the pool.`,
          });
        } catch (error) {
          return JSON.stringify({
            error:
              error instanceof Error
                ? error.message
                : 'Failed to list candidates',
            candidates: [],
            totalCount: 0,
          });
        }
      },
      {
        name: 'list_all_candidates',
        description:
          'List all ingested candidates with their names and guessed roles. Use this to explore the full candidate pool, especially for broad requirements where vector search alone might miss candidates. Helps ensure coverage of the entire applicant pool.',
        schema: z.object({}),
      }
    ),

    tool(
      async ({ query }: { query: string }) => {
        try {
          const queryEmbedding = await embedQuery(query);
          const chunks = await searchChunks(queryEmbedding, 15, context.jobId);

          if (chunks.length === 0) {
            return JSON.stringify({
              results: [],
              message: 'No relevant resume chunks found for this query',
            });
          }

          const chunksByCandidate: Record<
            string,
            {
              candidateName?: string;
              chunks: string[];
              maxSimilarity: number;
            }
          > = {};

          chunks.forEach(
            (chunk: {
              candidate_id: string;
              content: string;
              similarity: number;
            }) => {
              if (!chunksByCandidate[chunk.candidate_id]) {
                chunksByCandidate[chunk.candidate_id] = {
                  chunks: [],
                  maxSimilarity: 0,
                };
              }
              const data = chunksByCandidate[chunk.candidate_id];
              data.chunks.push(chunk.content);
              data.maxSimilarity = Math.max(
                data.maxSimilarity,
                chunk.similarity
              );
            }
          );

          const candidates = await listCandidates();
          const candidateNames = new Map(
            candidates.map((candidate) => [candidate.id, candidate.name])
          );

          const rankedCandidates = Object.entries(chunksByCandidate)
            .map(([candidateId, data]) => ({
              candidateId,
              candidateName:
                candidateNames.get(candidateId) || 'Unknown candidate',
              relevanceScore: Math.round(data.maxSimilarity * 100),
              topChunks: data.chunks.slice(0, 3),
            }))
            .sort((a, b) => b.relevanceScore - a.relevanceScore)
            .slice(0, 5);

          return JSON.stringify({
            results: rankedCandidates,
          });
        } catch (error) {
          return JSON.stringify({
            error:
              error instanceof Error
                ? error.message
                : 'Unknown error during search',
            results: [],
          });
        }
      },
      {
        name: 'search_chunks',
        description:
          'Search resume chunks using vector similarity. Returns most relevant candidates with matching resume sections. ' +
          'Use this to find candidates matching specific skills, experience, or requirements. ' +
          'After identifying relevant candidates, use get_full_resume to retrieve their complete resume text.',
        schema: z.object({
          query: z
            .string()
            .describe(
              'The search query describing the desired candidate qualifications'
            ),
        }),
      }
    ),

    tool(
      async ({ candidateId }: { candidateId: string }) => {
        try {
          if (!candidateId) {
            return JSON.stringify({
              error: 'candidateId is required',
            });
          }

          if (context.fetchedCandidates.has(candidateId)) {
            const fullText = await getFullResumeById(candidateId);
            return JSON.stringify({ candidateId, fullResume: fullText });
          }

          if (context.fetchedCandidates.size >= 2) {
            return JSON.stringify({
              error:
                'Maximum candidate fetch limit reached (2). Use search results for other candidates to manage token usage.',
            });
          }

          context.fetchedCandidates.add(candidateId);
          const fullText = await getFullResumeById(candidateId);

          return JSON.stringify({
            candidateId,
            fullResume: fullText,
          });
        } catch (error) {
          return JSON.stringify({
            error:
              error instanceof Error
                ? error.message
                : 'Failed to retrieve resume',
            candidateId,
          });
        }
      },
      {
        name: 'get_full_resume',
        description:
          'Retrieve the complete resume text for a specific candidate by ID. Use this after search_chunks identifies relevant candidates to examine their full background. Limited to 2 fetches per screening to manage token usage.',
        schema: z.object({
          candidateId: z
            .string()
            .describe('The unique candidate ID from search results'),
        }),
      }
    ),
  ];
}
