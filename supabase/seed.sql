insert into jobs (title, description, experience, skills)
select
  seed.title,
  seed.description,
  seed.experience,
  seed.skills
from (
  values
    (
      'Java Developer',
      'Build and maintain reliable Java services and APIs.',
      '3+ years of professional Java development experience',
      array['Java', 'Spring Boot', 'REST APIs', 'SQL']::text[]
    ),
    (
      'MERN stack developer',
      'Develop full-stack web applications with the MERN stack.',
      '3+ years of full-stack JavaScript development experience',
      array['MongoDB', 'Express.js', 'React', 'Node.js']::text[]
    ),
    (
      'Project Manager',
      'Lead software delivery from planning through execution and release.',
      '5+ years of project or program management experience',
      array['Agile', 'Scrum', 'Stakeholder management', 'Risk management']::text[]
    )
) as seed(title, description, experience, skills)
where not exists (
  select 1
  from jobs
  where jobs.title = seed.title
);