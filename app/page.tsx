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

export default function Home() {
  return (
    <div className="bg-gradient-to-b from-blue-50 to-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-12 sm:py-16">
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
      </div>
    </div>
  );
}
