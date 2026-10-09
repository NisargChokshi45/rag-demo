import type { Metadata, Viewport } from 'next';
import { Analytics } from '@vercel/analytics/next';
import { SiteHeader } from './components/SiteHeader';
import { THEME_STORAGE_KEY } from '@/lib/theme';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Resume Screening RAG',
    template: '%s | Resume Screening RAG',
  },
  description: 'Agentic resume screening with RAG',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8fafc' },
    { media: '(prefers-color-scheme: dark)', color: '#020617' },
  ],
};

// Runs before first paint so the page never flashes the wrong theme.
const themeScript = `(function(){try{var s=localStorage.getItem('${THEME_STORAGE_KEY}');var d=s==='dark'||((s!=='light')&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-dvh flex-col bg-slate-50 font-sans text-slate-900 antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-slate-900 focus:shadow-lg"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main-content" className="flex min-w-0 flex-1 flex-col">
          {children}
        </main>
        <Analytics />
      </body>
    </html>
  );
}
