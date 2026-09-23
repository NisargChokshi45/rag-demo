import { createServerClient } from "./supabase/server";

interface ChunkWithEmbedding {
  content: string;
  embedding: number[];
}

export async function insertCandidate(
  name: string,
  roleGuess: string,
  storagePath: string,
  originalFilename: string,
  fullText: string
): Promise<string> {
  const client = createServerClient();

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
  const client = createServerClient();

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
  const client = createServerClient();
  const { error } = await client.from("candidates").delete().eq("id", candidateId);
  if (error) throw error;
}

export async function searchChunks(
  queryEmbedding: number[],
  matchCount: number
): Promise<any[]> {
  const client = createServerClient();

  // Use RPC to call the match_resume_chunks function
  const { data, error } = await client.rpc("match_resume_chunks", {
    query_embedding: queryEmbedding,
    match_count: matchCount,
  });

  if (error) throw error;
  return data || [];
}

export async function getFullResumeById(candidateId: string): Promise<string> {
  const client = createServerClient();

  const { data, error } = await client
    .from("candidates")
    .select("full_text")
    .eq("id", candidateId)
    .single();

  if (error) throw error;
  return data.full_text;
}

export async function listCandidates(): Promise<any[]> {
  const client = createServerClient();

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
