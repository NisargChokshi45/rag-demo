'use client';

import { useEffect, useState } from 'react';
import { THEME_STORAGE_KEY } from '@/lib/theme';
import { MonitorIcon, MoonIcon, SunIcon } from '../icons';

export type ThemePreference = 'light' | 'dark' | 'system';

const NEXT_PREFERENCE: Record<ThemePreference, ThemePreference> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};
const LABELS: Record<ThemePreference, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

function readStoredPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // Storage can be blocked (private mode, disabled cookies). Fall back to system.
  }
  return 'system';
}

function applyPreference(preference: ThemePreference): void {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark =
    preference === 'dark' || (preference === 'system' && prefersDark);
  document.documentElement.classList.toggle('dark', isDark);
}

export function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>('system');

  useEffect(() => {
    const initial = readStoredPreference();
    setPreference(initial);

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemChange = () => {
      if (readStoredPreference() === 'system') applyPreference('system');
    };
    media.addEventListener('change', onSystemChange);
    return () => media.removeEventListener('change', onSystemChange);
  }, []);

  const cycle = () => {
    const next = NEXT_PREFERENCE[preference];
    setPreference(next);
    applyPreference(next);
    try {
      if (next === 'system') {
        window.localStorage.removeItem(THEME_STORAGE_KEY);
      } else {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      }
    } catch {
      // Preference still applies for this page view.
    }
  };

  const Icon =
    preference === 'light'
      ? SunIcon
      : preference === 'dark'
        ? MoonIcon
        : MonitorIcon;
  const nextLabel = LABELS[NEXT_PREFERENCE[preference]];

  return (
    <button
      type="button"
      onClick={cycle}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
      aria-label={`Theme: ${LABELS[preference]}. Switch to ${nextLabel}`}
      title={`Theme: ${LABELS[preference]}`}
    >
      <Icon className="h-5 w-5 fill-none stroke-current stroke-2" />
    </button>
  );
}
