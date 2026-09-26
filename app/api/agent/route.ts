export const maxDuration = 300;
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getJobById, listCandidates, searchChunks, getFullResumeById } from '@/lib/db';
import { embedQuery } from '@/lib/embeddings';
import { getChatModel } from '@/lib/models';
import { validateEnv, getMissingEnvMessage } from '@/lib/env';
import { ScreeningReportSchema, type ScreeningReport } from '@/lib/schema';

interface AgentRequest {
  query: string;
  jobId?: string;
  sessionId?: string;
  conversationHistory?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
}

function normalizeConversationHistory(
  history: AgentRequest['conversationHistory']
) {
  return (history || []).filter(
    (message) =>
      (message.role === 'user' || message.role === 'assistant') &&
      typeof message.content === 'string' &&
      message.content.trim().length > 0
  );
}

function getTextContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';

  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object' && 'text' in part) {
        return typeof part.text === 'string' ? part.text : '';
      }
      return '';
    })
    .join('');
}

function logPayloadSize(label: string, value: unknown) {
  const text = typeof value === 'string' ? value : JSON.stringify(value) || '';

  console.log(`[LLM SIZE] ${label}`, {
    characters: text.length,
    estimatedTokens: Math.ceil(text.length / 4),
  });
}

function parseReportResponse(response: unknown): ScreeningReport {
  const content =
    response && typeof response === 'object' && 'content' in response
      ? getTextContent(response.content)
      : getTextContent(response);
  const jsonText = content
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const start = jsonText.indexOf('{');
  const end = jsonText.lastIndexOf('}');

  if (start < 0 || end < start) {
    throw new Error('Groq returned a report without valid JSON');
  }

  return ScreeningReportSchema.parse(
    JSON.parse(jsonText.slice(start, end + 1))
  );
}

export async function POST(request: NextRequest) {
  try {
    const {
      query,
      jobId,
      sessionId,
      conversationHistory: submittedConversationHistory,
    }: AgentRequest = await request.json();
    const conversationHistory = normalizeConversationHistory(
      submittedConversationHistory
    );

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId is required for conversation tracking' },
        { status: 400 }
      );
    }

    logPayloadSize('screening input', { query, jobId, sessionId });
    console.log('[LLM SIZE] screening session', {
      sessionId,
      conversationHistoryMessages: conversationHistory.length,
      conversationHistoryCharacters: conversationHistory.reduce(
        (total, message) => total + message.content.length,
        0
      ),
    });

    const envCheck = validateEnv('server');
    if (!envCheck.valid) {
      return NextResponse.json(
        { error: getMissingEnvMessage(envCheck.missing) },
        { status: 500 }
      );
    }

    const encoder = new TextEncoder();
    const toolCalls: Array<{
      toolName: string;
      toolInput: Record<string, unknown>;
      result: unknown;
    }> = [];
    const fetchedCandidates = new Set<string>();

    const response = new ReadableStream<Uint8Array>({
      async start(controller) {
        let phase = 'initialization';

        try {
          console.log(`[SESSION] ${sessionId} - Starting analysis for query: "${query.substring(0, 50)}..."`);

          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: 'progress',
                message: 'Starting analysis...',
              }) + '\n'
            )
          );

          // Get job context
          const job = jobId ? await getJobById(jobId, false) : null;
          const jobContext = job
            ? `${job.title} | Experience: ${job.experience} | Skills: ${job.skills.join(', ')}`
            : '';

          // ===== STEP 1: Search candidates =====
          phase = 'search_chunks';
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: 'progress',
                message: 'Searching candidates...',
              }) + '\n'
            )
          );

          const queryEmbedding = await embedQuery(query);
          const chunks = await searchChunks(queryEmbedding, 15, jobId);

          // Rerank chunks by candidate similarity
          interface ChunkData {
            candidateName?: string;
            chunks: string[];
            maxSimilarity: number;
          }
          const chunksByCandidate: Record<string, ChunkData> = {};

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

          const allCandidates = await listCandidates();
          const candidateNames = new Map(
            allCandidates.map((candidate) => [candidate.id, candidate.name])
          );

          // OPTION 2: Skill-based reranking for job-specific screening
          const rankedCandidates = Object.entries(chunksByCandidate)
            .map(([candidateId, data]) => {
              let relevanceScore = Math.round(data.maxSimilarity * 100);

              // Boost score if chunks mention required job skills
              if (job?.skills && job.skills.length > 0) {
                const chunkText = data.chunks.join(' ').toLowerCase();
                const mentionedSkills = job.skills.filter((skill) =>
                  chunkText.includes(skill.toLowerCase())
                );

                if (mentionedSkills.length > 0) {
                  // Boost by 3 points per matched skill (max +15 for 5 skills)
                  const skillBoost = Math.min(
                    15,
                    mentionedSkills.length * 3
                  );
                  relevanceScore = Math.min(100, relevanceScore + skillBoost);

                  console.log(
                    `[SKILL BOOST] ${sessionId} - ${candidateNames.get(candidateId) || candidateId}: matched ${mentionedSkills.join(', ')} (+${skillBoost} points)`
                  );
                }
              }

              return {
                candidateId,
                candidateName:
                  candidateNames.get(candidateId) || 'Unknown candidate',
                relevanceScore,
                topChunks: data.chunks.slice(0, 3),
              };
            })
            .sort((a, b) => b.relevanceScore - a.relevanceScore)
            .slice(0, 5);

          const searchResult = {
            results: rankedCandidates,
          };

          logPayloadSize('search_chunks result', searchResult);

          // Stream search tool call and result
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: 'tool-call',
                toolName: 'search_chunks',
                toolInput: { query },
              }) + '\n'
            )
          );

          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: 'tool-result',
                toolName: 'search_chunks',
                result: searchResult,
              }) + '\n'
            )
          );

          toolCalls.push({
            toolName: 'search_chunks',
            toolInput: { query } as Record<string, unknown>,
            result: searchResult,
          });

          console.log(
            `[SESSION] ${sessionId} - search_chunks: found ${rankedCandidates.length} candidates`
          );

          // ===== STEP 2: Select top 1-3 candidates =====
          const topCandidates = rankedCandidates.slice(0, 3);

          // ===== STEP 3: Fetch full resumes for top candidates =====
          if (topCandidates.length > 0) {
            phase = 'get_full_resume';
            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  type: 'progress',
                  message: 'Fetching detailed profiles...',
                }) + '\n'
              )
            );

            for (const candidate of topCandidates) {
              if (fetchedCandidates.size >= 3) {
                console.log('[FETCH CAP] Reached max 3 candidates');
                break;
              }

              try {
                fetchedCandidates.add(candidate.candidateId);
                const fullResume = await getFullResumeById(
                  candidate.candidateId
                );

                logPayloadSize(
                  `get_full_resume: ${candidate.candidateId}`,
                  fullResume
                );

                // Stream full resume tool call and result
                controller.enqueue(
                  encoder.encode(
                    JSON.stringify({
                      type: 'tool-call',
                      toolName: 'get_full_resume',
                      toolInput: { candidateId: candidate.candidateId },
                    }) + '\n'
                  )
                );

                controller.enqueue(
                  encoder.encode(
                    JSON.stringify({
                      type: 'tool-result',
                      toolName: 'get_full_resume',
                      result: {
                        candidateId: candidate.candidateId,
                        fullResume,
                      },
                    }) + '\n'
                  )
                );

                toolCalls.push({
                  toolName: 'get_full_resume',
                  toolInput: {
                    candidateId: candidate.candidateId,
                  } as Record<string, unknown>,
                  result: { candidateId: candidate.candidateId, fullResume },
                });

                console.log(
                  `[SESSION] ${sessionId} - get_full_resume: fetched ${candidate.candidateName}`
                );
              } catch (error) {
                console.error(
                  `[SESSION] ${sessionId} - Error fetching resume for ${candidate.candidateId}:`,
                  error
                );
              }
            }
          }

          // ===== STEP 4: Generate final report =====
          phase = 'final report generation';
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: 'progress',
                message: 'Generating report...',
              }) + '\n'
            )
          );

          // Selective truncation: preserve evidence chunks, truncate large resumes only
          const contextForReport = toolCalls
            .map((call, idx) => {
              let resultStr =
                typeof call.result === 'string'
                  ? call.result
                  : JSON.stringify(call.result, null, 2);

              // PRESERVE: search_chunks results (lightweight, contains evidence topChunks)
              // TRUNCATE: get_full_resume results only (can be 10k+ characters)
              if (call.toolName === 'get_full_resume') {
                const MAX_RESUME_LENGTH = 1000; // Keep enough for context without bloat
                if (resultStr.length > MAX_RESUME_LENGTH) {
                  resultStr =
                    resultStr.substring(0, MAX_RESUME_LENGTH) +
                    '\n[... truncated (full resume too long) ...]';
                  console.log(
                    `[TRUNCATE] ${sessionId} - get_full_resume: ${resultStr.length} → ${MAX_RESUME_LENGTH} chars`
                  );
                }
              }
              // search_chunks: NO TRUNCATION (evidence chunks must be complete)

              return `[${idx + 1}] Tool: ${call.toolName}\nResult:\n${resultStr}`;
            })
            .join('\n\n---\n\n');

          // Build job description for report (OPTION 3: minimal, token-efficient)
          const MAX_JOB_DESC_LENGTH = 300;
          let jobDescription = '';
          if (job) {
            const baseDesc = `Title: ${job.title}`;
            const skillsDesc =
              job.skills && job.skills.length > 0
                ? `\nKey Skills: ${job.skills.slice(0, 5).join(', ')}`
                : '';
            const expDesc = job.experience
              ? `\nExperience Required: ${job.experience}`
              : '';
            const fullDesc = (baseDesc + skillsDesc + expDesc).substring(
              0,
              MAX_JOB_DESC_LENGTH
            );

            jobDescription = `Job Details:
${fullDesc}`;
          }

          // Build conversation context if history exists
          const previousConversation = conversationHistory.length
            ? `Previous screening context:
${conversationHistory
  .slice(-2)
  .map(
    (message) =>
      `${message.role === 'user' ? 'User asked' : 'Assistant found'}: ${message.content.substring(0, 200)}`
  )
  .join('\n\n')}

`
            : '';

          const reportPrompt = `Screen candidates based on the search and resume data below.

Query: ${query}
${jobDescription}
${previousConversation}

Results:
${contextForReport}

Generate a screening report with:
- ID, name, and relevance score (0-100)
- Evidence: key qualifications matching the query
- Unknowns: resume gaps
- Citations: 1-3 snippets from search_chunks or get_full_resume results supporting the assessment
- Summary: how candidates were evaluated
- Reasoning: key assessment steps
- Context: strategies used

IMPORTANT: For citations, only use tool values "search_chunks" or "get_full_resume". Do not reference any other tools.

Return valid JSON only (no markdown/commentary):
{"query":"string","assessments":[{"candidateId":"string","candidateName":"string","score":0,"evidence":["string"],"unknowns":["string"],"citations":[{"candidateId":"string","candidateName":"string","content":"string","tool":"search_chunks"}]}],"summary":"string","reasoning":"string","context":["string"]}`;

          logPayloadSize('final report prompt', reportPrompt);
          console.log('[LLM SIZE] report inputs', {
            sessionId,
            toolCalls: toolCalls.length,
            contextCharacters: contextForReport.length,
            jobContextCharacters: jobContext.length,
            conversationHistoryMessages: conversationHistory.length,
            conversationHistoryCharacters: conversationHistory.reduce(
              (total, msg) => total + msg.content.length,
              0
            ),
          });

          const model = getChatModel(0.3);
          const reportResponse = (await Promise.race([
            model.invoke(reportPrompt),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error('Report generation timeout')),
                55000
              )
            ),
          ])) as unknown;

          const report = parseReportResponse(reportResponse);

          console.log(
            `[SESSION] ${sessionId} - Report generated: ${report.assessments?.length || 0} assessments`
          );

          const reportMessage = {
            type: 'report',
            report: {
              ...report,
              query,
            },
          };

          controller.enqueue(
            encoder.encode(JSON.stringify(reportMessage) + '\n')
          );
          controller.close();
        } catch (error) {
          console.error(`[SESSION] ${sessionId} [${phase}] Stream error:`, error);
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: 'error',
                message:
                  error instanceof Error ? error.message : 'Unknown error',
              }) + '\n'
            )
          );
          controller.close();
        }
      },
    });

    return new NextResponse(response, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('[ROUTE ERROR] Request error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
