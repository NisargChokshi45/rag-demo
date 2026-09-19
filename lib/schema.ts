import { z } from "zod";

// TODO: Define Zod schemas for screening report and candidate assessment

export const CandidateAssessmentSchema = z.object({
  candidateId: z.string(),
  candidateName: z.string(),
  score: z.number().min(0).max(100),
  evidence: z.array(z.string()),
  unknowns: z.array(z.string()),
});

export type CandidateAssessment = z.infer<typeof CandidateAssessmentSchema>;

export const ScreeningReportSchema = z.object({
  query: z.string(),
  assessments: z.array(CandidateAssessmentSchema),
  summary: z.string(),
});

export type ScreeningReport = z.infer<typeof ScreeningReportSchema>;
