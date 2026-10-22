/**
 * Evaluates the document Q&A pipeline on the hands-on use cases and compares
 * the rerank strategies on the same stored chunks.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/eval-documents.ts <dir-with-pdfs> \
 *     [--modes none,llm,cross-encoder] [--cache .eval-documents.json]
 *
 * The directory should contain GPO-Anual-report.pdf, GEP-Jun-2026.pdf and
 * iMac_PER_Oct2024.pdf (the files in documents/). Each PDF is ingested once with
 * the same code path as the UI. Document ids are saved to --cache, so later runs
 * skip ingestion and spend no embedding quota. Every question is then answered
 * under each rerank mode.
 *
 * Metrics, per mode, over questions that have expected fragments:
 *  - recall@20: a candidate passage contains every fragment (retrieval reached it)
 *  - hit@6:     a passage in the top 6 after rerank contains every fragment
 *  - MRR:       mean of 1 / rank of the first passage containing every fragment
 *  - answers:   the pipeline answered correctly, or abstained when expected to
 *
 * Caveat: with about 16 questions, differences under roughly 0.1 in MRR or a
 * hit rate are within noise. Treat small gaps as ties and re-run on more
 * questions before choosing a mode.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createServiceClient } from '@/lib/supabase/server';
import {
  createDocumentFromStorage,
  embedPendingChunks,
} from '@/lib/documents/ingest';
import {
  answerDocumentQuestion,
  type DocumentAnswer,
} from '@/lib/documents/graph';
import { RERANK_MODES, type RerankMode } from '@/lib/documents/rerank';
import { getDocumentById } from '@/lib/db';
import type { DocumentStrategy } from '@/lib/documents/chunk';

interface EvalQuestion {
  question: string;
  /** Every fragment must appear in the answer and in the passage that holds it. */
  expect?: string[];
  /** The pipeline should abstain rather than answer. */
  unanswerable?: boolean;
}

interface EvalCase {
  key: string;
  name: string;
  file: string;
  strategy: DocumentStrategy;
  questions: EvalQuestion[];
}

const CASES: EvalCase[] = [
  {
    key: 'gpo',
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
    key: 'gep',
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
          "What is Pakistan's GDP growth forecast for fiscal year 2026/27 in this report?",
        expect: ['3.2'],
      },
      {
        question:
          'What was the price of Bitcoin on the last day of 2025 according to this report?',
        unanswerable: true,
      },
    ],
  },
  {
    key: 'imac',
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
          'What share of the iMac carbon footprint comes from product use?',
        expect: ['45%'],
      },
      {
        question: 'What is the iMac power draw in sleep mode at 115V?',
        expect: ['0.57W'],
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
const RANK_CUTOFF = 6;

function containsAll(passage: string, fragments: string[]) {
  const haystack = passage.toLowerCase();
  return fragments.every((fragment) =>
    haystack.includes(fragment.toLowerCase())
  );
}

function answerMatches(answer: DocumentAnswer, fragments: string[]) {
  return answer.answerable && containsAll(answer.answer, fragments);
}

async function ingest(directory: string, evalCase: EvalCase): Promise<string> {
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
  console.log(
    `  ingested in ${((Date.now() - started) / 1000).toFixed(0)}s (document ${document.id})`
  );
  return document.id;
}

async function documentIdFor(
  directory: string,
  evalCase: EvalCase,
  cache: Record<string, string>
): Promise<string> {
  const cached = cache[evalCase.key];
  if (cached) {
    const document = await getDocumentById(cached);
    if (document?.status === 'ready') {
      console.log(`  reusing ${document.id} (cached, ready)`);
      return cached;
    }
    console.log('  cached document missing or not ready, ingesting again');
  }
  const id = await ingest(directory, evalCase);
  cache[evalCase.key] = id;
  return id;
}

interface Scores {
  total: number;
  correct: number;
  answerable: number;
  recall20: number;
  hitAt6: number;
  mrrSum: number;
}

function emptyScores(): Scores {
  return {
    total: 0,
    correct: 0,
    answerable: 0,
    recall20: 0,
    hitAt6: 0,
    mrrSum: 0,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const directory = args.find(
    (arg, index) =>
      !arg.startsWith('--') && !['--modes', '--cache'].includes(args[index - 1])
  );
  if (!directory) {
    console.error(
      'Usage: tsx scripts/eval-documents.ts <dir-with-pdfs> [--modes none,llm,cross-encoder] [--cache file.json]'
    );
    process.exit(1);
  }

  const modes = (flag('--modes') ?? RERANK_MODES.join(','))
    .split(',')
    .map((mode) => mode.trim())
    .filter(Boolean) as RerankMode[];
  for (const mode of modes) {
    if (!RERANK_MODES.includes(mode)) throw new Error(`Unknown mode: ${mode}`);
  }

  const cachePath = flag('--cache');
  const cache: Record<string, string> =
    cachePath && existsSync(cachePath)
      ? JSON.parse(readFileSync(cachePath, 'utf8'))
      : {};

  const documentIds: Record<string, string> = {};
  for (const evalCase of CASES) {
    console.log(`\n== ${evalCase.name}`);
    documentIds[evalCase.key] = await documentIdFor(directory, evalCase, cache);
    if (cachePath) writeFileSync(cachePath, JSON.stringify(cache, null, 2));
  }

  const summary = new Map<RerankMode, Scores>();
  for (const mode of modes) {
    console.log(`\n### rerank mode: ${mode}`);
    const scores = emptyScores();
    summary.set(mode, scores);

    for (const evalCase of CASES) {
      console.log(`\n== ${evalCase.name}`);
      for (const item of evalCase.questions) {
        const answer = await answerDocumentQuestion({
          documentId: documentIds[evalCase.key],
          question: item.question,
          strategy: evalCase.strategy,
          rerankMode: mode,
          includeDebug: true,
        });
        const debug = answer.debug;

        const correct = item.unanswerable
          ? !answer.answerable
          : answerMatches(answer, item.expect ?? []);
        scores.total += 1;
        if (correct) scores.correct += 1;

        const fragments = item.expect ?? [];
        if (!item.unanswerable && fragments.length > 0) {
          scores.answerable += 1;
          const candidates = debug?.candidates ?? [];
          const ranked = debug?.ranked ?? [];
          if (candidates.some((text) => containsAll(text, fragments))) {
            scores.recall20 += 1;
          }
          const rank = ranked.findIndex((text) => containsAll(text, fragments));
          if (rank >= 0 && rank < RANK_CUTOFF) scores.hitAt6 += 1;
          if (rank >= 0) scores.mrrSum += 1 / (rank + 1);
        }

        console.log(`  ${correct ? 'PASS' : 'FAIL'}  ${item.question}`);
        console.log(
          `        answer: ${answer.answer.slice(0, 200).replace(/\s+/g, ' ')}`
        );
        console.log(
          `        citations: ${answer.citations.map((c) => `${c.label}(${c.kind} ${c.pages})`).join(', ') || 'none'}`
        );
        if (debug) {
          console.log(`        route: ${debug.route.reason}`);
        }
        if (answer.unverifiedNumbers.length > 0) {
          console.log(
            `        unverified numbers: ${answer.unverifiedNumbers.join(', ')}`
          );
        }
      }
    }
  }

  console.log('\n### summary');
  console.log('mode           answers    recall@20   hit@6    MRR');
  for (const [mode, scores] of summary) {
    const pct = (value: number, of: number) =>
      of === 0 ? '  -  ' : `${((value / of) * 100).toFixed(0).padStart(3)}%`;
    console.log(
      `${mode.padEnd(14)} ${`${scores.correct}/${scores.total}`.padEnd(10)} ${pct(scores.recall20, scores.answerable).padEnd(11)} ${pct(scores.hitAt6, scores.answerable).padEnd(8)} ${(scores.answerable === 0 ? 0 : scores.mrrSum / scores.answerable).toFixed(2)}`
    );
  }
  console.log(
    '\nWith this few questions, gaps under about 0.1 in MRR or a few points of hit rate are noise.'
  );

  const failed = [...summary.values()].some((s) => s.correct < s.total);
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
