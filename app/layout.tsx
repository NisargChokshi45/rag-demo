import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Resume Screening RAG",
  description: "Agentic resume screening with RAG",
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
          <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 hover:opacity-75 transition">
              <span className="text-2xl">📄</span>
              <h1 className="text-xl font-bold text-gray-900">Resume Screening</h1>
            </Link>
            <nav className="flex gap-6">
              <Link href="/" className="text-gray-600 hover:text-gray-900 font-medium text-sm">Home</Link>
              <Link href="/upload" className="text-gray-600 hover:text-gray-900 font-medium text-sm">Upload</Link>
              <Link href="/candidates" className="text-gray-600 hover:text-gray-900 font-medium text-sm">Candidates</Link>
              <Link href="/screen" className="text-gray-600 hover:text-gray-900 font-medium text-sm">Screen</Link>
            </nav>
          </div>
        </header>
        <main className="flex-1">
          {children}
        </main>
      </body>
    </html>
  );
}
