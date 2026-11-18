import { describe, expect, it } from 'vitest';
import { FillPlan, FieldPlan } from '../src/fillplan.js';

export function makeField(overrides: Record<string, unknown> = {}) {
  return {
    fieldId: 'f1',
    kind: 'text',
    label: '姓名',
    required: true,
    selectors: [{ type: 'label', value: '姓名' }, { type: 'css', value: '#name' }],
    value: { source: 'profile', profilePath: 'basics.name' },
    confidence: 0.95,
    status: 'pending',
    ...overrides,
  };
}

export function makePlan(overrides: Record<string, unknown> = {}) {
  return {
    id: 'plan-1',
    adapterId: 'generic',
    adapterVersion: '0.1.0',
    pageFingerprint: 'fp-generic',
    pages: [{ pageIndex: 0, fields: [makeField()] }],
    submit: {
      selectors: [{ type: 'css', value: '#submit' }],
      verify: { successTexts: ['提交成功'], formGoneCheck: true, emailCheck: false },
    },
    meta: { modelTier: 'small', promptVersion: 'v1', schemaHash: 'h1', createdAt: new Date().toISOString() },
    ...overrides,
  };
}

describe('FillPlan contract', () => {
  it('accepts a valid plan', () => {
    expect(FillPlan.safeParse(makePlan()).success).toBe(true);
  });
  it('rejects confidence out of range', () => {
    const p = makePlan();
    p.pages[0]!.fields[0]!.confidence = 1.5;
    expect(FillPlan.safeParse(p).success).toBe(false);
  });
  it('rejects empty selector chain', () => {
    const p = makePlan();
    p.pages[0]!.fields[0]!.selectors = [];
    expect(FillPlan.safeParse(p).success).toBe(false);
  });
  it('rejects empty pages', () => {
    expect(FillPlan.safeParse(makePlan({ pages: [] })).success).toBe(false);
  });
  it('requires at least one submit selector', () => {
    const p = makePlan();
    p.submit.selectors = [];
    expect(FillPlan.safeParse(p).success).toBe(false);
  });
  it('field defaults verify flags', () => {
    const parsed = FieldPlan.parse(makeField());
    expect(parsed.value.source).toBe('profile');
  });
});

