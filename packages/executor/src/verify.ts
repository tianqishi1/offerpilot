import type { PageContext, VerifyResult, VerifySpec } from '@offerpilot/core';
import { resolveOne } from './locate.js';

/**
 * 提交校验（反"草稿幻觉"）：多证据加权。
 * >=2 项命中 -> verified；1 项 -> unverified（提示人工确认）；0 -> failed。
 */
export async function verifySubmit(ctx: PageContext, spec: VerifySpec): Promise<VerifyResult> {
  const evidence: string[] = [];
  const url = ctx.url();
  for (const p of spec.successUrlPatterns ?? []) {
    if (new RegExp(p).test(url)) evidence.push(`url:${p}`);
  }
  for (const s of spec.successSelectors ?? []) {
    if (resolveOne(ctx, s)) evidence.push(`selector:${s.type}`);
  }
  const bodyText = ctx.document().body?.textContent ?? '';
  for (const t of spec.successTexts ?? []) {
    if (bodyText.includes(t)) evidence.push(`text:${t}`);
  }
  if (spec.formGoneCheck && !ctx.querySelector('form')) {
    evidence.push('form-gone');
  }
  const result = evidence.length >= 2 ? 'verified' : evidence.length === 1 ? 'unverified' : 'failed';
  return { result, evidence, checkedAt: ctx.now() };
}
