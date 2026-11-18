import { z } from 'zod';
import type { FieldKind, SelectorStrategy, FillPlan, ExecutionReport, VerifySpec, VerifyResult } from './fillplan.js';
import type { Profile } from './profile.js';
import type { Job } from './job.js';
import type { AppStatus } from './application.js';
import type { LlmClient } from './llm.js';
import type { Registry } from './registry.js';

/** 执行引擎面对的页面抽象（content script 提供真实实现，测试提供 happy-dom 实现）。 */
export interface PageContext {
  url(): string;
  document(): Document;
  querySelector(selector: string): Element | null;
  querySelectorAll(selector: string): Element[];
  evaluateXPath(expr: string): Element | null;
  wait(ms: number): Promise<void>;
  now(): string;
}

export const FieldSchema = z.object({
  fieldId: z.string(),
  kind: z.custom<FieldKind>((v) => typeof v === 'string'),
  label: z.string(),
  required: z.boolean(),
  options: z.array(z.string()).optional(),
  maxLength: z.number().int().optional(),
  accept: z.string().optional(),
  groupPath: z.string().optional(),
  selectors: z.array(z.custom<SelectorStrategy>((v) => typeof v === 'object' && v !== null)).min(1),
});
export type FieldSchema = z.infer<typeof FieldSchema>;

export interface DetectResult {
  adapterId: string;
  version: string;
  fingerprintId: string;
  confidence: number;
}

export interface BuildFillPlanInput {
  schema: FieldSchema[];
  profile: Profile;
  jd: Job;
  llm: LlmClient;
  promptVersion?: string;
}

export interface AtsAdapter {
  id: string;
  version: string;
  detect(ctx: PageContext, registry: Registry): Promise<DetectResult | null>;
  extract(ctx: PageContext): Promise<FieldSchema[]>;
  buildFillPlan(input: BuildFillPlanInput): Promise<FillPlan>;
  execute(plan: FillPlan, ctx: PageContext): Promise<ExecutionReport>;
  verifySubmit(ctx: PageContext, spec: VerifySpec): Promise<VerifyResult>;
  trackStatus?(ctx: PageContext): Promise<AppStatus | null>;
}
