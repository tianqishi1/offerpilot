import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import { z, ZodError } from 'zod';
import {
  FieldSchema, Job, Profile, Registry, TelemetryEvent,
  findSensitivePaths, stripSensitive, type LlmClient,
} from '@offerpilot/core';
import { genericAdapter } from '@offerpilot/adapters';
import { MemoryCache, MockProvider, OpenAiCompatibleProvider, createLlmGateway } from '@offerpilot/llm';
import { createSigner, type RegistrySigner } from './sign.js';
import { heuristicMappingResponder } from './devLlm.js';

const here = dirname(fileURLToPath(import.meta.url));
const defaultRegistryJson = JSON.parse(readFileSync(join(here, '..', 'data', 'registry.v0.json'), 'utf8'));

const FillPlanRequest = z.object({
  schema: z.array(FieldSchema),
  profile: Profile,
  jd: Job,
});

/**
 * LLM 配置（供应商中立）：
 *   LLM_API_KEY / DEEPSEEK_API_KEY / DASHSCOPE_API_KEY 任一即可
 *   LLM_BASE_URL  默认 https://api.deepseek.com（OpenAI 兼容）
 *   LLM_SMALL     默认 deepseek-flash（抽取/映射）
 *   LLM_LARGE     默认 deepseek-v4-pro（生成/复核；.env 可覆盖为 flash 省成本）
 * 无 Key 时进入离线 mock 模式，全链路仍可跑通。
 */
function defaultLlm(): LlmClient {
  const key = process.env.LLM_API_KEY ?? process.env.DEEPSEEK_API_KEY ?? process.env.DASHSCOPE_API_KEY;
  if (key) {
    const provider = new OpenAiCompatibleProvider({
      baseUrl: process.env.LLM_BASE_URL ?? 'https://api.deepseek.com',
      apiKey: key,
      models: {
        small: process.env.LLM_SMALL ?? 'deepseek-flash',
        large: process.env.LLM_LARGE ?? 'deepseek-v4-pro',
        embed: process.env.LLM_EMBED ?? 'deepseek-flash',
      },
      timeoutMs: Number(process.env.LLM_TIMEOUT_MS ?? 90_000),
    });
    return createLlmGateway({ providers: { small: provider, large: provider }, cache: new MemoryCache() });
  }
  const mock = new MockProvider(heuristicMappingResponder);
  return createLlmGateway({ providers: { small: mock, large: mock }, cache: new MemoryCache() });
}

export function llmMode(): string {
  const key = process.env.LLM_API_KEY ?? process.env.DEEPSEEK_API_KEY ?? process.env.DASHSCOPE_API_KEY;
  if (!key) return 'offline-mock';
  return `${process.env.LLM_BASE_URL ?? 'https://api.deepseek.com'} small=${process.env.LLM_SMALL ?? 'deepseek-flash'} large=${process.env.LLM_LARGE ?? 'deepseek-v4-pro'}`;
}

export interface ServerOptions {
  registryJson?: unknown;
  signer?: RegistrySigner;
  llm?: LlmClient;
}

export function buildServer(opts: ServerOptions = {}) {
  const app = Fastify({ logger: false });
  const registry = Registry.parse(opts.registryJson ?? defaultRegistryJson);
  const signer = opts.signer ?? createSigner(process.env.REGISTRY_PRIVATE_KEY_PEM);
  const llm = opts.llm ?? defaultLlm();
  const events: unknown[] = [];

  app.get('/health', async () => ({ ok: true, version: '0.1.0', registryVersion: registry.version, llmMode: llmMode() }));

  app.get('/registry', async () => ({
    keyId: signer.keyId,
    payload: registry,
    signature: signer.sign(registry),
  }));

  app.get('/registry/key', async () => ({ keyId: signer.keyId, publicKeyPem: signer.publicKeyPem }));

  app.post('/fillplan', async (req) => {
    const body = FillPlanRequest.parse(req.body);
    const sensitive = findSensitivePaths(body.profile);
    const profile = stripSensitive(body.profile);
    const plan = await genericAdapter.buildFillPlan({ schema: body.schema, profile, jd: body.jd, llm });
    return { plan, strippedSensitivePaths: sensitive };
  });

  app.post('/events', async (req) => {
    const ev = TelemetryEvent.parse(req.body);
    events.push(ev);
    return { ok: true };
  });

  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({ error: 'validation', issues: error.issues });
    }
    return reply.status(500).send({ error: (error as Error).message });
  });

  return app;
}
