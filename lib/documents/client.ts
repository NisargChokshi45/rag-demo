/**
 * Browser helpers for the Documents pages. No secrets here; these only call
 * the document API routes.
 */

export async function readJson(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || `Request failed (${response.status})`);
  }
  return body;
}

/** Repeats the resumable embed step until the document reports ready. */
export async function embedUntilReady(
  documentId: string,
  onProgress?: (remaining: number) => void
) {
  for (;;) {
    const progress = await readJson(
      await fetch(`/api/documents/${documentId}/embed`, { method: 'POST' })
    );
    onProgress?.(progress.remaining ?? 0);
    if (progress.status === 'ready') return;
  }
}
