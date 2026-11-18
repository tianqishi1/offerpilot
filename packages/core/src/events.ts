import { z } from 'zod';

/** 遥测白名单：只允许这些事件名；props 只允许标量，禁止 JD/简历内容。 */
export const TelemetryEventName = z.enum([
  'adapter_detected', 'fill_started', 'fill_finished', 'field_failed',
  'drift_used', 'submit_verified', 'submit_unverified', 'submit_failed',
  'digest_opened', 'outcome_marked',
]);

export const TelemetryEvent = z.object({
  name: TelemetryEventName,
  props: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  ts: z.string(),
});
export type TelemetryEvent = z.infer<typeof TelemetryEvent>;
