import Link from 'next/link';

const destinations = [
  {
    href: '/jobs',
    accent: 'border-orange-200 hover:border-orange-400',
    icon: '💼',
    title: 'Jobs',
    description: 'Create roles with the criteria used for resume screening',
  },
  {
    href: '/candidates',
    accent: 'border-blue-200 hover:border-blue-400',
    icon: '👥',
    title: 'Candidates',
    description: 'Upload resumes and review applicants and generated reports',
  },
  {
    href: '/screen',
    accent: 'border-green-200 hover:border-green-400',
    icon: '🎯',
    title: 'Screening',
    description: 'Ask free-form questions and get grounded, cited answers',
  },
];

function ArchitectureDiagram() {
  return (
    <div className="w-full bg-white rounded-lg border border-gray-200 p-8 shadow-sm overflow-x-auto">
      <h2 className="text-2xl font-bold text-gray-900 mb-8">
        System Architecture
      </h2>

      <svg
        viewBox="0 0 1400 750"
        className="w-full min-w-max"
        style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
      >
        {/* Background groups */}
        <defs>
          <linearGradient id="gradOrange" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#fef3c7" />
            <stop offset="100%" stopColor="#fed7aa" />
          </linearGradient>
          <linearGradient id="gradBlue" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#dbeafe" />
            <stop offset="100%" stopColor="#bfdbfe" />
          </linearGradient>
          <linearGradient id="gradGreen" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#dcfce7" />
            <stop offset="100%" stopColor="#bbf7d0" />
          </linearGradient>
          <linearGradient id="gradPurple" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#e9d5ff" />
            <stop offset="100%" stopColor="#d8b4fe" />
          </linearGradient>
        </defs>

        {/* Section backgrounds */}
        <rect
          x="20"
          y="30"
          width="420"
          height="670"
          rx="12"
          fill="url(#gradOrange)"
          opacity="0.3"
          stroke="#fbbf24"
          strokeWidth="2"
        />
        <rect
          x="480"
          y="30"
          width="420"
          height="670"
          rx="12"
          fill="url(#gradBlue)"
          opacity="0.3"
          stroke="#60a5fa"
          strokeWidth="2"
        />
        <rect
          x="940"
          y="30"
          width="420"
          height="670"
          rx="12"
          fill="url(#gradGreen)"
          opacity="0.3"
          stroke="#4ade80"
          strokeWidth="2"
        />

        {/* Section titles */}
        <text
          x="230"
          y="65"
          fontSize="18"
          fontWeight="bold"
          fill="#92400e"
          textAnchor="middle"
        >
          Job Creation
        </text>
        <text
          x="690"
          y="65"
          fontSize="18"
          fontWeight="bold"
          fill="#1e40af"
          textAnchor="middle"
        >
          Resume Processing
        </text>
        <text
          x="1150"
          y="65"
          fontSize="18"
          fontWeight="bold"
          fill="#166534"
          textAnchor="middle"
        >
          Screening
        </text>

        {/* ===== JOB CREATION FLOW ===== */}
        {/* Create Job box */}
        <rect
          x="60"
          y="100"
          width="320"
          height="80"
          rx="8"
          fill="white"
          stroke="#f59e0b"
          strokeWidth="2"
        />
        <text
          x="220"
          y="135"
          fontSize="16"
          fontWeight="bold"
          fill="#92400e"
          textAnchor="middle"
        >
          Create Job
        </text>
        <text x="220" y="160" fontSize="13" fill="#78350f" textAnchor="middle">
          Define criteria & requirements
        </text>

        {/* Arrow down */}
        <line
          x1="220"
          y1="180"
          x2="220"
          y2="220"
          stroke="#f59e0b"
          strokeWidth="2"
          markerEnd="url(#arrowOrange)"
        />

        {/* Store Job */}
        <rect
          x="60"
          y="220"
          width="320"
          height="80"
          rx="8"
          fill="white"
          stroke="#f59e0b"
          strokeWidth="2"
        />
        <text
          x="220"
          y="255"
          fontSize="16"
          fontWeight="bold"
          fill="#92400e"
          textAnchor="middle"
        >
          Store in Supabase
        </text>
        <text x="220" y="280" fontSize="13" fill="#78350f" textAnchor="middle">
          job_id, criteria, metadata
        </text>

        {/* Arrow to screening */}
        <path
          d="M 380 260 Q 460 260 480 360"
          stroke="#fbbf24"
          strokeWidth="2"
          fill="none"
          strokeDasharray="5,5"
          markerEnd="url(#arrowOrangeLight)"
        />
        <text x="420" y="305" fontSize="11" fill="#92400e" fontStyle="italic">
          Links to candidate search
        </text>

        {/* ===== RESUME PROCESSING FLOW ===== */}
        {/* Upload Resume */}
        <rect
          x="520"
          y="100"
          width="340"
          height="80"
          rx="8"
          fill="white"
          stroke="#3b82f6"
          strokeWidth="2"
        />
        <text
          x="690"
          y="135"
          fontSize="16"
          fontWeight="bold"
          fill="#1e40af"
          textAnchor="middle"
        >
          Upload Resume (PDF)
        </text>
        <text x="690" y="160" fontSize="13" fill="#1e3a8a" textAnchor="middle">
          Multi-page documents accepted
        </text>

        {/* Arrow down */}
        <line
          x1="690"
          y1="180"
          x2="690"
          y2="220"
          stroke="#3b82f6"
          strokeWidth="2"
          markerEnd="url(#arrowBlue)"
        />

        {/* Parse */}
        <rect
          x="520"
          y="220"
          width="340"
          height="75"
          rx="8"
          fill="white"
          stroke="#3b82f6"
          strokeWidth="2"
        />
        <text
          x="690"
          y="250"
          fontSize="16"
          fontWeight="bold"
          fill="#1e40af"
          textAnchor="middle"
        >
          Parse & Chunk
        </text>
        <text x="690" y="272" fontSize="12" fill="#1e3a8a" textAnchor="middle">
          Split into semantic chunks
        </text>

        {/* Arrow down */}
        <line
          x1="690"
          y1="295"
          x2="690"
          y2="335"
          stroke="#3b82f6"
          strokeWidth="2"
          markerEnd="url(#arrowBlue)"
        />

        {/* Embed */}
        <rect
          x="520"
          y="335"
          width="340"
          height="80"
          rx="8"
          fill="white"
          stroke="#3b82f6"
          strokeWidth="2"
        />
        <text
          x="690"
          y="370"
          fontSize="16"
          fontWeight="bold"
          fill="#1e40af"
          textAnchor="middle"
        >
          Generate Embeddings
        </text>
        <text x="690" y="395" fontSize="13" fill="#1e3a8a" textAnchor="middle">
          Using Gemini API
        </text>

        {/* Arrow down */}
        <line
          x1="690"
          y1="415"
          x2="690"
          y2="455"
          stroke="#3b82f6"
          strokeWidth="2"
          markerEnd="url(#arrowBlue)"
        />

        {/* Vector Storage */}
        <rect
          x="520"
          y="455"
          width="340"
          height="90"
          rx="8"
          fill="white"
          stroke="#3b82f6"
          strokeWidth="2"
        />
        <text
          x="690"
          y="490"
          fontSize="16"
          fontWeight="bold"
          fill="#1e40af"
          textAnchor="middle"
        >
          Vector Storage
        </text>
        <text x="690" y="515" fontSize="13" fill="#1e3a8a" textAnchor="middle">
          pgvector + Supabase
        </text>
        <text
          x="690"
          y="535"
          fontSize="12"
          fill="#1e3a8a"
          textAnchor="middle"
          fontStyle="italic"
        >
          Indexed with job_id
        </text>

        {/* Arrow to screening */}
        <path
          d="M 860 500 Q 900 500 940 420"
          stroke="#60a5fa"
          strokeWidth="2"
          fill="none"
          markerEnd="url(#arrowBlueBright)"
        />

        {/* ===== SCREENING FLOW ===== */}
        {/* User Question */}
        <rect
          x="980"
          y="100"
          width="340"
          height="80"
          rx="8"
          fill="white"
          stroke="#10b981"
          strokeWidth="2"
        />
        <text
          x="1150"
          y="135"
          fontSize="16"
          fontWeight="bold"
          fill="#166534"
          textAnchor="middle"
        >
          User Question
        </text>
        <text x="1150" y="160" fontSize="13" fill="#064e3b" textAnchor="middle">
          Job-specific or platform-wide
        </text>

        {/* Arrow down */}
        <line
          x1="1150"
          y1="180"
          x2="1150"
          y2="220"
          stroke="#10b981"
          strokeWidth="2"
          markerEnd="url(#arrowGreen)"
        />

        {/* Embed Question */}
        <rect
          x="980"
          y="220"
          width="340"
          height="75"
          rx="8"
          fill="white"
          stroke="#10b981"
          strokeWidth="2"
        />
        <text
          x="1150"
          y="250"
          fontSize="16"
          fontWeight="bold"
          fill="#166534"
          textAnchor="middle"
        >
          Embed Question
        </text>
        <text x="1150" y="272" fontSize="12" fill="#064e3b" textAnchor="middle">
          Gemini embeddings
        </text>

        {/* Arrow down */}
        <line
          x1="1150"
          y1="295"
          x2="1150"
          y2="335"
          stroke="#10b981"
          strokeWidth="2"
          markerEnd="url(#arrowGreen)"
        />

        {/* Vector Search */}
        <rect
          x="980"
          y="335"
          width="340"
          height="80"
          rx="8"
          fill="white"
          stroke="#10b981"
          strokeWidth="2"
        />
        <text
          x="1150"
          y="365"
          fontSize="16"
          fontWeight="bold"
          fill="#166534"
          textAnchor="middle"
        >
          Semantic Search
        </text>
        <text x="1150" y="390" fontSize="13" fill="#064e3b" textAnchor="middle">
          Cosine similarity + job-scoped
        </text>

        {/* Arrow down */}
        <line
          x1="1150"
          y1="415"
          x2="1150"
          y2="455"
          stroke="#10b981"
          strokeWidth="2"
          markerEnd="url(#arrowGreen)"
        />

        {/* GROQ + Processing */}
        <rect
          x="980"
          y="455"
          width="340"
          height="100"
          rx="8"
          fill="white"
          stroke="#10b981"
          strokeWidth="2"
        />
        <text
          x="1150"
          y="485"
          fontSize="16"
          fontWeight="bold"
          fill="#166534"
          textAnchor="middle"
        >
          GROQ API Call
        </text>
        <text x="1150" y="510" fontSize="12" fill="#064e3b" textAnchor="middle">
          Score candidates, generate
        </text>
        <text x="1150" y="530" fontSize="12" fill="#064e3b" textAnchor="middle">
          citations & structured output
        </text>

        {/* Arrow back to candidates */}
        <path
          d="M 980 505 Q 940 505 860 500"
          stroke="#34d399"
          strokeWidth="2"
          fill="none"
          strokeDasharray="5,5"
          markerEnd="url(#arrowGreenLight)"
        />

        {/* Response to UI */}
        <path
          d="M 1150 555 Q 1150 575 1150 590"
          stroke="#10b981"
          strokeWidth="2"
          markerEnd="url(#arrowGreen)"
        />
        <rect
          x="1020"
          y="590"
          width="260"
          height="60"
          rx="6"
          fill="white"
          stroke="#10b981"
          strokeWidth="2"
        />
        <text
          x="1150"
          y="625"
          fontSize="16"
          fontWeight="bold"
          fill="#166534"
          textAnchor="middle"
        >
          Stream to UI with Citations
        </text>

        {/* Arrow markers */}
        <defs>
          <marker
            id="arrowOrange"
            markerWidth="10"
            markerHeight="10"
            refX="5"
            refY="5"
            orient="auto"
          >
            <polygon points="0,0 10,5 0,10" fill="#f59e0b" />
          </marker>
          <marker
            id="arrowOrangeLight"
            markerWidth="10"
            markerHeight="10"
            refX="5"
            refY="5"
            orient="auto"
          >
            <polygon points="0,0 10,5 0,10" fill="#fbbf24" />
          </marker>
          <marker
            id="arrowBlue"
            markerWidth="10"
            markerHeight="10"
            refX="5"
            refY="5"
            orient="auto"
          >
            <polygon points="0,0 10,5 0,10" fill="#3b82f6" />
          </marker>
          <marker
            id="arrowBlueBright"
            markerWidth="10"
            markerHeight="10"
            refX="5"
            refY="5"
            orient="auto"
          >
            <polygon points="0,0 10,5 0,10" fill="#60a5fa" />
          </marker>
          <marker
            id="arrowGreen"
            markerWidth="10"
            markerHeight="10"
            refX="5"
            refY="5"
            orient="auto"
          >
            <polygon points="0,0 10,5 0,10" fill="#10b981" />
          </marker>
          <marker
            id="arrowGreenLight"
            markerWidth="10"
            markerHeight="10"
            refX="5"
            refY="5"
            orient="auto"
          >
            <polygon points="0,0 10,5 0,10" fill="#34d399" />
          </marker>
        </defs>
      </svg>

      {/* Legend */}
      {/* <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
        <div className="flex items-start gap-3">
          <div className="w-4 h-4 rounded-full bg-amber-400 flex-shrink-0 mt-1" />
          <div>
            <p className="font-semibold text-gray-900">Job Setup</p>
            <p className="text-gray-600">Define screening criteria once</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className="w-4 h-4 rounded-full bg-blue-400 flex-shrink-0 mt-1" />
          <div>
            <p className="font-semibold text-gray-900">Data Ingestion</p>
            <p className="text-gray-600">Upload, parse, embed, and store resumes</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className="w-4 h-4 rounded-full bg-green-400 flex-shrink-0 mt-1" />
          <div>
            <p className="font-semibold text-gray-900">Live Screening</p>
            <p className="text-gray-600">Search, score, and generate cited results</p>
          </div>
        </div>
      </div> */}
    </div>
  );
}

export default function Home() {
  return (
    <div className="bg-gradient-to-b from-blue-50 to-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-12 sm:py-16">
        <section className="mb-12 sm:mb-16 text-center sm:text-left">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4 text-gray-900">
            Resume Screening RAG
          </h1>
          <p className="text-base sm:text-lg text-gray-600 max-w-2xl mx-auto sm:mx-0 mb-8">
            Create jobs, Upload candidate resumes and ask free-form screening
            questions. An agent decides for itself which resumes to search and
            read in full, then returns a grounded, structured report.
          </p>
        </section>

        {/* Quick Links */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {destinations.map((dest) => (
            <Link
              key={dest.href}
              href={dest.href}
              className={`p-8 bg-white border-2 rounded-lg hover:shadow-xl transition duration-200 group ${dest.accent}`}
            >
              <div className="text-3xl mb-3 group-hover:scale-110 transition">
                {dest.icon}
                <span className="text-xl font-bold mb-2 text-gray-900">
                  &nbsp;{dest.title}
                </span>
              </div>
              <p className="text-gray-600">{dest.description}</p>
            </Link>
          ))}
        </section>

        {/* Architecture Diagram */}
        <section className="mt-16">
          <ArchitectureDiagram />
        </section>
      </div>
    </div>
  );
}
