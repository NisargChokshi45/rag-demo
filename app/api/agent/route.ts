export const maxDuration = 300;
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { createAgentTools } from "@/lib/agent-tools";
import { ScreeningReportSchema } from "@/lib/schema";
import { getChatModel } from "@/lib/models";
import { getJobById, createScreening } from "@/lib/db";

interface AgentRequest {
  query: string;
  jobId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { query, jobId }: AgentRequest = await request.json();

    if (!query) {
      return NextResponse.json(
        { error: "Query is required" },
        { status: 400 }
      );
    }

    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json(
        { error: "GROQ_API_KEY is missing" },
        { status: 500 }
      );
    }

    const toolContext = { fetchedCandidates: new Set<string>() };
    const tools = createAgentTools(toolContext);
    const job = jobId ? await getJobById(jobId) : null;
    const jobContext = job
      ? `Job title: ${job.title}\nDescription: ${job.description}\nExperience: ${job.experience}\nRequired skills: ${job.skills.join(", ")}`
      : "";

    const systemPrompt = jobContext
      ? `You are a resume screening assistant. Screen candidates against this job:\n\n${jobContext}\n\nUse the available tools to search for candidates and retrieve their full resumes when needed.`
      : "You are a resume screening assistant. Your job is to screen candidates based on the provided criteria. Use the available tools to search for candidates and retrieve their full resumes when needed.";

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
          const input = { messages: [{ type: "human", content: query }] };
          const stream = await agent.streamEvents(input, {
            version: "v2",
            recursionLimit: 10,
          });

          for await (const event of stream) {
            if (event.event === "on_tool_start") {
              const toolName = event.name;
              const toolInput = event.data?.input || {};

              const toolMessage = {
                type: "tool-call",
                toolName,
                toolInput,
              };

              controller.enqueue(
                encoder.encode(JSON.stringify(toolMessage) + "\n")
              );

              toolCalls.push({
                toolName,
                toolInput: toolInput as Record<string, unknown>,
                result: null,
              });
            } else if (event.event === "on_tool_end") {
              if (toolCalls.length > 0) {
                const lastToolCall = toolCalls[toolCalls.length - 1];
                if (lastToolCall.toolName === event.name) {
                  lastToolCall.result = event.data?.output;
                }
              }
            }
          }

          // Build context for the final report
          const contextForReport = toolCalls
            .map(
              (call) =>
                `Tool: ${call.toolName}\nInput: ${JSON.stringify(call.toolInput)}\nResult: ${JSON.stringify(call.result)}`
            )
            .join("\n\n");

          const reportPrompt = `Based on the search results and candidate information below, provide a screening report.

Query: ${query}
${jobContext ? `Job Criteria:\n${jobContext}` : ""}

Tool Calls and Results:
${contextForReport}

Provide assessments for the candidates mentioned in the results. For each candidate, include their ID, name, a relevance score (0-100), evidence from the resume, and any unknowns.`;

          // Generate final structured report
          const structuredOutput = getChatModel(0.3).withStructuredOutput(ScreeningReportSchema);
          const report = await structuredOutput.invoke(reportPrompt);

          // Persist screening to database if job exists
          if (jobId) {
            try {
              await createScreening(jobId, query, report.summary, report.assessments);
            } catch (persistError) {
              console.error("Failed to persist screening:", persistError);
              // Continue despite persistence error
            }
          }

          const reportMessage = {
            type: "report",
            report,
          };

          controller.enqueue(
            encoder.encode(JSON.stringify(reportMessage) + "\n")
          );
          controller.close();
        } catch (error) {
          console.error("Stream error:", error);
          controller.error(error);
        }
      },
    });

    return new NextResponse(response, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("Route error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
