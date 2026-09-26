import crypto from 'crypto';

interface JobData {
  description?: string;
  experience?: string;
  skills?: string[];
}

export function generateJobHash(jobData: JobData): string {
  const normalized = {
    description: (jobData.description || '').trim(),
    experience: (jobData.experience || '').trim(),
    skills: Array.isArray(jobData.skills) ? jobData.skills.sort() : [],
  };

  const jsonString = JSON.stringify(normalized);
  return crypto.createHash('sha256').update(jsonString).digest('hex');
}

export function jobHashesMatch(
  hash1: string | null | undefined,
  hash2: string
): boolean {
  if (!hash1) return false;
  return hash1 === hash2;
}
