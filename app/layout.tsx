import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthHeader } from './components/AuthHeader';
import './globals.css';

export const metadata: Metadata = {
  title: 'Resume Screening RAG',
  description: 'Agentic resume screening with RAG',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="flex flex-col min-h-screen bg-gray-50">
        <header className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 py-3 sm:py-4 flex flex-col sm:flex-row items-center gap-3 sm:gap-0 sm:justify-between">
            <Link
              href="/"
              className="flex items-center gap-2 hover:opacity-75 transition"
            >
              <span className="text-2xl">📄</span>
              <span className="text-xl font-bold text-gray-900">
                Resume Screening
              </span>
            </Link>
            <nav className="flex flex-wrap justify-center gap-4 sm:gap-6 items-center">
              <Link
                href="/jobs"
                className="text-gray-600 hover:text-gray-900 font-medium text-sm"
              >
                Jobs
              </Link>
              <Link
                href="/candidates"
                className="text-gray-600 hover:text-gray-900 font-medium text-sm"
              >
                Candidates
              </Link>
              <Link
                href="/screen"
                className="text-gray-600 hover:text-gray-900 font-medium text-sm"
              >
                Screen
              </Link>
              <a
                href="https://github.com/NisargChokshi45/rag-demo"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-600 hover:text-gray-900 transition"
                aria-label="GitHub repository"
              >
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.49.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.603-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.547 2.916 1.186.092-.923.35-1.546.636-1.903-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482C19.138 20.194 22 16.441 22 12.017 22 6.484 17.522 2 12 2z"
                    clipRule="evenodd"
                  />
                </svg>
              </a>
              <div className="sm:ml-4 sm:pl-4 sm:border-l sm:border-gray-200">
                <AuthHeader />
              </div>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
