import { embedDocument } from './embeddings';

interface ScoringInput {
  resumeText: string;
  jobDescription?: string;
  jobExperience?: string;
  jobSkills?: string[];
}

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) return 0;

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    magnitudeA += vecA[i] * vecA[i];
    magnitudeB += vecB[i] * vecB[i];
  }

  const denominator = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

async function calculateSemanticSimilarity(
  text1: string,
  text2: string
): Promise<number> {
  if (!text1.trim() || !text2.trim()) return 0;

  const [embedding1, embedding2] = await Promise.all([
    embedDocument(text1.substring(0, 5000)),
    embedDocument(text2.substring(0, 5000)),
  ]);

  const similarity = cosineSimilarity(embedding1, embedding2);
  return Math.max(0, Math.min(1, (similarity + 1) / 2));
}

function calculateSkillsMatch(
  resumeText: string,
  skills: string[]
): number {
  if (!skills.length) return 0.5;

  const resumeLower = resumeText.toLowerCase();
  let matchCount = 0;

  for (const skill of skills) {
    if (resumeLower.includes(skill.toLowerCase())) {
      matchCount++;
    }
  }

  return matchCount / skills.length;
}

async function scoreCandidate(input: ScoringInput): Promise<number> {
  const { resumeText, jobDescription = '', jobExperience = '', jobSkills = [] } =
    input;

  let descriptionScore = 0;
  let experienceScore = 0;
  let skillsScore = 0;

  const weights = {
    description: 0.4,
    experience: 0.35,
    skills: 0.25,
  };

  if (jobDescription.trim()) {
    descriptionScore = await calculateSemanticSimilarity(
      resumeText,
      jobDescription
    );
  }

  if (jobExperience.trim()) {
    experienceScore = await calculateSemanticSimilarity(
      resumeText,
      jobExperience
    );
  }

  if (jobSkills.length > 0) {
    skillsScore = calculateSkillsMatch(resumeText, jobSkills);
  }

  const weightedScore =
    descriptionScore * weights.description +
    experienceScore * weights.experience +
    skillsScore * weights.skills;

  return Math.round(weightedScore * 100);
}

export async function calculateCandidateScore(input: ScoringInput): Promise<number | null> {
  try {
    return await scoreCandidate(input);
  } catch (error) {
    console.error('[SCORING] Error calculating score:', error);
    return null;
  }
}
