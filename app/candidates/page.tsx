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

interface Assessment {
  id: string;
  candidate_id: string;
  score: number;
  evidence: string[];
  unknowns: string[];
  screenings?: {
    id: string;
    query: string;
    summary: string;
    jobs?: { id: string; title: string };
  };
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
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [resume, setResume] = useState<{ name: string; text: string } | null>(
    null
  );
  const [selectedAssessment, setSelectedAssessment] =
    useState<Assessment | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);

  const fetchCandidates = async () => {
    try {
      const response = await fetch('/api/candidates');
      if (!response.ok) throw new Error('Failed to fetch candidates');
      const data = await response.json();
      setCandidates(data.candidates || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

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
        }
      } catch (err) {
        console.error('Failed to fetch jobs:', err);
        setJobs([]);
      }
    };

    fetchCandidates();
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

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

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
      }
    }

    setIsUploading(false);

    // Refresh candidates list after upload
    setUploadProgress((finalProgress) => {
      const hasErrors = finalProgress.some((p) => p.status === 'error');
      if (!hasErrors) {
        setTimeout(() => {
          fetchCandidates();
          setShowUploadModal(false);
          setUploadProgress([]);
        }, 2000);
      }
      return finalProgress;
    });
  };

  const selectedJob = jobs.find((job) => job.id === selectedJobId);

  const viewResume = async (candidate: Candidate) => {
    try {
      const response = await fetch(`/api/candidates/${candidate.id}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load resume');
      setResume({ name: candidate.name, text: data.resume });
      setAssessments(data.assessments || []);
    } catch (resumeError) {
      setError(
        resumeError instanceof Error
          ? resumeError.message
          : 'Unable to load resume'
      );
    }
  };

  return (
    <div className="min-h-[calc(100vh-80px)] bg-gray-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">Candidates</h1>
          <p className="text-gray-600">
            {selectedJob
              ? `Candidates for ${selectedJob.title}`
              : `${candidates.length} ${candidates.length === 1 ? 'candidate' : 'candidates'} ingested`}
          </p>
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

        <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
          {candidates.length > 0 && (
            <div className="flex gap-4">
              <button
                onClick={() => setShowUploadModal(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
              >
                Upload More
              </button>
              <Link
                href="/screen"
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
              >
                Screen Candidates
              </Link>
            </div>
          )}
        </div>

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

        {!loading && candidates.length === 0 && (
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
        )}

        {!loading && candidates.length > 0 && (
          <div className="grid gap-4">
            {candidates.map((candidate) => (
              <div
                key={candidate.id}
                className={`p-6 rounded-lg shadow hover:shadow-lg transition ${
                  candidate.chunk_count === 0
                    ? 'bg-amber-50 border border-amber-200'
                    : 'bg-white'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">
                      {candidate.name}
                    </h2>
                    <p className="text-sm text-gray-600 mt-1">
                      Applied role: {candidate.role_guess}
                    </p>
                    <p className="text-xs text-gray-500 mt-2">
                      {candidate.original_filename}
                    </p>
                  </div>
                  {candidate.chunk_count === 0 ? (
                    <span className="px-3 py-1 text-sm font-medium text-amber-700 bg-amber-100 rounded-full whitespace-nowrap">
                      ⚠️ Not Indexed
                    </span>
                  ) : (
                    <span className="px-3 py-1 text-sm font-medium text-green-700 bg-green-100 rounded-full whitespace-nowrap">
                      ✓ Indexed
                    </span>
                  )}
                </div>
                <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
                  <button
                    type="button"
                    onClick={() => viewResume(candidate)}
                    className="rounded bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
                  >
                    View resume
                  </button>
                </div>
              </div>
            ))}
          </div>
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
                <pre className="whitespace-pre-wrap text-sm leading-6 text-gray-700">
                  {resume.text}
                </pre>
                {assessments.length > 0 && (
                  <div className="border-t pt-6">
                    <h3 className="font-semibold text-gray-900 mb-4">
                      Screening Assessments
                    </h3>
                    <div className="space-y-4">
                      {assessments.map((assessment) => (
                        <div
                          key={assessment.id}
                          className="bg-gray-50 p-4 rounded-lg"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <h4 className="font-medium text-gray-900">
                              {assessment.screenings?.jobs?.title ||
                                'General Screening'}
                            </h4>
                            <div className="text-right">
                              <div className="text-2xl font-bold text-blue-600">
                                {assessment.score}
                              </div>
                              <div className="text-xs text-gray-500">/100</div>
                            </div>
                          </div>
                          <p className="text-sm text-gray-600 mb-3 italic">
                            {assessment.screenings?.query}
                          </p>
                          {assessment.evidence.length > 0 && (
                            <div className="mb-3">
                              <h5 className="text-xs font-semibold text-gray-700 mb-1">
                                Evidence
                              </h5>
                              <ul className="text-xs text-gray-700 space-y-1">
                                {assessment.evidence.map((item) => (
                                  <li key={item}>• {item}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {assessment.unknowns.length > 0 && (
                            <div>
                              <h5 className="text-xs font-semibold text-gray-700 mb-1">
                                Unknowns
                              </h5>
                              <ul className="text-xs text-amber-700 space-y-1">
                                {assessment.unknowns.map((item) => (
                                  <li key={item}>? {item}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {selectedAssessment && (
          <div
            className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/50 p-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold">Screening report</h2>
                <button
                  type="button"
                  onClick={() => setSelectedAssessment(null)}
                  className="text-2xl text-gray-500"
                  aria-label="Close"
                >
                  &times;
                </button>
              </div>
              <p className="mb-4 text-4xl font-bold text-blue-600">
                {selectedAssessment.score}
                <span className="text-base font-normal text-gray-500">
                  {' '}
                  / 100
                </span>
              </p>
              <h3 className="mb-2 font-semibold text-gray-900">Evidence</h3>
              <ul className="mb-5 list-disc space-y-1 pl-5 text-sm text-gray-700">
                {selectedAssessment.evidence.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <h3 className="mb-2 font-semibold text-gray-900">Unknowns</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
                {selectedAssessment.unknowns.length ? (
                  selectedAssessment.unknowns.map((item) => (
                    <li key={item}>{item}</li>
                  ))
                ) : (
                  <li>None recorded</li>
                )}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
