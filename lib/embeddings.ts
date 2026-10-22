export const EMBEDDING_DIMENSIONS = 1536;

const EMBEDDING_MODEL =
  process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-2';

function formatEmbeddingInput(text: string, kind: 'document' | 'query') {
  return kind === 'document'
    ? `title: none | text: ${text}`
    : `task: search result | query: ${text}`;
}

/**
 * Raised when Gemini rejects an embedding call with a 429. `retryAt` is the
 * earliest time the call can succeed, or null when Gemini sent no delay.
 */
export class EmbeddingQuotaError extends Error {
  readonly retryAt: Date | null;

  constructor(details: string) {
    const retryAt = quotaRetryAt(details);
    super(quotaMessage(retryAt));
    this.name = 'EmbeddingQuotaError';
    this.retryAt = retryAt;
  }
}

/** Reads the retry delay from Gemini's JSON body, which is long and noisy. */
function quotaRetryAt(details: string): Date | null {
  let retryDelaySeconds: number | undefined;
  try {
    const body = JSON.parse(details) as {
      error?: { details?: Array<{ retryDelay?: string }> };
    };
    const delay = body.error?.details?.find((item) => item.retryDelay);
    retryDelaySeconds = delay?.retryDelay
      ? Number.parseFloat(delay.retryDelay)
      : undefined;
  } catch {
    retryDelaySeconds = undefined;
  }

  if (!retryDelaySeconds || !Number.isFinite(retryDelaySeconds)) return null;
  return new Date(Date.now() + retryDelaySeconds * 1000);
}

/** A short sentence for the UI, used when no retry time is known. */
function quotaMessage(retryAt: Date | null) {
  if (!retryAt) return 'Embedding quota reached. Retry later.';
  const totalMinutes = Math.ceil((retryAt.getTime() - Date.now()) / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `Embedding quota reached. Retry in about ${hours}h ${minutes}m.`;
}

async function embed(
  text: string,
  kind: 'document' | 'query'
): Promise<number[]> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY is missing');
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text: formatEmbeddingInput(text, kind) }] },
        outputDimensionality: EMBEDDING_DIMENSIONS,
      }),
    }
  );

  if (!response.ok) {
    const details = await response.text();
    if (response.status === 429) {
      throw new EmbeddingQuotaError(details);
    }
    throw new Error(`Gemini embedding failed (${response.status}): ${details}`);
  }

  const payload = (await response.json()) as {
    embedding?: { values?: number[] };
  };
  const values = payload.embedding?.values;
  if (!values || values.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Gemini returned ${values?.length || 0} dimensions; expected ${EMBEDDING_DIMENSIONS}`
    );
  }

  return values;
}

export function embedDocument(text: string): Promise<number[]> {
  return embed(text, 'document');
}

export function embedQuery(text: string): Promise<number[]> {
  return embed(text, 'query');
}
