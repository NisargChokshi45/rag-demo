import { getDocumentProxy } from 'unpdf';

/**
 * Positioned text items for every page, read in one pdf.js pass. unpdf's
 * extractTextItems reports size, family and position but not weight, and
 * reading the pages again just to get weight doubles the work. Here the
 * operator list is loaded alongside the text, so each item's font face is
 * known in the same pass. The PostScript name carries the weight
 * ("HelveticaLTStd-Bold", "Arial,Bold").
 */

export interface PageItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  dir: string;
  hasEOL: boolean;
  bold: boolean;
}

const BOLD_NAME = /bold|black|heavy|semibold|demi/i;

/**
 * Some titles are set with letter spacing, so one item reads "A U D I T" and
 * "U . S ." (pdf.js keeps the spaces inside the item). Three or more single
 * characters joined by single spaces are joined back up. Word gaps come as
 * separate items, so they are not affected. Ordinary prose items never have
 * this shape.
 */
const LETTER_SPACED = /^(?:[A-Za-z.] ){2,}[A-Za-z.]$/;

function repairLetterSpacing(text: string): string {
  return LETTER_SPACED.test(text) ? text.replace(/ /g, '') : text;
}

export async function extractPageItems(
  data: Uint8Array
): Promise<{ totalPages: number; items: PageItem[][] }> {
  const pdf = await getDocumentProxy(data);
  const pages: PageItem[][] = [];
  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number);
    const content = await page.getTextContent();
    await page.getOperatorList();

    const items: PageItem[] = [];
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const [, , c, d, e, f] = item.transform;
      const name = item.fontName;
      const font =
        name && page.commonObjs.has(name) ? page.commonObjs.get(name) : null;
      items.push({
        str: repairLetterSpacing(item.str),
        x: e,
        y: f,
        width: item.width,
        height: item.height,
        fontSize: Math.hypot(c, d),
        fontFamily: content.styles[name]?.fontFamily ?? '',
        dir: item.dir,
        hasEOL: item.hasEOL,
        bold: BOLD_NAME.test(font?.name ?? ''),
      });
    }
    pages.push(items);
  }
  return { totalPages: pdf.numPages, items: pages };
}
