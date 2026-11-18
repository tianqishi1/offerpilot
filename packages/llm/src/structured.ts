import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { LlmClient, LlmTier, StructuredCallOptions } from '@offerpilot/core';
import type { LlmProvider } from './types.js';
import type { Cache } from './cache.js';
import type { Budget } from './budget.js';

export interface GatewayConfig {
  providers: Partial<Record<LlmTier, LlmProvider>>;
  fallback?: Partial<Record<LlmTier, LlmProvider>>;
  cache?: Cache;
  budget?: Budget;
  defaultMaxRetries?: number;
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced?.[1] ?? text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('no_json_object');
  return body.slice(start, end + 1);
}

/**
 * 结构化调用链：JSON Schema 约束 → JSON 提取 → Zod 校验 → 带错误反馈重试 → 降级供应商。
 * 缓存键 = tier+model+prompt+schema；预算按 userId 月度限额。
 */
export function createLlmGateway(cfg: GatewayConfig): LlmClient {
  const maxRetriesDefault = cfg.defaultMaxRetries ?? 2;
  return {
    async callStructured<T>(schema: z.ZodType<T>, opts: StructuredCallOptions & { userId?: string }): Promise<T> {
      const provider = cfg.providers[opts.tier];
      if (!provider) throw new Error(`no_provider_for_tier_${opts.tier}`);
      const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
      const schemaHash = createHash('sha256').update(JSON.stringify(jsonSchema)).digest('hex').slice(0, 12);
      const cacheKey = createHash('sha256')
        .update(`${opts.tier}|${opts.model ?? ''}|${opts.system ?? ''}|${opts.prompt}|${schemaHash}`)
        .digest('hex');
      if (cfg.cache) {
        const hit = cfg.cache.get(cacheKey);
        if (hit !== undefined) return schema.parse(JSON.parse(hit));
      }
      const userId = opts.userId;
      if (cfg.budget && userId && cfg.budget.remaining(userId) <= 0) {
        throw new Error('budget_exceeded');
      }
      const maxRetries = opts.maxRetries ?? maxRetriesDefault;
      let prompt = opts.prompt;
      let lastError = 'unknown';
      const attempt = async (p: LlmProvider): Promise<T> => {
        for (let i = 0; i <= maxRetries; i++) {
          try {
            const res = await p.complete({ prompt, system: opts.system, tier: opts.tier, model: opts.model, jsonSchema });
            if (cfg.budget && userId && res.usage) {
              cfg.budget.consume(userId, res.usage.promptTokens + res.usage.completionTokens);
            }
            const parsed = schema.safeParse(JSON.parse(extractJson(res.text)));
            if (parsed.success) {
              cfg.cache?.set(cacheKey, JSON.stringify(parsed.data));
              return parsed.data;
            }
            lastError = parsed.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; ');
          } catch (e) {
            lastError = (e as Error).message;
          }
          prompt = `${opts.prompt}\n\n[上次输出不合格，错误：${lastError}。请严格按 JSON Schema 重新输出，只输出 JSON。]`;
        }
        throw new Error(`structured_failed:${lastError}`);
      };
      try {
        return await attempt(provider);
      } catch (e) {
        const fb = cfg.fallback?.[opts.tier];
        if (fb && fb !== provider) return await attempt(fb);
        throw e;
      }
    },
  };
}
