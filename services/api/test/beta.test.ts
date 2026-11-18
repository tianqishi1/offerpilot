import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { z } from 'zod';
import { buildServer } from '../src/server.js';
import { createLlmGateway, MockProvider } from '@offerpilot/llm';
import { ExtractedProfile, GeneratedAnswer } from '../src/prompts.js';
import { MappingResult } from '@offerpilot/adapters';

async function makeResumePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const lines = ['Xiao Lin', 'Huazhong University of Science and Technology', 'Computer Science, Master, 2027', 'Internship: X Company, Backend Developer Intern, Go microservices', 'Phone: 13800000000'];
  lines.forEach((l, i) => page.drawText(l, { x: 50, y: 780 - i * 20, size: 11, font }));
  return Buffer.from(await doc.save());
}

function multipartBody(pdf: Buffer, consent: string, filename = 'resume.pdf'): { body: Buffer; contentType: string } {
  const b = '----offerpilottest';
  const parts = [
    `--${b}\r\nContent-Disposition: form-data; name="consent"\r\n\r\n${consent}\r\n`,
    `--${b}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/pdf\r\n\r\n`,
  ];
  const tail = `\r\n--${b}--\r\n`;
  return {
    body: Buffer.concat([Buffer.from(parts.join(''), 'latin1'), Buffer.from(pdf.toString('latin1'), 'latin1'), Buffer.from(tail, 'latin1')]),
    contentType: `multipart/form-data; boundary=${b}`,
  };
}

const testLlm = createLlmGateway({
  providers: {
    small: new MockProvider(() => ({ mappings: [] })),
    large: new MockProvider((opts) => {
      if (opts.prompt.includes('简历文本')) {
        return {
          basics: { name: '小林', school: '华中科技大学', major: '计算机', degree: 'master', gradYear: 2027 },
          items: [{ type: 'internship', content: { company: 'X公司', role: '后端实习', phone: '13800000000' } }],
        };
      }
      if (opts.prompt.includes('网申开放题')) {
        return { answer: '基于X公司后端实习经历，我希望在贵司继续深耕分布式系统。', resumeItemIds: ['item-1'], jdKeywords: ['后端'] };
      }
      return { mappings: [] };
    }),
  },
});

describe('beta routes', () => {
  it('parse requires explicit consent', async () => {
    const app = buildServer({ llm: testLlm });
    const pdf = await makeResumePdf();
    const { body, contentType } = multipartBody(pdf, 'false');
    const res = await app.inject({ method: 'POST', url: '/profile/parse', payload: body, headers: { 'content-type': contentType } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('consent_required');
  });

  it('parses PDF into structured profile and strips sensitive fields', async () => {
    const app = buildServer({ llm: testLlm });
    const pdf = await makeResumePdf();
    const { body, contentType } = multipartBody(pdf, 'true');
    const res = await app.inject({ method: 'POST', url: '/profile/parse', payload: body, headers: { 'content-type': contentType } });
    expect(res.statusCode).toBe(200);
    const data = res.json();
    expect(data.profile.basics.name).toBe('小林');
    expect(data.profile.items[0].id).toBe('item-1');
    expect(data.profile.items[0].content.phone).toBeUndefined();
    expect(data.strippedPaths.length).toBeGreaterThan(0);
    expect(res.json().profile.version).toBe(1);
  });

  it('rejects unsupported format', async () => {
    const app = buildServer({ llm: testLlm });
    const { body, contentType } = multipartBody(Buffer.from('hello'), 'true', 'resume.txt');
    const res = await app.inject({ method: 'POST', url: '/profile/parse', payload: body, headers: { 'content-type': contentType } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('unsupported_format');
  });

  it('generate returns answer with traceability', async () => {
    const app = buildServer({ llm: testLlm });
    const res = await app.inject({
      method: 'POST', url: '/generate',
      payload: {
        profile: { version: 1, basics: { name: '小林' }, items: [{ id: 'item-1', type: 'internship', content: { company: 'X公司' } }], preferences: { cities: [], roles: [], industries: [] } },
        jd: { id: 'j', source: 'plugin', url: 'https://x.com', title: '后端', company: 'X', jdText: 'Go', dedupHash: 'h', freshnessAt: new Date().toISOString() },
        question: '为什么选择我们',
      },
    });
    expect(res.statusCode).toBe(200);
    const data = res.json();
    expect(data.answer.length).toBeGreaterThan(10);
    expect(data.resumeItemIds).toContain('item-1');
  });
});

