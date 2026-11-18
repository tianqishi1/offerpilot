import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import mammoth from 'mammoth';
import { extractText } from 'unpdf';
import { z, ZodError } from 'zod';
import {
  FieldSchema, Job, Profile, Registry, TelemetryEvent,
  findSensitivePaths, stripSensitive, type LlmClient,
} from '@offerpilot/core';
import { genericAdapter } from '@offerpilot/adapters';
import { MemoryCache, MockProvider, OpenAiCompatibleProvider, createLlmGateway } from '@offerpilot/llm';
import { createSigner, type RegistrySigner } from './sign.js';
import { heuristicMappingResponder } from './devLlm.js';
import { ExtractedProfile, GeneratedAnswer, extractionPrompt, generationPrompt, toProfile } from './prompts.js';

const here = dirname(fileURLToPath(import.meta.url));
const defaultRegistryJson = JSON.parse(readFileSync(join(here, '..', 'data', 'registry.v0.json'), 'utf8'));

const FillPlanRequest = z.object({
  schema: z.array(FieldSchema),
  profile: Profile,
  jd: Job,
});

const GenerateRequest = z.object({
  profile: Profile,
  jd: Job,
  question: z.string().min(1).max(500),
});

/**
 * LLM 配置（供应商中立）：LLM_API_KEY / DEEPSEEK_API_KEY / DASHSCOPE_API_KEY 任一即可。
 * 默认 DeepSeek 官方端点；无 Key 时离线 mock。
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

  app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1 } });

  app.get('/health', async () => ({ ok: true, version: '0.2.0-beta', registryVersion: registry.version, llmMode: llmMode() }));

  app.get('/registry', async () => ({ keyId: signer.keyId, payload: registry, signature: signer.sign(registry) }));
  app.get('/registry/key', async () => ({ keyId: signer.keyId, publicKeyPem: signer.publicKeyPem }));

  /**
   * 简历解析（内测版：服务端解析 + 显式同意）。
   * 隐私契约：原文件只在内存中处理，请求结束即丢弃，绝不落盘；
   * LLM 只接收文本；返回画像前深度剔除敏感字段。
   */
  app.post('/profile/parse', async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.status(400).send({ error: 'file_required' });
    const consentField = data.fields.consent as { value?: string } | undefined;
    if (consentField?.value !== 'true') return reply.status(400).send({ error: 'consent_required' });
    const buf = await data.toBuffer();
    const name = data.filename.toLowerCase();
    let text = '';
    if (name.endsWith('.pdf')) {
      text = (await extractText(new Uint8Array(buf), { mergePages: true })).text;
    } else if (name.endsWith('.docx')) {
      text = (await mammoth.extractRawText({ buffer: buf })).value;
    } else {
      return reply.status(400).send({ error: 'unsupported_format', hint: 'pdf/docx' });
    }
    if (!text.trim()) return reply.status(400).send({ error: 'empty_text', hint: '扫描件暂不支持，请用文本版 PDF/Word' });
    const extracted = await llm.callStructured(ExtractedProfile, {
      tier: 'large',
      system: '你是简历解析器，只输出符合 schema 的 JSON，只提取文本中真实存在的信息，不得编造，不输出敏感信息。',
      prompt: extractionPrompt(text),
    });
    const profile = stripSensitive(toProfile(extracted));
    return { profile, textLength: text.length, strippedPaths: findSensitivePaths(extracted) };
  });

  app.post('/fillplan', async (req) => {
    const body = FillPlanRequest.parse(req.body);
    const sensitive = findSensitivePaths(body.profile);
    const profile = stripSensitive(body.profile);
    const plan = await genericAdapter.buildFillPlan({ schema: body.schema, profile, jd: body.jd, llm });
    return { plan, strippedSensitivePaths: sensitive };
  });

  /** 开放题/求职信生成：事实护栏提示词 + 溯源 id；用户可在侧栏编辑后才填入。 */
  app.post('/generate', async (req) => {
    const body = GenerateRequest.parse(req.body);
    const profile = stripSensitive(body.profile);
    return llm.callStructured(GeneratedAnswer, {
      tier: 'large',
      system: '你是求职文书助手，只基于候选人真实画像写作，严禁编造经历/数字/技能。只输出 JSON。',
      prompt: generationPrompt(body.question, profile, body.jd.title, body.jd.jdText),
    });
  });

  app.post('/events', async (req) => {
    const ev = TelemetryEvent.parse(req.body);
    events.push(ev);
    return { ok: true };
  });

  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof ZodError) return reply.status(400).send({ error: 'validation', issues: error.issues });
    return reply.status(500).send({ error: (error as Error).message });
  });

  return app;
}

