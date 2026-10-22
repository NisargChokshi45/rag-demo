import { getDocumentProxy, getResolvedPDFJS } from 'unpdf';
import type { PageItem } from './items';

type PdfOps = Awaited<ReturnType<typeof getResolvedPDFJS>>['OPS'];

/**
 * Reads the filled shapes on each page (pdf.js operator list) so tables that
 * are drawn as shaded cells, rather than ruled or aligned text, can be rebuilt.
 *
 * A table is a cluster of touching filled rectangles that includes a dark
 * header bar. Charts also use filled rectangles, but their fills are bright and
 * they have no dark header, so they are not read as tables. Colourful shapes
 * are reported per page so the vision pass knows which pages hold charts.
 */

type Matrix = [number, number, number, number, number, number];

export interface FilledRect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** Fill colour as "#rrggbb", or "" when the operator list does not give one. */
  fill: string;
}

export interface DrawnTable {
  page: number;
  /** Top edge of the table on the page, in PDF points (y grows upwards). */
  top: number;
  rows: string[][];
  /** Positions in the page's text item array that the table consumed. */
  consumed: number[];
}

export interface DrawingPage {
  page: number;
  tables: DrawnTable[];
  /** True when the page carries bright filled shapes, e.g. chart bars. */
  hasColourShapes: boolean;
}

/** Luminance from 0 (black) to 1 (white). */
export function luminance(fill: string): number {
  if (!/^#[0-9a-f]{6}$/i.test(fill)) return 1;
  const value = parseInt(fill.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function chroma(fill: string): number {
  if (!/^#[0-9a-f]{6}$/i.test(fill)) return 0;
  const value = parseInt(fill.slice(1), 16);
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  return Math.max(...channels) - Math.min(...channels);
}

const DARK_FILL = 0.35;
const TOUCH = 2;
const EDGE_TOLERANCE = 2;
const MIN_WIDTH = 6;
const MIN_HEIGHT = 4;
const LINE_TOLERANCE = 2.5;
const COLOUR_AREA = 300;
const COLOUR_SHAPES_PER_PAGE = 4;
/** Table rows continue below the shaded cells while the gap stays this tight. */
const ROW_GAP_FACTOR = 2.6;
const MAX_EXTRA_ROWS = 30;

function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[1] * n[2],
    m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2],
    m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4],
    m[4] * n[1] + m[5] * n[3] + n[5],
  ];
}

/**
 * Decodes pdf.js path coordinates. The array interleaves local opcodes with
 * their arguments: 0 moveTo (x, y), 1 lineTo (x, y), 4 closePath.
 */
function subpaths(coords: ArrayLike<number>): Array<Array<[number, number]>> {
  const out: Array<Array<[number, number]>> = [];
  let current: Array<[number, number]> = [];
  let i = 0;
  while (i < coords.length) {
    const op = coords[i++];
    if (op === 0) {
      if (current.length > 0) out.push(current);
      current = [[coords[i], coords[i + 1]]];
      i += 2;
    } else if (op === 1) {
      current.push([coords[i], coords[i + 1]]);
      i += 2;
    } else if (op === 4) {
      if (current.length > 0) out.push(current);
      current = [];
    } else {
      // Curves or unknown opcodes: stop rather than misread the path.
      break;
    }
  }
  if (current.length > 0) out.push(current);
  return out;
}

interface OperatorPage {
  getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[] }>;
}

/** Filled rectangles of one page, in page coordinates. */
async function filledRects(
  page: OperatorPage,
  OPS: PdfOps
): Promise<FilledRect[]> {
  const list = await page.getOperatorList();
  const rects: FilledRect[] = [];
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  let fill = '';
  const stack: Array<{ ctm: Matrix; fill: string }> = [];

  list.fnArray.forEach((fn, index) => {
    const args = list.argsArray[index] as unknown[];
    if (fn === OPS.save) {
      stack.push({ ctm, fill });
    } else if (fn === OPS.restore) {
      const saved = stack.pop();
      if (saved) ({ ctm, fill } = saved);
    } else if (fn === OPS.transform) {
      ctm = multiply(ctm, args as Matrix);
    } else if (fn === OPS.setFillRGBColor) {
      fill = String(args[0] ?? '');
    } else if (fn === OPS.constructPath) {
      const paint = args[0];
      if (paint !== OPS.fill && paint !== OPS.eoFill) return;
      const coords = (args[1] as ArrayLike<number>[])[0];
      if (!coords) return;
      for (const path of subpaths(coords)) {
        if (path.length < 4 || path.length > 5) continue;
        const points = path.map(([x, y]) => [
          ctm[0] * x + ctm[2] * y + ctm[4],
          ctm[1] * x + ctm[3] * y + ctm[5],
        ]);
        const xs = points.map((p) => p[0]);
        const ys = points.map((p) => p[1]);
        const rect = {
          x0: Math.min(...xs),
          x1: Math.max(...xs),
          y0: Math.min(...ys),
          y1: Math.max(...ys),
          fill,
        };
        if (rect.x1 - rect.x0 >= MIN_WIDTH && rect.y1 - rect.y0 >= MIN_HEIGHT) {
          rects.push(rect);
        }
      }
    }
  });
  return rects;
}

function touching(a: FilledRect, b: FilledRect) {
  return (
    a.x0 <= b.x1 + TOUCH &&
    b.x0 <= a.x1 + TOUCH &&
    a.y0 <= b.y1 + TOUCH &&
    b.y0 <= a.y1 + TOUCH
  );
}

/** Groups rectangles that touch each other into connected clusters. */
export function clusterRects(rects: FilledRect[]): FilledRect[][] {
  const parent = rects.map((_, index) => index);
  const find = (i: number): number =>
    parent[i] === i ? i : (parent[i] = find(parent[i]));
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      if (touching(rects[i], rects[j])) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, FilledRect[]>();
  rects.forEach((rect, index) => {
    const root = find(index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(rect);
  });
  return [...groups.values()];
}

/** Sorted x (or y) edges of a cluster, with near-equal edges merged. */
function edgesOf(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const merged: number[] = [];
  for (const value of sorted) {
    const last = merged[merged.length - 1];
    if (last === undefined || value - last > EDGE_TOLERANCE) merged.push(value);
  }
  return merged;
}

interface Frame {
  x0: number;
  x1: number;
  top: number;
  bottom: number;
  columns: Array<[number, number]>;
  /** Vertical extents of the shaded rows, top first. */
  bands: Array<[number, number]>;
}

/**
 * Rows are the gaps between consecutive horizontal cell edges. A cell that
 * spans two rows (rowspan) crosses both gaps, so it does not merge them.
 */
function bandsOf(cluster: FilledRect[]): Array<[number, number]> {
  const edges = edgesOf(cluster.flatMap((rect) => [rect.y0, rect.y1]));
  const bands: Array<[number, number]> = [];
  for (let i = 0; i + 1 < edges.length; i++) {
    if (edges[i + 1] - edges[i] >= MIN_HEIGHT)
      bands.push([edges[i], edges[i + 1]]);
  }
  return bands.sort((a, b) => b[1] - a[1]);
}

/** A cluster is a table when it has a dark header bar and at least two columns. */
function frameOf(cluster: FilledRect[]): Frame | null {
  if (cluster.length < 2) return null;
  const hasDarkHeader = cluster.some(
    (rect) =>
      luminance(rect.fill) < DARK_FILL &&
      rect.x1 - rect.x0 >= 40 &&
      rect.y1 - rect.y0 >= 8
  );
  if (!hasDarkHeader) return null;

  const xs = edgesOf(cluster.flatMap((rect) => [rect.x0, rect.x1]));
  const columns: Array<[number, number]> = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    if (xs[i + 1] - xs[i] >= 8) columns.push([xs[i], xs[i + 1]]);
  }
  if (columns.length < 2) return null;

  return {
    x0: Math.min(...cluster.map((rect) => rect.x0)),
    x1: Math.max(...cluster.map((rect) => rect.x1)),
    bottom: Math.min(...cluster.map((rect) => rect.y0)),
    top: Math.max(...cluster.map((rect) => rect.y1)),
    columns,
    bands: bandsOf(cluster),
  };
}

interface Line {
  y: number;
  fontSize: number;
  items: Array<{ index: number; item: PageItem }>;
}

function groupLines(entries: Array<{ index: number; item: PageItem }>): Line[] {
  const sorted = [...entries].sort(
    (a, b) => b.item.y - a.item.y || a.item.x - b.item.x
  );
  const lines: Line[] = [];
  for (const entry of sorted) {
    const current = lines[lines.length - 1];
    if (current && Math.abs(current.y - entry.item.y) <= LINE_TOLERANCE) {
      current.items.push(entry);
      current.fontSize = Math.max(current.fontSize, entry.item.fontSize);
    } else {
      lines.push({
        y: entry.item.y,
        fontSize: entry.item.fontSize,
        items: [entry],
      });
    }
  }
  return lines;
}

function columnOf(x: number, columns: Array<[number, number]>) {
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  columns.forEach(([start, end], index) => {
    const distance =
      x >= start && x <= end
        ? 0
        : Math.min(Math.abs(x - start), Math.abs(x - end));
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return bestDistance <= EDGE_TOLERANCE * 4 ? best : -1;
}

/** Text items whose centre sits inside the frame, plus the rows that continue below it. */
function membersOf(
  frame: Frame,
  items: PageItem[]
): Array<{ index: number; item: PageItem }> {
  const inside = items
    .map((item, index) => ({ index, item }))
    .filter(
      ({ item }) =>
        item.str.trim().length > 0 &&
        item.x + item.width / 2 >= frame.x0 &&
        item.x + item.width / 2 <= frame.x1 &&
        item.y >= frame.bottom - 2 &&
        item.y <= frame.top + 2
    );
  if (inside.length === 0) return [];

  const members = [...inside];
  const used = new Set(members.map((entry) => entry.index));
  const lines = groupLines(members);
  let lowest = lines[lines.length - 1];
  const fontSize = Math.max(...lines.map((line) => line.fontSize));
  const gapLimit = ROW_GAP_FACTOR * fontSize;

  // Body rows continue below the shaded cells while the spacing stays tight,
  // every item sits inside one column, and the font matches the table text.
  const candidates = items
    .map((item, index) => ({ index, item }))
    .filter(
      ({ index, item }) =>
        !used.has(index) &&
        item.str.trim().length > 0 &&
        item.y < lowest.y &&
        item.x >= frame.x0 - 2 &&
        item.x + item.width <= frame.x1 + 2
    );
  const belowLines = groupLines(candidates);
  let extra = 0;
  for (const line of belowLines) {
    if (extra >= MAX_EXTRA_ROWS) break;
    const gap = lowest.y - line.y;
    if (gap > gapLimit) break;
    if (Math.abs(line.fontSize - fontSize) > 0.6) break;
    const fits = line.items.every(({ item }) =>
      frame.columns.some(
        ([start, end]) => item.x >= start - 2 && item.x + item.width <= end + 2
      )
    );
    if (!fits) break;
    for (const entry of line.items) {
      members.push(entry);
      used.add(entry.index);
    }
    lowest = line;
    extra++;
  }
  return members;
}

/**
 * Rows follow the shaded bands first: a multi-line header inside one dark bar
 * stays one row even when its lines sit at different baselines. Text outside
 * any band is grouped by baseline.
 */
function buildRows(
  frame: Frame,
  members: Array<{ index: number; item: PageItem }>
): string[][] {
  const inBand = new Map<number, typeof members>();
  const outside: typeof members = [];
  for (const entry of members) {
    const centre = entry.item.y + entry.item.fontSize * 0.35;
    const band = frame.bands.findIndex(
      ([lo, hi]) => centre >= lo - 1 && centre <= hi + 1
    );
    if (band < 0) outside.push(entry);
    else inBand.set(band, [...(inBand.get(band) ?? []), entry]);
  }

  const groups: Array<{ y: number; items: typeof members }> = [
    ...[...inBand].map(([band, items]) => ({
      y: frame.bands[band][1],
      items,
    })),
    ...groupLines(outside).map((line) => ({
      y: line.y,
      items: line.items,
    })),
  ];
  const ordered = groups.sort((a, b) => b.y - a.y);
  const rows = ordered.map((group) => {
    const cells = frame.columns.map(() => '');
    const sorted = [...group.items].sort((a, b) => a.item.x - b.item.x);
    for (const { item } of sorted) {
      const column = columnOf(item.x + item.width / 2, frame.columns);
      if (column < 0) continue;
      const text = item.str.replace(/\s+/g, ' ').trim();
      if (!text) continue;
      cells[column] = cells[column] ? `${cells[column]} ${text}` : text;
    }
    return cells.map((cell) => cell.trim());
  });

  const nonEmpty = rows.filter((row) => row.some((cell) => cell.length > 0));
  const keep = frame.columns.map((_, column) =>
    nonEmpty.some((row) => row[column].length > 0)
  );
  return nonEmpty.map((row) => row.filter((_, column) => keep[column]));
}

export async function extractDrawingPages(
  data: Uint8Array,
  textItems: PageItem[][]
): Promise<DrawingPage[]> {
  const doc = await getDocumentProxy(data);
  const { OPS } = await getResolvedPDFJS();
  const pages: DrawingPage[] = [];

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const rects = await filledRects(page, OPS);
    const { width, height } = page.getViewport({ scale: 1 });
    const pageArea = width * height;
    const shapes = rects.filter(
      (rect) =>
        (rect.x1 - rect.x0) * (rect.y1 - rect.y0) < pageArea * 0.5 &&
        !(rect.x1 - rect.x0 > width * 0.9 && rect.y1 - rect.y0 > height * 0.9)
    );

    const items = textItems[pageNumber - 1] ?? [];
    const tables: DrawnTable[] = [];
    for (const cluster of clusterRects(shapes)) {
      const frame = frameOf(cluster);
      if (!frame) continue;
      const members = membersOf(frame, items);
      if (members.length === 0) continue;
      const rows = buildRows(frame, members);
      if (rows.length < 2) continue;
      tables.push({
        page: pageNumber,
        top: frame.top,
        rows,
        consumed: members.map((entry) => entry.index),
      });
    }

    const colourful = shapes.filter(
      (rect) =>
        chroma(rect.fill) >= 40 &&
        (rect.x1 - rect.x0) * (rect.y1 - rect.y0) >= COLOUR_AREA
    );
    pages.push({
      page: pageNumber,
      tables,
      hasColourShapes: colourful.length >= COLOUR_SHAPES_PER_PAGE,
    });
  }

  return pages;
}
