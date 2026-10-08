import { extractTextItems, type StructuredTextItem } from 'unpdf';

/**
 * Rebuilds visual lines from the positioned text items that unpdf (pdf.js)
 * returns. Items are grouped into lines by their baseline, split into cells
 * where the horizontal gap is wide (table columns, side-by-side labels), and
 * tagged with the font size so headings and footnotes can be told apart from
 * body text later on. Multi-column pages are read column by column.
 */

export interface Cell {
  text: string;
  x0: number;
  x1: number;
}

export interface TextLine {
  page: number;
  y: number;
  x0: number;
  x1: number;
  fontSize: number;
  cells: Cell[];
  text: string;
  /** Position of the line on its page, 0 = bottom, 1 = top. */
  relY: number;
}

export interface DocumentLayout {
  pageCount: number;
  bodyFontSize: number;
  lines: TextLine[];
}

const LINE_TOLERANCE = 2.5;
const CELL_GAP = 14;
const SPACE_GAP = 0.8;
const MIN_GUTTER = 12;
const DOT_LEADER = /\.{4,}|…/;

function normalizeSpaces(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

function buildLines(
  items: StructuredTextItem[],
  page: number,
  pageMinY: number,
  pageSpan: number
): TextLine[] {
  const visible = items.filter((item) => item.str.trim().length > 0);
  if (visible.length === 0) return [];

  const sorted = [...visible].sort((a, b) => b.y - a.y || a.x - b.x);
  const groups: StructuredTextItem[][] = [];
  for (const item of sorted) {
    const current = groups[groups.length - 1];
    if (current && Math.abs(current[0].y - item.y) <= LINE_TOLERANCE) {
      current.push(item);
    } else {
      groups.push([item]);
    }
  }

  return groups.map((group) => {
    const ordered = [...group].sort((a, b) => a.x - b.x);
    const cells: Cell[] = [];
    let previousEnd = Number.NaN;

    for (const item of ordered) {
      const gap = item.x - previousEnd;
      const cell = cells[cells.length - 1];
      if (!cell || gap > CELL_GAP) {
        cells.push({ text: item.str, x0: item.x, x1: item.x + item.width });
      } else {
        cell.text += (gap > SPACE_GAP ? ' ' : '') + item.str;
        cell.x1 = item.x + item.width;
      }
      previousEnd = item.x + item.width;
    }

    const cleaned = cells
      .map((cell) => ({
        text: normalizeSpaces(cell.text),
        x0: cell.x0,
        x1: cell.x1,
      }))
      .filter((cell) => cell.text.length > 0);

    // Dot leaders (table of contents entries) are prose, not table cells.
    const joined = cleaned.map((cell) => cell.text).join(' ');
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    const finalCells = DOT_LEADER.test(joined)
      ? [{ text: joined, x0: first.x, x1: last.x + last.width }]
      : cleaned;

    const y = group[0].y;
    const longest = group.reduce((a, b) =>
      b.str.length > a.str.length ? b : a
    );

    return {
      page,
      y,
      x0: Math.min(...finalCells.map((cell) => cell.x0)),
      x1: Math.max(...finalCells.map((cell) => cell.x1)),
      fontSize: Math.round(longest.fontSize * 2) / 2,
      cells: finalCells,
      text: finalCells.map((cell) => cell.text).join(' '),
      relY: (y - pageMinY) / pageSpan,
    };
  });
}

function computeBodyFontSize(pages: StructuredTextItem[][]): number {
  const weights = new Map<number, number>();
  for (const page of pages) {
    for (const item of page) {
      const size = Math.round(item.fontSize * 2) / 2;
      weights.set(size, (weights.get(size) || 0) + item.str.length);
    }
  }
  let best = 10;
  let bestWeight = -1;
  for (const [size, weight] of weights) {
    if (weight > bestWeight) {
      best = size;
      bestWeight = weight;
    }
  }
  return best;
}

/**
 * Finds a vertical gutter on the page: a run of x-positions that no body-text
 * item crosses, near the middle of the page. Returns undefined for
 * single-column pages.
 */
function findGutter(
  items: StructuredTextItem[],
  bodySize: number
): { start: number; end: number } | undefined {
  const body = items.filter(
    (item) =>
      item.str.trim().length > 1 && Math.abs(item.fontSize - bodySize) < 1.5
  );
  if (body.length < 20) return undefined;

  const minX = Math.min(...items.map((item) => item.x));
  const maxX = Math.max(...items.map((item) => item.x + item.width));
  const width = Math.ceil(maxX - minX);
  if (width <= 0) return undefined;

  const coverage = new Uint16Array(width + 2);
  for (const item of body) {
    const from = Math.max(0, Math.floor(item.x - minX));
    const to = Math.min(width, Math.ceil(item.x + item.width - minX));
    for (let x = from; x <= to; x++) coverage[x]++;
  }

  const low = Math.floor(width * 0.25);
  const high = Math.ceil(width * 0.75);
  let best = { start: -1, length: 0 };
  let runStart = -1;
  for (let x = low; x <= high + 1; x++) {
    const free = x <= high && coverage[x] === 0;
    if (free && runStart < 0) runStart = x;
    if (!free && runStart >= 0) {
      if (x - runStart > best.length) {
        best = { start: runStart, length: x - runStart };
      }
      runStart = -1;
    }
  }
  if (best.length < MIN_GUTTER) return undefined;

  return { start: minX + best.start, end: minX + best.start + best.length };
}

function topDown(lines: TextLine[]) {
  return [...lines].sort((a, b) => b.y - a.y || a.x0 - b.x0);
}

/**
 * Builds the lines of one page in reading order. On multi-column pages each
 * column is read top to bottom before the next; items that cross the gutter
 * (headings, full-width tables) act as separators between column zones.
 */
function pageLines(
  items: StructuredTextItem[],
  page: number,
  bodySize: number
): TextLine[] {
  const visible = items.filter((item) => item.str.trim().length > 0);
  if (visible.length === 0) return [];

  const minY = Math.min(...visible.map((item) => item.y));
  const span = Math.max(...visible.map((item) => item.y)) - minY || 1;
  const gutter = findGutter(visible, bodySize);

  if (!gutter) {
    return topDown(buildLines(visible, page, minY, span));
  }

  const left: StructuredTextItem[] = [];
  const right: StructuredTextItem[] = [];
  const spanning: StructuredTextItem[] = [];
  for (const item of visible) {
    const itemEnd = item.x + item.width;
    if (item.x < gutter.start && itemEnd > gutter.end) spanning.push(item);
    else if (item.x >= gutter.end - 1) right.push(item);
    else left.push(item);
  }

  const leftLines = buildLines(left, page, minY, span);
  const rightLines = buildLines(right, page, minY, span);
  const spanLines = new Set(buildLines(spanning, page, minY, span));

  const ordered: TextLine[] = [];
  let pendingLeft: TextLine[] = [];
  let pendingRight: TextLine[] = [];
  const flush = () => {
    ordered.push(...topDown(pendingLeft), ...topDown(pendingRight));
    pendingLeft = [];
    pendingRight = [];
  };

  for (const line of topDown([...leftLines, ...rightLines, ...spanLines])) {
    if (spanLines.has(line)) {
      flush();
      ordered.push(line);
    } else if (leftLines.includes(line)) {
      pendingLeft.push(line);
    } else {
      pendingRight.push(line);
    }
  }
  flush();
  return ordered;
}

export async function extractLayout(data: Uint8Array): Promise<DocumentLayout> {
  const { totalPages, items } = await extractTextItems(data);
  const bodyFontSize = computeBodyFontSize(items);

  const lines = items.flatMap((pageItems, index) =>
    pageLines(pageItems, index + 1, bodyFontSize)
  );

  return {
    pageCount: totalPages,
    bodyFontSize,
    lines,
  };
}
