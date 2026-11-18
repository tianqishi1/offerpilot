import { z } from 'zod';

export const APP_STATUSES = [
  'draft', 'filled', 'confirmed', 'submitted', 'verified',
  'screening', 'test', 'interview', 'offer', 'closed',
] as const;
export type AppStatus = (typeof APP_STATUSES)[number];

export const CLOSED_REASONS = ['rejected', 'withdrawn', 'ghosted'] as const;
export type ClosedReason = (typeof CLOSED_REASONS)[number];

const TRANSITIONS: Record<AppStatus, readonly AppStatus[]> = {
  draft: ['filled', 'closed'],
  filled: ['confirmed', 'draft', 'closed'],
  confirmed: ['submitted', 'filled', 'closed'],
  submitted: ['verified', 'closed'],
  verified: ['screening', 'closed'],
  screening: ['test', 'interview', 'offer', 'closed'],
  test: ['interview', 'closed'],
  interview: ['offer', 'closed'],
  offer: ['closed'],
  closed: [],
};

export function canTransition(from: AppStatus, to: AppStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: AppStatus, to: AppStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`illegal application transition: ${from} -> ${to}`);
  }
}

/** 只有 verified 及之后的状态计入"有效投递"。 */
export function countsAsValidSubmission(status: AppStatus): boolean {
  const idx = APP_STATUSES.indexOf(status);
  return idx >= APP_STATUSES.indexOf('verified') && status !== 'closed';
}

export const StatusSource = z.enum(['plugin_detect', 'user_manual', 'email']);

export const ApplicationRecord = z.object({
  id: z.string(),
  jobId: z.string(),
  resumeVersion: z.string(),
  status: z.enum(APP_STATUSES),
  closedReason: z.enum(CLOSED_REASONS).optional(),
  source: StatusSource,
  timestamps: z.record(z.string(), z.string()),
  fillplanMetaId: z.string().optional(),
});
export type ApplicationRecord = z.infer<typeof ApplicationRecord>;
