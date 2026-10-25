'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { Modal } from '../components/Modal';
import {
  Alert,
  Badge,
  buttonClass,
  EmptyState,
  PageHeader,
  SkeletonCards,
  Spinner,
} from '../components/ui';
import {
  CloseIcon,
  EyeIcon,
  GridIcon,
  ListIcon,
  ParsedDataIcon,
  PlusIcon,
  RefreshIcon,
  ScreenIcon,
} from '../icons';
import { reparsingDocuments, resumingDocuments } from '@/lib/client-progress';
import { embedUntilReady, readJson } from '@/lib/documents/client';

type Strategy = 'narrative' | 'long_structured' | 'element_rich';
type Status = 'processing' | 'embedding' | 'ready' | 'failed';
type UploadStatus =
  | 'pending'
  | 'uploading'
  | 'parsing'
  | 'embedding'
  | 'done'
  | 'paused'
  | 'error';

interface DocumentItem {
  id: string;
  title: string;
  strategy: Strategy;
  page_count: number;
  status: Status;
  error: string | null;
  retry_at: string | null;
  created_at: string;
}

interface UploadItem {
  id: string;
  file: File;
  title: string;
  status: UploadStatus;
  remaining?: number;
  error?: string;
}

interface DocumentChunk {
  id: string;
  chunk_index: number;
  kind: 'section' | 'text' | 'table' | 'footnote' | 'figure' | 'callout';
  section_path: string;
  page_start: number;
  page_end: number;
  content: string;
}

const CHUNK_KIND_LABEL: Record<
  DocumentChunk['kind'],
  { label: string; tone: 'neutral' | 'info' | 'accent' | 'success' | 'warning' }
> = {
  section: { label: 'Section', tone: 'accent' },
  text: { label: 'Text', tone: 'neutral' },
  table: { label: 'Table', tone: 'info' },
  footnote: { label: 'Footnote', tone: 'warning' },
  figure: { label: 'Figure', tone: 'success' },
  callout: { label: 'Callout', tone: 'accent' },
};

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

// A failed embedding is shown as "Paused". Its stored chunks are kept until
// Re-parse replaces them.
const DOCUMENT_STATUS: Record<
  Status,
  { label: string; tone: 'warning' | 'success' }
> = {
  processing: { label: 'Processing', tone: 'warning' },
  embedding: { label: 'Embedding', tone: 'warning' },
  ready: { label: 'Ready', tone: 'success' },
  failed: { label: 'Paused', tone: 'warning' },
};

const UPLOAD_STATUS: Record<
  UploadStatus,
  {
    label: string;
    tone: 'neutral' | 'info' | 'accent' | 'success' | 'warning' | 'danger';
  }
> = {
  pending: { label: 'Waiting', tone: 'neutral' },
  uploading: { label: 'Uploading', tone: 'info' },
  parsing: { label: 'Parsing', tone: 'accent' },
  embedding: { label: 'Embedding', tone: 'accent' },
  done: { label: 'Ready', tone: 'success' },
  paused: { label: 'Paused', tone: 'warning' },
  error: { label: 'Failed', tone: 'danger' },
};

const labelClass = 'mb-1.5 block text-sm font-medium text-slate-700';
const iconButtonClass =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50';

const strategyLabel = (strategy: Strategy) =>
  STRATEGIES.find((option) => option.value === strategy)?.label ?? strategy;

const titleFromFilename = (filename: string) => filename.replace(/\.pdf$/i, '');

const formatCountdown = (milliseconds: number) => {
  const totalSeconds = Math.ceil(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  if (hours > 0) return `${hours}h ${pad(minutes)}m ${pad(seconds)}s`;
  if (minutes > 0) return `${minutes}m ${pad(seconds)}s`;
  return `${seconds}s`;
};

// Counts down to the time Gemini's embedding quota resets. The clock runs in
// the browser, but the target time is stored on the document, so a reload
// shows the same deadline.
function QuotaCountdown({ retryAt }: { retryAt: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const remaining = new Date(retryAt).getTime() - now;
  if (remaining <= 0) {
    return 'Embedding quota should be available again. Resume to finish indexing.';
  }
  return `Embedding quota reached. Retry in ${formatCountdown(remaining)}.`;
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'title' | 'newest' | 'oldest'>('newest');

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [queue, setQueue] = useState<UploadItem[]>([]);
  const [queueNotice, setQueueNotice] = useState<string | null>(null);
  const [strategy, setStrategy] = useState<Strategy>('narrative');
  const [isUploading, setIsUploading] = useState(false);
  const [pdfView, setPdfView] = useState<{
    title: string;
    pdfUrl: string;
  } | null>(null);
  const [parsedView, setParsedView] = useState<{
    title: string;
    chunks: DocumentChunk[];
  } | null>(null);
  const [loadingViewId, setLoadingViewId] = useState<string | null>(null);
  /* const [reparseProgress, setReparseProgress] = useState<{
    done: number;
    total: number;
  } | null>(null); */
  const [reparseTarget, setReparseTarget] = useState<DocumentItem | null>(null);
  const reparsing = useSyncExternalStore(
    reparsingDocuments.subscribe,
    reparsingDocuments.getSnapshot,
    reparsingDocuments.getSnapshot
  );
  const resuming = useSyncExternalStore(
    resumingDocuments.subscribe,
    resumingDocuments.getSnapshot,
    resumingDocuments.getSnapshot
  );
  // One document at a time: a re-parse or resume blocks every other action.
  const busy = reparsing.size > 0 || resuming.size > 0;

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [searchQuery]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      search: debouncedSearchQuery,
      sort: sortBy,
    });

    setIsLoading(true);
    fetch(`/api/documents?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(readJson)
      .then((body) => {
        setDocuments(body.documents as DocumentItem[]);
        setError(null);
      })
      .catch((loadError: Error) => {
        if (loadError.name !== 'AbortError') setError(loadError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
          setHasLoadedOnce(true);
        }
      });

    return () => controller.abort();
  }, [debouncedSearchQuery, sortBy, reloadKey]);

  const hasSearch = debouncedSearchQuery !== '';
  const pendingCount = queue.filter((item) => item.status === 'pending').length;
  const hasFinished =
    queue.length > 0 &&
    queue.every((item) => ['done', 'paused', 'error'].includes(item.status));

  const openUploadModal = () => {
    setQueue([]);
    setQueueNotice(null);
    setShowUploadModal(true);
  };

  const closeUploadModal = () => {
    if (isUploading) return;
    setShowUploadModal(false);
    setQueue([]);
    setQueueNotice(null);
  };

  const addFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length === 0) return;

    const pdfs = files.filter(
      (file) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
    );
    const skipped = files.length - pdfs.length;
    setQueueNotice(
      skipped > 0
        ? `${skipped} ${skipped === 1 ? 'file was' : 'files were'} skipped because ${skipped === 1 ? 'it is' : 'they are'} not PDFs.`
        : null
    );

    setQueue((current) => [
      ...current,
      ...pdfs.map((file) => ({
        id: `${file.name}-${Math.random().toString(36).slice(2)}`,
        file,
        title: titleFromFilename(file.name),
        status: 'pending' as const,
      })),
    ]);
  };

  const updateItem = (id: string, patch: Partial<UploadItem>) => {
    setQueue((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  };

  const uploadItem = async (item: UploadItem) => {
    // Once the document row exists, an embedding error pauses it (re-parse it
    // from the list) instead of failing the upload.
    let documentId: string | null = null;
    try {
      updateItem(item.id, { status: 'uploading', error: undefined });
      const { signedUrl, path } = await readJson(
        await fetch('/api/documents/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: item.file.name }),
        })
      );

      const upload = await fetch(signedUrl, {
        method: 'PUT',
        body: item.file,
        headers: { 'Content-Type': 'application/pdf' },
      });
      if (!upload.ok) throw new Error('Failed to upload file to storage');

      updateItem(item.id, { status: 'parsing' });
      const { document } = await readJson(
        await fetch('/api/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storagePath: path,
            strategy,
            title: item.title.trim() || undefined,
          }),
        })
      );

      documentId = document.id;
      updateItem(item.id, { status: 'embedding' });
      await embedUntilReady(document.id, (remaining) =>
        updateItem(item.id, { remaining })
      );

      updateItem(item.id, { status: 'done', remaining: 0 });
    } catch (uploadError) {
      const message =
        uploadError instanceof Error ? uploadError.message : 'Upload failed';
      updateItem(item.id, {
        status: documentId ? 'paused' : 'error',
        error: message,
      });
    }
  };

  // Re-parses one document and then embeds its chunks, one embed call at a
  // time, so each document stays within the embedding API's rate limits.
  const reparseOne = async (
    document: DocumentItem,
    onProgress?: (remaining: number) => void
  ) => {
    await readJson(
      await fetch(`/api/documents/${document.id}/reparse`, {
        method: 'POST',
      })
    );
    await embedUntilReady(document.id, onProgress);
  };

  // Embeds the chunks already stored for a paused or stuck document. Nothing is
  // re-parsed, so only the chunks still pending use embedding quota.
  const resumeDocument = async (document: DocumentItem) => {
    resumingDocuments.set(document.id, null);
    setError(null);
    try {
      await embedUntilReady(document.id, (remaining) =>
        resumingDocuments.set(document.id, remaining)
      );
    } catch (resumeError) {
      const message =
        resumeError instanceof Error ? resumeError.message : 'Resume failed';
      setError(`Resume did not finish for ${document.title}: ${message}`);
    } finally {
      resumingDocuments.remove(document.id);
      setReloadKey((key) => key + 1);
    }
  };

  const confirmReparseDocument = async (document: DocumentItem) => {
    setReparseTarget(null);
    reparsingDocuments.set(document.id, null);
    setError(null);
    try {
      await reparseOne(document, (remaining) =>
        reparsingDocuments.set(document.id, remaining)
      );
    } catch (reparseError) {
      const message =
        reparseError instanceof Error
          ? reparseError.message
          : 'Re-parse failed';
      setError(`Re-parse did not finish for ${document.title}: ${message}`);
    } finally {
      reparsingDocuments.remove(document.id);
      setReloadKey((key) => key + 1);
    }
  };

  /* const reparseAll = async () => {
    const confirmed = window.confirm(
      'Re-parse every document with its current document shape? Existing chunks are replaced and every chunk is embedded again, which uses embedding quota.'
    );
    if (!confirmed) return;

    const failures: string[] = [];
    try {
      const body = await readJson(await fetch('/api/documents'));
      const all = body.documents as DocumentItem[];
      setReparseProgress({ done: 0, total: all.length });

      // Sequential, like uploads: each document is parsed and embedded in turn.
      for (const [index, document] of all.entries()) {
        try {
          await reparseOne(document);
        } catch (reparseError) {
          const message =
            reparseError instanceof Error
              ? reparseError.message
              : 'Re-parse failed';
          failures.push(`${document.title}: ${message}`);
        }
        setReparseProgress({ done: index + 1, total: all.length });
      }
    } catch (listError) {
      failures.push(
        listError instanceof Error
          ? listError.message
          : 'Unable to list documents'
      );
    } finally {
      setReparseProgress(null);
      setReloadKey((key) => key + 1);
      setError(
        failures.length > 0
          ? `Re-parse did not finish for ${failures.length} ${failures.length === 1 ? 'item' : 'items'}: ${failures.join('; ')}`
          : null
      );
    }
  }; */

  const handleUpload = async (event: React.FormEvent) => {
    event.preventDefault();
    const pending = queue.filter((item) => item.status === 'pending');
    if (pending.length === 0 || isUploading) return;

    setIsUploading(true);
    // Sequential on purpose: each document is parsed and embedded in turn to
    // stay within the embedding API's free-tier rate limits.
    for (const item of pending) {
      await uploadItem(item);
    }
    setIsUploading(false);
    setReloadKey((key) => key + 1);
  };

  const viewDocument = async (document: DocumentItem) => {
    setLoadingViewId(document.id);
    try {
      const body = await readJson(
        await fetch(`/api/documents/${document.id}?view=pdf`)
      );
      setPdfView({ title: document.title, pdfUrl: body.pdfUrl });
    } catch (viewError) {
      setError(
        viewError instanceof Error ? viewError.message : 'Unable to open PDF'
      );
    } finally {
      setLoadingViewId(null);
    }
  };

  const viewParsedDocument = async (document: DocumentItem) => {
    setLoadingViewId(document.id);
    try {
      const body = await readJson(
        await fetch(`/api/documents/${document.id}?view=parsed`)
      );
      setParsedView({
        title: document.title,
        chunks: (body.chunks || []) as DocumentChunk[],
      });
    } catch (viewError) {
      setError(
        viewError instanceof Error
          ? viewError.message
          : 'Unable to load parsed document'
      );
    } finally {
      setLoadingViewId(null);
    }
  };

  return (
    <div className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <PageHeader
          title="Documents"
          description={
            hasLoadedOnce
              ? `${documents.length} ${documents.length === 1 ? 'document' : 'documents'} uploaded`
              : 'Loading documents…'
          }
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {/* <button
                type="button"
                onClick={reparseAll}
                disabled={
                  reparseProgress !== null ||
                  isUploading ||
                  reparsing.size > 0 ||
                  documents.length === 0
                }
                title="Re-parse every document with its current document shape"
                className={buttonClass('secondary', 'md')}
              >
                {reparseProgress !== null && (
                  <Spinner className="h-4 w-4 border-slate-500" />
                )}
                {reparseProgress
                  ? `Re-parsing ${reparseProgress.done}/${reparseProgress.total}…`
                  : 'Re-parse all'}
              </button> */}
              <button
                type="button"
                onClick={openUploadModal}
                disabled={busy}
                className={buttonClass('primary', 'md')}
              >
                <PlusIcon className="h-4 w-4 fill-none stroke-current stroke-2" />
                Add Document
              </button>
              {documents.length > 0 ? (
                <Link href="/screen" className={buttonClass('success', 'md')}>
                  <ScreenIcon />
                  Screen Documents
                </Link>
              ) : (
                <button
                  type="button"
                  disabled
                  title="Add documents before screening"
                  className={buttonClass('success', 'md')}
                >
                  <ScreenIcon />
                  Screen Documents
                </button>
              )}
            </div>
          }
        />

        <Modal
          open={showUploadModal}
          onClose={closeUploadModal}
          locked={isUploading}
          size="lg"
          title="Add Documents"
          description="Upload one or more PDFs. Each file is parsed, chunked and embedded, so it is ready to question as soon as its upload finishes."
          footer={
            <>
              <button
                type="button"
                onClick={closeUploadModal}
                disabled={isUploading}
                className={buttonClass('secondary', 'md', 'sm:w-auto')}
              >
                {hasFinished ? 'Done' : 'Cancel'}
              </button>
              {!hasFinished && (
                <button
                  type="submit"
                  form="document-form"
                  disabled={pendingCount === 0 || isUploading}
                  className={buttonClass('primary', 'md', 'sm:min-w-40')}
                >
                  {isUploading && <Spinner className="h-4 w-4 border-white" />}
                  {isUploading
                    ? 'Processing…'
                    : `Upload ${pendingCount} ${pendingCount === 1 ? 'document' : 'documents'}`}
                </button>
              )}
            </>
          }
        >
          <form
            id="document-form"
            onSubmit={handleUpload}
            className="space-y-6"
          >
            <div>
              <label htmlFor="document-input" className={labelClass}>
                PDF files
              </label>
              <input
                id="document-input"
                type="file"
                multiple
                accept=".pdf,application/pdf"
                onChange={addFiles}
                disabled={isUploading}
                className="sr-only"
              />
              <label
                htmlFor="document-input"
                className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2 ${
                  isUploading
                    ? 'cursor-not-allowed border-slate-300 bg-slate-50 text-slate-400'
                    : 'border-slate-300 text-slate-600 hover:border-blue-400 hover:bg-blue-50/50 hover:text-blue-700'
                }`}
              >
                <span aria-hidden="true" className="text-3xl">
                  📄
                </span>
                <span className="font-medium">
                  {isUploading ? 'Upload in progress…' : 'Click to select PDFs'}
                </span>
                <span className="text-sm text-slate-500">
                  You can select several documents at once
                </span>
              </label>
              {queueNotice && (
                <p className="mt-2 text-sm text-amber-700">{queueNotice}</p>
              )}
            </div>

            <fieldset className="space-y-2">
              <legend className={labelClass}>Document shape</legend>
              <div className="grid gap-3 sm:grid-cols-3">
                {STRATEGIES.map((option) => (
                  <label
                    key={option.value}
                    className={`cursor-pointer rounded-lg border p-3 text-sm transition ${
                      strategy === option.value
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-slate-200 hover:border-slate-300'
                    } ${isUploading ? 'cursor-not-allowed opacity-60' : ''}`}
                  >
                    <input
                      type="radio"
                      name="strategy"
                      value={option.value}
                      checked={strategy === option.value}
                      disabled={isUploading}
                      onChange={() => setStrategy(option.value)}
                      className="sr-only"
                    />
                    <span className="font-semibold text-slate-900">
                      {option.label}
                    </span>
                    <span className="mt-1 block text-slate-600">
                      {option.description}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {queue.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-900">
                  Selected documents
                </h3>
                <ul className="space-y-2" aria-live="polite">
                  {queue.map((item) => {
                    const config = UPLOAD_STATUS[item.status];
                    const canEdit = item.status === 'pending' && !isUploading;
                    return (
                      <li
                        key={item.id}
                        className="space-y-2.5 rounded-lg border border-slate-200 p-3.5"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="min-w-0 truncate text-sm font-medium text-slate-900">
                            {item.file.name}
                          </span>
                          <div className="flex shrink-0 items-center gap-2">
                            <Badge tone={config.tone}>
                              {item.status === 'embedding' &&
                              item.remaining !== undefined &&
                              item.remaining > 0
                                ? `${item.remaining} chunks left`
                                : config.label}
                            </Badge>
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() =>
                                  setQueue((current) =>
                                    current.filter(
                                      (entry) => entry.id !== item.id
                                    )
                                  )
                                }
                                className={iconButtonClass}
                                aria-label={`Remove ${item.file.name}`}
                                title="Remove"
                              >
                                <CloseIcon className="h-4 w-4 fill-none stroke-current stroke-2" />
                              </button>
                            )}
                          </div>
                        </div>
                        {canEdit ? (
                          <input
                            type="text"
                            value={item.title}
                            onChange={(event) =>
                              updateItem(item.id, { title: event.target.value })
                            }
                            aria-label={`Title for ${item.file.name}`}
                            placeholder="Document title"
                            className="field"
                          />
                        ) : (
                          <p className="truncate text-sm text-slate-600">
                            {item.title || titleFromFilename(item.file.name)}
                          </p>
                        )}
                        {item.status === 'paused' && (
                          <p className="text-sm text-amber-800">
                            {item.error} Find this document in the list and
                            press Resume.
                          </p>
                        )}
                        {item.status === 'error' && (
                          <p className="text-sm text-red-600">{item.error}</p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </form>
        </Modal>

        <Modal
          open={Boolean(pdfView)}
          onClose={() => setPdfView(null)}
          size="xl"
          title={`Document: ${pdfView?.title ?? ''}`}
          footer={
            <a
              href={pdfView?.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass('secondary', 'md', 'sm:w-auto')}
            >
              Open in new tab
            </a>
          }
        >
          {pdfView && (
            <iframe
              src={pdfView.pdfUrl}
              title={`Document PDF: ${pdfView.title}`}
              className="h-[65vh] min-h-[360px] w-full rounded-lg border border-slate-200"
            />
          )}
        </Modal>

        <Modal
          open={Boolean(parsedView)}
          onClose={() => setParsedView(null)}
          size="lg"
          title={`Parsed document: ${parsedView?.title ?? ''}`}
          description="Chunks in reading order, exactly as they were stored during parsing."
        >
          {parsedView && parsedView.chunks.length > 0 ? (
            <ol className="space-y-3">
              {parsedView.chunks.map((chunk) => {
                const kind = CHUNK_KIND_LABEL[chunk.kind];
                return (
                  <li
                    key={chunk.id}
                    className="space-y-2 rounded-lg border border-slate-200 p-3.5"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="font-medium text-slate-700">
                        #{chunk.chunk_index + 1}
                      </span>
                      <Badge tone={kind.tone}>{kind.label}</Badge>
                      <span>
                        {chunk.page_start === chunk.page_end
                          ? `Page ${chunk.page_start}`
                          : `Pages ${chunk.page_start}–${chunk.page_end}`}
                      </span>
                      {chunk.section_path && (
                        <span className="min-w-0 truncate">
                          {chunk.section_path}
                        </span>
                      )}
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
                      {chunk.content}
                    </p>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="text-sm text-slate-600">
              No parsed text is available for this document.
            </p>
          )}
        </Modal>

        <Modal
          open={reparseTarget !== null}
          onClose={() => setReparseTarget(null)}
          size="md"
          title="Re-parse document"
          description="Its chunks are replaced and embedded again, which uses embedding quota."
          footer={
            <>
              <button
                type="button"
                onClick={() => setReparseTarget(null)}
                className={buttonClass('secondary', 'md', 'sm:w-auto')}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  reparseTarget && confirmReparseDocument(reparseTarget)
                }
                className={buttonClass('primary', 'md', 'sm:min-w-40')}
              >
                Re-parse
              </button>
            </>
          }
        >
          {reparseTarget && (
            <div className="space-y-2 text-sm text-slate-700">
              <p>
                Re-parse{' '}
                <span className="font-semibold">{reparseTarget.title}</span>{' '}
                with its current document shape:{' '}
                <span className="font-medium">
                  {strategyLabel(reparseTarget.strategy)}
                </span>
                .
              </p>
              <p className="text-slate-600">
                The stored PDF is parsed again before the old chunks are
                replaced, so a failed parse keeps the existing content.
              </p>
            </div>
          )}
        </Modal>

        {error && <Alert tone="error">{error}</Alert>}

        <section
          aria-label="Document filters"
          className="rounded-xl border border-slate-200 bg-surface p-4 shadow-card sm:p-5"
        >
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_11rem_auto] md:items-end">
            <div className="min-w-0">
              <label htmlFor="document-search" className={labelClass}>
                Search documents
              </label>
              <input
                id="document-search"
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by title"
                className="field"
              />
            </div>
            <div>
              <label htmlFor="document-sort" className={labelClass}>
                Sort by
              </label>
              <select
                id="document-sort"
                value={sortBy}
                onChange={(event) =>
                  setSortBy(event.target.value as typeof sortBy)
                }
                className="select-control"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="title">Title A-Z</option>
              </select>
            </div>
            <div
              className="flex h-[42px] items-center gap-1 self-end rounded-lg border border-slate-300 p-1"
              role="group"
              aria-label="Document view"
            >
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                aria-pressed={viewMode === 'grid'}
                aria-label="Grid view"
                title="Grid view"
                className={`inline-flex h-7 w-8 items-center justify-center rounded-md transition ${viewMode === 'grid' ? 'bg-inverse text-inverse-fg' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                <GridIcon />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                aria-pressed={viewMode === 'list'}
                aria-label="List view"
                title="List view"
                className={`inline-flex h-7 w-8 items-center justify-center rounded-md transition ${viewMode === 'list' ? 'bg-inverse text-inverse-fg' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                <ListIcon />
              </button>
            </div>
          </div>
        </section>

        <section aria-live="polite" aria-busy={isLoading}>
          {!hasLoadedOnce && isLoading ? (
            <SkeletonCards count={4} />
          ) : documents.length === 0 ? (
            <EmptyState
              icon={
                <PlusIcon className="h-6 w-6 fill-none stroke-current stroke-2" />
              }
              title={hasSearch ? 'No matching documents' : 'No documents yet'}
              description={
                hasSearch
                  ? 'Try a different title or clear the search.'
                  : 'Add a PDF to start asking questions about it.'
              }
              action={
                hasSearch ? undefined : (
                  <button
                    type="button"
                    onClick={openUploadModal}
                    className={buttonClass('primary', 'sm')}
                  >
                    <PlusIcon className="h-4 w-4 fill-none stroke-current stroke-2" />
                    Add your first document
                  </button>
                )
              }
            />
          ) : (
            <div
              className={
                viewMode === 'grid'
                  ? 'grid gap-4 md:grid-cols-2'
                  : 'flex flex-col gap-3'
              }
            >
              {documents.map((document) => {
                const status = DOCUMENT_STATUS[document.status];
                const inProgress =
                  document.status === 'processing' ||
                  document.status === 'embedding';
                const isPaused = document.status === 'failed';
                const isReparsing = reparsing.has(document.id);
                const reparseRemaining = reparsing.get(document.id);
                const isResuming = resuming.has(document.id);
                const resumeRemaining = resuming.get(document.id);
                // Resume reuses the stored chunks, so it fits any document that
                // is paused or was left mid-embedding.
                const showResume =
                  !isReparsing &&
                  (isResuming ||
                    document.status === 'failed' ||
                    document.status === 'embedding');
                const reparseDisabled = isUploading || busy;
                return (
                  <article
                    key={document.id}
                    className={`flex flex-col rounded-xl border shadow-card transition hover:shadow-card-hover ${
                      isReparsing || isResuming
                        ? 'border-blue-200 bg-blue-50'
                        : inProgress || isPaused
                          ? 'border-amber-200 bg-amber-50'
                          : 'border-slate-200 bg-surface'
                    } ${viewMode === 'list' ? 'p-4 sm:p-5' : 'p-5 sm:p-6'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-semibold text-slate-900">
                          {document.title}
                        </h3>
                        <p className="mt-1 text-sm text-slate-600">
                          {document.page_count}{' '}
                          {document.page_count === 1 ? 'page' : 'pages'} ·{' '}
                          {strategyLabel(document.strategy)}
                        </p>
                      </div>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </div>

                    {isPaused && (
                      <p className="mt-3 line-clamp-3 text-sm text-amber-800">
                        {document.retry_at ? (
                          <QuotaCountdown retryAt={document.retry_at} />
                        ) : (
                          document.error ||
                          'Embedding paused. Resume to finish indexing.'
                        )}
                      </p>
                    )}

                    <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => viewDocument(document)}
                          disabled={loadingViewId === document.id}
                          className={buttonClass('primary', 'sm')}
                        >
                          {loadingViewId === document.id ? (
                            <Spinner className="h-3 w-3 border-white" />
                          ) : (
                            <EyeIcon />
                          )}
                          Document
                        </button>
                        <button
                          type="button"
                          onClick={() => viewParsedDocument(document)}
                          disabled={loadingViewId === document.id}
                          className={buttonClass('secondary', 'sm')}
                        >
                          <ParsedDataIcon />
                          Parsed document
                        </button>
                        {showResume && (
                          <button
                            type="button"
                            onClick={() => resumeDocument(document)}
                            disabled={isUploading || busy}
                            title="Embed the chunks that are still pending. Nothing is re-parsed."
                            className={buttonClass('primary', 'sm')}
                          >
                            {isResuming ? (
                              <>
                                <Spinner className="h-3 w-3 border-white" />
                                {(resumeRemaining ?? 0) > 0
                                  ? `${resumeRemaining} chunks left`
                                  : 'Resuming…'}
                              </>
                            ) : (
                              <>
                                <RefreshIcon />
                                Resume
                              </>
                            )}
                          </button>
                        )}
                        {!showResume && (
                          <button
                            type="button"
                            onClick={() => setReparseTarget(document)}
                            disabled={reparseDisabled}
                            title="Re-parse this document with its current document shape"
                            className={buttonClass(
                              'secondary',
                              'sm',
                              'text-blue-700'
                            )}
                          >
                            {isReparsing ? (
                              <>
                                <Spinner className="h-3 w-3 border-blue-500" />
                                {(reparseRemaining ?? 0) > 0
                                  ? `${reparseRemaining} chunks left`
                                  : 'Re-parsing…'}
                              </>
                            ) : (
                              <>
                                <RefreshIcon />
                                Re-parse
                              </>
                            )}
                          </button>
                        )}
                      </div>
                      {/* <div className="flex items-center justify-center gap-3">
                        <time
                          dateTime={document.created_at}
                          className="text-xs text-slate-500"
                        >
                          {new Date(document.created_at).toLocaleDateString()}
                        </time>
                      </div> */}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          {isLoading && hasLoadedOnce && (
            <p className="mt-4 flex items-center gap-2 text-sm text-slate-500">
              <Spinner className="h-3.5 w-3.5 border-slate-400" />
              Updating results…
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
