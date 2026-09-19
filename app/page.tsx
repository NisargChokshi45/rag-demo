import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <div className="max-w-4xl mx-auto px-4 py-16">
        <h1 className="text-4xl font-bold mb-4">Resume Screening RAG</h1>
        <p className="text-lg text-gray-600 mb-8">
          Agentic resume screening with retrieval-augmented generation
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link
            href="/upload"
            className="p-6 bg-blue-50 border border-blue-200 rounded-lg hover:shadow-lg transition"
          >
            <h2 className="text-xl font-semibold mb-2">Upload</h2>
            <p className="text-gray-600">Upload resumes and job description</p>
          </Link>

          <Link
            href="/candidates"
            className="p-6 bg-green-50 border border-green-200 rounded-lg hover:shadow-lg transition"
          >
            <h2 className="text-xl font-semibold mb-2">Candidates</h2>
            <p className="text-gray-600">View ingested candidates</p>
          </Link>

          <Link
            href="/screen"
            className="p-6 bg-purple-50 border border-purple-200 rounded-lg hover:shadow-lg transition"
          >
            <h2 className="text-xl font-semibold mb-2">Screen</h2>
            <p className="text-gray-600">Ask screening questions</p>
          </Link>
        </div>
      </div>
    </main>
  );
}
