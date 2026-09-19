export const maxDuration = 300;
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { generateObject, streamText } from "ai";
import { google } from "@ai-sdk/google";
import { createAgentTools } from "@/lib/agent-tools";
import { ScreeningReportSchema } from "@/lib/schema";

interface AgentRequest {
  query: string;
  jobDescription?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { query, jobDescription }: AgentRequest = await request.json();

    if (!query) {
      return NextResponse.json(
        { error: "Query is required" },
        { status: 400 }
      );
    }

    const toolContext = { fetchedCandidates: new Set<string>() };
    const tools = createAgentTools(toolContext);

    const systemPrompt =
      jobDescription
        ? `You are a resume screening assistant. The job description is:\n\n${jobDescription}\n\nYour job is to screen candidates and provide assessments. Use the available tools to search for candidates and retrieve their full resumes when needed.`
        : "You are a resume screening assistant. Your job is to screen candidates based on the provided criteria. Use the available tools to search for candidates and retrieve their full resumes when needed.";

    const encoder = new TextEncoder();
    const toolCalls: Array<{
      toolName: string;
      toolInput: Record<string, unknown>;
      result: unknown;
    }> = [];

    const response = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          // Stream the agent response with tool calls
          const { fullStream } = streamText({
            model: google("gemini-2.5-flash"),
            system: systemPrompt,
            prompt: query,
            tools,
            maxSteps: 10,
            temperature: 0.7,
          });

          // Process the stream and extract tool calls
          for await (const chunk of fullStream) {
            if (chunk.type === "tool-call") {
              const toolMessage = {
                type: "tool-call",
                toolName: chunk.toolName,
                toolInput: chunk.args as Record<string, unknown>,
              };

              controller.enqueue(
                encoder.encode(JSON.stringify(toolMessage) + "\n")
              );

              toolCalls.push({
                toolName: chunk.toolName,
                toolInput: chunk.args as Record<string, unknown>,
                result: null,
              });
            } else if (chunk.type === "tool-result") {
              if (toolCalls.length > 0) {
                const lastToolCall = toolCalls[toolCalls.length - 1];
                if (lastToolCall.toolName === chunk.toolName) {
                  lastToolCall.result = chunk.result;
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
${jobDescription ? `Job Description: ${jobDescription}` : ""}

Tool Calls and Results:
${contextForReport}

Provide assessments for the candidates mentioned in the results. For each candidate, include their ID, name, a relevance score (0-100), evidence from the resume, and any unknowns.`;

          // Generate final structured report
          const report = await generateObject({
            model: google("gemini-2.5-flash"),
            schema: ScreeningReportSchema,
            prompt: reportPrompt,
            temperature: 0.3,
          });

          const reportMessage = {
            type: "report",
            report: report.object,
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
