import Link from 'next/link';

export default function Home() {
  return (
    <div className="bg-gradient-to-b from-blue-50 to-gray-50 min-h-[calc(100vh-80px)] flex items-center">
      <div className="max-w-4xl mx-auto px-4 py-16 w-full">
        <div className="mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 text-gray-900">
            Resume Screening RAG
          </h1>
          <p className="text-lg text-gray-600">
            Agentic resume screening with retrieval-augmented generation
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link
            href="/jobs"
            className="p-8 bg-white border-2 border-orange-200 rounded-lg hover:shadow-xl hover:border-orange-400 transition duration-200 group"
          >
            <div className="text-3xl mb-3 group-hover:scale-110 transition">
              💼
            </div>
            <h2 className="text-xl font-bold mb-2 text-gray-900">Jobs</h2>
            <p className="text-gray-600">
              Create roles with the criteria used for resume screening
            </p>
          </Link>

          <Link
            href="/candidates"
            className="p-8 bg-white border-2 border-blue-200 rounded-lg hover:shadow-xl hover:border-blue-400 transition duration-200 group"
          >
            <div className="text-3xl mb-3 group-hover:scale-110 transition">
              👥
            </div>
            <h2 className="text-xl font-bold mb-2 text-gray-900">Candidates</h2>
            <p className="text-gray-600">
              Review applicants, resumes, and generated reports
            </p>
          </Link>

          <Link
            href="/screen"
            className="p-8 bg-white border-2 border-green-200 rounded-lg hover:shadow-xl hover:border-green-400 transition duration-200 group"
          >
            <div className="text-3xl mb-3 group-hover:scale-110 transition">
              🎯
            </div>
            <h2 className="text-xl font-bold mb-2 text-gray-900">Screening</h2>
            <p className="text-gray-600">
              Screen candidates against any job or custom criteria
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}
