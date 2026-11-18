import { z } from 'zod';
import { FillPlan, FieldResult, VerifySpec } from './fillplan.js';
import { APP_STATUSES } from './application.js';

/** 插件内部消息协议（content ↔ background ↔ sidepanel），全部 zod 校验。 */
export const ExtMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('DETECT') }),
  z.object({ type: z.literal('EXTRACT') }),
  z.object({ type: z.literal('EXECUTE_PLAN'), plan: FillPlan }),
  z.object({ type: z.literal('EXECUTE_FIELD'), plan: FillPlan, fieldId: z.string() }),
  z.object({ type: z.literal('CONFIRM_SUBMIT'), planId: z.string() }),
  z.object({ type: z.literal('VERIFY'), spec: VerifySpec }),
  z.object({ type: z.literal('PROGRESS'), results: z.array(FieldResult) }),
  z.object({ type: z.literal('STATUS'), status: z.enum(APP_STATUSES) }),
  z.object({ type: z.literal('REGISTRY_UPDATED'), version: z.string() }),
  z.object({ type: z.literal('DETECT_RESULT'), adapterId: z.string(), fingerprintId: z.string(), confidence: z.number() }),
  z.object({ type: z.literal('EXTRACT_RESULT'), fields: z.array(z.unknown()) }),
  z.object({ type: z.literal('ERROR'), message: z.string() }),
]);
export type ExtMessage = z.infer<typeof ExtMessage>;
