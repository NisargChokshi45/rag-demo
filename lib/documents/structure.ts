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

function repeatKey(line: TextLine) {
  return line.text.toLowerCase().replace(/\d+/g, '#').trim();
}

function inHeaderOrFooter(line: TextLine) {
  return line.relY < 0.08 || line.relY > 0.92;
}

function isRunningTextNoise(
  line: TextLine,
  repeats: Map<string, number>,
  pageCount: number
) {
  const threshold = Math.max(3, Math.floor(pageCount * 0.3));
  if (
    (repeats.get(repeatKey(line)) || 0) >= threshold &&
    line.text.length <= 120
  )
    return true;
  // Bare page numbers in the header or footer band
  if (/^\d{1,4}$/.test(line.text) && inHeaderOrFooter(line)) return true;
  return false;
}

/**
 * A bold line in the header or footer band that reads the same on the page
 * before or after it is a running header, e.g. "U.S. Government Publishing
 * Office" across a spread. Subsections repeat too, but under different
 * chapters, so their repeats sit far apart and they are kept.
 */
function runningBoldHeaders(lines: TextLine[]) {
  const pagesByKey = new Map<string, Set<number>>();
  const bandBold = lines.filter((line) => line.bold && inHeaderOrFooter(line));
  for (const line of bandBold) {
    const key = repeatKey(line);
    if (!pagesByKey.has(key)) pagesByKey.set(key, new Set());
    pagesByKey.get(key)!.add(line.page);
  }
  return new Set(
    bandBold.filter((line) => {
      const pages = pagesByKey.get(repeatKey(line));
      return Boolean(
        pages && (pages.has(line.page - 1) || pages.has(line.page + 1))
      );
    })
  );
}

function countRepeats(lines: TextLine[]) {
  const pagesByKey = new Map<string, Set<number>>();
  for (const line of lines) {
    const key = repeatKey(line);
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

/**
 * Joins wrapped lines. A word split across a line break ("sustainabil-" then
 * "ity") is rejoined, and so is one with a stray space after the hyphen.
 */
function joinParagraph(parts: string[]) {
  return parts
    .reduce((acc, part) => {
      if (!acc) return part;
      if (acc.endsWith('-') && /^[a-z]/.test(part)) {
        return acc.slice(0, -1) + part;
      }
      return `${acc} ${part}`;
    }, '')
    .replace(/([a-z]{3,})- ([a-z]{2,})/g, '$1$2');
}

function headingLevels(candidates: Set<TextLine>) {
  const sizes = [...new Set([...candidates].map((line) => line.fontSize))].sort(
    (a, b) => b - a
  );
  return new Map(sizes.map((size, index) => [size, Math.min(index + 1, 4)]));
}

/**
 * Bold body-size lines are subsections only when they read like a title: two
 * or more words, clear of the page's header and footer bands, and set off
 * from the line above by a paragraph-sized gap. Memo labels ("Date", "To")
 * are one word, and running headers sit in the bands.
 */
function isBoldHeading(line: TextLine, previous: TextLine | undefined) {
  if (line.text.trim().split(/\s+/).length < 2) return false;
  if (!previous || previous.page !== line.page) return true;
  return verticalGap(previous, line) > previous.fontSize * 1.2;
}

function isHeadingCandidate(
  line: TextLine,
  layout: DocumentLayout,
  previous?: TextLine
) {
  if (
    line.fontSize >= layout.bodyFontSize * 1.25 &&
    line.text.length <= 140 &&
    /[A-Za-z]/.test(line.text) &&
    line.cells.length <= 2
  ) {
    return true;
  }
  // Subsections often keep body size but switch family, e.g. sans-serif
  // headings in a serif body. Only short, single-cell, unpunctuated lines
  // qualify, which keeps most sans-serif table labels out. A bold line only
  // counts when the whole line is bold, so bold words inside a body sentence
  // do not start a heading.
  const shortLabel =
    Math.abs(line.fontSize - layout.bodyFontSize) < 0.6 &&
    line.cells.length === 1 &&
    line.text.length <= 90 &&
    /[A-Za-z]/.test(line.text) &&
    !/[.;,:]$/.test(line.text);
  if (!shortLabel) return false;
  const otherFamily =
    layout.bodyFamily !== '' &&
    line.fontFamily !== '' &&
    line.fontFamily !== layout.bodyFamily;
  return otherFamily || (line.bold && isBoldHeading(line, previous));
}

export function buildBlocks(layout: DocumentLayout): Block[] {
  const repeats = countRepeats(layout.lines);
  const running = runningBoldHeaders(layout.lines);
  const lines = layout.lines.filter(
    (line) =>
      line.drawnRows !== undefined ||
      (!running.has(line) &&
        !isRunningTextNoise(line, repeats, layout.pageCount))
  );
  const candidates = new Set(
    lines.filter((line, index) =>
      isHeadingCandidate(line, layout, lines[index - 1])
    )
  );
  const levels = headingLevels(candidates);
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

    if (line.drawnRows) {
      // Shaded-cell tables arrive pre-built, one line per table.
      flushAll();
      blocks.push({
        type: 'table',
        page: line.page,
        text: line.drawnRows.map((row) => row.join(' | ')).join('\n'),
        rows: line.drawnRows,
        caption: pendingCaption,
      });
      pendingCaption = undefined;
      continue;
    }

    if (CAPTION.test(text) && line.fontSize <= layout.bodyFontSize * 1.25) {
      flushAll();
      pendingCaption = text;
      continue;
    }

    if (candidates.has(line)) {
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
