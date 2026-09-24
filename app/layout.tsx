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
        <header className="bg-white border-b border-gray-200 shadow-sm">
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
