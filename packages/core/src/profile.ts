import { z } from 'zod';

/** 永不上传云端的敏感字段键名（端侧剔除 + CI payload 扫描共用）。 */
export const SENSITIVE_KEYS = ['phone', 'idNumber', 'address', 'bankCard', 'mobile', 'idCard'] as const;

export const ResumeItem = z.object({
  id: z.string(),
  type: z.enum(['education', 'internship', 'project', 'skill', 'award', 'other']),
  content: z.record(z.string(), z.unknown()),
  sourceRef: z.string().optional(),
});
export type ResumeItem = z.infer<typeof ResumeItem>;

export const Profile = z.object({
  version: z.number().int().min(1),
  basics: z.object({
    name: z.string().optional(),
    school: z.string().optional(),
    major: z.string().optional(),
    degree: z.enum(['bachelor', 'master', 'phd', 'other']).optional(),
    gradYear: z.number().int().optional(),
    city: z.string().optional(),
  }),
  items: z.array(ResumeItem),
  preferences: z.object({
    cities: z.array(z.string()).default([]),
    roles: z.array(z.string()).default([]),
    industries: z.array(z.string()).default([]),
    salaryFloor: z.number().optional(),
  }).default({ cities: [], roles: [], industries: [] }),
  intent: z.string().optional(),
});
export type Profile = z.infer<typeof Profile>;

const SENSITIVE_SET = new Set<string>(SENSITIVE_KEYS);

/** 深度剔除敏感键（返回新对象，不改原值）。上传前必须调用。 */
export function stripSensitive<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => stripSensitive(v)) as unknown as T;
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_SET.has(k)) continue;
      out[k] = stripSensitive(v);
    }
    return out as T;
  }
  return value;
}

/** 扫描对象中出现的敏感键路径（CI/上传预览用）。 */
export function findSensitivePaths(value: unknown, path = '$'): string[] {
  const hits: string[] = [];
  if (Array.isArray(value)) {
    value.forEach((v, i) => hits.push(...findSensitivePaths(v, `${path}[${i}]`)));
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const p = `${path}.${k}`;
      if (SENSITIVE_SET.has(k)) hits.push(p);
      hits.push(...findSensitivePaths(v, p));
    }
  }
  return hits;
}
