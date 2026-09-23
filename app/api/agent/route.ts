export const maxDuration = 300;
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { createAgentTools } from '@/lib/agent-tools';
import { ScreeningReportSchema } from '@/lib/schema';
import { getChatModel } from '@/lib/models';
import { getJobById, createScreening } from '@/lib/db';
import { validateEnv, getMissingEnvMessage } from '@/lib/env';

interface AgentRequest {
  query: string;
  jobId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { query, jobId }: AgentRequest = await request.json();

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

    const toolContext = { fetchedCandidates: new Set<string>() };
    const tools = createAgentTools(toolContext);
    const job = jobId ? await getJobById(jobId, true) : null;
    const jobContext = job
      ? `Job title: ${job.title}\nDescription: ${job.description}\nExperience: ${job.experience}\nRequired skills: ${job.skills.join(', ')}`
      : '';

    const systemPrompt = jobContext
      ? `You are a resume screening assistant. Screen candidates against this job:\n\n${jobContext}\n\nUse the available tools to search for candidates and retrieve their full resumes when needed.`
      : 'You are a resume screening assistant. Your job is to screen candidates based on the provided criteria. Use the available tools to search for candidates and retrieve their full resumes when needed.';

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

          const input = { messages: [{ type: 'human', content: query }] };
          const stream = await agent.streamEvents(input, {
            version: 'v2',
            recursionLimit: 10,
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
              if (toolCalls.length > 0) {
                const lastToolCall = toolCalls[toolCalls.length - 1];
                if (lastToolCall.toolName === event.name) {
                  lastToolCall.result = event.data?.output;
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

          // Build enhanced context for the final report with full tool results
          const contextForReport = toolCalls
            .map((call, idx) => {
              const resultStr =
                typeof call.result === 'string'
                  ? call.result
                  : JSON.stringify(call.result, null, 2);
              return `[${idx + 1}] Tool: ${call.toolName}\nInput: ${JSON.stringify(call.toolInput)}\nResult:\n${resultStr}`;
            })
            .join('\n\n---\n\n');

          const reportPrompt = `Based on the search results and candidate information below, provide a comprehensive screening report.

Query: ${query}
${jobContext ? `Job Criteria:\n${jobContext}` : ''}

Tool Calls and Results (these contain resume chunks and candidate information):
${contextForReport}

For each candidate assessment, include:
1. ID, name, and relevance score (0-100)
2. Evidence from the resume (key qualifications that match the query)
3. Unknowns or gaps in the resume
4. Citations: Include 1-3 relevant resume excerpts from the tool results (each 80-150 chars) that directly support the assessment. Include the tool name that provided each citation (search_chunks or get_full_resume).

Additionally, provide:
- A summary of the screening explaining how candidates were evaluated
- Key reasoning steps that guided the assessment (e.g., "Used vector search to find candidates with matching skills, then reranked by relevance")
- Context items used (such as job criteria, search strategies, number of candidates evaluated, tools employed)

Format citations as actual text snippets from the resume content shown in the tool results above.`;

          // Generate final structured report with timeout
          const structuredOutput = getChatModel(0.3).withStructuredOutput(
            ScreeningReportSchema
          );
          const report = (await Promise.race([
            structuredOutput.invoke(reportPrompt),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error('Report generation timeout')),
                55000
              )
            ),
          ])) as Awaited<ReturnType<typeof structuredOutput.invoke>>;

          // Persist screening to database if job exists (don't block response)
          if (jobId) {
            createScreening(
              jobId,
              query,
              report.summary,
              report.assessments
            ).catch((persistError) => {
              console.error('Failed to persist screening:', persistError);
            });
          }

          const reportMessage = {
            type: 'report',
            report,
          };

          controller.enqueue(
            encoder.encode(JSON.stringify(reportMessage) + '\n')
          );
          controller.close();
        } catch (error) {
          console.error('Stream error:', error);
          controller.error(error);
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
