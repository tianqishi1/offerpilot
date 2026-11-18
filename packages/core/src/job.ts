import { z } from 'zod';

export const Job = z.object({
  id: z.string(),
  source: z.string(),
  url: z.string(),
  title: z.string(),
  company: z.string(),
  city: z.string().optional(),
  jdText: z.string(),
  deadline: z.string().optional(),
  dedupHash: z.string(),
  freshnessAt: z.string(),
});
export type Job = z.infer<typeof Job>;

export const MatchDims = z.object({
  skill: z.number().min(0).max(100),
  experience: z.number().min(0).max(100),
  competition: z.number().min(0).max(100),
  timing: z.number().min(0).max(100),
});

export const JobMatch = z.object({
  jobId: z.string(),
  score: z.number().min(0).max(100),
  dims: MatchDims,
  gaps: z.array(z.object({
    missing: z.string(),
    severity: z.enum(['low', 'medium', 'high']),
    suggestion: z.string(),
  })),
  reasons: z.array(z.string()),
  profileVersion: z.number().int(),
});
export type JobMatch = z.infer<typeof JobMatch>;
