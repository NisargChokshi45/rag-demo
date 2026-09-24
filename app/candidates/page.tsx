'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

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
}

interface Job {
  id: string;
  title: string;
}

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
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'indexed' | 'not-indexed'
  >('all');
  const [sortBy, setSortBy] = useState<'name' | 'role' | 'indexed'>('name');
  const [availableRoles, setAvailableRoles] = useState<string[]>([]);
  const [hasLoadedCandidates, setHasLoadedCandidates] = useState(false);

  const fetchCandidates = async () => {
    const params = new URLSearchParams({
      status: statusFilter,
      sort: sortBy,
    });
    const jobId = new URLSearchParams(window.location.search).get('jobId');
    if (jobId) params.set('jobId', jobId);
    if (debouncedSearchQuery.trim())
      params.set('search', debouncedSearchQuery.trim());
    if (roleFilter !== 'all') params.set('role', roleFilter);

    try {
      const response = await fetch(`/api/candidates?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch candidates');
      const data = await response.json();
      const roles = data.roles || [];
      setCandidates(data.candidates || []);
      setAvailableRoles(
        roleFilter !== 'all' && !roles.includes(roleFilter)
          ? [roleFilter, ...roles]
          : roles
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
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
  }, [debouncedSearchQuery, roleFilter, sortBy, statusFilter]);

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const response = await fetch('/api/jobs');
        const data = await response.json();
        if (response.ok) {
          setJobs(data.jobs || []);
          const jobId = new URLSearchParams(window.location.search).get(
            'jobId'
          );
          setSelectedJobId(jobId || '');
          const selectedJob = data.jobs?.find((job: Job) => job.id === jobId);
          setRoleFilter(selectedJob?.title || 'all');
        }
      } catch (err) {
        console.error('Failed to fetch jobs:', err);
        setJobs([]);
      }
    };

    fetchJobs();
  }, []);

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

  return (
    <div className="min-h-[calc(100vh-80px)] bg-gray-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold mb-2">Candidates</h1>
            <p className="text-gray-600">
              {selectedJob
                ? `Candidates for ${selectedJob.title}`
                : `${candidates.length} ${candidates.length === 1 ? 'candidate' : 'candidates'} ingested`}
            </p>
          </div>

          {candidates.length > 0 && (
            <div className="flex flex-wrap gap-4 sm:justify-end">
              <button
                onClick={() => setShowUploadModal(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
              >
                Upload More
              </button>
              <Link
                href={
                  selectedJobId
                    ? `/screen?jobId=${encodeURIComponent(selectedJobId)}`
                    : '/screen'
                }
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
              >
                Screen Candidates
              </Link>
            </div>
          )}
        </div>

        {/* Upload Modal */}
        {showUploadModal && (
          <div
            className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">Upload Resumes</h2>
                <button
                  onClick={() => {
                    setShowUploadModal(false);
                    setUploadProgress([]);
                  }}
                  className="text-2xl text-gray-500 hover:text-gray-700"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>

              {/* Resume Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Upload Resumes (PDF)
                </label>
                <div
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition ${
                    isUploading
                      ? 'border-gray-300 bg-gray-50 cursor-not-allowed'
                      : 'border-gray-300 hover:border-blue-400 cursor-pointer'
                  }`}
                >
                  <input
                    type="file"
                    multiple
                    accept=".pdf"
                    onChange={handleFileSelect}
                    disabled={isUploading}
                    className="hidden"
                    id="resume-input"
                  />
                  <label
                    htmlFor="resume-input"
                    className={`block ${
                      isUploading
                        ? 'text-gray-400 cursor-not-allowed'
                        : 'text-gray-600 hover:text-blue-600 cursor-pointer'
                    }`}
                  >
                    <div className="text-3xl mb-2">📄</div>
                    <p className="font-medium">Click to select PDF files</p>
                    <p className="text-sm text-gray-500">
                      Select one or more resumes to upload
                    </p>
                  </label>
                </div>
              </div>

              {/* Upload Progress */}
              {uploadProgress.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-medium text-gray-900">Upload Progress</h3>
                  {uploadProgress.map((item, idx) => {
                    const statusConfig = {
                      pending: {
                        label: 'Waiting',
                        color: 'bg-gray-100 text-gray-700',
                      },
                      uploading: {
                        label: 'Uploading',
                        color: 'bg-blue-100 text-blue-700',
                      },
                      ingesting: {
                        label: 'Processing',
                        color: 'bg-purple-100 text-purple-700',
                      },
                      done: {
                        label: 'Complete',
                        color: 'bg-green-100 text-green-700',
                      },
                      error: {
                        label: 'Failed',
                        color: 'bg-red-100 text-red-700',
                      },
                    };
                    const config = statusConfig[item.status];
                    return (
                      <div
                        key={idx}
                        className="p-4 border border-gray-200 rounded-lg"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-900">
                            {item.filename}
                          </span>
                          <span
                            className={`text-xs px-2 py-1 rounded-full font-medium ${config.color}`}
                          >
                            {config.label}
                          </span>
                        </div>
                        {item.status === 'error' && (
                          <p className="text-sm text-red-600">{item.error}</p>
                        )}
                        {item.progress !== undefined &&
                          item.status !== 'error' && (
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                className="bg-blue-600 h-2 rounded-full transition-all"
                                style={{ width: `${item.progress}%` }}
                              />
                            </div>
                          )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {loading && (
          <div className="bg-white p-8 rounded-lg shadow text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
            <p className="text-gray-600">Loading candidates...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 p-6 rounded-lg">
            <p className="text-red-700 font-semibold mb-2">
              Error Loading Candidates
            </p>
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {!loading && hasLoadedCandidates && (
          <>
            <section
              className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
              aria-label="Candidate filters"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
                <label className="min-w-0 flex-1 text-sm font-medium text-slate-700">
                  Search candidates
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search name, role, or filename"
                    className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-normal text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Role
                  <select
                    value={roleFilter}
                    onChange={(event) => setRoleFilter(event.target.value)}
                    className="mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-2 font-normal text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="all">All roles</option>
                    {availableRoles.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Status
                  <select
                    value={statusFilter}
                    onChange={(event) =>
                      setStatusFilter(event.target.value as typeof statusFilter)
                    }
                    className="mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-2 font-normal text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="all">All statuses</option>
                    <option value="indexed">Indexed</option>
                    <option value="not-indexed">Not indexed</option>
                  </select>
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Sort by
                  <select
                    value={sortBy}
                    onChange={(event) =>
                      setSortBy(event.target.value as typeof sortBy)
                    }
                    className="mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-2 font-normal text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="name">Name</option>
                    <option value="role">Role</option>
                    <option value="indexed">Indexing status</option>
                  </select>
                </label>
                <div
                  className="flex rounded border border-slate-300 p-1"
                  role="group"
                  aria-label="Candidate view"
                >
                  {(['grid', 'list'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setViewMode(mode)}
                      aria-pressed={viewMode === mode}
                      className={`rounded px-3 py-2 text-sm font-medium capitalize ${viewMode === mode ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
              <p className="mt-3 text-sm text-slate-500">
                Showing {candidates.length}{' '}
                {candidates.length === 1 ? 'candidate' : 'candidates'} matching
                your filters
              </p>
            </section>

            {candidates.length === 0 ? (
              <div className="bg-white border-2 border-dashed border-gray-300 p-12 rounded-lg text-center">
                <p className="text-4xl mb-4">📋</p>
                <p className="text-gray-600 mb-4">No candidates uploaded yet</p>
                <button
                  onClick={() => setShowUploadModal(true)}
                  className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Upload Resumes to Get Started
                </button>
              </div>
            ) : (
              <div
                className={
                  viewMode === 'grid'
                    ? 'grid gap-4 md:grid-cols-2'
                    : 'space-y-3'
                }
              >
                {candidates.map((candidate) => (
                  <div
                    key={candidate.id}
                    className={`rounded-lg shadow-sm transition hover:shadow-md ${
                      viewMode === 'list'
                        ? 'flex items-center gap-4 p-4'
                        : 'p-6'
                    } ${candidate.chunk_count === 0 ? 'border border-amber-200 bg-amber-50' : 'border border-slate-200 bg-white'}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h2 className="truncate text-xl font-semibold text-gray-900">
                            {candidate.name}
                          </h2>
                          <p className="mt-1 text-sm text-gray-600">
                            Role: {candidate.role_guess}
                          </p>
                          <p className="mt-2 truncate text-xs text-gray-500">
                            {candidate.original_filename}
                          </p>
                        </div>
                        <span
                          className={`whitespace-nowrap rounded-full px-3 py-1 text-sm font-medium ${candidate.chunk_count === 0 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}
                        >
                          {candidate.chunk_count === 0
                            ? 'Not Indexed'
                            : 'Indexed'}
                        </span>
                      </div>
                      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
                        <button
                          type="button"
                          onClick={() => viewResume(candidate)}
                          className="rounded bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
                        >
                          View resume
                        </button>
                        <button
                          type="button"
                          onClick={() => viewParsedResume(candidate)}
                          className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        >
                          View parsed resume
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {resume && (
          <div
            className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/50 p-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold">Resume: {resume.name}</h2>
                <button
                  type="button"
                  onClick={() => setResume(null)}
                  className="text-2xl text-gray-500"
                  aria-label="Close"
                >
                  &times;
                </button>
              </div>
              <div className="space-y-6">
                <iframe
                  src={resume.pdfUrl}
                  title={`Resume PDF: ${resume.name}`}
                  className="h-[70vh] min-h-[500px] w-full rounded border border-gray-200"
                />
              </div>
            </div>
          </div>
        )}
        {parsedResume && (
          <div
            className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/50 p-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold">
                  Parsed resume: {parsedResume.name}
                </h2>
                <button
                  type="button"
                  onClick={() => setParsedResume(null)}
                  className="text-2xl text-gray-500"
                  aria-label="Close"
                >
                  &times;
                </button>
              </div>
              {parsedResume.text ? (
                <pre className="whitespace-pre-wrap text-sm leading-6 text-gray-700">
                  {parsedResume.text}
                </pre>
              ) : (
                <p className="text-sm text-gray-600">
                  No parsed resume text is available for this candidate.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
