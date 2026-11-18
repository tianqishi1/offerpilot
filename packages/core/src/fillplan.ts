import { z } from 'zod';

export const ValueSource = z.enum(['profile', 'generated', 'user', 'missing']);
export type ValueSource = z.infer<typeof ValueSource>;

export const SelectorStrategy = z.discriminatedUnion('type', [
  z.object({ type: z.literal('label'), value: z.string() }),
  z.object({ type: z.literal('aria'), role: z.string(), name: z.string() }),
  z.object({ type: z.literal('css'), value: z.string() }),
  z.object({ type: z.literal('xpath'), value: z.string() }),
  z.object({ type: z.literal('placeholder'), value: z.string() }),
  z.object({ type: z.literal('nameAttr'), value: z.string() }),
]);
export type SelectorStrategy = z.infer<typeof SelectorStrategy>;

export const FieldKind = z.enum([
  'text', 'textarea', 'select', 'combobox', 'radio', 'checkbox',
  'date', 'file', 'richtext', 'custom',
]);
export type FieldKind = z.infer<typeof FieldKind>;

export const ValidationRule = z.object({
  type: z.enum(['nonempty', 'maxLength', 'pattern', 'optionExists', 'fileAccepted']),
  args: z.record(z.string(), z.unknown()).optional(),
});
export type ValidationRule = z.infer<typeof ValidationRule>;

export const FieldValue = z.object({
  source: ValueSource,
  profilePath: z.string().optional(),
  generatedId: z.string().optional(),
  text: z.string().optional(),
  fileRef: z.string().optional(),
});
export type FieldValue = z.infer<typeof FieldValue>;

export const FieldStatus = z.enum(['pending', 'filled', 'needs_review', 'missing', 'failed', 'confirmed']);
export type FieldStatus = z.infer<typeof FieldStatus>;

export const Traceability = z.object({
  resumeItemIds: z.array(z.string()).optional(),
  jdKeywords: z.array(z.string()).optional(),
});

export const FieldPlan = z.object({
  fieldId: z.string(),
  kind: FieldKind,
  label: z.string(),
  required: z.boolean(),
  selectors: z.array(SelectorStrategy).min(1),
  value: FieldValue,
  confidence: z.number().min(0).max(1),
  status: FieldStatus,
  traceability: Traceability.optional(),
  validation: z.array(ValidationRule).optional(),
});
export type FieldPlan = z.infer<typeof FieldPlan>;

export const PagePlan = z.object({
  pageIndex: z.number().int().min(0),
  fields: z.array(FieldPlan),
  next: z.object({
    selectors: z.array(SelectorStrategy),
    waitUntil: z.enum(['navigation', 'domStable', 'selector']),
  }).optional(),
});
export type PagePlan = z.infer<typeof PagePlan>;

export const VerifySpec = z.object({
  successUrlPatterns: z.array(z.string()).optional(),
  successSelectors: z.array(SelectorStrategy).optional(),
  successTexts: z.array(z.string()).optional(),
  formGoneCheck: z.boolean().default(true),
  statusPageUrl: z.string().optional(),
  emailCheck: z.boolean().default(false),
});
export type VerifySpec = z.infer<typeof VerifySpec>;

export const FillPlanMeta = z.object({
  modelTier: z.string(),
  promptVersion: z.string(),
  schemaHash: z.string(),
  createdAt: z.string(),
});

export const FillPlan = z.object({
  id: z.string(),
  adapterId: z.string(),
  adapterVersion: z.string(),
  pageFingerprint: z.string(),
  applicationId: z.string().optional(),
  pages: z.array(PagePlan).min(1),
  submit: z.object({
    selectors: z.array(SelectorStrategy).min(1),
    verify: VerifySpec,
  }),
  meta: FillPlanMeta,
});
export type FillPlan = z.infer<typeof FillPlan>;

export const FieldResult = z.object({
  fieldId: z.string(),
  status: FieldStatus,
  attempts: z.number().int().min(0),
  driftUsed: z.boolean(),
  error: z.string().optional(),
});
export type FieldResult = z.infer<typeof FieldResult>;

export const ExecutionReport = z.object({
  planId: z.string(),
  results: z.array(FieldResult),
  startedAt: z.string(),
  finishedAt: z.string(),
});
export type ExecutionReport = z.infer<typeof ExecutionReport>;

export const VerifyResult = z.object({
  result: z.enum(['verified', 'unverified', 'failed']),
  evidence: z.array(z.string()),
  checkedAt: z.string(),
});
export type VerifyResult = z.infer<typeof VerifyResult>;
