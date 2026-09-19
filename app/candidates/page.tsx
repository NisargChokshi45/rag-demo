"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Candidate {
  id: string;
  name: string;
  role_guess: string;
  original_filename: string;
  chunk_count: number;
}

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCandidates = async () => {
      try {
        const response = await fetch("/api/candidates");
        if (!response.ok) throw new Error("Failed to fetch candidates");
        const data = await response.json();
        setCandidates(data.candidates || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchCandidates();
  }, []);

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Candidates ({candidates.length})</h1>
          <div className="space-x-4">
            <Link
              href="/upload"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Upload More
            </Link>
            <Link
              href="/screen"
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              Screen
            </Link>
          </div>
        </div>

        {loading && (
          <div className="bg-white p-8 rounded-lg shadow">
            <p className="text-gray-600">Loading candidates...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 p-8 rounded-lg shadow">
            <p className="text-red-600">Error: {error}</p>
          </div>
        )}

        {!loading && candidates.length === 0 && (
          <div className="bg-white p-8 rounded-lg shadow">
            <p className="text-gray-600">No candidates yet.</p>
            <Link href="/upload" className="text-blue-600 hover:underline">
              Upload some resumes to get started
            </Link>
          </div>
        )}

        {!loading && candidates.length > 0 && (
          <div className="grid gap-4">
            {candidates.map((candidate) => (
              <div key={candidate.id} className="bg-white p-6 rounded-lg shadow hover:shadow-lg transition">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">
                      {candidate.name}
                    </h2>
                    <p className="text-sm text-gray-600 mt-1">
                      {candidate.role_guess}
                    </p>
                    <p className="text-xs text-gray-500 mt-2">
                      {candidate.original_filename} • {candidate.chunk_count} chunks
                    </p>
                  </div>
                  <span className="px-3 py-1 text-sm font-medium text-blue-700 bg-blue-100 rounded-full">
                    {candidate.chunk_count} chunks
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
