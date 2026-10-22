import { extractDrawingPages, type DrawnTable } from './drawings';
import { extractPageItems, type PageItem } from './items';

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
  /** Generic family from the PDF font descriptor: "serif", "sans-serif", ... */
  fontFamily: string;
  /** True when every visible character is set in a bold font face. */
  bold: boolean;
  cells: Cell[];
  text: string;
  /** Position of the line on its page, 0 = bottom, 1 = top. */
  relY: number;
  /** Set on the single line that stands for a table drawn with shaded cells. */
  drawnRows?: string[][];
}

export interface DocumentLayout {
  pageCount: number;
  bodyFontSize: number;
  /** Font family that carries most of the body text, e.g. "serif". */
  bodyFamily: string;
  lines: TextLine[];
  /** Pages with bright filled shapes (charts), candidates for the vision pass. */
  visualPages: number[];
}

interface Superscript {
  digits: string;
  /** Right edge of the text the marker follows. */
  x: number;
  /** Baseline of that text. */
  y: number;
}

const LINE_TOLERANCE = 2.5;
const CELL_GAP = 14;
const SPACE_GAP = 0.8;
const MIN_GUTTER = 12;
const DOT_LEADER = /\.{4,}|…/;

/**
 * NFKC turns ligatures into plain letters ("ﬂ" -> "fl", "ﬁ" -> "fi") and
 * compatibility forms into their usual characters. Soft hyphens are dropped.
 */
function normalizeSpaces(text: string) {
  return text.normalize('NFKC').replace(/­/g, '').replace(/\s+/g, ' ').trim();
}

function fontFamilyOf(item: PageItem): string {
  return item.fontFamily;
}

function isBold(item: PageItem): boolean {
  return item.bold;
}

/**
 * Pulls small raised digits (footnote markers) out of the text items. A marker
 * is a short number, smaller than body text, sitting just right of a body-size
 * item and above its baseline. Subscripts sit lower and are left alone.
 */
function splitSuperscripts(
  items: PageItem[],
  bodySize: number,
  rich: boolean
): { body: PageItem[]; marks: Superscript[] } {
  const body: PageItem[] = [];
  const marks: Superscript[] = [];
  for (const item of items) {
    if (rich) {
      // Rich mode: the marker is smaller than the item it follows, whatever
      // the body size, and it is stored on that item so it stays in place.
      const digits = item.str.trim();
      const anchor = /^\d{1,3}$/.test(digits)
        ? items.find(
            (other) =>
              other !== item &&
              other.str.trim() !== '' &&
              other.fontSize * 0.85 > item.fontSize &&
              Math.abs(other.x + other.width - item.x) < 6 &&
              item.y > other.y &&
              item.y - other.y < other.fontSize * 0.8
          )
        : undefined;
      if (anchor) anchor.mark = `[^${digits}]`;
      else body.push(item);
      continue;
    }
    const digits = item.str.trim();
    const small = item.fontSize < bodySize * 0.8 && /^\d{1,3}$/.test(digits);
    const anchor = small
      ? items.find(
          (other) =>
            other.fontSize >= bodySize * 0.8 &&
            Math.abs(other.x + other.width - item.x) < 3 &&
            item.y > other.y &&
            item.y - other.y < other.fontSize * 0.8
        )
      : undefined;
    if (anchor) {
      marks.push({ digits, x: anchor.x + anchor.width, y: anchor.y });
    } else {
      body.push(item);
    }
  }
  return { body, marks };
}

/** Writes each marker as [^n] at the end of the cell it follows. */
function attachSuperscripts(lines: TextLine[], marks: Superscript[]) {
  for (const mark of marks) {
    const line = lines.find(
      (candidate) =>
        Math.abs(candidate.y - mark.y) <= LINE_TOLERANCE &&
        candidate.cells.some((cell) => Math.abs(cell.x1 - mark.x) < 3)
    );
    const cell = line?.cells.find((c) => Math.abs(c.x1 - mark.x) < 3);
    if (!line || !cell) continue;
    cell.text += `[^${mark.digits}]`;
    line.text = line.cells.map((c) => c.text).join(' ');
  }
}

function buildLines(
  items: PageItem[],
  page: number,
  pageMinY: number,
  pageSpan: number
): TextLine[] {
  const visible = items.filter((item) => item.str.trim().length > 0);
  if (visible.length === 0) return [];

  const sorted = [...visible].sort((a, b) => b.y - a.y || a.x - b.x);
  const groups: PageItem[][] = [];
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
      const str = item.str + (item.mark ?? '');
      if (!cell || gap > CELL_GAP) {
        cells.push({ text: str, x0: item.x, x1: item.x + item.width });
      } else {
        cell.text += (gap > SPACE_GAP ? ' ' : '') + str;
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
      fontFamily: fontFamilyOf(longest),
      bold: group.every((item) => item.str.trim() === '' || isBold(item)),
      cells: finalCells,
      text: finalCells.map((cell) => cell.text).join(' '),
      relY: (y - pageMinY) / pageSpan,
    };
  });
}

/** The size and family that carry the most characters are the body text. */
function dominant<K>(
  pages: PageItem[][],
  keyOf: (item: PageItem) => K,
  fallback: K
): K {
  const weights = new Map<K, number>();
  for (const page of pages) {
    for (const item of page) {
      const key = keyOf(item);
      weights.set(key, (weights.get(key) || 0) + item.str.length);
    }
  }
  let best = fallback;
  let bestWeight = -1;
  for (const [key, weight] of weights) {
    if (weight > bestWeight) {
      best = key;
      bestWeight = weight;
    }
  }
  return best;
}

function computeBodyFontSize(pages: PageItem[][]): number {
  return dominant(pages, (item) => Math.round(item.fontSize * 2) / 2, 10);
}

function computeBodyFamily(pages: PageItem[][]): string {
  return dominant(pages, fontFamilyOf, '');
}

/**
 * Finds a vertical gutter on the page: a run of x-positions that no body-text
 * item crosses, near the middle of the page. Returns undefined for
 * single-column pages.
 */
function findGutter(
  items: PageItem[],
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

/** True when at least half the items hold a word of three or more letters. */
function isProse(items: PageItem[]) {
  if (items.length === 0) return false;
  const words = items.filter((item) => /[A-Za-z]{3,}/.test(item.str));
  return words.length * 2 >= items.length;
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
  items: PageItem[],
  page: number,
  bodySize: number,
  rich: boolean
): TextLine[] {
  const visible = items.filter((item) => item.str.trim().length > 0);
  if (visible.length === 0) return [];
  const { body, marks } = splitSuperscripts(visible, bodySize, rich);
  const lines = orderLines(body, page, bodySize);
  attachSuperscripts(lines, marks);
  return lines;
}

function orderLines(
  visible: PageItem[],
  page: number,
  bodySize: number
): TextLine[] {
  if (visible.length === 0) return [];

  const minY = Math.min(...visible.map((item) => item.y));
  const span = Math.max(...visible.map((item) => item.y)) - minY || 1;
  // The document-wide body size can differ from this page's text, e.g. a
  // 10pt page in a 12pt report, so the gutter search uses the page's own size.
  const pageBodySize = dominant(
    [visible],
    (item) => Math.round(item.fontSize * 2) / 2,
    bodySize
  );
  const gutter = findGutter(visible, pageBodySize);

  if (!gutter) {
    return topDown(buildLines(visible, page, minY, span));
  }

  const left: PageItem[] = [];
  const right: PageItem[] = [];
  const spanning: PageItem[] = [];
  for (const item of visible) {
    const itemEnd = item.x + item.width;
    if (item.x < gutter.start && itemEnd > gutter.end) spanning.push(item);
    else if (item.x >= gutter.end - 1) right.push(item);
    else left.push(item);
  }

  // A gap inside a numeric table is not a column gutter. Both sides must
  // carry prose before the page is split.
  if (!isProse(left) || !isProse(right)) {
    return topDown(buildLines(visible, page, minY, span));
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

/**
 * Adds one line per drawn table at its height on the page. The text that
 * belongs to the table is already removed, so it is not read twice.
 */
function insertTables(
  built: TextLine[],
  tables: DrawnTable[],
  page: number,
  bodySize: number
): TextLine[] {
  if (tables.length === 0) return built;
  const ys = built.map((line) => line.y);
  const minY = ys.length ? Math.min(...ys) : 0;
  const span = ys.length ? Math.max(...ys) - minY || 1 : 1;

  const ordered = [...built];
  for (const table of [...tables].sort((a, b) => b.top - a.top)) {
    const at = ordered.findIndex((line) => line.y < table.top);
    const line: TextLine = {
      page,
      y: table.top,
      x0: 0,
      x1: 0,
      fontSize: bodySize,
      fontFamily: '',
      bold: false,
      cells: [],
      text: table.rows.map((row) => row.join(' | ')).join(' / '),
      relY: (table.top - minY) / span,
      drawnRows: table.rows,
    };
    if (at < 0) ordered.push(line);
    else ordered.splice(at, 0, line);
  }
  return ordered;
}

export interface LayoutOptions {
  /** element_rich: markers are placed on their own item, at any body size. */
  richNotes?: boolean;
}

export async function extractLayout(
  data: Uint8Array,
  options: LayoutOptions = {}
): Promise<DocumentLayout> {
  // pdf.js transfers the buffer to its worker, so the drawing pass gets a copy.
  const forDrawings = data.slice();
  const { totalPages, items } = await extractPageItems(data);
  const bodyFontSize = computeBodyFontSize(items);
  const bodyFamily = computeBodyFamily(items);
  const drawings = await extractDrawingPages(forDrawings, items);
  const rich = options.richNotes === true;

  const lines = items.flatMap((pageItems, index) => {
    const drawing = drawings[index];
    const consumed = new Set(drawing.tables.flatMap((t) => t.consumed));
    const remaining = pageItems.filter(
      (_, position) => !consumed.has(position)
    );
    return insertTables(
      pageLines(remaining, index + 1, bodyFontSize, rich),
      drawing.tables,
      index + 1,
      bodyFontSize
    );
  });

  return {
    pageCount: totalPages,
    bodyFontSize,
    bodyFamily,
    lines,
    visualPages: drawings
      .filter((drawing) => drawing.hasColourShapes)
      .map((drawing) => drawing.page),
  };
}
