import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAiCompatibleProvider } from '../src/index.js';

afterEach(() => vi.unstubAllGlobals());

describe('OpenAiCompatibleProvider', () => {
  it('sends correct request shape and parses response', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"a":1}' } }], usage: { prompt_tokens: 5, completion_tokens: 7 } }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const p = new OpenAiCompatibleProvider({
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      apiKey: 'sk-test',
      models: { small: 'qwen-flash', large: 'qwen-plus', embed: 'text-embedding-v4' },
    });
    const res = await p.complete({ prompt: 'hi', tier: 'small', jsonSchema: { type: 'object' } });
    expect(res.text).toBe('{"a":1}');
    expect(res.usage).toEqual({ promptTokens: 5, completionTokens: 7 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-test');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('qwen-flash');
    expect(body.response_format.type).toBe('json_object');
  });
  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429 })));
    const p = new OpenAiCompatibleProvider({ baseUrl: 'https://x/v1', apiKey: 'k', models: { small: 'm', large: 'm', embed: 'm' } });
    await expect(p.complete({ prompt: 'hi', tier: 'small' })).rejects.toThrow('llm_http_429');
  });
});
