import { createServiceClient } from './supabase/server';

interface ChunkWithEmbedding {
  content: string;
  embedding: number[];
}

export interface Job {
  id: string;
  title: string;
  description: string;
  experience: string;
  skills: string[];
  is_active: boolean;
  created_at: string;
}

export interface CreateJobInput {
  title: string;
  description: string;
  experience: string;
  skills: string[];
  is_active?: boolean;
}

export type UpdateJobInput = CreateJobInput;

export interface ListJobsOptions {
  search?: string;
  status?: 'all' | 'active' | 'inactive';
  sort?: 'title' | 'newest' | 'oldest';
}

export async function createJob(input: CreateJobInput): Promise<Job> {
  const client = createServiceClient();
  const { data, error } = await client
    .from('jobs')
    .insert({ ...input, is_active: input.is_active ?? true })
    .select('id, title, description, experience, skills, is_active, created_at')
    .single();

  if (error) throw error;
  return data as Job;
}

export async function updateJob(
  jobId: string,
  input: UpdateJobInput
): Promise<Job> {
  const client = createServiceClient();
  const update =
    input.is_active === undefined
      ? {
          title: input.title,
          description: input.description,
          experience: input.experience,
          skills: input.skills,
        }
      : input;
  const { data, error } = await client
    .from('jobs')
    .update(update)
    .eq('id', jobId)
    .select('id, title, description, experience, skills, is_active, created_at')
    .single();

  if (error) throw error;
  return data as Job;
}

export async function deleteJob(jobId: string): Promise<void> {
  const client = createServiceClient();
  const { error } = await client.from('jobs').delete().eq('id', jobId);

  if (error) throw error;
}

export async function listJobs(
  activeOnly = false,
  options: ListJobsOptions = {}
): Promise<Job[]> {
  const client = createServiceClient();
  let query = client
    .from('jobs')
    .select(
      'id, title, description, experience, skills, is_active, created_at'
    );

  if (activeOnly || options.status === 'active') {
    query = query.eq('is_active', true);
  } else if (options.status === 'inactive') {
    query = query.eq('is_active', false);
  }

  const search = options.search
    ?.trim()
    .replace(/[,%(){}.*]/g, ' ')
    .slice(0, 100);
  if (search) {
    query = query.or(
      `title.ilike.%${search}%,description.ilike.%${search}%,experience.ilike.%${search}%,skills.cs.{${search}}`
    );
  }

  const sort = options.sort || 'newest';
  const { data, error } = await query.order(
    sort === 'title' ? 'title' : 'created_at',
    {
      ascending: sort === 'oldest' || sort === 'title',
    }
  );

  if (error) throw error;
  return (data || []) as Job[];
}

export async function getJobById(
  jobId: string,
  activeOnly = false
): Promise<Job> {
  const client = createServiceClient();
  let query = client
    .from('jobs')
    .select('id, title, description, experience, skills, is_active, created_at')
    .eq('id', jobId);

  if (activeOnly) query = query.eq('is_active', true);

  const { data, error } = await query.single();

  if (error) throw error;
  return data as Job;
}

export async function insertCandidate(
  name: string,
  roleGuess: string,
  storagePath: string,
  originalFilename: string,
  fullText: string,
  jobId?: string
): Promise<string> {
  const client = createServiceClient();

  const { data, error } = await client
    .from('candidates')
    .insert([
      {
        name,
        role_guess: roleGuess,
        storage_path: storagePath,
        original_filename: originalFilename,
        full_text: fullText,
        job_id: jobId || null,
      },
    ])
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

export async function insertChunks(
  candidateId: string,
  chunks: ChunkWithEmbedding[]
): Promise<void> {
  const client = createServiceClient();

  const chunksData = chunks.map((chunk, index) => ({
    candidate_id: candidateId,
    chunk_index: index,
    content: chunk.content,
    embedding: chunk.embedding,
  }));

  const { error } = await client.from('resume_chunks').insert(chunksData);

  if (error) throw error;
}

export async function deleteCandidate(candidateId: string): Promise<void> {
  const client = createServiceClient();
  const { error } = await client
    .from('candidates')
    .delete()
    .eq('id', candidateId);
  if (error) throw error;
}

export async function searchChunks(
  queryEmbedding: number[],
  matchCount: number,
  filterJobId?: string
): Promise<any[]> {
  const client = createServiceClient();

  // Use RPC to call the match_resume_chunks function
  const { data, error } = await client.rpc('match_resume_chunks', {
    query_embedding: queryEmbedding,
    match_count: matchCount,
    filter_job_id: filterJobId || null,
  });

  if (error) throw error;
  return data || [];
}

export async function getFullResumeById(candidateId: string): Promise<string> {
  const client = createServiceClient();

  const { data, error } = await client
    .from('candidates')
    .select('full_text')
    .eq('id', candidateId)
    .single();

  if (error) throw error;
  return data.full_text;
}

export interface ListCandidatesOptions {
  search?: string;
  role?: string;
  jobId?: string;
  status?: 'all' | 'indexed' | 'not-indexed';
  sort?: 'name' | 'role' | 'indexed';
}

export async function listCandidates(
  options: ListCandidatesOptions = {}
): Promise<any[]> {
  const client = createServiceClient();

  let candidateQuery = client
    .from('candidates')
    .select('id, name, role_guess, original_filename');

  if (options.jobId)
    candidateQuery = candidateQuery.eq('job_id', options.jobId);

  if (options.search?.trim()) {
    const search = options.search.trim().replace(/[%(),]/g, ' ');
    candidateQuery = candidateQuery.or(
      `name.ilike.%${search}%,role_guess.ilike.%${search}%,original_filename.ilike.%${search}%`
    );
  }

  if (options.role && options.role !== 'all') {
    candidateQuery = candidateQuery.eq('role_guess', options.role);
  }

  if (options.sort === 'role') {
    candidateQuery = candidateQuery.order('role_guess', {
      ascending: true,
      nullsFirst: false,
    });
  } else if (options.sort !== 'indexed') {
    candidateQuery = candidateQuery.order('name', {
      ascending: true,
      nullsFirst: false,
    });
  }

  const { data: candidates, error: candidatesError } = await candidateQuery;

  if (candidatesError) throw candidatesError;

  // Get chunk counts for each candidate
  const { data: chunkCounts, error: chunkError } = await client
    .from('resume_chunks')
    .select('candidate_id');

  if (chunkError) throw chunkError;

  const countMap: Record<string, number> = {};
  chunkCounts.forEach((chunk: any) => {
    countMap[chunk.candidate_id] = (countMap[chunk.candidate_id] || 0) + 1;
  });

  const results = candidates.map((candidate: any) => ({
    ...candidate,
    chunk_count: countMap[candidate.id] || 0,
  }));

  const filtered =
    options.status === 'indexed'
      ? results.filter((candidate) => candidate.chunk_count > 0)
      : options.status === 'not-indexed'
        ? results.filter((candidate) => candidate.chunk_count === 0)
        : results;

  if (options.sort === 'indexed') {
    return filtered.sort((left, right) => right.chunk_count - left.chunk_count);
  }

  return filtered;
}

export async function listCandidateRoles(): Promise<string[]> {
  const client = createServiceClient();
  const { data, error } = await client
    .from('candidates')
    .select('role_guess')
    .not('role_guess', 'is', null)
    .order('role_guess', { ascending: true });

  if (error) throw error;

  return Array.from(
    new Set(
      (data || [])
        .map((candidate) => candidate.role_guess)
        .filter((role): role is string => Boolean(role))
    )
  );
}

export interface ScreeningAssessment {
  candidateId: string;
  candidateName: string;
  score: number;
  evidence: string[];
  unknowns: string[];
}

export interface ScreeningReport {
  query: string;
  summary: string;
  assessments: ScreeningAssessment[];
}

export async function createScreening(
  jobId: string,
  query: string,
  summary: string,
  assessments: ScreeningAssessment[]
): Promise<string> {
  const client = createServiceClient();

  // Create screening record
  const { data: screening, error: screeningError } = await client
    .from('screenings')
    .insert({
      job_id: jobId,
      query,
      summary,
    })
    .select('id')
    .single();

  if (screeningError) throw screeningError;

  const screeningId = screening.id;

  // Create assessment records
  const assessmentData = assessments.map((assessment) => ({
    screening_id: screeningId,
    candidate_id: assessment.candidateId,
    score: assessment.score,
    evidence: assessment.evidence,
    unknowns: assessment.unknowns,
  }));

  const { error: assessmentError } = await client
    .from('screening_assessments')
    .insert(assessmentData);

  if (assessmentError) throw assessmentError;

  return screeningId;
}

export async function getScreeningsByJob(jobId: string): Promise<any[]> {
  const client = createServiceClient();

  const { data, error } = await client
    .from('screenings')
    .select(
      `
      id,
      job_id,
      query,
      summary,
      created_at,
      screening_assessments (
        candidate_id,
        score,
        evidence,
        unknowns
      )
    `
    )
    .eq('job_id', jobId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getAssessmentsByCandidate(
  candidateId: string
): Promise<any[]> {
  const client = createServiceClient();

  const { data, error } = await client
    .from('screening_assessments')
    .select(
      `
      id,
      candidate_id,
      score,
      evidence,
      unknowns,
      screenings (
        id,
        job_id,
        query,
        summary,
        created_at,
        jobs (
          id,
          title
        )
      )
    `
    )
    .eq('candidate_id', candidateId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}
