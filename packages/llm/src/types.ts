import type { LlmTier } from '@offerpilot/core';

export interface CompleteOptions {
  prompt: string;
  system?: string;
  tier: LlmTier;
  model?: string;
  jsonSchema?: Record<string, unknown>;
  temperature?: number;
}

export interface CompleteResult {
  text: string;
  usage?: { promptTokens: number; completionTokens: number };
}

export interface LlmProvider {
  name: string;
  complete(opts: CompleteOptions): Promise<CompleteResult>;
}
