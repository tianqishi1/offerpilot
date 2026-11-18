import type { LlmTier } from '@offerpilot/core';
import type { CompleteOptions, CompleteResult, LlmProvider } from '../types.js';

export interface OpenAiCompatibleConfig {
  baseUrl: string;              // 如 https://dashscope.aliyuncs.com/compatible-mode/v1（国内端点）
  apiKey: string;
  models: Record<LlmTier, string>;
  timeoutMs?: number;
  /** 供应商支持 response_format=json_schema 时置 true */
  supportsJsonSchema?: boolean;
}

/** OpenAI 兼容 REST 供应商（DashScope/DeepSeek/GLM 等均可），零 SDK 依赖。 */
export class OpenAiCompatibleProvider implements LlmProvider {
  name = 'openai-compatible';
  constructor(private cfg: OpenAiCompatibleConfig) {}
  async complete(opts: CompleteOptions): Promise<CompleteResult> {
    const model = opts.model ?? this.cfg.models[opts.tier];
    const messages = [
      ...(opts.system ? [{ role: 'system', content: opts.system }] : []),
      { role: 'user', content: opts.prompt },
    ];
    const responseFormat = this.cfg.supportsJsonSchema && opts.jsonSchema
      ? { type: 'json_schema', json_schema: { name: 'output', schema: opts.jsonSchema, strict: true } }
      : { type: 'json_object' };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.cfg.timeoutMs ?? 60_000);
    try {
      const res = await fetch(`${this.cfg.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.cfg.apiKey}` },
        body: JSON.stringify({ model, messages, temperature: opts.temperature ?? 0.2, response_format: responseFormat }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`llm_http_${res.status}`);
      const data = (await res.json()) as {
        choices: { message: { content: string } }[];
        usage?: { prompt_tokens: number; completion_tokens: number };
      };
      const text = data.choices?.[0]?.message?.content ?? '';
      return {
        text,
        usage: data.usage ? { promptTokens: data.usage.prompt_tokens, completionTokens: data.usage.completion_tokens } : undefined,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
