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
    <div className="min-h-[calc(100vh-80px)] bg-gray-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">Candidates</h1>
          <p className="text-gray-600">{candidates.length} {candidates.length === 1 ? "candidate" : "candidates"} ingested</p>
        </div>
        <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
          {candidates.length > 0 && (
            <div className="flex gap-4">
              <Link
                href="/upload"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
              >
                Upload More
              </Link>
              <Link
                href="/screen"
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
              >
                Screen Candidates
              </Link>
            </div>
          )}
        </div>

        {loading && (
          <div className="bg-white p-8 rounded-lg shadow text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
            <p className="text-gray-600">Loading candidates...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 p-6 rounded-lg">
            <p className="text-red-700 font-semibold mb-2">Error Loading Candidates</p>
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {!loading && candidates.length === 0 && (
          <div className="bg-white border-2 border-dashed border-gray-300 p-12 rounded-lg text-center">
            <p className="text-4xl mb-4">📋</p>
            <p className="text-gray-600 mb-4">No candidates uploaded yet</p>
            <Link href="/upload" className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              Upload Resumes to Get Started
            </Link>
          </div>
        )}

        {!loading && candidates.length > 0 && (
          <div className="grid gap-4">
            {candidates.map((candidate) => (
              <div key={candidate.id} className={`p-6 rounded-lg shadow hover:shadow-lg transition ${
                candidate.chunk_count === 0
                  ? "bg-amber-50 border border-amber-200"
                  : "bg-white"
              }`}>
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">
                      {candidate.name}
                    </h2>
                    <p className="text-sm text-gray-600 mt-1">
                      {candidate.role_guess}
                    </p>
                    <p className="text-xs text-gray-500 mt-2">
                      {candidate.original_filename}
                    </p>
                  </div>
                  {candidate.chunk_count === 0 ? (
                    <span className="px-3 py-1 text-sm font-medium text-amber-700 bg-amber-100 rounded-full whitespace-nowrap">
                      ⚠️ Not Indexed
                    </span>
                  ) : (
                    <span className="px-3 py-1 text-sm font-medium text-green-700 bg-green-100 rounded-full whitespace-nowrap">
                      ✓ Indexed
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
