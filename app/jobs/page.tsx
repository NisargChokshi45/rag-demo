"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Job {
  id: string;
  title: string;
  description: string;
  experience: string;
  skills: string[];
  created_at: string;
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [experience, setExperience] = useState("");
  const [skillInput, setSkillInput] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetch("/api/jobs")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load jobs");
        setJobs(data.jobs);
      })
      .catch((loadError: Error) => setError(loadError.message));
  }, []);

  const addSkill = () => {
    const skill = skillInput.trim();
    if (skill && !skills.some((existing) => existing.toLowerCase() === skill.toLowerCase())) {
      setSkills((current) => [...current, skill]);
      setSkillInput("");
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, experience, skills }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to create job");
      setJobs((current) => [data.job, ...current]);
      setTitle("");
      setDescription("");
      setExperience("");
      setSkills([]);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to create job");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-80px)] bg-slate-50 px-4 py-8 md:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-blue-600">Hiring workspace</p>
            <h1 className="text-4xl font-bold text-slate-900">Create a job</h1>
            <p className="mt-2 text-slate-600">Save the criteria your screening agent should use for each role.</p>
          </div>
          <Link href="/screen" className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">Screen candidates</Link>
        </div>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <form onSubmit={handleSubmit} className="space-y-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <div>
              <label htmlFor="title" className="mb-2 block text-sm font-medium text-slate-700">Job title</label>
              <input id="title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Senior Backend Engineer" className="w-full rounded border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" required />
            </div>
            <div>
              <label htmlFor="description" className="mb-2 block text-sm font-medium text-slate-700">Description</label>
              <textarea id="description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What will this person own?" className="h-32 w-full resize-none rounded border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" required />
            </div>
            <div>
              <label htmlFor="experience" className="mb-2 block text-sm font-medium text-slate-700">Experience</label>
              <input id="experience" value={experience} onChange={(event) => setExperience(event.target.value)} placeholder="5+ years building production APIs" className="w-full rounded border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" required />
            </div>
            <div>
              <label htmlFor="skills" className="mb-2 block text-sm font-medium text-slate-700">Skills</label>
              <div className="flex gap-2">
                <input id="skills" value={skillInput} onChange={(event) => setSkillInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addSkill(); } }} placeholder="Type a skill and press Enter" className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                <button type="button" onClick={addSkill} className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">Add</button>
              </div>
              <div className="mt-3 flex min-h-8 flex-wrap gap-2">
                {skills.map((skill) => <button key={skill} type="button" onClick={() => setSkills((current) => current.filter((item) => item !== skill))} className="rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700 hover:bg-blue-100">{skill} x</button>)}
              </div>
            </div>
            {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <button type="submit" disabled={isSaving} className="w-full rounded bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700 disabled:bg-slate-400">{isSaving ? "Saving job..." : "Create job"}</button>
          </form>

          <section>
            <h2 className="mb-4 text-xl font-semibold text-slate-900">Saved jobs</h2>
            <div className="space-y-3">
              {jobs.length === 0 ? <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">No jobs yet.</div> : jobs.map((job) => <article key={job.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-4"><h3 className="font-semibold text-slate-900">{job.title}</h3><span className="text-xs text-slate-500">{new Date(job.created_at).toLocaleDateString()}</span></div><p className="mt-2 text-sm text-slate-600">{job.description}</p><p className="mt-3 text-sm font-medium text-slate-700">{job.experience}</p><div className="mt-3 flex flex-wrap gap-2">{job.skills.map((skill) => <span key={skill} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">{skill}</span>)}</div></article>)}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}