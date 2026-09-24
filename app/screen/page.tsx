'use client';

import { useState, useRef, useEffect } from 'react';
import { updateScreeningFeedback } from '@/lib/screenings-api';

type IconName =
  'copy' | 'edit' | 'eye' | 'like' | 'dislike' | 'retry' | 'user' | 'assistant';

function Icon({ name }: { name: IconName }) {
  const paths = {
    copy: (
      <>
        <rect x="9" y="9" width="10" height="10" rx="1" />
        <path d="M5 15V5a1 1 0 0 1 1-1h10" />
      </>
    ),
    edit: (
      <path d="m4 20 4.5-1 9.7-9.7a2.1 2.1 0 0 0-3-3L5.5 16 4 20Zm9.8-12.8 3 3" />
    ),
    eye: (
      <>
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
        <circle cx="12" cy="12" r="2.5" />
      </>
    ),
    like: (
      <path d="M7 10v10H4a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2h3Zm0 10h9.4a2 2 0 0 0 1.9-1.4l2-6A2 2 0 0 0 18.4 10H14l.7-3.4A2.2 2.2 0 0 0 12.5 4L7 10v10Z" />
    ),
    dislike: (
      <path d="M7 14V4H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h3Zm0-10h9.4a2 2 0 0 1 1.9 1.4l2 6A2 2 0 0 1 18.4 14H14l.7 3.4a2.2 2.2 0 0 1-2.2 2.6L7 14V4Z" />
    ),
    retry: (
      <path d="M20 11a8 8 0 0 0-14.7-4L3 10m0 0V5m0 5h5M4 13a8 8 0 0 0 14.7 4L21 14m0 0v5m0-5h-5" />
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
      </>
    ),
    assistant: (
      <>
        <rect x="5" y="7" width="14" height="12" rx="3" />
        <path d="M12 7V4m-2 0h4M8.5 12h.01M15.5 12h.01M9 16h6" />
      </>
    ),
  }[name];

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
      className="h-4 w-4"
    >
      {paths}
    </svg>
  );
}

interface Job {
  id: string;
  title: string;
  description: string;
  experience: string;
  skills: string[];
  is_active: boolean;
}

interface ToolCall {
  type: 'tool-call';
  toolName: string;
  toolInput: Record<string, unknown>;
  result?: unknown;
}

interface ToolResult {
  type: 'tool-result';
  toolName: string;
  result: unknown;
}

interface Citation {
  candidateId: string;
  candidateName: string;
  content: string;
  tool: 'search_chunks' | 'get_full_resume';
}

interface ReportData {
  query: string;
  text?: string;
  assessments?: Array<{
    candidateId: string;
    candidateName: string;
    score: number;
    evidence: string[];
    unknowns: string[];
    citations?: Citation[];
  }>;
  summary?: string;
  reasoning?: string;
  context?: string[];
}

interface ReportMessage {
  type: 'report';
  report: Omit<ReportData, 'query'> & { query: string };
}

interface ScreeningHistory {
  id: string;
  query: string;
  jobId?: string | null;
  timestamp: number;
  report: ReportData | null;
  feedback?: 'like' | 'dislike' | null;
  status?: 'running' | 'completed' | 'failed';
}

interface ProgressMessage {
  type: 'progress';
  message: string;
}

interface ErrorMessage {
  type: 'error';
  message: string;
}

type StreamMessage =
  ToolCall | ToolResult | ReportMessage | ProgressMessage | ErrorMessage;

export default function ScreenPage() {
  const [query, setQuery] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [report, setReport] = useState<ReportData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ScreeningHistory[]>([]);
  const [activeScreeningId, setActiveScreeningId] = useState<string | null>(
    null
  );
  const [isHistorySession, setIsHistorySession] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [editingSubmittedQuery, setEditingSubmittedQuery] = useState('');
  const [isEditingSubmittedQuery, setIsEditingSubmittedQuery] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [inspector, setInspector] = useState<'resume' | null>(null);
  const [resume, setResume] = useState<{
    name: string;
    pdfUrl: string;
  } | null>(null);
  const [feedback, setFeedback] = useState<'like' | 'dislike' | null>(null);
  const [inspectorWidth, setInspectorWidth] = useState(380);
  const [progress, setProgress] = useState<string>('');
  const editingQueryRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load screening history from Supabase (or localStorage as fallback)
  const loadHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const response = await fetch('/api/screenings');
      if (response.ok) {
        const { screenings } = await response.json();
        const formattedHistory: ScreeningHistory[] = screenings.map(
          (s: any) => ({
            id: s.id,
            query: s.query,
            jobId: s.job_id,
            timestamp: new Date(s.created_at).getTime(),
            report: s.report,
            feedback: s.feedback,
            status: s.status,
          })
        );
        setHistory(formattedHistory);
      } else {
        // Fallback to localStorage if API fails
        const saved = localStorage.getItem('screeningHistory');
        if (saved) {
          setHistory(JSON.parse(saved));
        }
      }
    } catch (err) {
      console.error(
        'Failed to load history from Supabase, using localStorage:',
        err
      );
      const saved = localStorage.getItem('screeningHistory');
      if (saved) {
        setHistory(JSON.parse(saved));
      }
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadHistory();
    fetch('/api/jobs')
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to load jobs');
        setJobs(data.jobs);
        setSelectedJobId(
          new URLSearchParams(window.location.search).get('jobId') || ''
        );
      })
      .catch((loadError) =>
        setError(
          loadError instanceof Error ? loadError.message : 'Unable to load jobs'
        )
      );
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [toolCalls, report]);

  useEffect(() => {
    const textarea = editingQueryRef.current;
    if (!textarea || !isEditingSubmittedQuery) return;

    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [editingSubmittedQuery, isEditingSubmittedQuery]);

  const createSession = async (q: string) => {
    const response = await fetch('/api/screenings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId: selectedJobId || undefined,
        query: q,
        status: 'running',
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.screeningId) {
      throw new Error(data.error || 'Unable to create screening session');
    }

    return data.screeningId as string;
  };

  const finalizeSession = async (
    screeningId: string,
    r: ReportData,
    calls: ToolCall[],
    status: 'completed' | 'failed' = 'completed'
  ) => {
    const response = await fetch(`/api/screenings/${screeningId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        report: status === 'completed' ? r : undefined,
        status,
        toolCalls: calls.map(({ type: _type, ...call }) => call),
        metadata: {
          toolCalls: calls.map(({ type: _type, ...call }) => call),
        },
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Unable to persist screening session');
    }
  };

  const loadFromHistory = async (item: ScreeningHistory) => {
    setIsHistorySession(true);
    setActiveScreeningId(item.id);
    setSelectedJobId(item.jobId || '');
    setQuery('');
    setSubmittedQuery(item.query);
    setIsEditingSubmittedQuery(false);
    setEditingSubmittedQuery('');
    setToolCalls([]);
    setError(null);
    setFeedback(item.feedback || null);

    // Fetch full details from Supabase for better data integrity
    try {
      const response = await fetch(`/api/screenings/${item.id}`);
      if (response.ok) {
        const screening = await response.json();
        setSelectedJobId(screening.job_id || '');
        const report: ReportData = screening.report || {
          query: screening.query,
          summary: screening.summary,
          reasoning: screening.reasoning,
          context: screening.context,
          assessments: screening.screening_assessments.map(
            (assessment: any) => ({
              candidateId: assessment.candidate_id,
              candidateName: '',
              score: assessment.score,
              evidence: assessment.evidence,
              unknowns: assessment.unknowns,
              citations: assessment.screening_citations,
            })
          ),
        };
        const savedToolCalls =
          screening.tool_calls || screening.metadata?.toolCalls || [];
        setToolCalls(
          savedToolCalls.map((call: Omit<ToolCall, 'type'>) => ({
            type: 'tool-call',
            ...call,
          }))
        );
        setReport(report);
        setFeedback(screening.feedback || null);
      } else {
        // Fallback to local report data
        setReport(item.report);
      }
    } catch (err) {
      console.error('Error loading screening details:', err);
      setReport(item.report);
    }
  };

  const deleteFromHistory = async (itemId: string) => {
    try {
      const response = await fetch(`/api/screenings/${itemId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setHistory((prev) => prev.filter((item) => item.id !== itemId));
        localStorage.setItem(
          'screeningHistory',
          JSON.stringify(history.filter((item) => item.id !== itemId))
        );
      } else {
        setError('Failed to delete screening');
      }
    } catch (err) {
      console.error('Error deleting screening:', err);
      setError('Error deleting screening');
    }
  };

  const clearHistory = async () => {
    // Delete all screenings from Supabase
    for (const item of history) {
      try {
        await fetch(`/api/screenings/${item.id}`, { method: 'DELETE' });
      } catch (err) {
        console.error('Error deleting screening:', err);
      }
    }
    setHistory([]);
    localStorage.removeItem('screeningHistory');
  };

  const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  const retryQuery = () => {
    if (!submittedQuery || isLoading) return;
    void submitQuery(submittedQuery);
  };

  const handleFeedback = async (nextFeedback: 'like' | 'dislike') => {
    if (!activeScreeningId) {
      setError('Feedback is unavailable until the screening is saved.');
      return;
    }

    const feedbackToSave = feedback === nextFeedback ? null : nextFeedback;
    const previousFeedback = feedback;
    setFeedback(feedbackToSave);
    setHistory((previousHistory) =>
      previousHistory.map((item) =>
        item.id === activeScreeningId
          ? { ...item, feedback: feedbackToSave }
          : item
      )
    );

    const result = await updateScreeningFeedback(
      activeScreeningId,
      feedbackToSave
    );
    if (!result.success) {
      setFeedback(previousFeedback);
      setHistory((previousHistory) =>
        previousHistory.map((item) =>
          item.id === activeScreeningId
            ? { ...item, feedback: previousFeedback }
            : item
        )
      );
      setError(result.error || 'Failed to save feedback');
    }
  };

  const viewResume = async (candidateId: string, candidateName: string) => {
    try {
      const response = await fetch(
        `/api/candidates/${candidateId}?view=resume`
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load resume');
      setResume({ name: candidateName, pdfUrl: data.pdfUrl });
      setInspector('resume');
    } catch (resumeError) {
      setError(
        resumeError instanceof Error
          ? resumeError.message
          : 'Unable to load resume'
      );
    }
  };

  const startInspectorResize = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = inspectorWidth;
    const onMove = (moveEvent: MouseEvent) => {
      setInspectorWidth(
        Math.min(560, Math.max(280, startWidth + startX - moveEvent.clientX))
      );
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const submitQuery = async (screeningQuery: string) => {
    if (!screeningQuery.trim()) return;
    setSubmittedQuery(screeningQuery);
    setIsEditingSubmittedQuery(false);
    setEditingSubmittedQuery('');
    setQuery('');
    setIsLoading(true);
    setError(null);
    setToolCalls([]);
    setReport(null);
    setFeedback(null);
    setProgress('Starting analysis...');

    let screeningId: string | null = null;
    let reportData: ReportData | null = null;
    const collectedToolCalls: ToolCall[] = [];

    try {
      screeningId = await createSession(screeningQuery);
      setActiveScreeningId(screeningId);
      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: screeningQuery,
          jobId: selectedJobId || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Screening failed');
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');

        buffer = lines[lines.length - 1];

        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          try {
            const message: StreamMessage = JSON.parse(line);

            if (message.type === 'tool-call') {
              collectedToolCalls.push(message);
              setToolCalls((prev) => [...prev, message]);
            } else if (message.type === 'tool-result') {
              setToolCalls((prev) => {
                const next = [...prev];
                const reverseIndex = [...next]
                  .reverse()
                  .findIndex(
                    (call: ToolCall) =>
                      call.toolName === message.toolName && !call.result
                  );
                const index =
                  reverseIndex >= 0 ? next.length - 1 - reverseIndex : -1;
                if (index >= 0)
                  next[index] = { ...next[index], result: message.result };
                return next;
              });
              for (
                let index = collectedToolCalls.length - 1;
                index >= 0;
                index--
              ) {
                const pending = collectedToolCalls[index];
                if (pending.toolName === message.toolName && !pending.result) {
                  pending.result = message.result;
                  break;
                }
              }
            } else if (message.type === 'report') {
              reportData = message.report;
              setReport(reportData);
            } else if (message.type === 'progress') {
              setProgress(message.message);
            } else if (message.type === 'error') {
              throw new Error(message.message);
            }
          } catch (parseError) {
            console.error('Failed to parse message:', line, parseError);
          }
        }
      }

      if (reportData && screeningId) {
        await finalizeSession(screeningId, reportData, collectedToolCalls);
        await loadHistory();
      }
    } catch (err) {
      if (screeningId) {
        try {
          await finalizeSession(
            screeningId,
            reportData || {
              query: screeningQuery,
            },
            collectedToolCalls,
            'failed'
          );
          await loadHistory();
        } catch (persistError) {
          console.error('Failed to persist screening failure:', persistError);
        }
      }
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submitQuery(query.trim());
  };

  return (
    <div className="min-h-[calc(100vh-80px)] bg-gray-50 flex">
      {/* Sidebar */}
      <div
        className={`${
          sidebarOpen ? 'w-64' : 'w-0'
        } bg-white border-r border-gray-200 transition-all duration-200 overflow-hidden flex flex-col`}
      >
        <div className="p-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900 mb-2">
            Screening History
          </h2>
          <button
            onClick={() => {
              setIsHistorySession(false);
              setActiveScreeningId(null);
              setQuery('');
              setSubmittedQuery('');
              setReport(null);
              setToolCalls([]);
              setFeedback(null);
              setError(null);
            }}
            className="w-full px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition"
          >
            New Query
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoadingHistory ? (
            <div className="p-4 text-sm text-gray-500">Loading history...</div>
          ) : history.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">
              No screening history yet. Start with a new query.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="p-3 hover:bg-gray-50 transition group border-b border-gray-100 flex items-start justify-between gap-2"
                >
                  <button
                    onClick={() => loadFromHistory(item)}
                    className="flex-1 text-left"
                  >
                    <p className="text-xs text-gray-500 mb-1">
                      {new Date(item.timestamp).toLocaleDateString()} at{' '}
                      {new Date(item.timestamp).toLocaleTimeString()}
                    </p>
                    <p className="text-sm text-gray-900 line-clamp-2 group-hover:text-blue-600">
                      {item.query}
                    </p>
                    {item.report && item.report.assessments && (
                      <p className="text-xs text-gray-400 mt-1">
                        {item.report.assessments.length} candidates
                      </p>
                    )}
                  </button>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      deleteFromHistory(item.id);
                    }}
                    className="flex-shrink-0 text-gray-400 hover:text-red-600 transition p-1 opacity-0 group-hover:opacity-100"
                    title="Delete screening"
                  >
                    ✕
                  </button>
                </div>
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
          {sidebarOpen ? '←' : '→'}
        </button>

        {/* Header */}
        <div className="border-b border-gray-200 bg-white p-6 md:p-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">
            Screen Candidates
          </h1>
          <p className="text-gray-600">
            Ask screening questions and get AI-powered candidate assessments
          </p>
        </div>

        {/* Results Area */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-4xl mx-auto">
            {/* Submitted Query Display */}
            {submittedQuery && (
              <div className="mb-6 flex items-start justify-end gap-2">
                <div className="w-fit max-w-[70%]">
                  <div className="rounded-lg bg-gray-100 p-4 text-white">
                    {/* <p className="mb-1 text-sm text-gray-600">Your Query:</p> */}
                    {isEditingSubmittedQuery ? (
                      <textarea
                        ref={editingQueryRef}
                        value={editingSubmittedQuery}
                        onChange={(e) =>
                          setEditingSubmittedQuery(e.target.value)
                        }
                        rows={3}
                        className="min-h-24 w-full resize-none overflow-hidden rounded border border-gray-300 bg-white p-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                        aria-label="Edit your query"
                        autoFocus
                      />
                    ) : (
                      <p className="font-medium text-gray-900">
                        {submittedQuery}
                      </p>
                    )}
                  </div>
                  <div className="mt-2 flex justify-end gap-1 text-gray-500">
                    {isEditingSubmittedQuery ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            const nextQuery = editingSubmittedQuery.trim();
                            if (nextQuery) void submitQuery(nextQuery);
                          }}
                          className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:opacity-40"
                          disabled={isLoading || !editingSubmittedQuery.trim()}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsEditingSubmittedQuery(false)}
                          className="rounded px-3 py-1 text-sm hover:bg-gray-200 hover:text-gray-900"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => copyText(submittedQuery)}
                          className="rounded p-2 hover:bg-gray-200 hover:text-gray-900"
                          aria-label="Copy your query"
                          title="Copy"
                        >
                          <Icon name="copy" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingSubmittedQuery(submittedQuery);
                            setIsEditingSubmittedQuery(true);
                          }}
                          className="rounded p-2 hover:bg-gray-200 hover:text-gray-900"
                          aria-label="Edit your query"
                          title="Edit"
                        >
                          <Icon name="edit" />
                        </button>
                        <button
                          type="button"
                          onClick={retryQuery}
                          className="rounded p-2 hover:bg-gray-200 hover:text-gray-900 disabled:opacity-40"
                          aria-label="Retry your query"
                          title="Retry"
                          disabled={isLoading}
                        >
                          <Icon name="retry" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <span
                  className="mt-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700"
                  aria-label="User"
                  title="User"
                >
                  <Icon name="user" />
                </span>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 p-4 rounded-lg mb-6">
                <p className="text-red-700 font-medium">Error</p>
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}

            {/* Final Report */}
            {report && (
              <>
                <div className="flex items-start justify-start gap-2">
                  <span
                    className="mt-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-gray-700"
                    aria-label="Assistant"
                    title="Assistant"
                  >
                    <Icon name="assistant" />
                  </span>
                  <div className="w-full max-w-[85%] space-y-6">
                    {report.summary && (
                      <div>
                        <p className="whitespace-pre-line text-sm leading-relaxed text-gray-700">
                          {report.summary}
                        </p>
                      </div>
                    )}
                    {(report.summary || report.text || report.assessments) && (
                      <>
                        {/* Candidate Assessments */}
                        {report.assessments && (
                          <div>
                            <h3 className="font-semibold text-lg mb-4">
                              Candidate Assessments
                            </h3>
                            <div className="space-y-3">
                              {report.assessments.map((assessment, idx) => (
                                <article
                                  key={idx}
                                  className="rounded-lg border border-gray-200 bg-white p-4"
                                >
                                  <div className="flex items-start justify-between gap-4">
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <h4 className="font-bold text-gray-900">
                                          {assessment.candidateName}
                                        </h4>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            viewResume(
                                              assessment.candidateId,
                                              assessment.candidateName
                                            )
                                          }
                                          className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-blue-700"
                                          aria-label={`View resume for ${assessment.candidateName}`}
                                          title="View resume"
                                        >
                                          <Icon name="eye" />
                                        </button>
                                      </div>
                                    </div>
                                    <div className="shrink-0 text-right">
                                      <span className="text-2xl font-bold text-blue-600">
                                        {assessment.score}
                                      </span>
                                      <span className="text-xs text-gray-500">
                                        /100
                                      </span>
                                    </div>
                                  </div>
                                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                    <div>
                                      <h5 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">
                                        Evidence
                                      </h5>
                                      <ul className="space-y-2 text-sm text-gray-700">
                                        {assessment.evidence.map((item, i) => (
                                          <li key={i} className="flex gap-2">
                                            <span className="text-green-600">
                                              •
                                            </span>
                                            <strong>{item}</strong>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                    <div>
                                      <h5 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">
                                        Unknowns
                                      </h5>
                                      <ul className="space-y-2 text-sm text-gray-700">
                                        {assessment.unknowns.map((item, i) => (
                                          <li key={i} className="flex gap-2">
                                            <span className="text-amber-600">
                                              •
                                            </span>
                                            <span>{item}</span>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  </div>
                                </article>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <div className="ml-10 flex items-start justify-start gap-1 text-gray-500">
                  <button
                    type="button"
                    onClick={() =>
                      copyText(report.text || JSON.stringify(report, null, 2))
                    }
                    className="rounded p-2 hover:bg-gray-100 hover:text-gray-900"
                    aria-label="Copy agent response"
                    title="Copy"
                  >
                    <Icon name="copy" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleFeedback('like')}
                    className={`rounded p-2 hover:bg-gray-100 hover:text-gray-900 ${feedback === 'like' ? 'bg-green-100 text-green-700' : ''}`}
                    aria-label="Like agent response"
                    title="Like"
                  >
                    <Icon name="like" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleFeedback('dislike')}
                    className={`rounded p-2 hover:bg-gray-100 hover:text-gray-900 ${feedback === 'dislike' ? 'bg-red-100 text-red-700' : ''}`}
                    aria-label="Dislike agent response"
                    title="Dislike"
                  >
                    <Icon name="dislike" />
                  </button>
                  <button
                    type="button"
                    onClick={retryQuery}
                    className="rounded p-2 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-40"
                    aria-label="Retry screening query"
                    title="Retry"
                    disabled={isLoading}
                  >
                    <Icon name="retry" />
                  </button>
                </div>
              </>
            )}

            {isLoading && !report && (
              <div className="flex justify-start">
                <div className="flex max-w-[85%] items-center gap-3 rounded-lg bg-white px-4 py-4 border border-gray-200">
                  <div className="flex gap-1">
                    <div
                      className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"
                      style={{ animationDelay: '0s' }}
                    ></div>
                    <div
                      className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"
                      style={{ animationDelay: '0.2s' }}
                    ></div>
                    <div
                      className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"
                      style={{ animationDelay: '0.4s' }}
                    ></div>
                  </div>
                  <p className="text-gray-600">{progress || 'Processing...'}</p>
                </div>
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
              <div className="flex flex-col gap-3 sm:gap-3">
                <label
                  htmlFor="job"
                  className="text-sm font-medium text-gray-700"
                >
                  Screen for job (optional)
                </label>
                <select
                  id="job"
                  value={selectedJobId}
                  onChange={(e) => setSelectedJobId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white p-3 text-gray-900 text-sm transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 hover:border-gray-400 disabled:bg-gray-50 disabled:text-gray-500"
                  disabled={isLoading || isHistorySession}
                >
                  <option value="">General screening criteria</option>
                  {jobs.map((job) => (
                    <option key={job.id} value={job.id}>
                      {job.title} - {job.skills.join(', ')}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder="Ask screening questions (e.g., 'Find candidates with Java and AWS experience')"
                className="w-full h-24 p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                disabled={isLoading}
                aria-describedby="screening-prompt-hint"
              />
              {/* <p id="screening-prompt-hint" className="text-xs text-gray-500">
                Press Shift+Enter for a new line. Press Enter to screen
                candidates.
              </p> */}
              <button
                type="submit"
                disabled={isLoading || !query.trim()}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-medium transition"
              >
                {isLoading ? 'Screening...' : 'Screen Candidates'}
              </button>
              <p
                id="screening-prompt-hint"
                className="text-center text-xs text-gray-500"
              >
                AI can make mistakes. Please verify important information.
              </p>
            </form>
          </div>
        </div>
      </div>

      {inspector && (
        <aside
          style={{ width: inspectorWidth }}
          className="fixed right-0 top-0 z-20 flex h-screen max-w-[90vw] border-l border-gray-200 bg-white shadow-xl"
        >
          <div
            onMouseDown={startInspectorResize}
            className="w-1 cursor-col-resize bg-gray-200 hover:bg-blue-400"
            title="Resize panel"
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center justify-between border-b border-gray-200 p-4">
              <h2 className="font-semibold text-gray-900">
                {`Resume: ${resume?.name || 'Candidate'}`}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setInspector(null);
                  setResume(null);
                }}
                className="rounded px-2 py-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                aria-label="Close inspector"
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {resume ? (
                <iframe
                  src={resume.pdfUrl}
                  title={`Resume PDF: ${resume.name}`}
                  className="h-full min-h-[calc(100vh-120px)] w-full rounded border border-gray-200"
                />
              ) : (
                <p className="text-sm text-gray-500">Loading resume...</p>
              )}
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
