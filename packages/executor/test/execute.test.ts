import { describe, expect, it } from 'vitest';
import { executeField, executePlan } from '../src/execute.js';
import { verifySubmit } from '../src/verify.js';
import { loadFixture, makeField, makePlan, setupMultipage, setupUpload, trackControlled } from './helpers.js';

const fast = { fieldDelayMs: [0, 1] as [number, number] };

describe('executeField', () => {
  it('fills profile text into controlled input', async () => {
    const ctx = loadFixture('react-form.html');
    trackControlled(document.getElementById('name') as HTMLInputElement, '');
    const r = await executeField(ctx, makeField() as never, fast);
    expect(r.status).toBe('filled');
    expect((document.getElementById('name') as HTMLInputElement).value).toBe('小林');
  });
  it('marks generated content needs_review', async () => {
    const ctx = loadFixture('react-form.html');
    const f = makeField({ fieldId: 'intro', kind: 'textarea', label: '自我介绍', selectors: [{ type: 'label', value: '自我介绍' }], value: { source: 'generated', generatedId: 'g1', text: '你好' } });
    const r = await executeField(ctx, f as never, fast);
    expect(r.status).toBe('needs_review');
  });
  it('missing and unconfirmed user fields are not written', async () => {
    const ctx = loadFixture('react-form.html');
    const missing = makeField({ fieldId: 'm', value: { source: 'missing' } });
    const user = makeField({ fieldId: 'u', value: { source: 'user', text: '10k' } });
    expect((await executeField(ctx, missing as never, fast)).status).toBe('missing');
    expect((await executeField(ctx, user as never, fast)).status).toBe('needs_review');
  });
  it('is idempotent on second run', async () => {
    const ctx = loadFixture('react-form.html');
    const f = makeField() as never;
    await executeField(ctx, f, fast);
    const r2 = await executeField(ctx, f, fast);
    expect(r2.status).toBe('filled');
    expect((document.getElementById('name') as HTMLInputElement).value).toBe('小林');
  });
  it('fails cleanly when element missing', async () => {
    const ctx = loadFixture('react-form.html');
    const f = makeField({ selectors: [{ type: 'css', value: '#ghost' }] });
    const r = await executeField(ctx, f as never, fast);
    expect(r.status).toBe('failed');
    expect(r.error).toBe('element_not_found');
  });
  it('uploads file via resolver', async () => {
    const ctx = loadFixture('upload.html');
    setupUpload();
    const f = makeField({ fieldId: 'resume', kind: 'file', label: '附件简历', selectors: [{ type: 'label', value: '附件简历' }], value: { source: 'profile', fileRef: 'local:resume-v1' }, validation: [{ type: 'fileAccepted' }] });
    const r = await executeField(ctx, f as never, { ...fast, fileResolver: async () => ({ blob: new Blob(['pdf']), name: 'resume-v1.pdf' }) });
    expect(r.status).toBe('filled');
    expect((window as unknown as { __uploaded?: string }).__uploaded).toBe('resume-v1.pdf');
  });
});

describe('executePlan multi-page', () => {
  it('advances pages and fills both', async () => {
    const ctx = loadFixture('multipage.html');
    setupMultipage();
    const plan = makePlan([makeField({ selectors: [{ type: 'label', value: '姓名' }] })], {
      pages: [
        { pageIndex: 0, fields: [makeField({ selectors: [{ type: 'label', value: '姓名' }] })], next: { selectors: [{ type: 'css', value: '#next' }], waitUntil: 'domStable' } },
        { pageIndex: 1, fields: [makeField({ fieldId: 'school', label: '学校', selectors: [{ type: 'label', value: '学校' }], value: { source: 'profile', profilePath: 'basics.school', text: '某大学' } })] },
      ],
    });
    const report = await executePlan(ctx, plan as never, fast);
    expect(report.results.map((r) => r.status)).toEqual(['filled', 'filled']);
    expect((document.getElementById('p2-school') as HTMLInputElement).value).toBe('某大学');
    expect(document.getElementById('page2')!.hidden).toBe(false);
  });
});

describe('verifySubmit', () => {
  it('verified with multiple evidence after real submit', async () => {
    const ctx = loadFixture('multipage.html');
    setupMultipage();
    (document.getElementById('submit') as HTMLElement).click();
    const r = await verifySubmit(ctx, { successUrlPatterns: ['/success'], successTexts: ['提交成功'], formGoneCheck: true, emailCheck: false });
    expect(r.result).toBe('verified');
    expect(r.evidence.length).toBeGreaterThanOrEqual(2);
  });
  it('unverified with single evidence (draft illusion guard)', async () => {
    const ctx = loadFixture('react-form.html');
    const r = await verifySubmit(ctx, { successTexts: ['提交成功'], formGoneCheck: true, emailCheck: false });
    expect(r.result).toBe('failed');
  });
});
