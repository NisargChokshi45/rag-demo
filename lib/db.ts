import { createServiceClient } from "./supabase/server";

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
  created_at: string;
}

export interface CreateJobInput {
  title: string;
  description: string;
  experience: string;
  skills: string[];
}

export async function createJob(input: CreateJobInput): Promise<Job> {
  const client = createServiceClient();
  const { data, error } = await client
    .from("jobs")
    .insert(input)
    .select("id, title, description, experience, skills, created_at")
    .single();

  if (error) throw error;
  return data as Job;
}

export async function listJobs(): Promise<Job[]> {
  const client = createServiceClient();
  const { data, error } = await client
    .from("jobs")
    .select("id, title, description, experience, skills, created_at")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []) as Job[];
}

export async function getJobById(jobId: string): Promise<Job> {
  const client = createServiceClient();
  const { data, error } = await client
    .from("jobs")
    .select("id, title, description, experience, skills, created_at")
    .eq("id", jobId)
    .single();

  if (error) throw error;
  return data as Job;
}

export async function insertCandidate(
  name: string,
  roleGuess: string,
  storagePath: string,
  originalFilename: string,
  fullText: string
): Promise<string> {
  const client = createServiceClient();

  const { data, error } = await client
    .from("candidates")
    .insert([
      {
        name,
        role_guess: roleGuess,
        storage_path: storagePath,
        original_filename: originalFilename,
        full_text: fullText,
      },
    ])
    .select("id")
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

  const { error } = await client.from("resume_chunks").insert(chunksData);

  if (error) throw error;
}

export async function deleteCandidate(candidateId: string): Promise<void> {
  const client = createServiceClient();
  const { error } = await client.from("candidates").delete().eq("id", candidateId);
  if (error) throw error;
}

export async function searchChunks(
  queryEmbedding: number[],
  matchCount: number
): Promise<any[]> {
  const client = createServiceClient();

  // Use RPC to call the match_resume_chunks function
  const { data, error } = await client.rpc("match_resume_chunks", {
    query_embedding: queryEmbedding,
    match_count: matchCount,
  });

  if (error) throw error;
  return data || [];
}

export async function getFullResumeById(candidateId: string): Promise<string> {
  const client = createServiceClient();

  const { data, error } = await client
    .from("candidates")
    .select("full_text")
    .eq("id", candidateId)
    .single();

  if (error) throw error;
  return data.full_text;
}

export async function listCandidates(): Promise<any[]> {
  const client = createServiceClient();

  const { data: candidates, error: candidatesError } = await client
    .from("candidates")
    .select("id, name, role_guess, original_filename");

  if (candidatesError) throw candidatesError;

  // Get chunk counts for each candidate
  const { data: chunkCounts, error: chunkError } = await client
    .from("resume_chunks")
    .select("candidate_id");

  if (chunkError) throw chunkError;

  const countMap: Record<string, number> = {};
  chunkCounts.forEach((chunk: any) => {
    countMap[chunk.candidate_id] = (countMap[chunk.candidate_id] || 0) + 1;
  });

  return candidates.map((candidate: any) => ({
    ...candidate,
    chunk_count: countMap[candidate.id] || 0,
  }));
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
    .from("screenings")
    .insert({
      job_id: jobId,
      query,
      summary,
    })
    .select("id")
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
    .from("screening_assessments")
    .insert(assessmentData);

  if (assessmentError) throw assessmentError;

  return screeningId;
}

export async function getScreeningsByJob(jobId: string): Promise<any[]> {
  const client = createServiceClient();

  const { data, error } = await client
    .from("screenings")
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
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getAssessmentsByCandidate(
  candidateId: string
): Promise<any[]> {
  const client = createServiceClient();

  const { data, error } = await client
    .from("screening_assessments")
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
    .eq("candidate_id", candidateId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}
