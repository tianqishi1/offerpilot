import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createLlmGateway, MemoryBudget, MemoryCache, MockProvider } from '../src/index.js';

const Schema = z.object({
  mappings: z.array(z.object({ fieldId: z.string(), profilePath: z.string().nullable() })),
});
const good = { mappings: [{ fieldId: 'name', profilePath: 'basics.name' }] };

describe('structured call chain', () => {
  it('parses valid JSON on first attempt', async () => {
    const p = new MockProvider(() => good);
    const gw = createLlmGateway({ providers: { small: p } });
    const out = await gw.callStructured(Schema, { prompt: 'map', tier: 'small' });
    expect(out.mappings[0]?.fieldId).toBe('name');
    expect(p.calls.length).toBe(1);
  });
  it('retries with error feedback on invalid JSON', async () => {
    const p = new MockProvider((_o, i) => (i === 0 ? '抱歉，这不是JSON' : good));
    const gw = createLlmGateway({ providers: { small: p } });
    const out = await gw.callStructured(Schema, { prompt: 'map', tier: 'small' });
    expect(out).toEqual(good);
    expect(p.calls.length).toBe(2);
    expect(p.calls[1]?.prompt).toContain('上次输出不合格');
  });
  it('retries on zod validation failure', async () => {
    const p = new MockProvider((_o, i) => (i === 0 ? { mappings: [{ fieldId: 123 }] } : good));
    const gw = createLlmGateway({ providers: { small: p } });
    expect(await gw.callStructured(Schema, { prompt: 'map', tier: 'small' })).toEqual(good);
    expect(p.calls.length).toBe(2);
  });
  it('falls back to secondary provider when primary exhausted', async () => {
    const bad = new MockProvider(() => 'garbage');
    const fb = new MockProvider(() => good);
    const gw = createLlmGateway({ providers: { small: bad }, fallback: { small: fb }, defaultMaxRetries: 1 });
    expect(await gw.callStructured(Schema, { prompt: 'map', tier: 'small' })).toEqual(good);
    expect(bad.calls.length).toBe(2);
    expect(fb.calls.length).toBe(1);
  });
  it('throws structured_failed without fallback', async () => {
    const bad = new MockProvider(() => 'garbage');
    const gw = createLlmGateway({ providers: { small: bad }, defaultMaxRetries: 0 });
    await expect(gw.callStructured(Schema, { prompt: 'map', tier: 'small' })).rejects.toThrow(/structured_failed/);
  });
  it('caches identical calls', async () => {
    const p = new MockProvider(() => good);
    const gw = createLlmGateway({ providers: { small: p }, cache: new MemoryCache() });
    await gw.callStructured(Schema, { prompt: 'map', tier: 'small' });
    await gw.callStructured(Schema, { prompt: 'map', tier: 'small' });
    expect(p.calls.length).toBe(1);
  });
  it('enforces per-user monthly budget', async () => {
    const p = new MockProvider(() => good);
    const budget = new MemoryBudget(10);
    const gw = createLlmGateway({ providers: { small: p }, budget });
    await gw.callStructured(Schema, { prompt: 'map', tier: 'small', userId: 'u1' } as never);
    await expect(gw.callStructured(Schema, { prompt: 'map2', tier: 'small', userId: 'u1' } as never)).rejects.toThrow('budget_exceeded');
  });
  it('strips code fences around JSON', async () => {
    const p = new MockProvider(() => '```json\n' + JSON.stringify(good) + '\n```');
    const gw = createLlmGateway({ providers: { small: p } });
    expect(await gw.callStructured(Schema, { prompt: 'map', tier: 'small' })).toEqual(good);
  });
});
