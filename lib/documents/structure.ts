import type { DocumentLayout, TextLine } from './layout';

/**
 * Turns the line layout into typed blocks (headings, paragraphs, tables,
 * footnotes, captions) in reading order. Font sizes relative to the body
 * text drive heading and footnote detection; cell gaps drive table detection.
 */

export type BlockType =
  'heading' | 'paragraph' | 'table' | 'footnote' | 'figure' | 'callout';

export interface Block {
  type: BlockType;
  page: number;
  /** Heading depth, 1 = largest heading in the document. */
  level?: number;
  text: string;
  rows?: string[][];
  /** Caption that labels a table or figure (e.g. "Figure 2.1 ..."). */
  caption?: string;
  /** Footnote blocks only: true when the note starts with its number. */
  numbered?: boolean;
}

const CAPTION =
  /^(figure|chart|table|graph|exhibit|box|map)\s+[A-Za-z]*\.?\d[\w.-]*/i;
const MARKER_TAG = /\[\^\d{1,3}\]/g;
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

/**
 * A note that opens with its number followed by a capital ("3 Breakdown",
 * "18Energy"), or a Note/Source label. A lowercase word after a number ("16
 * million passports") is a sentence, not a note.
 */
const NOTE_NUMBER = /^\d{1,3}\s*[A-Z(“"]/;

function startsNumbered(text: string) {
  if (/\.{4,}|…/.test(text)) return false;
  return NOTE_NUMBER.test(text) || NOTE.test(text);
}

/**
 * Two numbered notes can share one line of text ("11 ... 12 We map ..."). A
 * split happens only where the next number follows the last one, one to three
 * notes on, so a year or a figure in the note body is not cut.
 */
function splitNotes(text: string): string[] {
  const leading = /^(\d{1,3})\s*[A-Z(“"]/.exec(text);
  if (!leading) return [text];
  const pieces: string[] = [];
  let current = Number(leading[1]);
  let start = 0;
  // A note ends with punctuation, so the next note starts after ". " or ") ".
  for (const match of text.matchAll(
    /(?<=[.;)])\s+(?=(\d{1,3})\s*[A-Za-z(“"])/g
  )) {
    const next = Number(match[1]);
    if (next <= current || next - current > 3) continue;
    pieces.push(text.slice(start, match.index).trim());
    start = match.index! + match[0].length;
    current = next;
  }
  pieces.push(text.slice(start).trim());
  return pieces;
}

/** Running titles that pdf.js joins onto the start of a body line. */
function stripRunningTitles(text: string) {
  return text.replace(/^Endnotes\s+(?=[a-z])/, '');
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

/**
 * A stat cell: a value with a figure (possibly after a word, as in "More than
 * 15% recycled content") and a lowercase label after it.
 */
const STAT_CELL =
  /^([^.;:]{1,24}?\d[\d.,]*\s?(?:%|kg|W|GB)?)\s+([a-z][\s\S]*)$/;

/** Stat values set side by side in one line, one value and label per cell. */
function statRow(line: TextLine): { x0: number; text: string }[] | undefined {
  if (line.cells.length < 2) return undefined;
  const matches = line.cells.map((cell) => STAT_CELL.exec(cell.text));
  if (matches.some((match) => match === null || match[1].split(' ').length > 3))
    return undefined;
  return matches.map((match, index) => ({
    x0: line.cells[index].x0,
    text: `${match![1]} ${match![2]}`,
  }));
}

/**
 * Stat panels: a bold heading over one column of stat values. Each value
 * starts a stat, and label lines beneath it in the same column wrap into it.
 * A panel is one callout block, "<heading>: <stat> - <stat>". Lines whose
 * cells all belong to a panel are taken out of the flow.
 */
interface StatSeed {
  line: TextLine;
  cell: number;
  x0: number;
  value: string;
  label: string;
}

function buildStatPanels(lines: TextLine[], bodySize: number) {
  const starts = new Map<TextLine, Block[]>();
  const used = new Map<TextLine, Set<number>>();
  const use = (line: TextLine, cell: number) => {
    if (!used.has(line)) used.set(line, new Set());
    used.get(line)!.add(cell);
  };

  const seeds: StatSeed[] = [];
  for (const line of lines) {
    // Table rows have three or more cells; stat rows have at most two.
    if (
      line.drawnRows ||
      line.cells.length > 2 ||
      line.fontSize > bodySize * 1.25
    )
      continue;
    line.cells.forEach((cell, index) => {
      const match = STAT_CELL.exec(cell.text);
      // Stat cells are column-width; a full-width body line is not a stat.
      const narrow = cell.x1 - cell.x0 <= 200;
      if (match && narrow && match[1].split(' ').length <= 3) {
        seeds.push({
          line,
          cell: index,
          x0: cell.x0,
          value: match[1],
          label: match[2],
        });
      }
    });
  }

  const columns: { page: number; x0: number; seeds: StatSeed[] }[] = [];
  for (const seed of seeds) {
    const column = columns.find(
      (c) => c.page === seed.line.page && Math.abs(c.x0 - seed.x0) <= 8
    );
    if (column) column.seeds.push(seed);
    else columns.push({ page: seed.line.page, x0: seed.x0, seeds: [seed] });
  }

  const headings = lines.flatMap((line) =>
    line.bold && line.fontSize >= 10 && !line.drawnRows
      ? line.cells.map((cell, index) => ({
          line,
          cell: index,
          x0: cell.x0,
          text: cell.text,
        }))
      : []
  );
  const cellsTopDown = lines
    .flatMap((line) => line.cells.map((cell, index) => ({ line, index, cell })))
    .sort((a, b) => b.line.y - a.line.y);

  for (const column of columns.sort((a, b) => a.page - b.page || a.x0 - b.x0)) {
    const columnSeeds = column.seeds.sort((a, b) => b.line.y - a.line.y);
    const top = columnSeeds[0].line;

    // The heading is the bold text just above the first stat, in this column.
    const above = headings
      .filter(
        (h) =>
          h.line.page === column.page &&
          h.line.y > top.y &&
          h.line.y - top.y <= 70 &&
          Math.abs(h.x0 - column.x0) <= 60
      )
      .sort((a, b) => a.line.y - b.line.y);
    if (above.length === 0) continue;
    const chain = [above[0]];
    for (const h of above.slice(1)) {
      const last = chain[chain.length - 1];
      if (h.line.y - last.line.y <= last.line.fontSize * 1.6) chain.push(h);
    }
    for (const h of chain) use(h.line, h.cell);
    const heading = chain
      .reverse()
      .map((h) => h.text)
      .join(' ');

    const units = columnSeeds.map((seed, index) => {
      const floor = columnSeeds[index + 1]?.line.y ?? -Infinity;
      let text = `${seed.value} ${seed.label}`;
      let last = seed.line;
      use(seed.line, seed.cell);
      // Wrapped label cells beneath the stat, above the next stat.
      for (const candidate of cellsTopDown) {
        const { line, index: cellIndex, cell } = candidate;
        if (
          line.page !== column.page ||
          line.y >= last.y ||
          line.y <= floor ||
          last.y - line.y > last.fontSize * 2.5 ||
          Math.abs(cell.x0 - column.x0) > 6 ||
          STAT_CELL.test(cell.text) ||
          used.get(line)?.has(cellIndex)
        )
          continue;
        text += ` ${cell.text}`;
        last = line;
        use(line, cellIndex);
      }
      return text;
    });

    const block: Block = {
      type: 'callout',
      page: column.page,
      text: `${heading}: ${units.join(' - ')}`,
    };
    const list = starts.get(top) ?? [];
    list.push(block);
    starts.set(top, list);
  }

  const consumed = new Set<TextLine>();
  for (const line of lines) {
    const cells = used.get(line);
    if (cells && cells.size === line.cells.length) consumed.add(line);
  }
  return { starts, consumed };
}

export interface BlockOptions {
  /**
   * Numbered notes keep their wrapped and run-together lines, and running
   * titles are stripped. Only the element_rich strategy turns this on, so the
   * other strategies keep the same blocks.
   */
  richNotes?: boolean;
}

export function buildBlocks(
  layout: DocumentLayout,
  options: BlockOptions = {}
): Block[] {
  const rich = options.richNotes === true;
  const repeats = countRepeats(layout.lines);
  const running = runningBoldHeaders(layout.lines);
  const lines = layout.lines
    .filter(
      (line) =>
        line.drawnRows !== undefined ||
        (!running.has(line) &&
          !isRunningTextNoise(line, repeats, layout.pageCount) &&
          !(rich && line.text.trim() === 'Endnotes'))
    )
    .map((line) =>
      rich && !line.drawnRows
        ? { ...line, text: stripRunningTitles(line.text) }
        : line
    );
  // Large lines with a figure are pull quotes and stat values, not section
  // titles, which are large too but carry no number. Rich mode only.
  // Numbered titles ("1 Introduction", "Chapter 2") are headings even when large.
  const isCallout = (line: TextLine) =>
    rich &&
    !line.drawnRows &&
    line.fontSize >= layout.bodyFontSize * 1.8 &&
    line.text.length <= 140 &&
    /\d/.test(line.text) &&
    !/^(chapter|part|section)\s+\d/i.test(line.text) &&
    !/^\d+(\.\d+)*\.?\s+[A-Z]/.test(line.text);
  // A stat value stands alone ("100%", "445 kg"), so its small label lines
  // beneath it belong to it.
  const isStatValue = (line: TextLine) =>
    isCallout(line) && line.text.length <= 24;
  const panels = rich ? buildStatPanels(lines, layout.bodyFontSize) : undefined;
  const candidates = new Set(
    lines.filter(
      (line, index) =>
        !isCallout(line) && isHeadingCandidate(line, layout, lines[index - 1])
    )
  );
  const levels = headingLevels(candidates);
  const blocks: Block[] = [];

  let paragraph: TextLine[] = [];
  let heading: TextLine[] = [];
  let table: TextLine[] = [];
  let footnote: TextLine[] = [];
  let callout: TextLine[] = [];
  // Stat blocks still taking wrapped label lines, by the x of their value.
  let statOpen: { x0: number; block: Block; last: TextLine }[] = [];
  const chartLabels = new Map<
    number,
    { labels: string[]; last: TextLine; block: Block }
  >();
  const chartPages = new Set(layout.visualPages);
  // Note markers from the last heading, waiting for the next paragraph.
  const pendingMarks: string[] = [];
  // True when the open footnote group began with a small, numbered line.
  let footnoteNumbered = false;
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
    const marks = pendingMarks.splice(0).join('');
    blocks.push({
      type: 'paragraph',
      page: paragraph[0].page,
      text:
        joinParagraph(paragraph.map((line) => line.text)) +
        (marks ? ` ${marks}` : ''),
    });
    paragraph = [];
  };

  const flushHeading = () => {
    if (heading.length === 0) return;
    emitPendingFigure();
    let text = joinParagraph(heading.map((line) => line.text));
    if (rich) {
      // A heading is not a chunk, so a note marker on it moves to the next
      // paragraph, where the claim it marks is read.
      const marks = text.match(MARKER_TAG) ?? [];
      text = text.replace(MARKER_TAG, '').replace(/ {2,}/g, ' ').trim();
      pendingMarks.push(...marks);
    }
    blocks.push({
      type: 'heading',
      page: heading[0].page,
      level: levels.get(heading[0].fontSize) ?? 4,
      text,
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

  const flushCallout = () => {
    if (callout.length === 0) return;
    emitPendingFigure();
    blocks.push({
      type: 'callout',
      page: callout[0].page,
      text: joinParagraph(callout.map((line) => line.text)),
    });
    callout = [];
  };

  const flushFootnote = () => {
    if (footnote.length === 0) return;
    emitPendingFigure();
    const text = joinParagraph(footnote.map((line) => line.text));
    const notes = rich ? splitNotes(text) : [text];
    notes.forEach((note, index) => {
      blocks.push({
        type: 'footnote',
        page: footnote[0].page,
        text: note,
        // Pieces after the first were split at a note number, so they are notes.
        numbered: index > 0 || startsNumbered(note),
      });
    });
    footnote = [];
    footnoteNumbered = false;
  };

  const flushAll = () => {
    flushHeading();
    flushCallout();
    flushParagraph();
    flushTable();
    flushFootnote();
  };

  for (const line of lines) {
    const panelBlocks = panels?.starts.get(line);
    if (panelBlocks) {
      flushAll();
      blocks.push(...panelBlocks);
      continue;
    }
    if (panels?.consumed.has(line)) continue;
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

    // Chart labels on a chart page become one figure chunk for that page.
    const chartLabel =
      rich &&
      chartPages.has(line.page) &&
      line.text.length <= 50 &&
      !/[.]$/.test(line.text) &&
      line.fontSize <= layout.bodyFontSize * 1.25 &&
      !candidates.has(line) &&
      !isCallout(line) &&
      !startsNumbered(line.text) &&
      !statRow(line);
    if (chartLabel) {
      let chart = chartLabels.get(line.page);
      if (!chart) {
        flushParagraph();
        flushTable();
        flushFootnote();
        flushHeading();
        flushCallout();
        const block: Block = { type: 'figure', page: line.page, text: '' };
        blocks.push(block);
        chart = { labels: [], last: line, block };
        chartLabels.set(line.page, chart);
      }
      // A label that wraps onto the next line continues the same label.
      const wrapped =
        verticalGap(chart.last, line) <= line.fontSize * 1.6 &&
        Math.abs(chart.last.x0 - line.x0) < 4;
      if (wrapped && chart.labels.length > 0) {
        chart.labels[chart.labels.length - 1] += ` ${line.text}`;
      } else {
        chart.labels.push(line.text);
      }
      chart.last = line;
      chart.block.text = `Chart labels on page ${line.page}: ${chart.labels.join('; ')}`;
      continue;
    }

    // Stat values: a wrapped label line under a stat joins its block; a row of
    // value and label cells makes one block per pair.
    if (rich) {
      const stat = statOpen.find(
        (open) =>
          open.block.page === line.page &&
          line.cells.length === 1 &&
          !STAT_CELL.test(line.text) &&
          Math.abs(open.x0 - line.x0) < 4 &&
          verticalGap(open.last, line) <= open.last.fontSize * 2.5
      );
      if (stat) {
        stat.block.text += ` ${line.text}`;
        stat.last = line;
        continue;
      }
      const pairs = statRow(line);
      if (pairs) {
        flushParagraph();
        flushTable();
        flushFootnote();
        flushHeading();
        flushCallout();
        statOpen = pairs.map((pair) => {
          const block: Block = {
            type: 'callout',
            page: line.page,
            text: pair.text,
          };
          blocks.push(block);
          return { x0: pair.x0, block, last: line };
        });
        continue;
      }
      statOpen = [];
    }

    const open = callout[callout.length - 1];
    if (
      open &&
      isStatValue(callout[0]) &&
      rich &&
      line.page === open.page &&
      line.fontSize < callout[0].fontSize * 0.8 &&
      Math.abs(line.x0 - callout[0].x0) < 6 &&
      verticalGap(open, line) <= open.fontSize * 2.5
    ) {
      callout.push(line);
      continue;
    }

    if (isCallout(line)) {
      flushParagraph();
      flushTable();
      flushFootnote();
      flushHeading();
      const previous = callout[callout.length - 1];
      if (
        previous &&
        (!sameBand(previous, line) ||
          verticalGap(previous, line) > line.fontSize * 1.6)
      ) {
        flushCallout();
      }
      callout.push(line);
      continue;
    }
    flushCallout();

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

    const lastNote = footnote[footnote.length - 1];
    const isNote =
      line.fontSize <= layout.bodyFontSize * 0.9 &&
      (line.relY < 0.25 || FOOTNOTE_MARKER.test(text) || NOTE.test(text));
    // A numbered note keeps its wrapped lines, even when they sit mid-page
    // and are not small. Unnumbered groups keep the rule above.
    // A wrapped note line sits at the note's size and, unless a running title
    // was merged into it, at the note's left edge. A line that opens lowercase
    // or with a digit is a wrapped sentence whatever its x-position.
    const continuesNumbered =
      rich &&
      footnoteNumbered &&
      !/\.{4,}|…/.test(text) &&
      lastNote !== undefined &&
      lastNote.page === line.page &&
      sameBand(lastNote, line) &&
      (Math.abs(lastNote.x0 - line.x0) < 4 || /^[a-z(\d]/.test(text)) &&
      verticalGap(lastNote, line) <= line.fontSize * 2.2;
    if (isNote || continuesNumbered) {
      flushParagraph();
      flushTable();
      if (lastNote && verticalGap(lastNote, line) > line.fontSize * 2.2) {
        flushFootnote();
      }
      if (footnote.length === 0) {
        footnoteNumbered =
          line.fontSize <= layout.bodyFontSize * 0.9 && startsNumbered(text);
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
