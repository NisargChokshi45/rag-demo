'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { embedUntilReady, readJson } from '@/lib/documents/client';

type Strategy = 'narrative' | 'long_structured' | 'element_rich';
type Status = 'processing' | 'embedding' | 'ready' | 'failed';

interface DocumentItem {
  id: string;
  title: string;
  strategy: Strategy;
  page_count: number;
  status: Status;
  error: string | null;
  created_at: string;
}

const STRATEGIES: Array<{
  value: Strategy;
  label: string;
  description: string;
}> = [
  {
    value: 'narrative',
    label: 'Narrative text',
    description: 'Plain prose reports. Paragraph windows with page numbers.',
  },
  {
    value: 'long_structured',
    label: 'Long, structured',
    description:
      'Chapters and sections. Section-aware retrieval for long reports.',
  },
  {
    value: 'element_rich',
    label: 'Tables, charts and footnotes',
    description:
      'Short visual reports. Tables, footnotes and captions are indexed separately.',
  },
];

const STATUS_STYLES: Record<Status, string> = {
  processing: 'bg-gray-100 text-gray-700',
  embedding: 'bg-amber-100 text-amber-800',
  ready: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
};

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [strategy, setStrategy] = useState<Strategy>('narrative');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    try {
      const body = await readJson(await fetch('/api/documents'));
      setDocuments(body.documents as DocumentItem[]);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Failed to load documents'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const handleUpload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) return;

    setBusy(true);
    setError(null);
    try {
      setMessage('Uploading PDF…');
      const { signedUrl, path } = await readJson(
        await fetch('/api/documents/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name }),
        })
      );

      const upload = await fetch(signedUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': 'application/pdf' },
      });
      if (!upload.ok) throw new Error('Failed to upload file to storage');

      setMessage('Parsing and chunking…');
      const { document } = await readJson(
        await fetch('/api/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storagePath: path, strategy, title }),
        })
      );

      await embedUntilReady(document.id, (remaining) =>
        setMessage(
          remaining > 0
            ? `Embedding… ${remaining} chunks left`
            : 'Finishing up…'
        )
      );

      setMessage('Ready to ask questions.');
      setFile(null);
      setTitle('');
      await loadDocuments();
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : 'Upload failed'
      );
      setMessage(null);
      await loadDocuments();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
        <p className="text-gray-600 mt-1">
          Upload a long PDF. It is parsed, chunked and embedded during upload,
          so it is ready to question as soon as the upload finishes.
        </p>
      </div>

      <form
        onSubmit={handleUpload}
        className="bg-surface rounded-lg border border-gray-200 p-6 shadow-sm space-y-5"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">PDF file</span>
            <input
              type="file"
              accept="application/pdf"
              disabled={busy}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-sm text-gray-700"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">
              Title (optional)
            </span>
            <input
              type="text"
              value={title}
              disabled={busy}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Derived from the file name"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-gray-700">
            Document shape
          </legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {STRATEGIES.map((option) => (
              <label
                key={option.value}
                className={`cursor-pointer rounded-lg border p-3 text-sm ${
                  strategy === option.value
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="strategy"
                  value={option.value}
                  checked={strategy === option.value}
                  disabled={busy}
                  onChange={() => setStrategy(option.value)}
                  className="sr-only"
                />
                <span className="font-semibold text-gray-900">
                  {option.label}
                </span>
                <span className="block text-gray-600 mt-1">
                  {option.description}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-4">
          <button
            type="submit"
            disabled={!file || busy}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:bg-gray-300"
          >
            {busy ? 'Processing…' : 'Upload and prepare'}
          </button>
          {message && <span className="text-sm text-gray-600">{message}</span>}
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      </form>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Your documents</h2>
        {loading ? (
          <p className="text-gray-500 text-sm">Loading…</p>
        ) : documents.length === 0 ? (
          <p className="text-gray-500 text-sm">No documents yet.</p>
        ) : (
          <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-surface">
            {documents.map((document) => (
              <li
                key={document.id}
                className="flex flex-wrap items-center justify-between gap-3 p-4"
              >
                <div>
                  <p className="font-medium text-gray-900">{document.title}</p>
                  <p className="text-xs text-gray-500">
                    {document.page_count} pages ·{' '}
                    {document.strategy.replace('_', ' ')}
                  </p>
                  {document.error && (
                    <p className="text-xs text-red-600 mt-1">
                      {document.error}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[document.status]}`}
                  >
                    {document.status}
                  </span>
                  <Link
                    href={`/documents/${document.id}`}
                    className="text-sm font-medium text-blue-600 hover:text-blue-800"
                  >
                    {document.status === 'ready' ? 'Ask questions' : 'Open'}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
