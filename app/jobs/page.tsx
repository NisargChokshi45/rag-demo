'use client';

import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  EditIcon,
  GridIcon,
  ListIcon,
  PlusIcon,
  ScreenIcon,
  TrashIcon,
  UsersIcon,
} from '../icons';

interface Job {
  id: string;
  title: string;
  description: string;
  experience: string;
  skills: string[];
  is_active: boolean;
  created_at: string;
}

function SkillsDisplay({ skills }: { skills: string[] }) {
  const [visibleCount, setVisibleCount] = useState(skills.length);
  const containerRef = useRef<HTMLDivElement>(null);
  const checkedRef = useRef(false);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || checkedRef.current) return;

    const checkOverflow = () => {
      const children = Array.from(container.querySelectorAll('span'));
      if (children.length === 0) return;

      const firstChildTop = children[0].getBoundingClientRect().top;
      let lastFitIndex = children.length - 1;

      for (let i = 0; i < children.length; i++) {
        const childTop = children[i].getBoundingClientRect().top;
        if (childTop > firstChildTop) {
          lastFitIndex = i - 1;
          break;
        }
      }

      if (lastFitIndex < children.length - 1) {
        setVisibleCount(Math.max(1, lastFitIndex));
        checkedRef.current = true;
      } else {
        checkedRef.current = true;
      }
    };

    checkOverflow();
    const resizeObserver = new ResizeObserver(checkOverflow);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [skills.length]);

  if (skills.length === 0) return null;

  return (
    <div ref={containerRef} className="mt-3 flex flex-wrap items-center gap-2">
      {skills.slice(0, visibleCount).map((skill) => (
        <Badge key={skill} tone="neutral">
          {skill}
        </Badge>
      ))}
      {visibleCount < skills.length && (
        <span
          title={skills.slice(visibleCount).join(', ')}
          className="inline-flex cursor-help items-center whitespace-nowrap rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-300"
        >
          +{skills.length - visibleCount} more
        </span>
      )}
    </div>
  );
}

const inputClass = 'field';
const labelClass = 'mb-1.5 block text-sm font-medium text-slate-700';
const iconButtonClass =
  'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50 hover:text-slate-900';

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
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

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
        if (!controller.signal.aborted) {
          setIsLoading(false);
          setHasLoadedOnce(true);
        }
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

  const closeJobModal = () => {
    setIsModalOpen(false);
    setEditingJob(null);
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
  const hasActiveFilters =
    debouncedSearchQuery !== '' || statusFilter !== 'all';

  return (
    <div className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <PageHeader
          title="Jobs on the platform"
          description={
            hasLoadedOnce
              ? `Showing ${visibleJobs.length} of ${jobs.length} jobs`
              : 'Loading jobs…'
          }
          actions={
            <button
              type="button"
              onClick={openCreateModal}
              className={buttonClass('primary', 'md')}
            >
              <PlusIcon className="h-4 w-4 fill-none stroke-current stroke-2" />
              Add Job
            </button>
          }
        />

        {error && !isModalOpen && !deletingJob && (
          <Alert tone="error">{error}</Alert>
        )}

        <section
          aria-label="Job filters"
          className="rounded-xl border border-slate-200 bg-surface p-4 shadow-card sm:p-5"
        >
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_11rem_11rem_auto] md:items-end">
            <div className="min-w-0">
              <label htmlFor="job-search" className={labelClass}>
                Search jobs
              </label>
              <input
                id="job-search"
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search title, description, or skill"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="job-status" className={labelClass}>
                Status
              </label>
              <select
                id="job-status"
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as typeof statusFilter)
                }
                className="select-control"
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div>
              <label htmlFor="job-sort" className={labelClass}>
                Sort by
              </label>
              <select
                id="job-sort"
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
              aria-label="Job view"
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
          ) : visibleJobs.length === 0 ? (
            <EmptyState
              icon={
                <ScreenIcon className="h-6 w-6 fill-none stroke-current stroke-2" />
              }
              title={
                jobs.length === 0 && !hasActiveFilters
                  ? 'No jobs yet'
                  : 'No matching jobs'
              }
              description={
                jobs.length === 0 && !hasActiveFilters
                  ? 'Add the first role to start screening candidates.'
                  : 'Try a different search term or clear the filters.'
              }
              action={
                jobs.length === 0 && !hasActiveFilters ? (
                  <button
                    type="button"
                    onClick={openCreateModal}
                    className={buttonClass('primary', 'sm')}
                  >
                    <PlusIcon className="h-4 w-4 fill-none stroke-current stroke-2" />
                    Add your first job
                  </button>
                ) : undefined
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
              {visibleJobs.map((job) => (
                <article
                  key={job.id}
                  className={`flex flex-col rounded-xl border border-slate-200 bg-surface shadow-card transition hover:shadow-card-hover ${viewMode === 'list' ? 'p-4 sm:p-5' : 'p-5 sm:p-6'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="flex items-center gap-2.5 text-base font-semibold text-slate-900">
                        <span className="relative flex h-2.5 w-2.5 shrink-0">
                          {job.is_active && (
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:animate-none" />
                          )}
                          <span
                            aria-label={`Status: ${job.is_active ? 'Active' : 'Inactive'}`}
                            title={`Status: ${job.is_active ? 'Active' : 'Inactive'}`}
                            className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                              job.is_active ? 'bg-emerald-500' : 'bg-slate-400'
                            }`}
                          />
                        </span>
                        <span className="truncate">{job.title}</span>
                      </h3>
                      <p className="mt-1 text-sm font-medium text-slate-600">
                        {job.experience}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEditModal(job)}
                        className={iconButtonClass}
                        aria-label={`Edit ${job.title}`}
                        title="Edit"
                      >
                        <EditIcon />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setError(null);
                          setDeletingJob(job);
                        }}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 text-red-600 transition hover:bg-red-50"
                        aria-label={`Delete ${job.title}`}
                        title="Delete"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </div>

                  <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-slate-600">
                    {job.description}
                  </p>
                  <SkillsDisplay skills={job.skills} />

                  <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/candidates?jobId=${job.id}`}
                        className={buttonClass(
                          'secondary',
                          'sm',
                          'text-blue-700'
                        )}
                      >
                        <UsersIcon />
                        View candidates
                      </Link>
                      <Link
                        href={`/screen?jobId=${job.id}`}
                        className={buttonClass('secondary', 'sm')}
                      >
                        <ScreenIcon />
                        Screen this job
                      </Link>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 sm:flex-col sm:items-end sm:gap-1">
                      <Badge tone={job.is_active ? 'success' : 'neutral'}>
                        {job.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                      <time dateTime={job.created_at}>
                        {new Date(job.created_at).toLocaleDateString()}
                      </time>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
          {isLoading && hasLoadedOnce && (
            <p className="mt-4 flex items-center gap-2 text-sm text-slate-500">
              <Spinner className="h-3.5 w-3.5 border-slate-400" />
              Updating results…
            </p>
          )}
        </section>

        <Modal
          open={isModalOpen}
          onClose={closeJobModal}
          locked={isSaving}
          size="lg"
          title={editingJob ? 'Edit Job' : 'Add Job'}
          description={
            editingJob
              ? 'Update the criteria used when screening candidates for this role.'
              : 'Define the criteria used when screening candidates for this role.'
          }
          footer={
            <>
              <button
                type="button"
                onClick={closeJobModal}
                disabled={isSaving}
                className={buttonClass('secondary', 'md', 'sm:w-auto')}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="job-form"
                disabled={isSaving}
                className={buttonClass('primary', 'md', 'sm:min-w-40')}
              >
                {isSaving && <Spinner className="h-4 w-4 border-white" />}
                {isSaving
                  ? 'Saving job...'
                  : editingJob
                    ? 'Save changes'
                    : 'Create job'}
              </button>
            </>
          }
        >
          <form id="job-form" onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="title" className={labelClass}>
                Job title
              </label>
              <input
                id="title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Senior Backend Engineer"
                className={inputClass}
                required
                autoComplete="off"
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
                Actively Hiring
              </label>
            )}
            <div>
              <label htmlFor="description" className={labelClass}>
                Description
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What will this person own?"
                className={`${inputClass} h-32 resize-y`}
                required
              />
            </div>
            <div>
              <label htmlFor="experience" className={labelClass}>
                Experience
              </label>
              <input
                id="experience"
                value={experience}
                onChange={(event) => setExperience(event.target.value)}
                placeholder="5+ years building production APIs"
                className={inputClass}
                required
              />
            </div>
            <div>
              <label htmlFor="skills" className={labelClass}>
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
                  className={`${inputClass} min-w-0 flex-1`}
                />
                <button
                  type="button"
                  onClick={addSkill}
                  className={buttonClass('secondary', 'md', 'shrink-0')}
                >
                  <PlusIcon className="h-4 w-4 fill-none stroke-current stroke-2" />
                  Add
                </button>
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                Select a skill chip to remove it.
              </p>
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
                    aria-label={`Remove skill ${skill}`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700 transition hover:bg-blue-100"
                  >
                    {skill}
                    <span aria-hidden="true" className="text-blue-500">
                      &times;
                    </span>
                  </button>
                ))}
              </div>
            </div>
            {error && <Alert tone="error">{error}</Alert>}
          </form>
        </Modal>

        <Modal
          open={Boolean(deletingJob)}
          onClose={() => setDeletingJob(null)}
          locked={isDeleting}
          size="sm"
          title="Delete this job?"
          footer={
            <>
              <button
                type="button"
                onClick={() => setDeletingJob(null)}
                disabled={isDeleting}
                className={buttonClass('secondary', 'md', 'sm:w-auto')}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className={buttonClass('danger', 'md', 'sm:min-w-40')}
              >
                <TrashIcon />
                {isDeleting ? 'Deleting...' : 'Delete job'}
              </button>
            </>
          }
        >
          <p className="text-sm text-slate-600">
            This will permanently delete{' '}
            <strong className="font-semibold text-slate-900">
              {deletingJob?.title}
            </strong>{' '}
            and its screening history.
          </p>
          {error && (
            <Alert tone="error" className="mt-4">
              {error}
            </Alert>
          )}
        </Modal>
      </div>
    </div>
  );
}
