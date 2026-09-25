'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

interface Job {
  id: string;
  title: string;
  description: string;
  experience: string;
  skills: string[];
  is_active: boolean;
  created_at: string;
}

function EditIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4 fill-none stroke-current stroke-2"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4 fill-none stroke-current stroke-2"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v5M14 11v5" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4 fill-none stroke-current stroke-2"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function ScreenIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4 fill-none stroke-current stroke-2"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35M11 8v6M8 11h6" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4 fill-none stroke-current stroke-2"
    >
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4 fill-none stroke-current stroke-2"
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [experience, setExperience] = useState('');
  const [skillInput, setSkillInput] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [deletingJob, setDeletingJob] = useState<Job | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'active' | 'inactive'
  >('all');
  const [sortBy, setSortBy] = useState<'title' | 'newest' | 'oldest'>('newest');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

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
      status: statusFilter,
      sort: sortBy,
    });

    setIsLoading(true);
    fetch(`/api/jobs?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to load jobs');
        setJobs(data.jobs || []);
        setError(null);
      })
      .catch((loadError: Error) => {
        if (loadError.name !== 'AbortError') setError(loadError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [debouncedSearchQuery, sortBy, statusFilter]);

  const addSkill = () => {
    const skill = skillInput.trim();
    if (
      skill &&
      !skills.some((existing) => existing.toLowerCase() === skill.toLowerCase())
    ) {
      setSkills((current) => [...current, skill]);
      setSkillInput('');
    }
  };

  const openCreateModal = () => {
    setEditingJob(null);
    setTitle('');
    setDescription('');
    setExperience('');
    setSkills([]);
    setIsActive(true);
    setError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (job: Job) => {
    setEditingJob(job);
    setTitle(job.title);
    setDescription(job.description);
    setExperience(job.experience);
    setSkills(job.skills);
    setIsActive(job.is_active);
    setError(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      const response = await fetch(
        editingJob ? `/api/jobs/${editingJob.id}` : '/api/jobs',
        {
          method: editingJob ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            description,
            experience,
            skills,
            is_active: editingJob ? isActive : true,
          }),
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to save job');
      setJobs((current) =>
        editingJob
          ? current.map((job) => (job.id === data.job.id ? data.job : job))
          : [data.job, ...current]
      );
      setTitle('');
      setDescription('');
      setExperience('');
      setSkills([]);
      setIsActive(true);
      setEditingJob(null);
      setIsModalOpen(false);
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : 'Unable to save job'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingJob) return;
    setIsDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/jobs/${deletingJob.id}`, {
        method: 'DELETE',
      });
      const data = response.status === 204 ? null : await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Unable to delete job');
      }
      setJobs((current) => current.filter((job) => job.id !== deletingJob.id));
      setDeletingJob(null);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : 'Unable to delete job'
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const visibleJobs = jobs;

  return (
    <div className="min-h-[calc(100vh-80px)] bg-slate-50 px-4 py-8 md:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              Jobs on the platform
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Showing {visibleJobs.length} of {jobs.length} jobs
            </p>
          </div>
          <button
            type="button"
            onClick={openCreateModal}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Add Job
          </button>
        </div>

        <section>
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end">
            <label className="min-w-0 flex-1 text-sm font-medium text-slate-700">
              Search jobs
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search title, description, or skill"
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-normal text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Status
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as typeof statusFilter)
                }
                className="select-control mt-1 block w-full font-normal"
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Sort by
              <select
                value={sortBy}
                onChange={(event) =>
                  setSortBy(event.target.value as typeof sortBy)
                }
                className="select-control mt-1 block w-full font-normal"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="title">Title A-Z</option>
              </select>
            </label>
            <div
              className="flex self-start rounded border border-slate-300 p-1 lg:self-auto"
              role="group"
              aria-label="Job view"
            >
              <button
                key="grid"
                type="button"
                onClick={() => setViewMode('grid')}
                aria-pressed={viewMode === 'grid'}
                aria-label="Grid view"
                className={`rounded p-2 ${viewMode === 'grid' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                <GridIcon />
              </button>
              <button
                key="list"
                type="button"
                onClick={() => setViewMode('list')}
                aria-pressed={viewMode === 'list'}
                aria-label="List view"
                className={`rounded p-2 ${viewMode === 'list' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                <ListIcon />
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500">
              Loading jobs...
            </div>
          ) : visibleJobs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
              {jobs.length === 0
                ? 'No jobs yet. Add the first role to start screening.'
                : 'No jobs match the current search and filters.'}
            </div>
          ) : (
            <div
              className={
                viewMode === 'grid' ? 'grid gap-4 md:grid-cols-2' : 'space-y-3'
              }
            >
              {visibleJobs.map((job) => (
                <article
                  key={job.id}
                  className={`rounded-lg border border-slate-200 bg-white shadow-sm ${viewMode === 'list' ? 'p-4' : 'p-5'}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="flex items-center gap-2 font-semibold text-slate-900">
                      <span className="relative flex h-2.5 w-2.5">
                        {job.is_active && (
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                        )}
                        <span
                          aria-label={`Project status: ${job.is_active ? 'Active' : 'Inactive'}`}
                          title={`Project status: ${job.is_active ? 'Active' : 'Inactive'}`}
                          className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                            job.is_active ? 'bg-emerald-500' : 'bg-slate-400'
                          }`}
                        />
                      </span>
                      {job.title}
                    </h3>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(job)}
                        className="inline-flex items-center gap-1.5 rounded border border-slate-200 px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:border-blue-300 hover:text-blue-700"
                        aria-label={`Edit ${job.title}`}
                      >
                        <EditIcon />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setError(null);
                          setDeletingJob(job);
                        }}
                        className="inline-flex items-center gap-1.5 rounded border border-red-200 px-2.5 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                        aria-label={`Delete ${job.title}`}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    {job.description}
                  </p>
                  <p className="mt-3 text-sm font-medium text-slate-700">
                    {job.experience}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {job.skills.map((skill) => (
                      <span
                        key={skill}
                        className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                  <div className="mt-5 flex items-center justify-between gap-4 border-t border-slate-100 pt-4">
                    <div className="flex min-w-0 flex-wrap gap-3">
                      <Link
                        href={`/candidates?jobId=${job.id}`}
                        className="inline-flex items-center gap-1.5 rounded border border-blue-200 px-2.5 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50"
                      >
                        <UsersIcon />
                        View candidates
                      </Link>
                      <Link
                        href={`/screen?jobId=${job.id}`}
                        className="inline-flex items-center gap-1.5 rounded border border-slate-200 px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <ScreenIcon />
                        Screen this job
                      </Link>
                    </div>
                    <div className="flex shrink-0 flex-col items-center gap-1 text-center">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          job.is_active
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {job.is_active ? 'Active' : 'Inactive'}
                      </span>
                      <span className="text-xs text-slate-500">
                        {new Date(job.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {isModalOpen && (
          <div
            className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/50 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="job-form-title"
          >
            <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
              <div className="mb-5 flex items-center justify-between">
                <h2
                  id="job-form-title"
                  className="text-xl font-semibold text-slate-900"
                >
                  {editingJob ? 'Edit Job' : 'Add Job'}
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingJob(null);
                  }}
                  className="text-2xl leading-none text-slate-500 hover:text-slate-900"
                  aria-label="Close"
                >
                  &times;
                </button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label
                    htmlFor="title"
                    className="mb-2 block text-sm font-medium text-slate-700"
                  >
                    Job title
                  </label>
                  <input
                    id="title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Senior Backend Engineer"
                    className="w-full rounded border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    required
                  />
                </div>
                {editingJob && (
                  <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(event) => setIsActive(event.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    {isActive ? 'Active job' : 'Inactive job'}
                  </label>
                )}
                <div>
                  <label
                    htmlFor="description"
                    className="mb-2 block text-sm font-medium text-slate-700"
                  >
                    Description
                  </label>
                  <textarea
                    id="description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="What will this person own?"
                    className="h-32 w-full resize-none rounded border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    required
                  />
                </div>
                <div>
                  <label
                    htmlFor="experience"
                    className="mb-2 block text-sm font-medium text-slate-700"
                  >
                    Experience
                  </label>
                  <input
                    id="experience"
                    value={experience}
                    onChange={(event) => setExperience(event.target.value)}
                    placeholder="5+ years building production APIs"
                    className="w-full rounded border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    required
                  />
                </div>
                <div>
                  <label
                    htmlFor="skills"
                    className="mb-2 block text-sm font-medium text-slate-700"
                  >
                    Skills
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="skills"
                      value={skillInput}
                      onChange={(event) => setSkillInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          addSkill();
                        }
                      }}
                      placeholder="Type a skill and press Enter"
                      className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                    <button
                      type="button"
                      onClick={addSkill}
                      className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
                    >
                      Add
                    </button>
                  </div>
                  <div className="mt-3 flex min-h-8 flex-wrap gap-2">
                    {skills.map((skill) => (
                      <button
                        key={skill}
                        type="button"
                        onClick={() =>
                          setSkills((current) =>
                            current.filter((item) => item !== skill)
                          )
                        }
                        className="rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700 hover:bg-blue-100"
                      >
                        {skill} x
                      </button>
                    ))}
                  </div>
                </div>
                {error && (
                  <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={isSaving}
                  className="w-full rounded bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700 disabled:bg-slate-400"
                >
                  {isSaving
                    ? 'Saving job...'
                    : editingJob
                      ? 'Save changes'
                      : 'Create job'}
                </button>
              </form>
            </div>
          </div>
        )}

        {deletingJob && (
          <div
            className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-job-title"
          >
            <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
              <h2
                id="delete-job-title"
                className="text-xl font-semibold text-slate-900"
              >
                Delete this job?
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                This will permanently delete{' '}
                <strong>{deletingJob.title}</strong> and its screening history.
              </p>
              {error && (
                <p className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              )}
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setDeletingJob(null)}
                  disabled={isDeleting}
                  className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="inline-flex items-center gap-2 rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:bg-slate-400"
                >
                  <TrashIcon />
                  {isDeleting ? 'Deleting...' : 'Delete job'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
