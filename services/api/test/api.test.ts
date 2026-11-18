import { describe, expect, it } from 'vitest';
import { SignedRegistry } from '@offerpilot/core';
import { buildServer } from '../src/server.js';
import { createSigner, verifySignature } from '../src/sign.js';

const signer = createSigner();
const makeApp = () => buildServer({ signer });

const schema = [
  { fieldId: 'name', kind: 'text', label: '姓名', required: true, selectors: [{ type: 'label', value: '姓名' }] },
  { fieldId: 'salary', kind: 'text', label: '期望薪资', required: false, selectors: [{ type: 'label', value: '期望薪资' }] },
  { fieldId: 'why', kind: 'textarea', label: '为什么选我们', required: false, selectors: [{ type: 'label', value: '为什么选我们' }] },
];
const profile = {
  version: 1,
  basics: { name: '小林', school: '某大学', major: '计算机', degree: 'master', gradYear: 2027, city: '北京' },
  items: [{ id: 'i1', type: 'internship', content: { company: 'X公司', phone: '13800000000' } }],
  preferences: { cities: ['北京'], roles: ['后端'], industries: [] },
};
const jd = { id: 'j1', source: 'plugin', url: 'https://example.com/apply', title: '后端开发工程师', company: 'Example', jdText: 'Go/Java 后端', dedupHash: 'h1', freshnessAt: new Date().toISOString() };

describe('api', () => {
  it('health', async () => {
    const res = await makeApp().inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });

  it('registry is signed and verifiable; tampering breaks signature', async () => {
    const res = await makeApp().inject({ method: 'GET', url: '/registry' });
    const signed = SignedRegistry.parse(res.json());
    expect(signed.payload.adapters.length).toBeGreaterThan(3);
    expect(verifySignature(signer.publicKeyPem, signed.payload, signed.signature)).toBe(true);
    const tampered = { ...signed.payload, version: 'evil' };
    expect(verifySignature(signer.publicKeyPem, tampered, signed.signature)).toBe(false);
  });

  it('fillplan maps profile fields, protects knockout, strips sensitive data', async () => {
    const res = await makeApp().inject({ method: 'POST', url: '/fillplan', payload: { schema, profile, jd } });
    expect(res.statusCode).toBe(200);
    const { plan, strippedSensitivePaths } = res.json() as { plan: any; strippedSensitivePaths: string[] };
    expect(strippedSensitivePaths).toContain('$.items[0].content.phone');
    const byId = new Map<string, any>(plan.pages[0].fields.map((f: any) => [f.fieldId, f]));
    expect(byId.get('name').value).toMatchObject({ source: 'profile', text: '小林' });
    expect(byId.get('salary').value.source).toBe('user');
    expect(byId.get('why').value.source).toBe('generated');
    expect(JSON.stringify(plan)).not.toContain('13800000000');
  });

  it('events whitelist enforced', async () => {
    const app = makeApp();
    const ok = await app.inject({ method: 'POST', url: '/events', payload: { name: 'fill_started', props: { adapterId: 'generic' }, ts: new Date().toISOString() } });
    expect(ok.statusCode).toBe(200);
    const bad = await app.inject({ method: 'POST', url: '/events', payload: { name: 'upload_resume', props: {}, ts: new Date().toISOString() } });
    expect(bad.statusCode).toBe(400);
  });
});


