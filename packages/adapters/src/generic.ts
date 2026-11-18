import { z } from 'zod';
import {
  detectAdapter, FillPlan, type AtsAdapter, type BuildFillPlanInput, type DetectResult,
  type ExecutionReport, type FieldSchema, type FieldStatus, type FieldValue,
  type PageContext, type Profile, type Registry, type VerifyResult, type VerifySpec,
} from '@offerpilot/core';
import { executePlan, verifySubmit } from '@offerpilot/executor';
import { extractFields } from './extract.js';

/** knockout/敏感问题：一律用户自答，禁止 AI 代填。 */
const KNOCKOUT_RE = /薪资|薪酬|签证|竞业|身份证|户口|政治面貌|服从调剂|残疾|病史|婚育/;

export const FieldMapping = z.object({
  fieldId: z.string(),
  profilePath: z.string().nullable(),
  generated: z.boolean().default(false),
  confidence: z.number().min(0).max(1),
  reason: z.string().optional(),
});
export const MappingResult = z.object({ mappings: z.array(FieldMapping) });
export type MappingResult = z.infer<typeof MappingResult>;

export function getAtPath(obj: unknown, path: string): unknown {
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function profileSummary(profile: Profile): string {
  return JSON.stringify({
    basics: profile.basics,
    items: profile.items.map((i) => ({ id: i.id, type: i.type, content: i.content })),
  });
}

export function buildMappingPrompt(schema: FieldSchema[], profile: Profile, jdTitle: string): string {
  return [
    `目标岗位：${jdTitle}`,
    `字段列表(JSON)：${JSON.stringify(schema.map((f) => ({ fieldId: f.fieldId, label: f.label, kind: f.kind, required: f.required, options: f.options })))}`,
    `候选人画像(JSON)：${profileSummary(profile)}`,
    '任务：为每个字段给出映射。事实字段映射到画像已有路径(profilePath)；开放题(为什么选我们/职业规划等)标 generated=true；薪资/签证/竞业等 knockout 字段 profilePath=null 且 generated=false；无法映射 profilePath=null。只输出 JSON。',
  ].join('\n');
}

export const genericAdapter: AtsAdapter = {
  id: 'generic',
  version: '0.1.0',

  async detect(ctx: PageContext, registry: Registry): Promise<DetectResult | null> {
    const r = detectAdapter(registry, ctx);
    return r && r.adapterId === 'generic' ? r : null;
  },

  async extract(ctx: PageContext): Promise<FieldSchema[]> {
    return extractFields(ctx);
  },

  async buildFillPlan(input: BuildFillPlanInput): Promise<FillPlan> {
    const { schema, profile, jd, llm } = input;
    const mapping = await llm.callStructured(MappingResult, {
      tier: 'small',
      system: '你是简历字段映射器，只输出符合 schema 的 JSON，不得编造画像中不存在的内容。',
      prompt: buildMappingPrompt(schema, profile, jd.title),
    });
    const byId = new Map(mapping.mappings.map((m) => [m.fieldId, m]));
    const fields = schema.map((f) => {
      const m = byId.get(f.fieldId);
      const knockout = KNOCKOUT_RE.test(f.label);
      let value: FieldValue;
      let confidence = 0.3;
      let status: FieldStatus = 'pending';
      if (knockout) {
        value = { source: 'user' };
        confidence = 1;
        status = 'needs_review';
      } else if (m?.generated) {
        value = { source: 'generated', generatedId: `gen-${f.fieldId}` };
        confidence = m.confidence;
        status = 'needs_review';
      } else if (m?.profilePath) {
        const raw = getAtPath(profile, m.profilePath);
        const text = raw === undefined || raw === null ? '' : String(raw);
        if (text) {
          value = { source: 'profile', profilePath: m.profilePath, text };
          confidence = m.confidence;
        } else {
          value = { source: 'missing' };
          status = 'missing';
        }
      } else {
        value = { source: 'missing' };
        status = 'missing';
      }
      return {
        fieldId: f.fieldId,
        kind: f.kind,
        label: f.label,
        required: f.required,
        selectors: f.selectors,
        value,
        confidence,
        status,
        validation: f.required ? [{ type: 'nonempty' as const }] : undefined,
      };
    });
    return FillPlan.parse({
      id: `plan-${Date.now()}`,
      adapterId: 'generic',
      adapterVersion: genericAdapter.version,
      pageFingerprint: 'fp-generic',
      pages: [{ pageIndex: 0, fields }],
      submit: {
        selectors: [{ type: 'css', value: 'button[type="submit"],#submit' }],
        verify: { successTexts: ['提交成功', '申请已收到', '感谢投递'], formGoneCheck: true, emailCheck: false },
      },
      meta: { modelTier: 'small', promptVersion: input.promptVersion ?? 'v1', schemaHash: String(schema.length), createdAt: new Date().toISOString() },
    });
  },

  async execute(plan, ctx): Promise<ExecutionReport> {
    return executePlan(ctx, plan);
  },

  async verifySubmit(ctx: PageContext, spec: VerifySpec): Promise<VerifyResult> {
    return verifySubmit(ctx, spec);
  },
};
