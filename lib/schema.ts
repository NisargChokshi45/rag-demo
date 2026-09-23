import { z } from 'zod';

export const CitationSchema = z.object({
  candidateId: z.string(),
  candidateName: z.string(),
  content: z.string().describe('Relevant excerpt from resume'),
  tool: z
    .enum(['search_chunks', 'get_full_resume'])
    .describe('Which tool provided this citation'),
});

export type Citation = z.infer<typeof CitationSchema>;

export const CandidateAssessmentSchema = z.object({
  candidateId: z.string(),
  candidateName: z.string(),
  score: z.number().min(0).max(100),
  evidence: z.array(z.string()),
  unknowns: z.array(z.string()),
  citations: z
    .array(CitationSchema)
    .optional()
    .default([])
    .describe('Resume excerpts supporting this assessment'),
});

export type CandidateAssessment = z.infer<typeof CandidateAssessmentSchema>;

export const ScreeningReportSchema = z.object({
  query: z.string(),
  assessments: z.array(CandidateAssessmentSchema),
  summary: z.string(),
  reasoning: z
    .string()
    .optional()
    .describe('Key reasoning steps and thinking process'),
  context: z
    .array(z.string())
    .optional()
    .default([])
    .describe('Context items used (job criteria, search strategies, etc)'),
});

export type ScreeningReport = z.infer<typeof ScreeningReportSchema>;
