const CHUNK_SIZE = 800;
const OVERLAP = 100;

export function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    chunks.push(text.substring(start, end));

    // Move start by CHUNK_SIZE - OVERLAP for the next iteration
    start += CHUNK_SIZE - OVERLAP;

    // Prevent infinite loop if text is very small
    if (end === text.length) break;
  }

  return chunks;
}
