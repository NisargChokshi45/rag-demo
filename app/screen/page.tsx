"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

interface ToolCall {
  type: "tool-call";
  toolName: string;
  toolInput: Record<string, unknown>;
}

interface ReportData {
  query: string;
  assessments: Array<{
    candidateId: string;
    candidateName: string;
    score: number;
    evidence: string[];
    unknowns: string[];
  }>;
  summary: string;
}

interface ReportMessage {
  type: "report";
  report: ReportData;
}

type StreamMessage = ToolCall | ReportMessage;

export default function ScreenPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [report, setReport] = useState<ReportData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [toolCalls, report]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsLoading(true);
    setError(null);
    setToolCalls([]);
    setReport(null);

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Screening failed");
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");

        // Keep the last incomplete line in the buffer
        buffer = lines[lines.length - 1];

        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          try {
            const message: StreamMessage = JSON.parse(line);

            if (message.type === "tool-call") {
              setToolCalls((prev) => [...prev, message]);
            } else if (message.type === "report") {
              setReport(message.report);
            }
          } catch (parseError) {
            console.error("Failed to parse message:", line, parseError);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-80px)] bg-gray-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">Screen Candidates</h1>
          <p className="text-gray-600">Ask screening questions and get AI-powered candidate assessments</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          {/* Query Input */}
          <div className="col-span-1">
            <div className="bg-white p-6 rounded-lg shadow sticky top-24">
              <h2 className="text-lg font-semibold mb-4">Screening Query</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <textarea
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ask screening questions (e.g., 'Find candidates with Java and AWS experience')"
                  className="w-full h-32 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  disabled={isLoading}
                />
                <button
                  type="submit"
                  disabled={isLoading || !query.trim()}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {isLoading ? "Screening..." : "Screen"}
                </button>
              </form>
            </div>
          </div>

          {/* Results */}
          <div className="col-span-2">
            {error && (
              <div className="bg-red-50 border border-red-200 p-4 rounded-lg mb-6">
                <p className="text-red-700 font-medium">Error</p>
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}

            {/* Tool Calls Trace */}
            {toolCalls.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 p-6 rounded-lg mb-6">
                <h3 className="font-semibold text-blue-900 mb-4">
                  Tool Calls Trace
                </h3>
                <div className="space-y-3">
                  {toolCalls.map((call, idx) => (
                    <div
                      key={idx}
                      className="bg-white p-4 rounded border border-blue-100"
                    >
                      <p className="font-mono text-sm font-semibold text-blue-700">
                        {call.toolName}
                      </p>
                      {Object.keys(call.toolInput).length > 0 && (
                        <pre className="mt-2 text-xs bg-gray-50 p-2 rounded overflow-auto max-h-20">
                          {JSON.stringify(call.toolInput, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Final Report */}
            {report && (
              <div className="space-y-6">
                <div className="bg-green-50 border border-green-200 p-6 rounded-lg">
                  <h3 className="font-semibold text-green-900 mb-2">Summary</h3>
                  <p className="text-green-800">{report.summary}</p>
                </div>

                <div>
                  <h3 className="font-semibold text-lg mb-4">
                    Candidate Assessments
                  </h3>
                  <div className="space-y-4">
                    {report.assessments.map((assessment, idx) => (
                      <div
                        key={idx}
                        className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition"
                      >
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <h4 className="font-semibold text-lg">
                              {assessment.candidateName}
                            </h4>
                          </div>
                          <div className="text-right">
                            <div className="text-3xl font-bold text-blue-600">
                              {assessment.score}
                            </div>
                            <div className="text-xs text-gray-600">/100</div>
                          </div>
                        </div>

                        {assessment.evidence.length > 0 && (
                          <div className="mb-4">
                            <h5 className="text-sm font-medium text-gray-700 mb-2">
                              Evidence
                            </h5>
                            <ul className="space-y-1">
                              {assessment.evidence.map((item, i) => (
                                <li
                                  key={i}
                                  className="text-sm text-gray-700 flex gap-2"
                                >
                                  <span className="text-green-600">✓</span>
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {assessment.unknowns.length > 0 && (
                          <div>
                            <h5 className="text-sm font-medium text-gray-700 mb-2">
                              Unknowns
                            </h5>
                            <ul className="space-y-1">
                              {assessment.unknowns.map((item, i) => (
                                <li
                                  key={i}
                                  className="text-sm text-amber-700 flex gap-2"
                                >
                                  <span className="text-amber-600">?</span>
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {isLoading && !report && (
              <div className="bg-white p-8 rounded-lg text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
                <p className="text-gray-600">Screening candidates...</p>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
