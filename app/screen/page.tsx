"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

interface Job {
  id: string;
  title: string;
  description: string;
  experience: string;
  skills: string[];
}

interface ToolCall {
  type: "tool-call";
  toolName: string;
  toolInput: Record<string, unknown>;
}

interface Citation {
  candidateId: string;
  candidateName: string;
  content: string;
  tool: "search_chunks" | "get_full_resume";
}

interface ReportData {
  query: string;
  assessments: Array<{
    candidateId: string;
    candidateName: string;
    score: number;
    evidence: string[];
    unknowns: string[];
    citations?: Citation[];
  }>;
  summary: string;
  reasoning?: string;
  context?: string[];
}

interface ReportMessage {
  type: "report";
  report: ReportData;
}

interface ScreeningHistory {
  id: string;
  query: string;
  timestamp: number;
  report: ReportData | null;
}

type StreamMessage = ToolCall | ReportMessage;

export default function ScreenPage() {
  const [query, setQuery] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [report, setReport] = useState<ReportData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ScreeningHistory[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("screeningHistory");
    if (saved) {
      setHistory(JSON.parse(saved));
    }
    fetch("/api/jobs")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load jobs");
        setJobs(data.jobs);
        setSelectedJobId(new URLSearchParams(window.location.search).get("jobId") || "");
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load jobs"));
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [toolCalls, report]);

  const saveToHistory = (q: string, r: ReportData | null) => {
    const newEntry: ScreeningHistory = {
      id: Date.now().toString(),
      query: q,
      timestamp: Date.now(),
      report: r,
    };
    const updated = [newEntry, ...history];
    setHistory(updated);
    localStorage.setItem("screeningHistory", JSON.stringify(updated));
  };

  const loadFromHistory = (item: ScreeningHistory) => {
    setQuery(item.query);
    setToolCalls([]);
    setReport(item.report);
    setError(null);
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem("screeningHistory");
  };

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
        body: JSON.stringify({ query, jobId: selectedJobId || undefined }),
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
      let reportData: ReportData | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");

        buffer = lines[lines.length - 1];

        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          try {
            const message: StreamMessage = JSON.parse(line);

            if (message.type === "tool-call") {
              setToolCalls((prev) => [...prev, message]);
            } else if (message.type === "report") {
              reportData = message.report;
              setReport(message.report);
            }
          } catch (parseError) {
            console.error("Failed to parse message:", line, parseError);
          }
        }
      }

      if (reportData) {
        saveToHistory(query, reportData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-80px)] bg-gray-50 flex">
      {/* Sidebar */}
      <div
        className={`${
          sidebarOpen ? "w-64" : "w-0"
        } bg-white border-r border-gray-200 transition-all duration-200 overflow-hidden flex flex-col`}
      >
        <div className="p-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900 mb-2">Screening History</h2>
          <button
            onClick={() => setQuery("")}
            className="w-full px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition"
          >
            New Query
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {history.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">
              No screening history yet. Start with a new query.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {history.map((item) => (
                <button
                  key={item.id}
                  onClick={() => loadFromHistory(item)}
                  className="w-full text-left p-3 hover:bg-gray-50 transition group"
                >
                  <p className="text-xs text-gray-500 mb-1">
                    {new Date(item.timestamp).toLocaleDateString()} at{" "}
                    {new Date(item.timestamp).toLocaleTimeString()}
                  </p>
                  <p className="text-sm text-gray-900 line-clamp-2 group-hover:text-blue-600">
                    {item.query}
                  </p>
                  {item.report && (
                    <p className="text-xs text-gray-400 mt-1">
                      {item.report.assessments.length} candidates
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {history.length > 0 && (
          <div className="p-4 border-t border-gray-200">
            <button
              onClick={clearHistory}
              className="w-full px-3 py-2 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50 transition"
            >
              Clear History
            </button>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Toggle Button */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute top-24 left-2 z-10 p-2 hover:bg-gray-100 rounded transition md:hidden"
        >
          {sidebarOpen ? "←" : "→"}
        </button>

        {/* Header */}
        <div className="border-b border-gray-200 bg-white p-6 md:p-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">Screen Candidates</h1>
          <p className="text-gray-600">
            Ask screening questions and get AI-powered candidate assessments
          </p>
        </div>

        {/* Results Area */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-4xl mx-auto">
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
                {/* Summary Section */}
                <div className="bg-green-50 border border-green-200 p-6 rounded-lg">
                  <h3 className="font-semibold text-green-900 mb-2">Summary</h3>
                  <p className="text-green-800">{report.summary}</p>
                </div>

                {/* Reasoning & Thinking Process */}
                {report.reasoning && (
                  <div className="bg-purple-50 border border-purple-200 p-6 rounded-lg">
                    <h3 className="font-semibold text-purple-900 mb-3 flex items-center gap-2">
                      <span>🧠</span> Thinking Process
                    </h3>
                    <p className="text-purple-800 text-sm leading-relaxed">
                      {report.reasoning}
                    </p>
                  </div>
                )}

                {/* Context Used */}
                {report.context && report.context.length > 0 && (
                  <div className="bg-indigo-50 border border-indigo-200 p-6 rounded-lg">
                    <h3 className="font-semibold text-indigo-900 mb-3 flex items-center gap-2">
                      <span>📋</span> Context Used
                    </h3>
                    <ul className="space-y-2">
                      {report.context.map((item, i) => (
                        <li
                          key={i}
                          className="text-sm text-indigo-800 flex gap-2"
                        >
                          <span className="text-indigo-600 flex-shrink-0">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Candidate Assessments */}
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
                        {/* Header with Score */}
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

                        {/* Evidence */}
                        {assessment.evidence.length > 0 && (
                          <div className="mb-4">
                            <h5 className="text-sm font-medium text-gray-700 mb-2">
                              ✓ Evidence
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

                        {/* Unknowns */}
                        {assessment.unknowns.length > 0 && (
                          <div className="mb-4">
                            <h5 className="text-sm font-medium text-gray-700 mb-2">
                              ? Unknowns
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

                        {/* Citations */}
                        {assessment.citations && assessment.citations.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-gray-100">
                            <h5 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                              <span>📌</span> Citations from Resume
                            </h5>
                            <div className="space-y-2">
                              {assessment.citations.map((citation, i) => (
                                <div
                                  key={i}
                                  className="bg-gray-50 p-3 rounded border-l-4 border-blue-400"
                                >
                                  <p className="text-xs text-gray-500 mb-1">
                                    Source: <span className="font-mono text-blue-600">{citation.tool}</span>
                                  </p>
                                  <p className="text-sm text-gray-700 italic">
                                    "{citation.content.substring(0, 150)}{citation.content.length > 150 ? "..." : ""}"
                                  </p>
                                </div>
                              ))}
                            </div>
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

            {!report && !isLoading && history.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-500 text-lg">
                  Start by entering a screening query below
                </p>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Area - Bottom Fixed */}
        <div className="border-t border-gray-200 bg-white p-6 md:p-8">
          <div className="max-w-4xl mx-auto">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <label htmlFor="job" className="text-sm font-medium text-gray-700">Screen for job</label>
                <select
                  id="job"
                  value={selectedJobId}
                  onChange={(e) => setSelectedJobId(e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white p-3 focus:border-transparent focus:ring-2 focus:ring-blue-500"
                  disabled={isLoading}
                >
                  <option value="">General screening criteria</option>
                  {jobs.map((job) => <option key={job.id} value={job.id}>{job.title} - {job.skills.join(", ")}</option>)}
                </select>
                <Link href="/jobs" className="text-sm font-medium text-blue-600 hover:text-blue-700">Create a job</Link>
              </div>
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask screening questions (e.g., 'Find candidates with Java and AWS experience')"
                className="w-full h-24 p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !query.trim()}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-medium transition"
              >
                {isLoading ? "Screening..." : "Screen Candidates"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
