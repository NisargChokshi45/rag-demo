import type { Block } from './structure';

/**
 * Chunking strategies, one per document shape:
 *  - narrative:       paragraph windows with page and heading metadata.
 *  - long_structured: section rows (embedded for section-level routing) plus
 *                     paragraph windows that point back to their section.
 *  - element_rich:    paragraph windows plus standalone table, footnote and
 *                     figure-caption chunks so visual facts stay searchable.
 */

export const DOCUMENT_STRATEGIES = [
  'narrative',
  'long_structured',
  'element_rich',
] as const;

export type DocumentStrategy = (typeof DOCUMENT_STRATEGIES)[number];
export type ChunkKind = 'section' | 'text' | 'table' | 'footnote' | 'figure';

export interface ChunkDraft {
  kind: ChunkKind;
  sectionPath: string;
  pageStart: number;
  pageEnd: number;
  content: string;
  /** Index into the drafts array of the section this chunk belongs to. */
  parentIndex?: number;
}

const TARGET_CHARS = 900;
const MAX_PIECE_CHARS = 1300;
const OVERLAP_MAX_CHARS = 300;
const SECTION_INTRO_CHARS = 1200;

interface Piece {
  text: string;
  page: number;
}

interface Packed {
  content: string;
  pageStart: number;
  pageEnd: number;
}

function splitSentences(text: string, limit: number): string[] {
  if (text.length <= limit) return [text];
  const sentences = text.match(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g) || [text];
  const pieces: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    const next = sentence.trim();
    if (!next) continue;
    if (current && current.length + next.length + 1 > limit) {
      pieces.push(current);
      current = next;
    } else {
      current = current ? `${current} ${next}` : next;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

function packPieces(pieces: Piece[]): Packed[] {
  interface Window {
    texts: string[];
    pageStart: number;
    pageEnd: number;
    length: number;
  }
  const packed: Packed[] = [];
  let current: Window | null = null;

  const finalize = () => {
    if (!current) return;
    packed.push({
      content: current.texts.join('\n\n'),
      pageStart: current.pageStart,
      pageEnd: current.pageEnd,
    });
  };

  for (const piece of pieces) {
    for (const text of splitSentences(piece.text, MAX_PIECE_CHARS)) {
      if (current && current.length + text.length > TARGET_CHARS) {
        const last: string = current.texts[current.texts.length - 1];
        finalize();
        // Carry the previous paragraph forward so context spans the boundary.
        const overlap: string[] =
          last.length <= OVERLAP_MAX_CHARS ? [last] : [];
        current = {
          texts: overlap,
          pageStart: piece.page,
          pageEnd: piece.page,
          length: overlap.reduce(
            (sum: number, value: string) => sum + value.length,
            0
          ),
        };
      }
      if (!current) {
        current = {
          texts: [],
          pageStart: piece.page,
          pageEnd: piece.page,
          length: 0,
        };
      }
      current.texts.push(text);
      current.length += text.length;
      current.pageEnd = piece.page;
    }
  }
  finalize();
  return packed;
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

interface HeadingFrame {
  level: number;
  text: string;
}

function currentPath(stack: HeadingFrame[]) {
  return stack.map((frame) => frame.text).join(' > ');
}

/** Paragraph text that follows a heading, up to the next heading. */
function sectionIntro(
  blocks: Block[],
  start: number
): { text: string; pageEnd: number } {
  const parts: string[] = [];
  let pageEnd = blocks[start].page;
  let length = 0;
  for (let index = start + 1; index < blocks.length; index++) {
    const block = blocks[index];
    if (block.type === 'heading') break;
    if (block.type !== 'paragraph') continue;
    parts.push(block.text);
    pageEnd = block.page;
    length += block.text.length;
    if (length >= SECTION_INTRO_CHARS) break;
  }
  return { text: parts.join('\n\n').slice(0, SECTION_INTRO_CHARS), pageEnd };
}

export function chunkBlocks(
  blocks: Block[],
  strategy: DocumentStrategy
): ChunkDraft[] {
  const drafts: ChunkDraft[] = [];
  const stack: HeadingFrame[] = [];
  let buffer: Piece[] = [];
  let bufferPath = '';
  let sectionIndex: number | undefined;

  const flush = () => {
    if (buffer.length === 0) return;
    for (const packed of packPieces(buffer)) {
      drafts.push({
        kind: 'text',
        sectionPath: bufferPath,
        pageStart: packed.pageStart,
        pageEnd: packed.pageEnd,
        content: packed.content,
        parentIndex: sectionIndex,
      });
    }
    buffer = [];
  };

  blocks.forEach((block, index) => {
    if (block.type === 'heading') {
      flush();
      const level = block.level ?? 4;
      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }
      stack.push({ level, text: block.text });

      // Every structural heading opens a section row, so routing can land on
      // a chapter, section or sub-section rather than only the top level.
      if (strategy === 'long_structured') {
        const intro = sectionIntro(blocks, index);
        sectionIndex = drafts.length;
        drafts.push({
          kind: 'section',
          sectionPath: currentPath(stack),
          pageStart: block.page,
          pageEnd: intro.pageEnd,
          content: intro.text,
        });
      }
      bufferPath = currentPath(stack);
      return;
    }

    if (
      block.type === 'paragraph' ||
      (block.type === 'footnote' && strategy !== 'element_rich') ||
      (block.type === 'figure' && strategy !== 'element_rich')
    ) {
      if (buffer.length === 0) bufferPath = currentPath(stack);
      buffer.push({ text: block.text, page: block.page });
      return;
    }

    if (block.type === 'table') {
      if (strategy !== 'element_rich') {
        if (buffer.length === 0) bufferPath = currentPath(stack);
        buffer.push({
          text: block.rows
            ? block.rows.map((row) => row.join(' | ')).join('\n')
            : block.text,
          page: block.page,
        });
        return;
      }
      flush();
      const markdown = toMarkdownTable(block.rows ?? []);
      drafts.push({
        kind: 'table',
        sectionPath: currentPath(stack),
        pageStart: block.page,
        pageEnd: block.page,
        content: [block.caption, markdown].filter(Boolean).join('\n'),
        parentIndex: sectionIndex,
      });
      return;
    }

    if (block.type === 'footnote') {
      flush();
      drafts.push({
        kind: 'footnote',
        sectionPath: currentPath(stack),
        pageStart: block.page,
        pageEnd: block.page,
        content: block.text,
        parentIndex: sectionIndex,
      });
      return;
    }

    // Figure captions that are not attached to a table.
    flush();
    drafts.push({
      kind: 'figure',
      sectionPath: currentPath(stack),
      pageStart: block.page,
      pageEnd: block.page,
      content: block.text,
      parentIndex: sectionIndex,
    });
  });

  flush();
  return drafts;
}
