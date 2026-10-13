/**
 * Evaluates the document Q&A pipeline on the three hands-on use cases.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/eval-documents.ts <dir-with-pdfs>
 *
 * The directory should contain GPO-Anual-report.pdf, GEP-Jun-2026.pdf and
 * iMac_PER_Oct2024.pdf (the files in documents/). Each PDF is uploaded to the
 * `documents` bucket, ingested with the same code path as the UI, and each
 * question is answered with the LangGraph pipeline. A question passes when
 * its answer contains every expected fragment, or abstains when it is marked
 * as unanswerable.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createServiceClient } from '@/lib/supabase/server';
import {
  createDocumentFromStorage,
  embedPendingChunks,
} from '@/lib/documents/ingest';
import { answerDocumentQuestion } from '@/lib/documents/graph';
import type { DocumentStrategy } from '@/lib/documents/chunk';

interface EvalQuestion {
  question: string;
  /** Every fragment must appear in the answer (case-insensitive). */
  expect?: string[];
  /** The pipeline should abstain rather than answer. */
  unanswerable?: boolean;
}

interface EvalCase {
  name: string;
  file: string;
  strategy: DocumentStrategy;
  questions: EvalQuestion[];
}

const CASES: EvalCase[] = [
  {
    name: 'GPO 2018 Annual Report (narrative)',
    file: 'GPO-Anual-report.pdf',
    strategy: 'narrative',
    questions: [
      {
        question:
          'How many depository libraries did GPO staff visit in FY 2018?',
        expect: ['166'],
      },
      {
        question:
          'What new digital system replaced FDsys, and when was it fully deployed?',
        expect: ['govinfo', 'FY 2018'],
      },
      {
        question:
          'How much did GPO procure in printing and information products in FY 2018 on behalf of federal agencies?',
        expect: ['375'],
      },
      {
        question: 'What was the GPO stock price at the end of FY 2018?',
        unanswerable: true,
      },
    ],
  },
  {
    name: 'Global Economic Prospects, June 2026 (long, structured)',
    file: 'GEP-Jun-2026.pdf',
    strategy: 'long_structured',
    questions: [
      {
        question: 'What is the growth outlook for South Asia in this report?',
        expect: ['South Asia', '%'],
      },
      {
        question:
          'What does Chapter 3 say about sovereign debt in developing economies?',
        expect: ['sovereign debt'],
      },
      {
        question:
          'According to the executive summary, what are the main risks to the global outlook?',
        expect: ['risk'],
      },
      {
        question:
          'What was the price of Bitcoin on the last day of 2025 according to this report?',
        unanswerable: true,
      },
    ],
  },
  {
    name: 'iMac Product Environmental Report (tables, charts, footnotes)',
    file: 'iMac_PER_Oct2024.pdf',
    strategy: 'element_rich',
    questions: [
      {
        question:
          'How much less energy does iMac use compared to the ENERGY STAR requirement?',
        expect: ['58'],
      },
      {
        question:
          'What is the total carbon footprint of the iMac, and how much of that comes from product use versus manufacturing?',
        expect: ['346'],
      },
      {
        question:
          'What material is the iMac stand made from, and what percentage of it is recycled?',
        expect: ['aluminum', '100'],
      },
      {
        question:
          'How many iMac units were sold in the fourth quarter of 2024?',
        unanswerable: true,
      },
    ],
  },
];

const EMBED_BUDGET_MS = 240_000;

function matchesExpectations(answer: string, expect: string[]) {
  const haystack = answer.toLowerCase();
  return expect.every((fragment) => haystack.includes(fragment.toLowerCase()));
}

async function ingest(directory: string, evalCase: EvalCase) {
  const client = createServiceClient();
  const buffer = readFileSync(path.join(directory, evalCase.file));
  const storagePath = `eval/${Date.now()}-${evalCase.file}`;

  const { error } = await client.storage
    .from('documents')
    .upload(storagePath, buffer, {
      contentType: 'application/pdf',
      upsert: false,
    });
  if (error) throw new Error(`Upload failed: ${error.message}`);

  const started = Date.now();
  const document = await createDocumentFromStorage({
    storagePath,
    strategy: evalCase.strategy,
    title: evalCase.name,
  });

  for (;;) {
    const progress = await embedPendingChunks(document.id, EMBED_BUDGET_MS);
    if (progress.status === 'ready') break;
    console.log(`  embedding… ${progress.remaining} chunks left`);
  }
  return { documentId: document.id, seconds: (Date.now() - started) / 1000 };
}

async function main() {
  const directory = process.argv[2];
  if (!directory) {
    console.error('Usage: tsx scripts/eval-documents.ts <dir-with-pdfs>');
    process.exit(1);
  }

  let passed = 0;
  let total = 0;

  for (const evalCase of CASES) {
    console.log(`\n== ${evalCase.name}`);
    const { documentId, seconds } = await ingest(directory, evalCase);
    console.log(
      `  ingested in ${seconds.toFixed(0)}s (document ${documentId})`
    );

    for (const item of evalCase.questions) {
      total += 1;
      const answer = await answerDocumentQuestion({
        documentId,
        question: item.question,
      });

      const ok = item.unanswerable
        ? !answer.answerable
        : answer.answerable &&
          matchesExpectations(answer.answer, item.expect ?? []);
      if (ok) passed += 1;

      console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${item.question}`);
      console.log(
        `        answer: ${answer.answer.slice(0, 200).replace(/\s+/g, ' ')}`
      );
      console.log(
        `        citations: ${answer.citations.map((c) => `${c.label}(${c.kind} ${c.pages})`).join(', ') || 'none'}`
      );
      if (answer.unverifiedNumbers.length > 0) {
        console.log(
          `        unverified numbers: ${answer.unverifiedNumbers.join(', ')}`
        );
      }
    }
  }

  console.log(`\n${passed}/${total} questions passed`);
  if (passed < total) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
