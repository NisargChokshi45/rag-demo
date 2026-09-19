// TODO: Implement database functions
// Expected interface:
// export async function insertCandidate(...): Promise<string> (id)
// export async function insertChunks(...): Promise<void>
// export async function searchChunks(...): Promise<any[]>
// export async function getFullResumeById(...): Promise<string>
// export async function listCandidates(): Promise<any[]>

export async function insertCandidate(
  _name: string,
  _roleGuess: string,
  _storagePath: string,
  _originalFilename: string,
  _fullText: string
): Promise<string> {
  throw new Error("Not implemented");
}

export async function insertChunks(
  _candidateId: string,
  _chunks: string[]
): Promise<void> {
  throw new Error("Not implemented");
}

export async function searchChunks(
  _queryEmbedding: number[],
  _matchCount: number
): Promise<any[]> {
  throw new Error("Not implemented");
}

export async function getFullResumeById(_candidateId: string): Promise<string> {
  throw new Error("Not implemented");
}

export async function listCandidates(): Promise<any[]> {
  throw new Error("Not implemented");
}
