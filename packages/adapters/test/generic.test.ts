import { describe, expect, it } from 'vitest';
import { extractFields } from '../src/extract.js';
import { genericAdapter, getAtPath } from '../src/generic.js';
import { createPageContext } from '@offerpilot/executor';
import { Registry, type LlmClient, type Profile, type Job } from '@offerpilot/core';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'executor', 'fixtures');
function load(name: string) {
  document.body.innerHTML = readFileSync(join(fixturesDir, name), 'utf8');
  return createPageContext(window);
}

const profile: Profile = {
  version: 1,
  basics: { name: '小林', school: '某大学', major: '计算机', degree: 'master', gradYear: 2027, city: '北京' },
  items: [{ id: 'i1', type: 'internship', content: { company: 'X公司', role: '后端实习' } }],
  preferences: { cities: ['北京'], roles: ['后端'], industries: [] },
};
const jd: Job = { id: 'j1', source: 'test', url: 'https://example.com', title: '后端开发工程师', company: 'X', jdText: 'Go/Java', dedupHash: 'h', freshnessAt: new Date().toISOString() };

class ScriptedLlm implements LlmClient {
  constructor(private responder: (prompt: string) => unknown) {}
  async callStructured<T>(schema: z.ZodType<T>, opts: { prompt: string }): Promise<T> {
    return schema.parse(this.responder(opts.prompt));
  }
}

describe('extractFields', () => {
  it('extracts kinds, labels, required, options without values', () => {
    const ctx = load('react-form.html');
    (document.getElementById('name') as HTMLInputElement).required = true;
    const fields = extractFields(ctx);
    const byId = new Map(fields.map((f) => [f.fieldId, f]));
    expect(byId.get('name')?.kind).toBe('text');
    expect(byId.get('name')?.label).toBe('姓名');
    expect(byId.get('name')?.required).toBe(true);
    expect(byId.get('intro')?.kind).toBe('textarea');
    expect(byId.get('city')?.kind).toBe('select');
    expect(byId.get('city')?.options).toEqual(['北京', '上海']);
    expect(byId.get('agree')?.kind).toBe('checkbox');
  });
  it('extracts combobox with listbox options', () => {
    const ctx = load('combobox.html');
    const fields = extractFields(ctx);
    expect(fields[0]?.kind).toBe('combobox');
    expect(fields[0]?.label).toBe('期望城市');
    expect(fields[0]?.options).toEqual(['北京', '上海', '深圳']);
  });
  it('skips hidden pages', () => {
    const ctx = load('multipage.html');
    const fields = extractFields(ctx);
    expect(fields.map((f) => f.fieldId)).toEqual(['p1-name']);
  });
});

describe('getAtPath', () => {
  it('resolves nested and array paths', () => {
    expect(getAtPath(profile, 'basics.name')).toBe('小林');
    expect(getAtPath(profile, 'items[0].content.company')).toBe('X公司');
    expect(getAtPath(profile, 'basics.none')).toBeUndefined();
  });
});

describe('genericAdapter.buildFillPlan', () => {
  const registry = Registry.parse({ version: 't', adapters: [{ id: 'generic', fingerprints: [] }] });
  it('maps profile fields, flags generated and knockout, marks missing', async () => {
    const ctx = load('react-form.html');
    document.body.insertAdjacentHTML('beforeend', '<label for="salary">期望薪资</label><input id="salary" name="salary" type="text" /><label for="why">为什么选我们</label><textarea id="why" name="why"></textarea>');
    const schema = extractFields(ctx);
    const llm = new ScriptedLlm(() => ({
      mappings: [
        { fieldId: 'name', profilePath: 'basics.name', generated: false, confidence: 0.97 },
        { fieldId: 'intro', profilePath: null, generated: true, confidence: 0.8 },
        { fieldId: 'city', profilePath: 'basics.city', generated: false, confidence: 0.9 },
        { fieldId: 'agree', profilePath: null, generated: false, confidence: 0.2 },
        { fieldId: 'salary', profilePath: null, generated: false, confidence: 0.9 },
        { fieldId: 'why', profilePath: null, generated: true, confidence: 0.75 },
      ],
    }));
    const plan = await genericAdapter.buildFillPlan({ schema, profile, jd, llm });
    const byId = new Map(plan.pages[0]!.fields.map((f) => [f.fieldId, f]));
    expect(byId.get('name')?.value).toMatchObject({ source: 'profile', text: '小林' });
    expect(byId.get('intro')?.status).toBe('needs_review');
    expect(byId.get('intro')?.value.source).toBe('generated');
    expect(byId.get('salary')?.value.source).toBe('user');
    expect(byId.get('agree')?.value.source).toBe('missing');
    expect(byId.get('why')?.value.source).toBe('generated');
    expect(plan.adapterId).toBe('generic');
  });
  it('detects generic fallback on unknown portal', async () => {
    const ctx = load('react-form.html');
    const r = await genericAdapter.detect(ctx, registry);
    expect(r?.adapterId).toBe('generic');
  });
});
