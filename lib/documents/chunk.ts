import type { Block } from './structure';
import { chapterForHeading, regionForHeading } from './regions';

/**
 * Chunking strategies, one per document shape:
 *  - narrative:       sentence windows with page and heading metadata.
 *  - long_structured: parent windows (~3,300 chars, what the model reads) per
 *                     section, plus child windows (~900 chars, what we search)
 *                     that point back to the parent containing them.
 *  - element_rich:    sentence windows plus standalone table, footnote and
 *                     figure chunks. Footnote markers in body text pull their
 *                     note text into the chunk that cites them.
 *
 * Every window is built from whole sentences, with the last sentences of one
 * window repeated at the start of the next so a fact at a boundary stays whole.
 */

export const DOCUMENT_STRATEGIES = [
  'narrative',
  'long_structured',
  'element_rich',
] as const;

export type DocumentStrategy = (typeof DOCUMENT_STRATEGIES)[number];
export type ChunkKind =
  'section' | 'text' | 'table' | 'footnote' | 'figure' | 'callout';

export interface ChunkDraft {
  kind: ChunkKind;
  sectionPath: string;
  /** "Chapter N" from the nearest chapter heading, or ''. */
  chapter?: string;
  /** Region name from the nearest regional heading, or ''. */
  region?: string;
  pageStart: number;
  pageEnd: number;
  content: string;
  /** Index into the drafts array of the section this chunk belongs to. */
  parentIndex?: number;
}

interface SectionMeta {
  chapter: string;
  region: string;
}

/** Child windows are searched; parent windows are what the model reads. */
const CHILD_CHARS = 900;
const CHILD_OVERLAP_CHARS = 240;
const PARENT_CHARS = 3300;
const NOTE_CHARS = 700;

const ABBREVIATIONS = new Set([
  'mr',
  'mrs',
  'ms',
  'dr',
  'prof',
  'st',
  'no',
  'nos',
  'vs',
  'inc',
  'co',
  'ltd',
  'jr',
  'sr',
  'fy',
  'approx',
  'etc',
  'fig',
  'eq',
  'al',
  'vol',
  'ed',
  'dept',
  'jan',
  'feb',
  'mar',
  'apr',
  'jun',
  'jul',
  'aug',
  'sep',
  'sept',
  'oct',
  'nov',
  'dec',
  'cf',
  'ca',
]);

/**
 * A sentence ends at . ! or ? followed by whitespace and a capital, digit or
 * opening quote. Decimals ("6.3") have no space after the dot, so they never
 * match. Abbreviations ("U.S.", "No. 5", "e.g.") are skipped.
 */
const SENTENCE_END = /[.!?]["')\]”’]*\s+(?=["“‘(\[]?[A-Z0-9])/g;

function isAbbreviation(word: string) {
  const lower = word.toLowerCase().replace(/^[("“‘[]+/, '');
  return (
    ABBREVIATIONS.has(lower) ||
    /^[a-z]$/.test(lower) ||
    /^([a-z]\.)+[a-z]?$/.test(lower)
  );
}

/**
 * Splits prose into sentences without dropping text. Every character of the
 * input ends up in exactly one sentence (whitespace aside).
 */
export function splitSentences(text: string): string[] {
  const clean = text.trim();
  const sentences: string[] = [];
  let start = 0;
  for (const match of clean.matchAll(SENTENCE_END)) {
    const at = match.index ?? 0;
    const word = clean.slice(start, at).split(/\s+/).pop() ?? '';
    if (isAbbreviation(word)) continue;
    sentences.push(clean.slice(start, at + match[0].trimEnd().length));
    start = at + match[0].length;
  }
  const tail = clean.slice(start).trim();
  if (tail) sentences.push(tail);
  return sentences;
}

/** Breaks a run-on string at spaces so no unit exceeds the child size. */
function hardSplit(text: string, limit: number): string[] {
  const parts: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    let cut = rest.lastIndexOf(' ', limit);
    if (cut <= 0) cut = limit;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

/** One sentence, table row or other atomic piece of text, with its page. */
interface Unit {
  text: string;
  page: number;
  /** First unit of a paragraph: joined with a blank line, not a space. */
  breakBefore: boolean;
  /** Table rows and similar: joined with a newline, never merged into prose. */
  atomic: boolean;
}

interface Packed {
  start: number;
  end: number;
  content: string;
  pageStart: number;
  pageEnd: number;
}

interface Section extends SectionMeta {
  path: string;
  /** Prose runs between standalone chunks, or standalone chunk drafts. */
  runs: Array<Unit[] | ChunkDraft>;
}

function proseUnits(text: string, page: number, atomic = false): Unit[] {
  const pieces = atomic ? [text] : splitSentences(text);
  return pieces.flatMap((piece, index) =>
    hardSplit(piece, CHILD_CHARS).map((part, sub) => ({
      text: part,
      page,
      breakBefore: index === 0 && sub === 0 && !atomic,
      atomic,
    }))
  );
}

function joinUnits(units: Unit[], start: number, end: number): string {
  let out = '';
  for (let i = start; i < end; i++) {
    if (i > start) {
      const unit = units[i];
      if (unit.breakBefore) out += '\n\n';
      else if (unit.atomic || units[i - 1].atomic) out += '\n';
      else out += ' ';
    }
    out += units[i].text;
  }
  return out;
}

/**
 * Packs units into windows of about `target` characters. When `overlap` is
 * positive, each window starts with as many trailing units of the previous
 * window as fit in `overlap` characters.
 */
function packUnits(units: Unit[], target: number, overlap: number): Packed[] {
  const windows: Packed[] = [];
  const close = (start: number, end: number) => {
    windows.push({
      start,
      end,
      content: joinUnits(units, start, end),
      pageStart: units[start].page,
      pageEnd: units[end - 1].page,
    });
  };

  let start = 0;
  let length = 0;
  for (let i = 0; i < units.length; i++) {
    const size = units[i].text.length;
    if (i > start && length + size > target) {
      close(start, i);
      let next = i;
      let carried = 0;
      while (
        next > start + 1 &&
        carried + units[next - 1].text.length <= overlap
      ) {
        next--;
        carried += units[next].text.length;
      }
      start = next;
      length = carried;
    }
    length += size;
  }
  if (units.length > start) close(start, units.length);
  return windows;
}

interface HeadingFrame {
  level: number;
  text: string;
}

function currentPath(stack: HeadingFrame[]) {
  return stack.map((frame) => frame.text).join(' > ');
}

function toMarkdownTable(rows: string[][]): string {
  if (rows.length === 0) return '';
  const width = Math.max(...rows.map((row) => row.length));
  const escape = (value: string) => value.replace(/\|/g, '\\|').trim();
  const pad = (row: string[]) =>
    Array.from({ length: width }, (_, index) => escape(row[index] ?? ''));
  const [header, ...body] = rows.map(pad);
  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...body.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

/**
 * Groups blocks into sections (one per heading) and prose runs. Each section
 * carries the chapter and region in force at its heading. A chapter heading
 * resets the region, and a regional heading sets it until the next one.
 */
function buildSections(blocks: Block[], strategy: DocumentStrategy): Section[] {
  const sections: Section[] = [];
  const stack: HeadingFrame[] = [];
  let chapter = '';
  let region = '';
  let current: Section = { path: '', chapter, region, runs: [] };
  sections.push(current);
  let run: Unit[] | null = null;

  const proseInto = (units: Unit[]) => {
    if (!run) {
      run = [];
      current.runs.push(run);
    }
    run.push(...units);
  };
  const standalone = (draft: ChunkDraft) => {
    current.runs.push({
      ...draft,
      chapter: current.chapter,
      region: current.region,
    });
    run = null;
  };

  for (const block of blocks) {
    if (block.type === 'heading') {
      const level = block.level ?? 4;
      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }
      stack.push({ level, text: block.text });

      const chapterLabel = chapterForHeading(block.text);
      if (chapterLabel) {
        chapter = chapterLabel;
        region = '';
      }
      const regionLabel = regionForHeading(block.text);
      if (regionLabel) region = regionLabel;

      current = { path: currentPath(stack), chapter, region, runs: [] };
      sections.push(current);
      run = null;
      continue;
    }

    const page = block.page;
    const path = current.path;

    if (block.type === 'table') {
      if (strategy !== 'element_rich') {
        const rows = block.rows?.length
          ? block.rows.map((row) => row.join(' | '))
          : [block.text];
        proseInto(rows.flatMap((row) => proseUnits(row, page, true)));
        continue;
      }
      standalone({
        kind: 'table',
        sectionPath: path,
        pageStart: page,
        pageEnd: page,
        content: [block.caption, toMarkdownTable(block.rows ?? [])]
          .filter(Boolean)
          .join('\n'),
      });
      continue;
    }

    if (block.type === 'paragraph') {
      proseInto(proseUnits(block.text, page));
      continue;
    }

    // Numbered notes and figure captions are their own chunks. Unnumbered
    // small text (callout captions, chart labels) reads as prose.
    if (
      strategy === 'element_rich' &&
      (block.type === 'figure' || block.type === 'callout')
    ) {
      standalone({
        kind: block.type,
        sectionPath: path,
        pageStart: page,
        pageEnd: page,
        content: block.text,
      });
      continue;
    }
    if (strategy === 'element_rich' && block.numbered) {
      standalone({
        kind: 'footnote',
        sectionPath: path,
        pageStart: page,
        pageEnd: page,
        content: block.text,
      });
      continue;
    }

    // Footnotes and figure captions read as prose in the other strategies.
    proseInto(proseUnits(block.text, page));
  }

  return sections.filter((section) => section.runs.length > 0);
}

/** Long reports: parent windows for the model, child windows for search. */
function pushParented(drafts: ChunkDraft[], section: Section, units: Unit[]) {
  const meta = {
    sectionPath: section.path,
    chapter: section.chapter,
    region: section.region,
  };
  const parents = packUnits(units, PARENT_CHARS, 0);
  const parentIndexes = parents.map((parent) => {
    drafts.push({
      kind: 'section',
      ...meta,
      pageStart: parent.pageStart,
      pageEnd: parent.pageEnd,
      content: parent.content,
    });
    return drafts.length - 1;
  });

  for (const child of packUnits(units, CHILD_CHARS, CHILD_OVERLAP_CHARS)) {
    const owner = parents.findIndex(
      (parent) => child.start >= parent.start && child.start < parent.end
    );
    drafts.push({
      kind: 'text',
      ...meta,
      pageStart: child.pageStart,
      pageEnd: child.pageEnd,
      content: child.content,
      parentIndex: owner >= 0 ? parentIndexes[owner] : undefined,
    });
  }
}

function pushWindows(drafts: ChunkDraft[], section: Section, units: Unit[]) {
  for (const piece of packUnits(units, CHILD_CHARS, CHILD_OVERLAP_CHARS)) {
    drafts.push({
      kind: 'text',
      sectionPath: section.path,
      chapter: section.chapter,
      region: section.region,
      pageStart: piece.pageStart,
      pageEnd: piece.pageEnd,
      content: piece.content,
    });
  }
}

const NOTE_LABEL = /^\[?\^?(\d{1,3})\]?[.)]?\s*(\S[\s\S]*)$/;
const NOTE_MARKER = /\[\^(\d{1,3})\]/g;
const WORD_MARKER = /([a-z]{3,})(\d{1,2})(?=$|[\s.,;:)])/g;

/**
 * Footnote markers ([^n]) in body text are replaced by the note text, so the
 * claim and its caveat are retrieved together. Notes stay as their own chunks.
 */
function linkFootnotes(drafts: ChunkDraft[]) {
  const notes = new Map<number, string>();
  for (const draft of drafts) {
    if (draft.kind !== 'footnote') continue;
    const match = NOTE_LABEL.exec(draft.content);
    if (match) notes.set(Number(match[1]), match[2].trim());
  }

  for (const draft of drafts) {
    if (draft.kind === 'footnote') continue;
    // pdf.js joins a raised marker onto its word when both share a font size,
    // e.g. "achieved7". Only a number that names an existing note counts.
    draft.content = draft.content.replace(
      WORD_MARKER,
      (match, word: string, digits: string) =>
        notes.has(Number(digits)) ? `${word}[^${digits}]` : match
    );
    const refs = [...draft.content.matchAll(NOTE_MARKER)].map((m) =>
      Number(m[1])
    );
    if (refs.length === 0) continue;
    draft.content = draft.content
      .replace(NOTE_MARKER, '')
      .replace(/ {2,}/g, ' ')
      .trim();
    const lines = [...new Set(refs)]
      .filter((ref) => notes.has(ref))
      .map((ref) => `[Note ${ref}] ${notes.get(ref)!.slice(0, NOTE_CHARS)}`);
    if (lines.length > 0) draft.content += `\n${lines.join('\n')}`;
  }
}

export function chunkBlocks(
  blocks: Block[],
  strategy: DocumentStrategy
): ChunkDraft[] {
  const drafts: ChunkDraft[] = [];
  for (const section of buildSections(blocks, strategy)) {
    for (const run of section.runs) {
      if (!Array.isArray(run)) {
        drafts.push(run);
        continue;
      }
      if (strategy === 'long_structured') {
        pushParented(drafts, section, run);
      } else {
        pushWindows(drafts, section, run);
      }
    }
  }
  if (strategy === 'element_rich') linkFootnotes(drafts);
  return drafts;
}
