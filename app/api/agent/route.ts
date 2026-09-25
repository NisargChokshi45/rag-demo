export const maxDuration = 300;
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { createAgentTools } from '@/lib/agent-tools';
import { getChatModel } from '@/lib/models';
import { getJobById } from '@/lib/db';
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

    const envCheck = validateEnv('server');
    if (!envCheck.valid) {
      return NextResponse.json(
        { error: getMissingEnvMessage(envCheck.missing) },
        { status: 500 }
      );
    }

    const toolContext = { fetchedCandidates: new Set<string>(), jobId };
    const tools = createAgentTools(toolContext);
    const job = jobId ? await getJobById(jobId, true) : null;
    const jobContext = job
      ? `Job title: ${job.title}\nDescription: ${job.description}\nExperience: ${job.experience}\nRequired skills: ${job.skills.join(', ')}`
      : '';

    const systemPrompt = jobContext
      ? `You are a resume screening assistant. Screen candidates against this job:\n\n${jobContext}\n\nIMPORTANT: To manage token usage, prefer search results over full resumes. Only fetch full resumes for the top 2 candidates who best match the job. Use search result snippets to assess other candidates. Search first, fetch sparingly.`
      : 'You are a resume screening assistant. To manage token usage, prefer search results over full resumes. Only fetch full resumes for the top 2 candidates who best match requirements. Use search result snippets to assess other candidates. Search first, fetch sparingly.';

    const model = getChatModel(0.2);

    const agent = createReactAgent({
      llm: model,
      tools,
      messageModifier: systemPrompt,
    });

    const encoder = new TextEncoder();
    const toolCalls: Array<{
      toolName: string;
      toolInput: Record<string, unknown>;
      result: unknown;
    }> = [];

    const response = new ReadableStream<Uint8Array>({
      async start(controller) {
        let modelPhase = 'initial agent stream';

        try {
          // Stream progress update
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: 'progress',
                message: 'Starting analysis...',
              }) + '\n'
            )
          );

          const input = {
            messages: [
              ...conversationHistory.map((message) =>
                message.role === 'user'
                  ? new HumanMessage(message.content)
                  : new AIMessage(message.content)
              ),
              new HumanMessage(query),
            ],
          };

          logPayloadSize('agent input', input);
          console.log('[LLM SIZE] conversation history', {
            messages: conversationHistory.length,
            characters: conversationHistory.reduce(
              (total, message) => total + message.content.length,
              0
            ),
          });

          const stream = await agent.streamEvents(input, {
            version: 'v2',
            recursionLimit: 25,
            ...(sessionId ? { configurable: { thread_id: sessionId } } : {}),
          });

          let toolCount = 0;
          for await (const event of stream) {
            if (event.event === 'on_tool_start') {
              toolCount++;
              const toolName = event.name;
              const toolInput = event.data?.input || {};

              // Send progress update
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({
                    type: 'progress',
                    message: `Searching for candidates (${toolCount})...`,
                  }) + '\n'
                )
              );

              const toolMessage = {
                type: 'tool-call',
                toolName,
                toolInput,
              };

              controller.enqueue(
                encoder.encode(JSON.stringify(toolMessage) + '\n')
              );

              toolCalls.push({
                toolName,
                toolInput: toolInput as Record<string, unknown>,
                result: null,
              });
            } else if (event.event === 'on_tool_end') {
              const toolOutput = event.data?.output;
              logPayloadSize(`tool result: ${event.name}`, toolOutput);

              if (toolCalls.length > 0) {
                const lastToolCall = toolCalls[toolCalls.length - 1];
                if (lastToolCall.toolName === event.name) {
                  lastToolCall.result = toolOutput;
                  controller.enqueue(
                    encoder.encode(
                      JSON.stringify({
                        type: 'tool-result',
                        toolName: event.name,
                        result: toolOutput,
                      }) + '\n'
                    )
                  );
                }
              }
            }
          }

          // Progress: generating report
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: 'progress',
                message: 'Generating report...',
              }) + '\n'
            )
          );

          // Build enhanced context for the final report with truncated results to avoid token limits
          const MAX_RESULT_LENGTH = 1500;
          const contextForReport = toolCalls
            .map((call, idx) => {
              let resultStr =
                typeof call.result === 'string'
                  ? call.result
                  : JSON.stringify(call.result, null, 2);

              // Truncate long results to manage token usage
              if (resultStr.length > MAX_RESULT_LENGTH) {
                resultStr =
                  resultStr.substring(0, MAX_RESULT_LENGTH) +
                  '\n[... truncated ...]';
              }

              return `[${idx + 1}] Tool: ${call.toolName}\nResult:\n${resultStr}`;
            })
            .join('\n\n---\n\n');

          const previousConversation = conversationHistory.length
            ? `Previous context:
${conversationHistory
  .slice(-4)
  .map(
    (message) =>
      `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content.substring(0, 300)}`
  )
  .join('\n\n')}

`
            : '';
          const reportPrompt = `Screen candidates based on the search results below.

Query: ${query}
${jobContext ? `Job: ${jobContext}` : ''}
${previousConversation}

Results:
${contextForReport}

Generate a screening report with:
- ID, name, and relevance score (0-100)
- Evidence: key qualifications matching the query
- Unknowns: resume gaps
- Citations: 1-3 snippets from results supporting the assessment
- Summary: how candidates were evaluated
- Reasoning: key assessment steps
- Context: strategies used

Return valid JSON only (no markdown/commentary):
{"query":"string","assessments":[{"candidateId":"string","candidateName":"string","score":0,"evidence":["string"],"unknowns":["string"],"citations":[{"candidateId":"string","candidateName":"string","content":"string","tool":"search_chunks"}]}],"summary":"string","reasoning":"string","context":["string"]}`;

          // Generate final structured report with timeout
          // Groq does not support LangChain's synthetic `json` tool strategy.
          const model = getChatModel(0.3);
          modelPhase = 'final report generation';
          logPayloadSize('final report prompt', reportPrompt);
          console.log('[LLM SIZE] report inputs', {
            toolCalls: toolCalls.length,
            totalRawResultCharacters: toolCalls.reduce((total, call) => {
              const result =
                typeof call.result === 'string'
                  ? call.result
                  : JSON.stringify(call.result) || '';
              return total + result.length;
            }, 0),
            contextCharacters: contextForReport.length,
            jobContextCharacters: jobContext.length,
            previousConversationCharacters: previousConversation.length,
          });

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
          console.error(`[${modelPhase}] Stream error:`, error);
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
    console.error('Route error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
