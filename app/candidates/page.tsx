'use client';

import { useEffect, useRef, useState } from 'react';
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
import { GridIcon, ListIcon, PlusIcon, ScreenIcon } from '../icons';

interface UploadProgress {
  filename: string;
  status: 'pending' | 'uploading' | 'ingesting' | 'done' | 'error';
  progress?: number;
  error?: string;
}

interface Candidate {
  id: string;
  name: string;
  role_guess: string;
  original_filename: string;
  chunk_count: number;
  score?: number | null;
  needsRescore?: boolean;
}

interface Job {
  id: string;
  title: string;
}

const labelClass = 'mb-1.5 block text-sm font-medium text-slate-700';

const UPLOAD_STATUS: Record<
  UploadProgress['status'],
  { label: string; tone: 'neutral' | 'info' | 'accent' | 'success' | 'danger' }
> = {
  pending: { label: 'Waiting', tone: 'neutral' },
  uploading: { label: 'Uploading', tone: 'info' },
  ingesting: { label: 'Processing', tone: 'accent' },
  done: { label: 'Complete', tone: 'success' },
  error: { label: 'Failed', tone: 'danger' },
};

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [resume, setResume] = useState<{
    name: string;
    pdfUrl: string;
  } | null>(null);
  const [parsedResume, setParsedResume] = useState<{
    name: string;
    text: string;
  } | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'indexed' | 'not-indexed'
  >('all');
  const [sortBy, setSortBy] = useState<'name' | 'role' | 'indexed' | 'score'>(
    'name'
  );
  const [hasLoadedCandidates, setHasLoadedCandidates] = useState(false);
  const [rescoreLoading, setRescoreLoading] = useState<Set<string>>(new Set());
  const candidatesRequestId = useRef(0);

  const fetchCandidates = async () => {
    if (selectedJobId === null) return;

    const requestId = ++candidatesRequestId.current;
    const params = new URLSearchParams({
      status: statusFilter,
      sort: sortBy === 'score' ? 'name' : sortBy,
    });
    if (selectedJobId) params.set('jobId', selectedJobId);
    if (debouncedSearchQuery.trim())
      params.set('search', debouncedSearchQuery.trim());

    try {
      const response = await fetch(`/api/candidates?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch candidates');
      let data = await response.json();
      if (requestId !== candidatesRequestId.current) return;

      let candidates = data.candidates || [];
      if (sortBy === 'score') {
        candidates.sort(
          (a: Candidate, b: Candidate) => (b.score ?? -1) - (a.score ?? -1)
        );
      }

      setCandidates(candidates);
    } catch (err) {
      if (requestId !== candidatesRequestId.current) return;
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      if (requestId !== candidatesRequestId.current) return;
      setLoading(false);
      setHasLoadedCandidates(true);
    }
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [searchQuery]);

  useEffect(() => {
    fetchCandidates();
  }, [debouncedSearchQuery, selectedJobId, sortBy, statusFilter]);

  useEffect(() => {
    const fetchJobs = async () => {
      const jobId = new URLSearchParams(window.location.search).get('jobId');
      setSelectedJobId(jobId || '');

      try {
        const response = await fetch('/api/jobs');
        const data = await response.json();
        if (response.ok) {
          setJobs(data.jobs || []);
        }
      } catch (err) {
        console.error('Failed to fetch jobs:', err);
        setJobs([]);
      }
    };

    fetchJobs();
  }, []);

  const handleJobChange = (jobId: string) => {
    setSelectedJobId(jobId);
    const url = new URL(window.location.href);
    if (jobId) {
      url.searchParams.set('jobId', jobId);
    } else {
      url.searchParams.delete('jobId');
    }
    window.history.replaceState(null, '', url.toString());
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setIsUploading(true);
    const newProgress: UploadProgress[] = files.map((f) => ({
      filename: f.name,
      status: 'pending',
    }));
    setUploadProgress(newProgress);

    const uploadResults = await Promise.all(
      files.map(async (file, i) => {
        try {
          // Update to uploading
          setUploadProgress((prev) =>
            prev.map((p, idx) =>
              idx === i ? { ...p, status: 'uploading', progress: 0 } : p
            )
          );

          // Get signed upload URL
          const urlResponse = await fetch('/api/upload-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: file.name }),
          });

          if (!urlResponse.ok) {
            throw new Error('Failed to get upload URL');
          }

          const { signedUrl, path } = await urlResponse.json();

          // Upload to Supabase Storage using signed URL
          const uploadResponse = await fetch(signedUrl, {
            method: 'PUT',
            body: file,
            headers: { 'Content-Type': 'application/pdf' },
          });

          if (!uploadResponse.ok) {
            throw new Error('Failed to upload file to storage');
          }

          // Update to ingesting
          setUploadProgress((prev) =>
            prev.map((p, idx) =>
              idx === i ? { ...p, status: 'ingesting', progress: 50 } : p
            )
          );

          // Trigger ingestion
          const ingestResponse = await fetch('/api/ingest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              storagePath: path,
              jobDescription: '',
              jobId: selectedJobId || undefined,
            }),
          });

          if (!ingestResponse.ok) {
            const errorData = await ingestResponse.json();
            throw new Error(errorData.error || 'Ingestion failed');
          }

          await ingestResponse.json();

          // Mark as done
          setUploadProgress((prev) =>
            prev.map((p, idx) =>
              idx === i
                ? {
                    ...p,
                    status: 'done',
                    progress: 100,
                  }
                : p
            )
          );
          return true;
        } catch (error) {
          setUploadProgress((prev) =>
            prev.map((p, idx) =>
              idx === i
                ? {
                    ...p,
                    status: 'error',
                    error:
                      error instanceof Error ? error.message : 'Unknown error',
                  }
                : p
            )
          );
          return false;
        }
      })
    );

    setIsUploading(false);

    // Refresh candidates list after upload
    const hasErrors = uploadResults.some((result) => !result);
    if (!hasErrors) {
      setTimeout(() => {
        fetchCandidates();
        setShowUploadModal(false);
        setUploadProgress([]);
      }, 2000);
    }
  };

  const selectedJob = jobs.find((job) => job.id === selectedJobId);

  const viewResume = async (candidate: Candidate) => {
    try {
      const response = await fetch(
        `/api/candidates/${candidate.id}?view=resume`
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load resume');
      setResume({
        name: candidate.name,
        pdfUrl: data.pdfUrl,
      });
    } catch (resumeError) {
      setError(
        resumeError instanceof Error
          ? resumeError.message
          : 'Unable to load resume'
      );
    }
  };

  const viewParsedResume = async (candidate: Candidate) => {
    try {
      const response = await fetch(
        `/api/candidates/${candidate.id}?view=resume`
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || 'Unable to load parsed resume');
      setParsedResume({
        name: candidate.name,
        text: data.resume || '',
      });
    } catch (resumeError) {
      setError(
        resumeError instanceof Error
          ? resumeError.message
          : 'Unable to load parsed resume'
      );
    }
  };

  const rescoreCandidate = async (candidate: Candidate) => {
    setRescoreLoading((prev) => new Set([...prev, candidate.id]));
    try {
      const response = await fetch(`/api/candidates/${candidate.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rescore' }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.upToDate) {
          setCandidates((prev) =>
            prev.map((c) =>
              c.id === candidate.id ? { ...c, needsRescore: false } : c
            )
          );
          setError(null);
        } else {
          throw new Error(data.error || 'Failed to rescore candidate');
        }
        return;
      }

      const { score } = data;
      setCandidates((prev) =>
        prev.map((c) =>
          c.id === candidate.id ? { ...c, score, needsRescore: false } : c
        )
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to rescore candidate'
      );
    } finally {
      setRescoreLoading((prev) => {
        const next = new Set(prev);
        next.delete(candidate.id);
        return next;
      });
    }
  };

  const closeUploadModal = () => {
    setShowUploadModal(false);
    setUploadProgress([]);
  };

  const hasFilters =
    debouncedSearchQuery.trim() !== '' ||
    statusFilter !== 'all' ||
    (selectedJobId ?? '') !== '';

  return (
    <div className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <PageHeader
          title="Candidates on the Platform"
          description={
            selectedJob
              ? `Candidates for ${selectedJob.title}`
              : `${candidates.length} ${
                  candidates.length === 1 ? 'candidate' : 'candidates'
                } ingested`
          }
          actions={
            <>
              <button
                type="button"
                onClick={() => setShowUploadModal(true)}
                className={buttonClass('primary', 'md')}
              >
                <PlusIcon className="h-4 w-4 fill-none stroke-current stroke-2" />
                Upload Resumes
              </button>
              {candidates.length > 0 ? (
                <Link
                  href={
                    selectedJobId
                      ? `/screen?jobId=${encodeURIComponent(selectedJobId)}`
                      : '/screen'
                  }
                  className={buttonClass('success', 'md')}
                >
                  <ScreenIcon />
                  Screen Candidates
                </Link>
              ) : (
                <button
                  type="button"
                  disabled
                  title="Upload resumes before screening"
                  className={buttonClass('success', 'md')}
                >
                  <ScreenIcon />
                  Screen Candidates
                </button>
              )}
            </>
          }
        />

        <Modal
          open={showUploadModal}
          onClose={closeUploadModal}
          locked={isUploading}
          size="lg"
          title="Upload Resumes"
          description="Select one or more PDF resumes. Each file is parsed, embedded and added to the selected role."
          footer={
            <button
              type="button"
              onClick={closeUploadModal}
              disabled={isUploading}
              className={buttonClass('secondary', 'md', 'sm:w-auto')}
            >
              {uploadProgress.length > 0 && !isUploading ? 'Done' : 'Close'}
            </button>
          }
        >
          <div className="space-y-6">
            <div>
              <label htmlFor="resume-input" className={labelClass}>
                Resume files (PDF)
              </label>
              <input
                type="file"
                multiple
                accept=".pdf,application/pdf"
                onChange={handleFileSelect}
                disabled={isUploading}
                className="sr-only"
                id="resume-input"
              />
              <label
                htmlFor="resume-input"
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
                  {isUploading
                    ? 'Upload in progress…'
                    : 'Click to select PDF files'}
                </span>
                <span className="text-sm text-slate-500">
                  You can select several resumes at once
                </span>
              </label>
            </div>

            {uploadProgress.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-900">
                  Upload progress
                </h3>
                <ul className="space-y-2" aria-live="polite">
                  {uploadProgress.map((item, idx) => {
                    const config = UPLOAD_STATUS[item.status];
                    return (
                      <li
                        key={`${item.filename}-${idx}`}
                        className="rounded-lg border border-slate-200 p-3.5"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="min-w-0 truncate text-sm font-medium text-slate-900">
                            {item.filename}
                          </span>
                          <Badge tone={config.tone}>{config.label}</Badge>
                        </div>
                        {item.status === 'error' && (
                          <p className="mt-2 text-sm text-red-600">
                            {item.error}
                          </p>
                        )}
                        {item.progress !== undefined &&
                          item.status !== 'error' && (
                            <div
                              className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200"
                              role="progressbar"
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={item.progress}
                              aria-label={`Upload progress for ${item.filename}`}
                            >
                              <div
                                className="h-full rounded-full bg-blue-600 transition-all duration-300"
                                style={{ width: `${item.progress}%` }}
                              />
                            </div>
                          )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </Modal>

        {loading && !hasLoadedCandidates && <SkeletonCards count={4} />}

        {error && (
          <Alert tone="error" title="Error loading candidates">
            {error}
          </Alert>
        )}

        {hasLoadedCandidates && (
          <>
            <section
              aria-label="Candidate filters"
              className="rounded-xl border border-slate-200 bg-surface p-4 shadow-card sm:p-5"
            >
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))_auto] lg:items-end">
                <div className="sm:col-span-2 lg:col-span-1">
                  <label htmlFor="candidate-search" className={labelClass}>
                    Search candidates
                  </label>
                  <input
                    id="candidate-search"
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search name, role, or filename"
                    className="field"
                  />
                </div>
                <div>
                  <label htmlFor="candidate-role" className={labelClass}>
                    Role
                  </label>
                  <select
                    id="candidate-role"
                    value={selectedJobId || ''}
                    onChange={(event) => handleJobChange(event.target.value)}
                    className="select-control"
                  >
                    <option value="">All roles</option>
                    {jobs.map((job) => (
                      <option key={job.id} value={job.id}>
                        {job.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="candidate-status" className={labelClass}>
                    Status
                  </label>
                  <select
                    id="candidate-status"
                    value={statusFilter}
                    onChange={(event) =>
                      setStatusFilter(event.target.value as typeof statusFilter)
                    }
                    className="select-control"
                  >
                    <option value="all">All statuses</option>
                    <option value="indexed">Indexed</option>
                    <option value="not-indexed">Not indexed</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="candidate-sort" className={labelClass}>
                    Sort by
                  </label>
                  <select
                    id="candidate-sort"
                    value={sortBy}
                    onChange={(event) =>
                      setSortBy(event.target.value as typeof sortBy)
                    }
                    className="select-control"
                  >
                    <option value="name">Name</option>
                    <option value="role">Role</option>
                    <option value="indexed">Indexing status</option>
                    <option value="score">Job match score</option>
                  </select>
                </div>
                <div
                  className="flex h-[42px] items-center gap-1 self-end rounded-lg border border-slate-300 p-1"
                  role="group"
                  aria-label="Candidate view"
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
              <p className="mt-4 text-sm text-slate-500" aria-live="polite">
                Showing {candidates.length}{' '}
                {candidates.length === 1 ? 'candidate' : 'candidates'}
                {hasFilters ? ' matching your filters' : ''}
                {loading && ' · updating…'}
              </p>
            </section>

            {candidates.length === 0 ? (
              <EmptyState
                icon={
                  <PlusIcon className="h-6 w-6 fill-none stroke-current stroke-2" />
                }
                title={
                  hasFilters
                    ? 'No matching candidates'
                    : 'No candidates uploaded yet'
                }
                description={
                  hasFilters
                    ? 'Try a different search or clear the filters.'
                    : 'Upload PDF resumes to start building your candidate pool.'
                }
                action={
                  hasFilters ? undefined : (
                    <button
                      type="button"
                      onClick={() => setShowUploadModal(true)}
                      className={buttonClass('primary', 'sm')}
                    >
                      Upload resumes to get started
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
                {candidates.map((candidate) => {
                  const isRescoring = rescoreLoading.has(candidate.id);
                  const canRescore =
                    candidate.needsRescore === true && !isRescoring;
                  const notIndexed = candidate.chunk_count === 0;
                  return (
                    <article
                      key={candidate.id}
                      className={`rounded-xl border shadow-card transition hover:shadow-card-hover ${
                        notIndexed
                          ? 'border-amber-200 bg-amber-50'
                          : 'border-slate-200 bg-surface'
                      } ${viewMode === 'list' ? 'p-4 sm:p-5' : 'p-5 sm:p-6'}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h3 className="truncate text-lg font-semibold text-slate-900">
                            {candidate.name}
                          </h3>
                          <p className="mt-1 text-sm text-slate-600">
                            Role: {candidate.role_guess}
                          </p>
                          <p className="mt-2 truncate text-xs text-slate-500">
                            {candidate.original_filename}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <Badge tone={notIndexed ? 'warning' : 'success'}>
                            {notIndexed ? 'Not indexed' : 'Indexed'}
                          </Badge>
                          {candidate.score !== null &&
                            candidate.score !== undefined && (
                              <div className="flex flex-col items-end gap-1">
                                <Badge tone="info">
                                  Score: {candidate.score}%
                                </Badge>
                                {candidate.needsRescore === false && (
                                  <span className="text-xs text-slate-500">
                                    Updated with latest job
                                  </span>
                                )}
                              </div>
                            )}
                        </div>
                      </div>
                      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                        <button
                          type="button"
                          onClick={() => viewResume(candidate)}
                          className={buttonClass('primary', 'sm')}
                        >
                          View resume
                        </button>
                        <button
                          type="button"
                          onClick={() => viewParsedResume(candidate)}
                          className={buttonClass('secondary', 'sm')}
                        >
                          View parsed resume
                        </button>
                        <button
                          type="button"
                          onClick={() => rescoreCandidate(candidate)}
                          disabled={!canRescore}
                          className={buttonClass(
                            'secondary',
                            'sm',
                            'text-blue-700'
                          )}
                        >
                          {isRescoring ? (
                            <>
                              <Spinner className="h-3 w-3 border-blue-500" />
                              Rescoring...
                            </>
                          ) : (
                            'Re-score'
                          )}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}

        <Modal
          open={Boolean(resume)}
          onClose={() => setResume(null)}
          size="xl"
          title={`Resume: ${resume?.name ?? ''}`}
          footer={
            <a
              href={resume?.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass('secondary', 'md', 'sm:w-auto')}
            >
              Open in new tab
            </a>
          }
        >
          {resume && (
            <iframe
              src={resume.pdfUrl}
              title={`Resume PDF: ${resume.name}`}
              className="h-[65vh] min-h-[360px] w-full rounded-lg border border-slate-200"
            />
          )}
        </Modal>

        <Modal
          open={Boolean(parsedResume)}
          onClose={() => setParsedResume(null)}
          size="lg"
          title={`Parsed resume: ${parsedResume?.name ?? ''}`}
        >
          {parsedResume?.text ? (
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6 text-slate-700">
              {parsedResume.text}
            </pre>
          ) : (
            <p className="text-sm text-slate-600">
              No parsed resume text is available for this candidate.
            </p>
          )}
        </Modal>
      </div>
    </div>
  );
}
