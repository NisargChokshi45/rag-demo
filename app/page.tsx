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
    href: '/documents',
    accent: 'border-purple-200 hover:border-purple-400',
    icon: '📚',
    title: 'Documents',
    description:
      'Upload long reports and ask cited questions across their text, tables and footnotes',
  },
  {
    href: '/screen',
    accent: 'border-green-200 hover:border-green-400',
    icon: '🎯',
    title: 'Screening',
    description: 'Ask free-form questions and get grounded, cited answers',
  },
];

const docSteps = [
  {
    title: 'Plan',
    lines: [
      'Question names a chapter',
      'or region? Limit search',
      'to it, else whole document',
    ],
  },
  {
    title: 'Retrieve',
    lines: [
      'Hybrid search: vector +',
      'keyword, fused with RRF',
      'Top 20, widens if thin',
    ],
  },
  {
    title: 'Re-rank',
    lines: [
      'LLM, cross-encoder or none',
      'Keeps the best 6 passages',
      'Tables & figures keep a slot',
    ],
    highlight: true,
  },
  {
    title: 'Expand',
    lines: [
      'Long reports: swap child',
      'windows for parent sections',
      'Narrative: add neighbours',
    ],
  },
  {
    title: 'Generate',
    lines: [
      'GROQ answers as JSON',
      'with passage labels',
      'Abstains if unanswerable',
    ],
  },
  {
    title: 'Verify',
    lines: [
      'Checks citations exist',
      'Flags numbers not in',
      'the cited passages',
    ],
  },
];

function ArchitectureDiagram() {
  return (
    <div className="w-full rounded-xl border border-slate-200 bg-surface p-5 shadow-card sm:p-8">
      <div className="mb-6 flex flex-col gap-1 sm:mb-8">
        <h2
          id="architecture-heading"
          className="text-xl font-bold text-slate-900 sm:text-2xl"
        >
          System Architecture
        </h2>
        <p className="text-sm text-slate-500">
          How a resume moves from upload to a cited screening answer, and how a
          document question is retrieved, re-ranked and verified.
          <span className="lg:hidden">
            {' '}
            Swipe sideways to see the full diagram.
          </span>
        </p>
      </div>

      <div className="-mx-5 overflow-x-auto px-5 sm:-mx-8 sm:px-8">
        <svg
          viewBox="0 0 1400 1290"
          role="img"
          aria-labelledby="architecture-heading architecture-title"
          className="w-full min-w-[720px] font-sans"
        >
          <title id="architecture-title">
            Job creation, resume processing with embeddings and vector storage,
            screening with re-ranked candidates and a GROQ model that streams
            cited results to the UI, and a document pipeline that routes,
            retrieves, re-ranks, expands, answers and verifies.
          </title>
          {/* Background groups */}
          <defs>
            <linearGradient id="gradOrange" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop
                offset="0%"
                style={{ stopColor: 'rgb(var(--c-amber-100))' }}
              />
              <stop
                offset="100%"
                style={{ stopColor: 'rgb(var(--c-orange-200))' }}
              />
            </linearGradient>
            <linearGradient id="gradBlue" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop
                offset="0%"
                style={{ stopColor: 'rgb(var(--c-blue-100))' }}
              />
              <stop
                offset="100%"
                style={{ stopColor: 'rgb(var(--c-blue-200))' }}
              />
            </linearGradient>
            <linearGradient id="gradGreen" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop
                offset="0%"
                style={{ stopColor: 'rgb(var(--c-green-100))' }}
              />
              <stop
                offset="100%"
                style={{ stopColor: 'rgb(var(--c-green-200))' }}
              />
            </linearGradient>
            <linearGradient id="gradPurple" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop
                offset="0%"
                style={{ stopColor: 'rgb(var(--c-purple-200))' }}
              />
              <stop
                offset="100%"
                style={{ stopColor: 'rgb(var(--c-purple-300))' }}
              />
            </linearGradient>
          </defs>

          {/* Section backgrounds */}
          <rect
            className="stroke-amber-400"
            x="20"
            y="30"
            width="420"
            height="310"
            rx="12"
            fill="url(#gradOrange)"
            opacity="0.3"
            strokeWidth="2"
          />
          <rect
            className="stroke-blue-400"
            x="480"
            y="30"
            width="420"
            height="550"
            rx="12"
            fill="url(#gradBlue)"
            opacity="0.3"
            strokeWidth="2"
          />
          <rect
            className="stroke-green-400"
            x="940"
            y="30"
            width="420"
            height="870"
            rx="12"
            fill="url(#gradGreen)"
            opacity="0.3"
            strokeWidth="2"
          />

          {/* Section titles */}
          <text
            className="fill-amber-800"
            x="230"
            y="65"
            fontSize="18"
            fontWeight="bold"
            textAnchor="middle"
          >
            Job Creation
          </text>
          <text
            className="fill-blue-800"
            x="690"
            y="65"
            fontSize="18"
            fontWeight="bold"
            textAnchor="middle"
          >
            Resume Processing
          </text>
          <text
            className="fill-green-800"
            x="1150"
            y="65"
            fontSize="18"
            fontWeight="bold"
            textAnchor="middle"
          >
            Screening
          </text>

          {/* ===== JOB CREATION FLOW ===== */}
          {/* Create Job box */}
          <rect
            className="fill-surface stroke-amber-500"
            x="60"
            y="100"
            width="320"
            height="80"
            rx="8"
            strokeWidth="2"
          />
          <text
            className="fill-amber-800"
            x="220"
            y="135"
            fontSize="16"
            fontWeight="bold"
            textAnchor="middle"
          >
            Create Job
          </text>
          <text
            className="fill-amber-900"
            x="220"
            y="160"
            fontSize="13"
            textAnchor="middle"
          >
            Define criteria & requirements
          </text>

          {/* Arrow down */}
          <line
            className="stroke-amber-500"
            x1="220"
            y1="180"
            x2="220"
            y2="220"
            strokeWidth="2"
            markerEnd="url(#arrowOrange)"
          />

          {/* Store Job */}
          <rect
            className="fill-surface stroke-amber-500"
            x="60"
            y="220"
            width="320"
            height="80"
            rx="8"
            strokeWidth="2"
          />
          <text
            className="fill-amber-800"
            x="220"
            y="255"
            fontSize="16"
            fontWeight="bold"
            textAnchor="middle"
          >
            Store in Supabase
          </text>
          <text
            className="fill-amber-900"
            x="220"
            y="280"
            fontSize="13"
            textAnchor="middle"
          >
            job_id, criteria, metadata
          </text>

          {/* Arrow to screening */}
          <path
            className="stroke-amber-400"
            d="M 380 260 Q 460 260 480 360"
            strokeWidth="2"
            fill="none"
            strokeDasharray="5,5"
            markerEnd="url(#arrowOrangeLight)"
          />
          <text
            className="fill-amber-800"
            x="420"
            y="305"
            fontSize="11"
            fontStyle="italic"
          >
            Links to candidate search
          </text>

          {/* ===== RESUME PROCESSING FLOW ===== */}
          {/* Upload Resume */}
          <rect
            className="fill-surface stroke-blue-500"
            x="520"
            y="100"
            width="340"
            height="80"
            rx="8"
            strokeWidth="2"
          />
          <text
            className="fill-blue-800"
            x="690"
            y="135"
            fontSize="16"
            fontWeight="bold"
            textAnchor="middle"
          >
            Upload Resume (PDF)
          </text>
          <text
            className="fill-blue-900"
            x="690"
            y="160"
            fontSize="13"
            textAnchor="middle"
          >
            Multi-page documents accepted
          </text>

          {/* Arrow down */}
          <line
            className="stroke-blue-500"
            x1="690"
            y1="180"
            x2="690"
            y2="220"
            strokeWidth="2"
            markerEnd="url(#arrowBlue)"
          />

          {/* Parse */}
          <rect
            className="fill-surface stroke-blue-500"
            x="520"
            y="220"
            width="340"
            height="75"
            rx="8"
            strokeWidth="2"
          />
          <text
            className="fill-blue-800"
            x="690"
            y="250"
            fontSize="16"
            fontWeight="bold"
            textAnchor="middle"
          >
            Parse & Chunk
          </text>
          <text
            className="fill-blue-900"
            x="690"
            y="272"
            fontSize="12"
            textAnchor="middle"
          >
            800-char windows, 100 overlap
          </text>

          {/* Arrow down */}
          <line
            className="stroke-blue-500"
            x1="690"
            y1="295"
            x2="690"
            y2="335"
            strokeWidth="2"
            markerEnd="url(#arrowBlue)"
          />

          {/* Embed */}
          <rect
            className="fill-surface stroke-blue-500"
            x="520"
            y="335"
            width="340"
            height="80"
            rx="8"
            strokeWidth="2"
          />
          <text
            className="fill-blue-800"
            x="690"
            y="370"
            fontSize="16"
            fontWeight="bold"
            textAnchor="middle"
          >
            Generate Embeddings
          </text>
          <text
            className="fill-blue-900"
            x="690"
            y="395"
            fontSize="13"
            textAnchor="middle"
          >
            Using Gemini API
          </text>

          {/* Arrow down */}
          <line
            className="stroke-blue-500"
            x1="690"
            y1="415"
            x2="690"
            y2="455"
            strokeWidth="2"
            markerEnd="url(#arrowBlue)"
          />

          {/* Vector Storage */}
          <rect
            className="fill-surface stroke-blue-500"
            x="520"
            y="455"
            width="340"
            height="90"
            rx="8"
            strokeWidth="2"
          />
          <text
            className="fill-blue-800"
            x="690"
            y="490"
            fontSize="16"
            fontWeight="bold"
            textAnchor="middle"
          >
            Vector Storage
          </text>
          <text
            className="fill-blue-900"
            x="690"
            y="515"
            fontSize="13"
            textAnchor="middle"
          >
            pgvector + Supabase
          </text>
          <text
            className="fill-blue-900"
            x="690"
            y="535"
            fontSize="12"
            textAnchor="middle"
            fontStyle="italic"
          >
            Indexed with job_id
          </text>

          {/* Arrow to screening */}
          <path
            className="stroke-blue-400"
            d="M 860 500 Q 900 500 940 420"
            strokeWidth="2"
            fill="none"
            markerEnd="url(#arrowBlueBright)"
          />

          {/* ===== SCREENING FLOW ===== */}
          {/* User Question */}
          <rect
            className="fill-surface stroke-emerald-500"
            x="980"
            y="100"
            width="340"
            height="80"
            rx="8"
            strokeWidth="2"
          />
          <text
            className="fill-green-800"
            x="1150"
            y="135"
            fontSize="16"
            fontWeight="bold"
            textAnchor="middle"
          >
            User Question
          </text>
          <text
            className="fill-emerald-900"
            x="1150"
            y="160"
            fontSize="13"
            textAnchor="middle"
          >
            Job-specific or platform-wide
          </text>

          {/* Arrow down */}
          <line
            className="stroke-emerald-500"
            x1="1150"
            y1="180"
            x2="1150"
            y2="220"
            strokeWidth="2"
            markerEnd="url(#arrowGreen)"
          />

          {/* Embed Question */}
          <rect
            className="fill-surface stroke-emerald-500"
            x="980"
            y="220"
            width="340"
            height="75"
            rx="8"
            strokeWidth="2"
          />
          <text
            className="fill-green-800"
            x="1150"
            y="250"
            fontSize="16"
            fontWeight="bold"
            textAnchor="middle"
          >
            Embed Question
          </text>
          <text
            className="fill-emerald-900"
            x="1150"
            y="272"
            fontSize="12"
            textAnchor="middle"
          >
            Gemini embeddings
          </text>

          {/* Arrow down */}
          <line
            className="stroke-emerald-500"
            x1="1150"
            y1="295"
            x2="1150"
            y2="335"
            strokeWidth="2"
            markerEnd="url(#arrowGreen)"
          />

          {/* Vector Search */}
          <rect
            className="fill-surface stroke-emerald-500"
            x="980"
            y="335"
            width="340"
            height="80"
            rx="8"
            strokeWidth="2"
          />
          <text
            className="fill-green-800"
            x="1150"
            y="365"
            fontSize="16"
            fontWeight="bold"
            textAnchor="middle"
          >
            Semantic Search
          </text>
          <text
            className="fill-emerald-900"
            x="1150"
            y="390"
            fontSize="13"
            textAnchor="middle"
          >
            Cosine similarity, top 15, job-scoped
          </text>

          {/* Arrow down */}
          <line
            className="stroke-emerald-500"
            x1="1150"
            y1="415"
            x2="1150"
            y2="455"
            strokeWidth="2"
            markerEnd="url(#arrowGreen)"
          />

          {/* Re-rank */}
          <line
            className="stroke-emerald-500"
            x1="1150"
            y1="415"
            x2="1150"
            y2="445"
            strokeWidth="2"
            markerEnd="url(#arrowGreen)"
          />
          <rect
            className="fill-surface stroke-emerald-500"
            x="980"
            y="445"
            width="340"
            height="100"
            rx="8"
            strokeWidth="2"
          />
          <text
            className="fill-green-800"
            x="1150"
            y="475"
            fontSize="16"
            fontWeight="bold"
            textAnchor="middle"
          >
            Re-rank Candidates
          </text>
          <text
            className="fill-emerald-900"
            x="1150"
            y="499"
            fontSize="12"
            textAnchor="middle"
          >
            Group chunks by candidate, best match first
          </text>
          <text
            className="fill-emerald-900"
            x="1150"
            y="519"
            fontSize="12"
            textAnchor="middle"
          >
            +3 per matched job skill (max +15), top 3
          </text>

          {/* Fetch full resumes */}
          <line
            className="stroke-emerald-500"
            x1="1150"
            y1="545"
            x2="1150"
            y2="575"
            strokeWidth="2"
            markerEnd="url(#arrowGreen)"
          />
          <rect
            className="fill-surface stroke-emerald-500"
            x="980"
            y="575"
            width="340"
            height="70"
            rx="8"
            strokeWidth="2"
          />
          <text
            className="fill-green-800"
            x="1150"
            y="605"
            fontSize="16"
            fontWeight="bold"
            textAnchor="middle"
          >
            Fetch Full Resumes
          </text>
          <text
            className="fill-emerald-900"
            x="1150"
            y="627"
            fontSize="12"
            textAnchor="middle"
          >
            Complete text, capped at 3 candidates
          </text>

          {/* Arrow back to candidates */}
          <path
            className="stroke-emerald-400"
            d="M 980 610 Q 920 610 860 520"
            strokeWidth="2"
            fill="none"
            strokeDasharray="5,5"
            markerEnd="url(#arrowGreenLight)"
          />

          {/* GROQ + Processing */}
          <line
            className="stroke-emerald-500"
            x1="1150"
            y1="645"
            x2="1150"
            y2="675"
            strokeWidth="2"
            markerEnd="url(#arrowGreen)"
          />
          <rect
            className="fill-surface stroke-emerald-500"
            x="980"
            y="675"
            width="340"
            height="100"
            rx="8"
            strokeWidth="2"
          />
          <text
            className="fill-green-800"
            x="1150"
            y="705"
            fontSize="16"
            fontWeight="bold"
            textAnchor="middle"
          >
            GROQ API Call
          </text>
          <text
            className="fill-emerald-900"
            x="1150"
            y="730"
            fontSize="12"
            textAnchor="middle"
          >
            Score candidates, generate
          </text>
          <text
            className="fill-emerald-900"
            x="1150"
            y="750"
            fontSize="12"
            textAnchor="middle"
          >
            citations & structured output
          </text>

          {/* Response to UI */}
          <path
            className="stroke-emerald-500"
            d="M 1150 775 L 1150 805"
            strokeWidth="2"
            markerEnd="url(#arrowGreen)"
          />
          <rect
            className="fill-surface stroke-emerald-500"
            x="1020"
            y="805"
            width="260"
            height="60"
            rx="6"
            strokeWidth="2"
          />
          <text
            className="fill-green-800"
            x="1150"
            y="840"
            fontSize="16"
            fontWeight="bold"
            textAnchor="middle"
          >
            Stream to UI with Citations
          </text>

          {/* ===== DOCUMENT Q&A PIPELINE (LangGraph) ===== */}
          <rect
            className="stroke-purple-500"
            x="20"
            y="930"
            width="1340"
            height="330"
            rx="12"
            fill="url(#gradPurple)"
            opacity="0.3"
            strokeWidth="2"
          />
          <text
            className="fill-purple-800"
            x="690"
            y="965"
            fontSize="18"
            fontWeight="bold"
            textAnchor="middle"
          >
            Document Q&A (LangGraph)
          </text>
          <text
            className="fill-purple-900"
            x="690"
            y="988"
            fontSize="12"
            textAnchor="middle"
          >
            Uploaded reports are parsed, chunked by document shape, embedded and
            stored the same way, then each question runs through these steps
          </text>

          {docSteps.map((step, i) => {
            const x = 50 + i * 215;
            return (
              <g key={step.title}>
                <rect
                  className="fill-surface stroke-purple-500"
                  x={x}
                  y="1010"
                  width="190"
                  height="110"
                  rx="8"
                  strokeWidth={step.highlight ? 3 : 2}
                />
                <text
                  className="fill-purple-800"
                  x={x + 95}
                  y="1038"
                  fontSize="16"
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {step.title}
                </text>
                {step.lines.map((line, j) => (
                  <text
                    className="fill-purple-900"
                    key={line}
                    x={x + 95}
                    y={1062 + j * 18}
                    fontSize="12"
                    textAnchor="middle"
                  >
                    {line}
                  </text>
                ))}
                {i < docSteps.length - 1 && (
                  <line
                    className="stroke-purple-500"
                    x1={x + 190}
                    y1="1065"
                    x2={x + 215}
                    y2="1065"
                    strokeWidth="2"
                    markerEnd="url(#arrowPurple)"
                  />
                )}
              </g>
            );
          })}

          {/* Rewrite loop from Verify back to Retrieve */}
          <path
            className="stroke-purple-400"
            d="M 1220 1120 C 1220 1200 360 1200 360 1120"
            strokeWidth="2"
            fill="none"
            strokeDasharray="5,5"
            markerEnd="url(#arrowPurple)"
          />
          <text
            className="fill-purple-800"
            x="790"
            y="1180"
            fontSize="12"
            fontStyle="italic"
            textAnchor="middle"
          >
            Not grounded: rewrite as a keyword query and retry once
          </text>
          <text
            className="fill-purple-900"
            x="690"
            y="1238"
            fontSize="12"
            textAnchor="middle"
          >
            Re-rank defaults to the LLM; element-rich documents skip it because
            prose rerankers under-rate tables. RERANK_MODE overrides.
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
              <polygon className="fill-amber-500" points="0,0 10,5 0,10" />
            </marker>
            <marker
              id="arrowOrangeLight"
              markerWidth="10"
              markerHeight="10"
              refX="5"
              refY="5"
              orient="auto"
            >
              <polygon className="fill-amber-400" points="0,0 10,5 0,10" />
            </marker>
            <marker
              id="arrowBlue"
              markerWidth="10"
              markerHeight="10"
              refX="5"
              refY="5"
              orient="auto"
            >
              <polygon className="fill-blue-500" points="0,0 10,5 0,10" />
            </marker>
            <marker
              id="arrowBlueBright"
              markerWidth="10"
              markerHeight="10"
              refX="5"
              refY="5"
              orient="auto"
            >
              <polygon className="fill-blue-400" points="0,0 10,5 0,10" />
            </marker>
            <marker
              id="arrowGreen"
              markerWidth="10"
              markerHeight="10"
              refX="5"
              refY="5"
              orient="auto"
            >
              <polygon className="fill-emerald-500" points="0,0 10,5 0,10" />
            </marker>
            <marker
              id="arrowPurple"
              markerWidth="10"
              markerHeight="10"
              refX="5"
              refY="5"
              orient="auto"
            >
              <polygon className="fill-purple-500" points="0,0 10,5 0,10" />
            </marker>
            <marker
              id="arrowGreenLight"
              markerWidth="10"
              markerHeight="10"
              refX="5"
              refY="5"
              orient="auto"
            >
              <polygon className="fill-emerald-400" points="0,0 10,5 0,10" />
            </marker>
          </defs>
        </svg>
      </div>

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
    <div className="flex-1">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <section className="mb-12 max-w-3xl sm:mb-16">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-blue-600">
            AI-assisted recruiting
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Resume Screening RAG
          </h1>
          <p className="mt-5 text-base leading-relaxed text-slate-600 sm:text-lg">
            Create jobs, upload candidate resumes and ask free-form screening
            questions. An agent decides for itself which resumes to search and
            read in full, then returns a grounded, structured report.
          </p>
        </section>

        <section aria-labelledby="get-started-heading">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {destinations.map((dest) => (
              <Link
                key={dest.href}
                href={dest.href}
                className={`group flex flex-col rounded-xl border-2 bg-surface p-6 shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-card-hover ${dest.accent}`}
              >
                <span
                  aria-hidden="true"
                  className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-2xl transition group-hover:scale-105"
                >
                  {dest.icon}
                </span>
                <h3 className="text-lg font-semibold text-slate-900">
                  {dest.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                  {dest.description}
                </p>
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-16" aria-label="Architecture">
          <ArchitectureDiagram />
        </section>
      </div>
    </div>
  );
}
