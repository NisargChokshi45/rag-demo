import { countTermByRegion } from '@/lib/db';
import { chapterInQuestion, regionInQuestion } from './regions';

/**
 * Decides which chapter or region a question is about, so search can be
 * limited to it. A filter is applied only when the question names one:
 *
 *  1. A chapter named in the question ("Chapter 3") filters by chapter.
 *  2. A region named by its name or abbreviation ("South Asia", "SAR").
 *  3. A place name (e.g. a country) the question mentions. The region is the
 *     one whose tagged passages mention that name most often, provided it
 *     dominates. Only passages inside a region are counted.
 *
 * Search falls back to the whole document when a filtered search comes back
 * thin, so a wrong filter cannot hide the answer entirely.
 */

export interface QuestionRoute {
  chapter: string | null;
  region: string | null;
  reason: string;
}

/** Capitalised words that start questions or sentences, not place names. */
const STOPWORDS = new Set([
  'what',
  'which',
  'when',
  'where',
  'who',
  'how',
  'why',
  'is',
  'are',
  'was',
  'were',
  'does',
  'do',
  'did',
  'the',
  'this',
  'that',
  'these',
  'those',
  'in',
  'of',
  'for',
  'and',
  'or',
  'according',
  'report',
  'chapter',
  'section',
  'figure',
  'table',
  'chart',
  'it',
  'its',
  'their',
  'there',
  'global',
  'growth',
  'outlook',
  'risks',
  'risk',
  'percent',
  'year',
  'fy',
  'i',
  'a',
  'an',
  'to',
  'on',
  'by',
  'with',
  'from',
  'as',
]);

const DOMINANCE = 0.7;
const MIN_MENTIONS = 2;

/**
 * Candidate place names: runs of capitalised words such as "Sri Lanka". Words
 * in capitals (GDP, FY) and possessives are not place names.
 */
export function placeCandidates(question: string): string[] {
  const terms = new Set<string>();
  let run: string[] = [];
  const flush = () => {
    const term = run.join(' ');
    run = [];
    if (term.length >= 3 && !STOPWORDS.has(term.toLowerCase())) terms.add(term);
  };
  for (const raw of question.split(/\s+/)) {
    const word = raw.replace(/[?.,;:()"“”]/g, '').replace(/[’']s$/, '');
    const capitalised = /^[A-Z][a-z][A-Za-z'’-]*$/.test(word);
    if (capitalised && !STOPWORDS.has(word.toLowerCase())) {
      run.push(word);
    } else {
      flush();
      if (capitalised) run = [];
    }
  }
  flush();
  return [...terms];
}

export async function routeQuestion(
  documentId: string,
  question: string
): Promise<QuestionRoute> {
  const chapter = chapterInQuestion(question);
  if (chapter) {
    return { chapter, region: null, reason: `question names ${chapter}` };
  }

  const named = regionInQuestion(question);
  if (named) {
    return { chapter: null, region: named, reason: `question names ${named}` };
  }

  for (const term of placeCandidates(question)) {
    const counts = await countTermByRegion(documentId, term);
    const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
    if (total < MIN_MENTIONS) continue;

    const [topRegion, topCount] = [...counts].sort((a, b) => b[1] - a[1])[0];
    if (topCount / total >= DOMINANCE) {
      return {
        chapter: null,
        region: topRegion,
        reason: `"${term}" appears in ${topCount} of ${total} regional passages, most in ${topRegion}`,
      };
    }
  }

  return { chapter: null, region: null, reason: 'no chapter or region named' };
}
