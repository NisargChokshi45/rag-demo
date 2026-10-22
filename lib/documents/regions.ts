/**
 * Region and chapter labels for document chunks.
 *
 * The region names are the regional headings used by the World Bank Global
 * Economic Prospects report, and the aliases are the abbreviations from its
 * Abbreviations page. Chunks take their region from the nearest matching
 * heading, so no country list is needed to tag a passage.
 */

export interface RegionDefinition {
  name: string;
  aliases: string[];
}

export const REGIONS: RegionDefinition[] = [
  {
    name: 'East Asia and Pacific',
    aliases: ['EAP', 'East Asia', 'Pacific'],
  },
  {
    name: 'Europe and Central Asia',
    aliases: ['ECA', 'Europe', 'Central Asia'],
  },
  {
    name: 'Latin America and the Caribbean',
    aliases: ['LAC', 'Latin America', 'Caribbean'],
  },
  {
    name: 'Middle East, North Africa, Afghanistan, and Pakistan',
    aliases: ['MENA', 'MNA', 'Middle East', 'North Africa'],
  },
  {
    name: 'South Asia',
    aliases: ['SAR', 'South Asia'],
  },
  {
    name: 'Sub-Saharan Africa',
    aliases: ['SSA', 'Sub-Saharan Africa'],
  },
];

const CHAPTER_HEADING = /^chapter\s+(\d{1,2})$/i;

function normalizeHeading(text: string) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/[.:;,]+$/, '')
    .trim()
    .toLowerCase();
}

/** The region a heading names, or null when the heading is not a region. */
export function regionForHeading(text: string): string | null {
  const key = normalizeHeading(text);
  const match = REGIONS.find((region) => normalizeHeading(region.name) === key);
  return match ? match.name : null;
}

/** "Chapter 3" for a heading that is just a chapter label, otherwise null. */
export function chapterForHeading(text: string): string | null {
  const match = CHAPTER_HEADING.exec(text.replace(/\s+/g, ' ').trim());
  return match ? `Chapter ${Number(match[1])}` : null;
}

/** Chapter label named in a question, e.g. "chapter 3" -> "Chapter 3". */
export function chapterInQuestion(question: string): string | null {
  const match = /\bchapter\s+(\d{1,2})\b/i.exec(question);
  return match ? `Chapter ${Number(match[1])}` : null;
}

/**
 * Region named in a question through its name or abbreviation. Returns null
 * when no region is named or when the question names more than one.
 */
export function regionInQuestion(question: string): string | null {
  const found = new Set<string>();
  for (const region of REGIONS) {
    const terms = [region.name, ...region.aliases];
    const hit = terms.some((term) => {
      const pattern = new RegExp(
        `(^|[^A-Za-z])${escapeRegExp(term)}([^A-Za-z]|$)`,
        'i'
      );
      return pattern.test(question);
    });
    if (hit) found.add(region.name);
  }
  return found.size === 1 ? [...found][0] : null;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
