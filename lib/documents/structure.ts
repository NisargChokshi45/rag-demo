import type { DocumentLayout, TextLine } from './layout';

/**
 * Turns the line layout into typed blocks (headings, paragraphs, tables,
 * footnotes, captions) in reading order. Font sizes relative to the body
 * text drive heading and footnote detection; cell gaps drive table detection.
 */

export type BlockType =
  'heading' | 'paragraph' | 'table' | 'footnote' | 'figure';

export interface Block {
  type: BlockType;
  page: number;
  /** Heading depth, 1 = largest heading in the document. */
  level?: number;
  text: string;
  rows?: string[][];
  /** Caption that labels a table or figure (e.g. "Figure 2.1 ..."). */
  caption?: string;
}

const CAPTION =
  /^(figure|chart|table|graph|exhibit|box|map)\s+[A-Za-z]*\.?\d[\w.-]*/i;
const NOTE = /^(source|sources|note|notes)\b[:.\s]/i;
const FOOTNOTE_MARKER = /^[\d*†‡]{1,3}\s+\S/;
const NUMERIC = /\d/;

function isRunningTextNoise(
  line: TextLine,
  repeats: Map<string, number>,
  pageCount: number
) {
  const key = line.text.toLowerCase().replace(/\d+/g, '#').trim();
  const threshold = Math.max(3, Math.floor(pageCount * 0.3));
  if ((repeats.get(key) || 0) >= threshold && line.text.length <= 120)
    return true;
  // Bare page numbers in the header or footer band
  if (/^\d{1,4}$/.test(line.text) && (line.relY < 0.08 || line.relY > 0.92))
    return true;
  return false;
}

function countRepeats(lines: TextLine[]) {
  const pagesByKey = new Map<string, Set<number>>();
  for (const line of lines) {
    const key = line.text.toLowerCase().replace(/\d+/g, '#').trim();
    if (!key) continue;
    if (!pagesByKey.has(key)) pagesByKey.set(key, new Set());
    pagesByKey.get(key)!.add(line.page);
  }
  const repeats = new Map<string, number>();
  for (const [key, pages] of pagesByKey) repeats.set(key, pages.size);
  return repeats;
}

function isTableRow(line: TextLine) {
  if (line.cells.length >= 3) return true;
  return (
    line.cells.length === 2 &&
    line.cells.some((cell) => NUMERIC.test(cell.text))
  );
}

function sameBand(a: TextLine, b: TextLine) {
  return a.page === b.page && Math.abs(a.fontSize - b.fontSize) < 0.6;
}

function verticalGap(a: TextLine, b: TextLine) {
  return Math.abs(a.y - b.y);
}

function joinParagraph(parts: string[]) {
  return parts.reduce((acc, part) => {
    if (!acc) return part;
    if (acc.endsWith('-') && /^[a-z]/.test(part)) {
      return acc.slice(0, -1) + part;
    }
    return `${acc} ${part}`;
  }, '');
}

function headingLevels(lines: TextLine[], bodySize: number) {
  const sizes = [
    ...new Set(
      lines
        .filter((line) => isHeadingCandidate(line, bodySize))
        .map((line) => line.fontSize)
    ),
  ].sort((a, b) => b - a);
  return new Map(sizes.map((size, index) => [size, Math.min(index + 1, 4)]));
}

function isHeadingCandidate(line: TextLine, bodySize: number) {
  return (
    line.fontSize >= bodySize * 1.25 &&
    line.text.length <= 140 &&
    /[A-Za-z]/.test(line.text) &&
    line.cells.length <= 2
  );
}

export function buildBlocks(layout: DocumentLayout): Block[] {
  const repeats = countRepeats(layout.lines);
  const lines = layout.lines.filter(
    (line) => !isRunningTextNoise(line, repeats, layout.pageCount)
  );
  const levels = headingLevels(lines, layout.bodyFontSize);
  const blocks: Block[] = [];

  let paragraph: TextLine[] = [];
  let heading: TextLine[] = [];
  let table: TextLine[] = [];
  let footnote: TextLine[] = [];
  let pendingCaption: string | undefined;

  // A caption only labels a table when a table follows it; otherwise it
  // stands alone as a figure caption.
  const emitPendingFigure = () => {
    if (!pendingCaption) return;
    blocks.push({
      type: 'figure',
      page: lines.find((line) => line.text === pendingCaption)?.page ?? 0,
      text: pendingCaption,
    });
    pendingCaption = undefined;
  };

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    emitPendingFigure();
    blocks.push({
      type: 'paragraph',
      page: paragraph[0].page,
      text: joinParagraph(paragraph.map((line) => line.text)),
    });
    paragraph = [];
  };

  const flushHeading = () => {
    if (heading.length === 0) return;
    emitPendingFigure();
    blocks.push({
      type: 'heading',
      page: heading[0].page,
      level: levels.get(heading[0].fontSize) ?? 4,
      text: joinParagraph(heading.map((line) => line.text)),
    });
    heading = [];
  };

  const flushTable = () => {
    if (table.length === 0) return;
    if (table.length >= 2) {
      const width = Math.max(...table.map((line) => line.cells.length));
      const rows = table.map((line) => {
        const cells = line.cells.map((cell) => cell.text);
        while (cells.length < width) cells.push('');
        return cells;
      });
      blocks.push({
        type: 'table',
        page: table[0].page,
        text: table.map((line) => line.text).join('\n'),
        rows,
        caption: pendingCaption,
      });
      pendingCaption = undefined;
    } else {
      // A lone multi-cell line is more likely prose than a table.
      paragraph.push(...table);
    }
    table = [];
  };

  const flushFootnote = () => {
    if (footnote.length === 0) return;
    emitPendingFigure();
    blocks.push({
      type: 'footnote',
      page: footnote[0].page,
      text: joinParagraph(footnote.map((line) => line.text)),
    });
    footnote = [];
  };

  const flushAll = () => {
    flushHeading();
    flushParagraph();
    flushTable();
    flushFootnote();
  };

  for (const line of lines) {
    const text = line.text;

    if (CAPTION.test(text) && line.fontSize <= layout.bodyFontSize * 1.25) {
      flushAll();
      pendingCaption = text;
      continue;
    }

    if (isHeadingCandidate(line, layout.bodyFontSize)) {
      flushParagraph();
      flushTable();
      flushFootnote();
      const previous = heading[heading.length - 1];
      if (previous && !sameBand(previous, line)) flushHeading();
      heading.push(line);
      continue;
    }
    flushHeading();

    const isNote =
      line.fontSize <= layout.bodyFontSize * 0.9 &&
      (line.relY < 0.25 || FOOTNOTE_MARKER.test(text) || NOTE.test(text));
    if (isNote) {
      flushParagraph();
      flushTable();
      const previous = footnote[footnote.length - 1];
      if (previous && verticalGap(previous, line) > line.fontSize * 2.2) {
        flushFootnote();
      }
      footnote.push(line);
      continue;
    }
    flushFootnote();

    if (isTableRow(line)) {
      flushParagraph();
      const previous = table[table.length - 1];
      if (
        previous &&
        (previous.page !== line.page ||
          verticalGap(previous, line) > line.fontSize * 2.4)
      ) {
        flushTable();
      }
      table.push(line);
      continue;
    }
    flushTable();

    const previous = paragraph[paragraph.length - 1];
    if (
      previous &&
      (!sameBand(previous, line) ||
        verticalGap(previous, line) > previous.fontSize * 1.7 ||
        line.x0 - previous.x0 > 12)
    ) {
      flushParagraph();
    }
    paragraph.push(line);
  }

  flushAll();

  return blocks.filter((block) => block.text.trim().length > 0);
}
