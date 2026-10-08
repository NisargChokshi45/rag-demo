'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { embedUntilReady, readJson } from '@/lib/documents/client';

type Status = 'processing' | 'embedding' | 'ready' | 'failed';

interface DocumentDetail {
  id: string;
  title: string;
  strategy: string;
  page_count: number;
  status: Status;
  error: string | null;
}

interface Citation {
  label: string;
  kind: string;
  sectionPath: string;
  pages: string;
  excerpt: string;
}

interface TraceStep {
  step: string;
  detail: string;
}

interface Answer {
  answer: string;
  answerable: boolean;
  citations: Citation[];
  unverifiedNumbers: string[];
  searchQuery: string;
  trace: TraceStep[];
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  answer?: Answer;
}

export default function DocumentChatPage() {
  const params = useParams<{ id: string }>();
  const documentId = params.id;

  const [document, setDocument] = useState<DocumentDetail | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const body = await readJson(
          await fetch(`/api/documents/${documentId}`)
        );
        if (cancelled) return;
        setDocument(body.document);

        // An interrupted upload resumes here, so chat is never left stuck.
        if (
          body.document.status === 'embedding' ||
          body.document.status === 'processing'
        ) {
          await embedUntilReady(documentId, (left) => {
            if (!cancelled) setRemaining(left);
          });
          if (cancelled) return;
          const refreshed = await readJson(
            await fetch(`/api/documents/${documentId}`)
          );
          setDocument(refreshed.document);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : 'Failed to load document'
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [documentId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, asking]);

  const ready = document?.status === 'ready';

  const handleAsk = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = question.trim();
    if (!text || asking || !ready) return;

    const history = messages.map(({ role, content }) => ({ role, content }));
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setQuestion('');
    setAsking(true);
    try {
      const answer: Answer = await readJson(
        await fetch(`/api/documents/${documentId}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: text, history }),
        })
      );
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: answer.answer, answer },
      ]);
    } catch (askError) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            askError instanceof Error
              ? askError.message
              : 'Something went wrong',
        },
      ]);
    } finally {
      setAsking(false);
    }
  };

  if (loadError) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <p className="text-red-600">{loadError}</p>
        <Link href="/documents" className="text-blue-600 text-sm">
          Back to documents
        </Link>
      </div>
    );
  }

  if (!document) {
    return <p className="px-4 py-10 text-gray-500">Loading…</p>;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col min-h-[calc(100vh-140px)]">
      <div className="mb-4">
        <Link
          href="/documents"
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          ← All documents
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">
          {document.title}
        </h1>
        <p className="text-sm text-gray-500">
          {document.page_count} pages · {document.strategy.replace('_', ' ')}
        </p>
      </div>

      {!ready && document.status !== 'failed' && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Preparing this document for questions
          {remaining !== null ? ` · ${remaining} chunks left to embed` : ''}.
        </div>
      )}
      {document.status === 'failed' && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          Processing failed: {document.error || 'unknown error'}
        </div>
      )}

      <div className="flex-1 space-y-4">
        {messages.length === 0 && ready && (
          <p className="text-sm text-gray-500">
            Ask a question about this document. Answers cite the passages they
            come from.
          </p>
        )}
        {messages.map((message, index) => (
          <MessageBubble key={index} message={message} />
        ))}
        {asking && (
          <p className="text-sm text-gray-500">Searching the document…</p>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleAsk} className="mt-6 flex gap-2 sticky bottom-4">
        <input
          type="text"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          disabled={!ready || asking}
          placeholder={
            ready
              ? 'Ask about this document'
              : 'Waiting for the document to be prepared'
          }
          className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm"
        />
        <button
          type="submit"
          disabled={!ready || asking || !question.trim()}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:bg-gray-300"
        >
          Ask
        </button>
      </form>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-lg bg-blue-600 px-4 py-2 text-sm text-white">
          {message.content}
        </p>
      </div>
    );
  }

  const answer = message.answer;
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <p className="whitespace-pre-wrap text-sm text-gray-900">
          {message.content}
        </p>

        {answer && answer.unverifiedNumbers.length > 0 && (
          <p className="mt-3 text-xs text-amber-700">
            Check these figures against the source:{' '}
            {answer.unverifiedNumbers.join(', ')}
          </p>
        )}
      </div>

      {answer && answer.citations.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Sources
          </p>
          {answer.citations.map((citation) => (
            <details
              key={citation.label}
              className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm"
            >
              <summary className="cursor-pointer text-gray-800">
                <span className="font-medium">{citation.label}</span> ·{' '}
                {citation.pages} ·{' '}
                <span className="text-gray-600">{citation.kind}</span>
                {citation.sectionPath && (
                  <span className="block text-xs text-gray-500">
                    {citation.sectionPath}
                  </span>
                )}
              </summary>
              <p className="mt-2 whitespace-pre-wrap text-gray-700">
                {citation.excerpt}
              </p>
            </details>
          ))}
        </div>
      )}

      {answer && answer.trace.length > 0 && (
        <details className="text-xs text-gray-500">
          <summary className="cursor-pointer">Retrieval trace</summary>
          <ul className="mt-2 space-y-1">
            {answer.trace.map((step, index) => (
              <li key={index}>
                <span className="font-mono">{step.step}</span> — {step.detail}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
