import { createServiceClient } from './supabase/server';
import { generateJobHash, jobHashesMatch } from './job-hash';

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
  jobId?: string,
  score?: number | null,
  jobHash?: string | null
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
        score: score ?? null,
        job_hash: jobHash ?? null,
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
    .select('id, name, role_guess, original_filename, score, job_id, job_hash');

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

  // Fetch jobs for candidates that have job_ids
  const jobIds = [
    ...new Set(
      candidates.filter((c: any) => c.job_id).map((c: any) => c.job_id)
    ),
  ];
  const jobMap: Record<string, Job> = {};

  if (jobIds.length > 0) {
    const { data: jobs, error: jobError } = await client
      .from('jobs')
      .select(
        'id, title, description, experience, skills, is_active, created_at'
      )
      .in('id', jobIds);

    if (jobError) throw jobError;
    if (jobs) {
      jobs.forEach((job: any) => {
        jobMap[job.id] = job;
      });
    }
  }

  const results = candidates.map((candidate: any) => {
    const result: any = {
      ...candidate,
      chunk_count: countMap[candidate.id] || 0,
    };

    // Compute needsRescore if candidate has a job
    if (candidate.job_id && jobMap[candidate.job_id]) {
      const job = jobMap[candidate.job_id];
      const currentJobHash = generateJobHash({
        description: job.description,
        experience: job.experience,
        skills: job.skills,
      });

      // If score exists and hashes match, score is current
      if (
        candidate.score !== null &&
        jobHashesMatch(candidate.job_hash, currentJobHash)
      ) {
        result.needsRescore = false;
      } else if (candidate.score === null) {
        // No score yet, needs rescoring
        result.needsRescore = true;
      } else {
        // Score exists but job has changed
        result.needsRescore = true;
      }
    } else if (candidate.score === null && candidate.job_id) {
      // Has job_id but no job found, needs rescoring
      result.needsRescore = true;
    }

    return result;
  });

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

// ---------------------------------------------------------------------------
// Documents (long-form PDFs with hybrid retrieval)
// ---------------------------------------------------------------------------

export type DocumentStatus = 'processing' | 'embedding' | 'ready' | 'failed';

export interface DocumentRecord {
  id: string;
  title: string;
  storage_path: string;
  strategy: 'narrative' | 'long_structured' | 'element_rich';
  page_count: number;
  status: DocumentStatus;
  error: string | null;
  created_at: string;
}

export interface DocumentChunkRow {
  id: string;
  parent_id: string | null;
  chunk_index: number;
  kind: 'section' | 'text' | 'table' | 'footnote' | 'figure';
  section_path: string;
  page_start: number;
  page_end: number;
  content: string;
}

const DOCUMENT_COLUMNS =
  'id, title, storage_path, strategy, page_count, status, error, created_at';

export async function createDocument(input: {
  title: string;
  storagePath: string;
  strategy: DocumentRecord['strategy'];
  pageCount: number;
  userId?: string | null;
}): Promise<DocumentRecord> {
  const client = createServiceClient();
  const { data, error } = await client
    .from('documents')
    .insert({
      title: input.title,
      storage_path: input.storagePath,
      strategy: input.strategy,
      page_count: input.pageCount,
      status: 'processing',
      user_id: input.userId ?? null,
    })
    .select(DOCUMENT_COLUMNS)
    .single();

  if (error) throw error;
  return data as DocumentRecord;
}

export async function setDocumentStatus(
  documentId: string,
  status: DocumentStatus,
  errorMessage: string | null = null
): Promise<void> {
  const client = createServiceClient();
  const { error } = await client
    .from('documents')
    .update({ status, error: errorMessage })
    .eq('id', documentId);

  if (error) throw error;
}

export async function getDocumentById(
  documentId: string
): Promise<DocumentRecord | null> {
  const client = createServiceClient();
  const { data, error } = await client
    .from('documents')
    .select(DOCUMENT_COLUMNS)
    .eq('id', documentId)
    .maybeSingle();

  if (error) throw error;
  return (data as DocumentRecord | null) ?? null;
}

export async function listDocuments(): Promise<DocumentRecord[]> {
  const client = createServiceClient();
  const { data, error } = await client
    .from('documents')
    .select(DOCUMENT_COLUMNS)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as DocumentRecord[];
}

/**
 * Inserts chunk rows without embeddings. Returns the generated ids in the
 * same order as the input so parent links can be resolved.
 */
export async function insertDocumentChunks(
  documentId: string,
  rows: Array<Omit<DocumentChunkRow, 'id' | 'document_id'>>
): Promise<string[]> {
  const client = createServiceClient();
  const ids: string[] = [];
  const batchSize = 200;

  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize).map((row) => ({
      ...row,
      document_id: documentId,
    }));
    const { data, error } = await client
      .from('document_chunks')
      .insert(batch)
      .select('id, chunk_index');

    if (error) throw error;
    const byIndex = new Map(
      (data || []).map((row: { id: string; chunk_index: number }) => [
        row.chunk_index,
        row.id,
      ])
    );
    for (const row of batch) ids.push(byIndex.get(row.chunk_index) as string);
  }

  return ids;
}

export async function countPendingDocumentChunks(
  documentId: string
): Promise<number> {
  const client = createServiceClient();
  const { count, error } = await client
    .from('document_chunks')
    .select('id', { count: 'exact', head: true })
    .eq('document_id', documentId)
    .is('embedding', null);

  if (error) throw error;
  return count ?? 0;
}

export async function getPendingDocumentChunks(
  documentId: string,
  limit: number
): Promise<Array<{ id: string; section_path: string; content: string }>> {
  const client = createServiceClient();
  const { data, error } = await client
    .from('document_chunks')
    .select('id, section_path, content')
    .eq('document_id', documentId)
    .is('embedding', null)
    .order('chunk_index', { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data || []) as Array<{
    id: string;
    section_path: string;
    content: string;
  }>;
}

export async function setDocumentChunkEmbedding(
  chunkId: string,
  embedding: number[]
): Promise<void> {
  const client = createServiceClient();
  const { error } = await client
    .from('document_chunks')
    .update({ embedding: JSON.stringify(embedding) })
    .eq('id', chunkId);

  if (error) throw error;
}

export interface DocumentSearchHit extends DocumentChunkRow {
  score: number;
}

export async function searchDocumentChunks(
  documentId: string,
  queryText: string,
  queryEmbedding: number[],
  matchCount: number
): Promise<DocumentSearchHit[]> {
  const client = createServiceClient();
  const { data, error } = await client.rpc('search_document_chunks', {
    p_document_id: documentId,
    p_query_text: queryText,
    p_query_embedding: JSON.stringify(queryEmbedding),
    p_match_count: matchCount,
  });

  if (error) throw error;
  return (data || []) as DocumentSearchHit[];
}

export async function getDocumentChunksByIndex(
  documentId: string,
  indexes: number[]
): Promise<DocumentChunkRow[]> {
  if (indexes.length === 0) return [];
  const client = createServiceClient();
  const { data, error } = await client
    .from('document_chunks')
    .select(
      'id, parent_id, chunk_index, kind, section_path, page_start, page_end, content'
    )
    .eq('document_id', documentId)
    .in('chunk_index', indexes);

  if (error) throw error;
  return (data || []) as DocumentChunkRow[];
}

export async function getDocumentChunksByIds(
  ids: string[]
): Promise<DocumentChunkRow[]> {
  if (ids.length === 0) return [];
  const client = createServiceClient();
  const { data, error } = await client
    .from('document_chunks')
    .select(
      'id, parent_id, chunk_index, kind, section_path, page_start, page_end, content'
    )
    .in('id', ids);

  if (error) throw error;
  return (data || []) as DocumentChunkRow[];
}
