import { z } from 'zod';
import type { Profile, ResumeItem } from '@offerpilot/core';

/** 抽取 schema 容错：degree/gradYear 允许字符串，toProfile 归一化。 */
export const ExtractedProfile = z.object({
  basics: z.object({
    name: z.string().optional(),
    school: z.string().optional(),
    major: z.string().optional(),
    degree: z.string().optional(),
    gradYear: z.union([z.number(), z.string()]).optional(),
    city: z.string().optional(),
  }).default({}),
  items: z.array(z.object({
    type: z.enum(['education', 'internship', 'project', 'skill', 'award', 'other']),
    content: z.record(z.string(), z.unknown()).default({}),
  })).default([]),
  intent: z.string().optional(),
});
export type ExtractedProfile = z.infer<typeof ExtractedProfile>;

export const GeneratedAnswer = z.object({
  answer: z.string().min(1).max(2000),
  resumeItemIds: z.array(z.string()).default([]),
  jdKeywords: z.array(z.string()).default([]),
});
export type GeneratedAnswer = z.infer<typeof GeneratedAnswer>;

const EXTRACTION_EXAMPLE = '{"basics":{"name":"张三","school":"某大学","major":"计算机科学与技术","degree":"master","gradYear":2027,"city":"北京"},"items":[{"type":"education","content":{"school":"某大学","major":"计算机","degree":"master","end":"2027"}},{"type":"internship","content":{"company":"X公司","role":"后端开发实习生","desc":"Go 微服务开发","start":"2026.03","end":"2026.09"}},{"type":"skill","content":{"skills":["Go","Java"]}}],"intent":"后端开发"}';

export function extractionPrompt(resumeText: string): string {
  return [
    '从简历文本提取结构化画像。',
    '硬规则：只提取文本中真实存在的信息，不得编造；不要输出手机号/身份证/住址等敏感信息。',
    '必须严格按照以下 JSON 结构输出（basics + items 两个顶层键，items 的 type 只能是 education/internship/project/skill/award/other，经历细节放在 content 里）：',
    EXTRACTION_EXAMPLE,
    '简历文本：',
    resumeText.slice(0, 12000),
  ].join('\n');
}

function normalizeDegree(d?: string): Profile['basics']['degree'] {
  if (!d) return undefined;
  const s = d.toLowerCase();
  if (/本科|学士|bachelor|bsc|ba\b/.test(s)) return 'bachelor';
  if (/硕士|研究生|master|msc|ma\b|meng/.test(s)) return 'master';
  if (/博士|phd|doctor/.test(s)) return 'phd';
  return 'other';
}

function normalizeYear(y?: number | string): number | undefined {
  if (typeof y === 'number') return Math.trunc(y);
  if (typeof y === 'string') {
    const m = y.match(/(19|20)\d{2}/);
    return m ? Number(m[0]) : undefined;
  }
  return undefined;
}

export function toProfile(extracted: ExtractedProfile): Profile {
  const items: ResumeItem[] = extracted.items.map((it, i) => ({ id: `item-${i + 1}`, type: it.type, content: it.content }));
  return {
    version: 1,
    basics: {
      ...extracted.basics,
      degree: normalizeDegree(extracted.basics.degree),
      gradYear: normalizeYear(extracted.basics.gradYear),
    },
    items,
    preferences: { cities: [], roles: [], industries: [] },
    intent: extracted.intent,
  };
}

export function generationPrompt(question: string, profile: Profile, jdTitle: string, jdText: string): string {
  return [
    `岗位：${jdTitle}`,
    `岗位描述：${jdText.slice(0, 3000)}`,
    `候选人画像(JSON)：${JSON.stringify({ basics: profile.basics, items: profile.items })}`,
    `网申开放题：${question}`,
    '写一段 150-300 字的回答。硬规则：只能基于画像中的真实经历，不得编造公司/项目/数字/技能；语气真诚具体，结合岗位要求；不要空话套话。',
    '必须严格按照此 JSON 结构输出：{"answer":"回答正文","resumeItemIds":["引用的画像item id"],"jdKeywords":["呼应的岗位关键词"]}',
  ].join('\n');
}
