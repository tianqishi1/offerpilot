import { describe, expect, it } from 'vitest';
import { detectAdapter, matchFingerprint, Registry } from '../src/registry.js';
import type { PageContext } from '../src/adapter.js';

const registry = Registry.parse({
  version: 'test-1',
  adapters: [
    {
      id: 'beisen',
      fingerprints: [{ id: 'beisen-zhiye', domains: ['*.zhiye.com'], pathRegex: '^/campus', weight: 1 }],
    },
    {
      id: 'moka',
      fingerprints: [
        { id: 'moka-std', domains: ['app.mokahr.com', 'app-tc.mokahr.com'], pathRegex: '^/(campus-recruitment|su)/', weight: 1 },
        { id: 'moka-channel', paramExists: ['channelToken'], pathRegex: '/campus', weight: 0.8 },
      ],
    },
    { id: 'generic', fingerprints: [] },
  ],
  fallback: 'generic',
});

function ctx(url: string, doc?: Document): PageContext {
  return {
    url: () => url,
    document: () => doc ?? ({ querySelector: () => null } as unknown as Document),
    querySelector: () => null,
    querySelectorAll: () => [],
    evaluateXPath: () => null,
    wait: async () => {},
    now: () => new Date().toISOString(),
  };
}

describe('fingerprint matching', () => {
  it('matches wildcard tenant domains', () => {
    const rule = registry.adapters[0]!.fingerprints[0]!;
    expect(matchFingerprint(rule, { hostname: 'sanycampus.zhiye.com', pathname: '/campus/jobs', params: new URLSearchParams() })).toBe(true);
    expect(matchFingerprint(rule, { hostname: 'zhiye.com', pathname: '/campus', params: new URLSearchParams() })).toBe(false);
    expect(matchFingerprint(rule, { hostname: 'evil-zhiye.com', pathname: '/campus', params: new URLSearchParams() })).toBe(false);
  });
  it('matches moka standard path and short link', () => {
    const rule = registry.adapters[1]!.fingerprints[0]!;
    const ok = (u: string) => {
      const url = new URL(u);
      return matchFingerprint(rule, { hostname: url.hostname, pathname: url.pathname, params: url.searchParams });
    };
    expect(ok('https://app.mokahr.com/campus-recruitment/mgtv/44490')).toBe(true);
    expect(ok('https://app.mokahr.com/su/PHQF7')).toBe(true);
    expect(ok('https://app.mokahr.com/social-recruitment/x/1')).toBe(false);
  });
  it('requires dom markers when present', () => {
    const rule = { id: 'x', domMarkers: ['#app'], weight: 1 };
    const input = { hostname: 'a.com', pathname: '/', params: new URLSearchParams() };
    expect(matchFingerprint(rule, input)).toBe(false);
    const doc = { querySelector: (s: string) => (s === '#app' ? {} : null) } as unknown as Document;
    expect(matchFingerprint(rule, { ...input, doc })).toBe(true);
  });
});

describe('detectAdapter', () => {
  it('picks the highest-weight match', () => {
    const r = detectAdapter(registry, ctx('https://app.mokahr.com/campus-recruitment/mgtv/44490?channelToken=abc'));
    expect(r?.adapterId).toBe('moka');
    expect(r?.fingerprintId).toBe('moka-std');
  });
  it('falls back to generic on unknown portals', () => {
    const r = detectAdapter(registry, ctx('https://talent.baidu.com/jobs/resume/create'));
    expect(r?.adapterId).toBe('generic');
    expect(r?.fingerprintId).toBe('fallback');
  });
  it('honors kill switch', () => {
    const killed = Registry.parse({ ...registry, killSwitch: { adapters: ['moka'], features: [] } });
    const r = detectAdapter(killed, ctx('https://app.mokahr.com/campus-recruitment/mgtv/44490'));
    expect(r?.adapterId).toBe('generic');
  });
});
