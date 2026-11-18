import { z } from 'zod';
import { VerifySpec } from './fillplan.js';
import type { DetectResult, PageContext } from './adapter.js';

export const FingerprintRule = z.object({
  id: z.string(),
  domains: z.array(z.string()).optional(),
  domainRegex: z.string().optional(),
  pathRegex: z.string().optional(),
  paramExists: z.array(z.string()).optional(),
  domMarkers: z.array(z.string()).optional(),
  weight: z.number().min(0).max(1).default(1),
});
export type FingerprintRule = z.infer<typeof FingerprintRule>;

export const AdapterRegistryEntry = z.object({
  id: z.string(),
  minExecutorVersion: z.string().default('0.0.0'),
  fingerprints: z.array(FingerprintRule),
  fieldSchemaOverrides: z.record(z.string(), z.unknown()).default({}),
  verifyPresets: VerifySpec.optional(),
  promptVersions: z.record(z.string(), z.string()).default({}),
  enabled: z.boolean().default(true),
});
export type AdapterRegistryEntry = z.infer<typeof AdapterRegistryEntry>;

export const Registry = z.object({
  version: z.string(),
  adapters: z.array(AdapterRegistryEntry),
  fallback: z.string().default('generic'),
  killSwitch: z.object({
    adapters: z.array(z.string()).default([]),
    features: z.array(z.string()).default([]),
  }).default({ adapters: [], features: [] }),
});
export type Registry = z.infer<typeof Registry>;

export const SignedRegistry = z.object({
  keyId: z.string(),
  payload: Registry,
  signature: z.string(),
});
export type SignedRegistry = z.infer<typeof SignedRegistry>;

export interface FingerprintInput {
  hostname: string;
  pathname: string;
  params: URLSearchParams;
  doc?: Document;
}

function domainMatches(pattern: string, hostname: string): boolean {
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(1); // ".zhiye.com"
    return hostname.endsWith(suffix) && hostname.length > suffix.length;
  }
  return hostname === pattern;
}

export function matchFingerprint(rule: FingerprintRule, input: FingerprintInput): boolean {
  if (rule.domains && rule.domains.length > 0) {
    if (!rule.domains.some((d) => domainMatches(d, input.hostname))) return false;
  }
  if (rule.domainRegex && !new RegExp(rule.domainRegex).test(input.hostname)) return false;
  if (rule.pathRegex && !new RegExp(rule.pathRegex).test(input.pathname)) return false;
  if (rule.paramExists && rule.paramExists.length > 0) {
    if (!rule.paramExists.every((p) => input.params.has(p))) return false;
  }
  if (rule.domMarkers && rule.domMarkers.length > 0) {
    if (!input.doc) return false;
    if (!rule.domMarkers.every((sel) => input.doc!.querySelector(sel) !== null)) return false;
  }
  const hasAnyPositive = Boolean(rule.domains?.length || rule.domainRegex || rule.pathRegex || rule.paramExists?.length || rule.domMarkers?.length);
  return hasAnyPositive;
}

/** 按注册中心指纹判定当前页面适配器；被 kill/禁用的一律跳过；无命中回退 fallback。 */
export function detectAdapter(registry: Registry, ctx: PageContext): DetectResult | null {
  const url = new URL(ctx.url());
  const input: FingerprintInput = {
    hostname: url.hostname,
    pathname: url.pathname,
    params: url.searchParams,
    doc: ctx.document(),
  };
  let best: { entry: AdapterRegistryEntry; rule: FingerprintRule; score: number } | null = null;
  for (const entry of registry.adapters) {
    if (!entry.enabled) continue;
    if (registry.killSwitch.adapters.includes(entry.id)) continue;
    for (const rule of entry.fingerprints) {
      if (!matchFingerprint(rule, input)) continue;
      const score = rule.weight;
      if (!best || score > best.score) best = { entry, rule, score };
    }
  }
  if (!best) {
    const fb = registry.adapters.find((a) => a.id === registry.fallback && a.enabled);
    if (!fb) return null;
    return { adapterId: fb.id, version: '0.0.0', fingerprintId: 'fallback', confidence: 0.3 };
  }
  return {
    adapterId: best.entry.id,
    version: best.entry.minExecutorVersion,
    fingerprintId: best.rule.id,
    confidence: best.score,
  };
}
