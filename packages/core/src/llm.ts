import type { z } from 'zod';

export type LlmTier = 'small' | 'large' | 'embed';

export interface StructuredCallOptions {
  prompt: string;
  system?: string;
  tier: LlmTier;
  /** 覆盖默认模型（测试/灰度用） */
  model?: string;
  maxRetries?: number;
}

/** LLM 网关最小接口（packages/llm 实现；core 不依赖具体供应商）。 */
export interface LlmClient {
  callStructured<T>(schema: z.ZodType<T>, opts: StructuredCallOptions): Promise<T>;
}
