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

function defaultLlm(): LlmClient {
  const key = process.env.DASHSCOPE_API_KEY;
  if (key) {
    const provider = new OpenAiCompatibleProvider({
      baseUrl: process.env.LLM_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      apiKey: key,
      models: {
        small: process.env.LLM_SMALL ?? 'qwen-flash',
        large: process.env.LLM_LARGE ?? 'qwen-plus',
        embed: process.env.LLM_EMBED ?? 'text-embedding-v4',
      },
    });
    return createLlmGateway({ providers: { small: provider, large: provider }, cache: new MemoryCache() });
  }
  const mock = new MockProvider(heuristicMappingResponder);
  return createLlmGateway({ providers: { small: mock, large: mock }, cache: new MemoryCache() });
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

  app.get('/health', async () => ({ ok: true, version: '0.1.0', registryVersion: registry.version }));

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
