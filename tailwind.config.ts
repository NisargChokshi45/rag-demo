import type { Config } from 'tailwindcss';
import colors from 'tailwindcss/colors';
import plugin from 'tailwindcss/plugin';

/**
 * Theme tokens.
 *
 * Every colour scale is exposed as CSS variables (`--c-<name>-<step>`), so the
 * same class names (`text-slate-900`, `bg-blue-50`, ...) resolve to the right
 * value in light and dark mode. Dark mode is activated by adding the `dark`
 * class to <html> (see app/components/ThemeToggle.tsx).
 */

const STEPS = [
  '50',
  '100',
  '200',
  '300',
  '400',
  '500',
  '600',
  '700',
  '800',
  '900',
  '950',
] as const;

type Step = (typeof STEPS)[number];

const NEUTRAL_NAMES = ['slate', 'gray'] as const;
const ACCENT_NAMES = [
  'blue',
  'red',
  'green',
  'emerald',
  'amber',
  'purple',
  'indigo',
  'orange',
] as const;

// Neutrals invert so text, borders, chips and cards flip together while
// keeping distinct levels (page < card < chip) in dark mode.
const NEUTRAL_DARK: Record<Step, Step> = {
  '50': '950',
  '100': '800',
  '200': '700',
  '300': '600',
  '400': '500',
  '500': '400',
  '600': '300',
  '700': '200',
  '800': '100',
  '900': '50',
  '950': '50',
};

// Accents keep 500-600 saturated enough to carry white text on buttons, while
// tints (50-200) become deep, low-glare backgrounds and 700+ become legible text.
const ACCENT_DARK: Record<Step, Step> = {
  '50': '950',
  '100': '900',
  '200': '800',
  '300': '700',
  '400': '500',
  '500': '500',
  '600': '500',
  '700': '400',
  '800': '300',
  '900': '200',
  '950': '100',
};

const ALL_NAMES = [...NEUTRAL_NAMES, ...ACCENT_NAMES] as const;

type PaletteName = (typeof ALL_NAMES)[number];

function hexToRgbTriplet(hex: string): string {
  const value = parseInt(hex.replace('#', ''), 16);
  return `${(value >> 16) & 255} ${(value >> 8) & 255} ${value & 255}`;
}

function paletteHex(name: PaletteName, step: Step): string {
  const palette = colors[name] as Record<Step, string>;
  return palette[step];
}

function buildThemeVariables(mode: 'light' | 'dark'): Record<string, string> {
  const variables: Record<string, string> = {};

  for (const name of ALL_NAMES) {
    const isNeutral = (NEUTRAL_NAMES as readonly string[]).includes(name);
    const darkMap = isNeutral ? NEUTRAL_DARK : ACCENT_DARK;

    for (const step of STEPS) {
      const source = mode === 'light' ? step : darkMap[step];
      variables[`--c-${name}-${step}`] = hexToRgbTriplet(
        paletteHex(name, source)
      );
    }
  }

  variables['--c-surface'] =
    mode === 'light'
      ? '255 255 255'
      : hexToRgbTriplet(paletteHex('slate', '900'));
  variables['--c-inverse'] =
    mode === 'light'
      ? hexToRgbTriplet(paletteHex('slate', '800'))
      : hexToRgbTriplet(paletteHex('slate', '100'));
  variables['--c-inverse-fg'] =
    mode === 'light'
      ? '255 255 255'
      : hexToRgbTriplet(paletteHex('slate', '900'));

  return variables;
}

const themeColors = Object.fromEntries(
  ALL_NAMES.map((name) => [
    name,
    Object.fromEntries(
      STEPS.map((step) => [
        step,
        `rgb(var(--c-${name}-${step}) / <alpha-value>)`,
      ])
    ),
  ])
);

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        ...themeColors,
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        inverse: 'rgb(var(--c-inverse) / <alpha-value>)',
        'inverse-fg': 'rgb(var(--c-inverse-fg) / <alpha-value>)',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)',
        'card-hover':
          '0 4px 12px -2px rgb(15 23 42 / 0.08), 0 2px 6px -2px rgb(15 23 42 / 0.06)',
      },
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      addBase({
        ':root': { ...buildThemeVariables('light'), colorScheme: 'light' },
        '.dark': { ...buildThemeVariables('dark'), colorScheme: 'dark' },
      });
    }),
  ],
};

export default config;
