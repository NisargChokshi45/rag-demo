/**
 * Re-parses and re-chunks uploaded documents with their current strategy,
 * then embeds the new chunks. Old chunks are replaced only after the PDF
 * parses successfully.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/reparse-documents.ts            # all documents
 *   npx tsx --env-file=.env.local scripts/reparse-documents.ts <id> [...] # selected ids
 *   npx tsx --env-file=.env.local scripts/reparse-documents.ts --metadata [id ...]
 *
 * --metadata refreshes chapter, region and chart-page labels on the existing
 * chunks. It then runs the embed loop, which only reads chart pages not yet
 * cached and embeds the new figure chunks. Chunks whose text changed are
 * reported; those documents need a full run without the flag.
 *
 * Embedding is sequential and paced by the Gemini quota. If a 429 occurs, the
 * script stops that document and reports it. Every run re-parses the selected
 * documents from their PDFs, so after a quota stop, pass only the ids that
 * still need work (the list prints them as "(id)") rather than re-running all.
 */

import {
  embedPendingChunks,
  refreshChunkMetadata,
  reparseDocument,
} from '@/lib/documents/ingest';
import { getDocumentById, listDocuments } from '@/lib/db';

const EMBED_BUDGET_MS = 240_000;

async function main() {
  const args = process.argv.slice(2);
  const metadataOnly = args.includes('--metadata');
  const requested = args.filter((arg) => !arg.startsWith('--'));
  const documents = requested.length
    ? await Promise.all(requested.map((id) => getDocumentById(id)))
    : await listDocuments();

  const targets = documents.filter(
    (document): document is NonNullable<typeof document> => Boolean(document)
  );
  if (targets.length === 0) {
    console.log('No documents found.');
    return;
  }

  for (const document of targets) {
    console.log(
      `\n📄 ${document.title} [${document.strategy}] (${document.id})`
    );
    try {
      if (metadataOnly) {
        const result = await refreshChunkMetadata(document.id);
        console.log(
          `   labels: updated ${result.updated}, unchanged ${result.unchanged}, needs re-parse ${result.mismatched}`
        );
        console.log('   reading chart pages not yet cached…');
      } else {
        await reparseDocument(document.id);
        console.log('   parsed and chunked, embedding…');
      }

      let remaining = Infinity;
      while (remaining > 0) {
        const progress = await embedPendingChunks(document.id, EMBED_BUDGET_MS);
        remaining = progress.remaining;
        console.log(`   ${progress.status}, ${progress.remaining} chunks left`);
      }
      console.log('   ✅ ready');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`   ❌ ${message}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
