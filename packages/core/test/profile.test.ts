import { describe, expect, it } from 'vitest';
import { findSensitivePaths, stripSensitive } from '../src/profile.js';

describe('sensitive data guard', () => {
  const payload = {
    basics: { name: '小林', phone: '13800000000', school: '某大学' },
    items: [{ id: 'i1', content: { company: 'X', idNumber: '110101200001011234', nested: { address: '北京市…' } } }],
  };
  it('strips sensitive keys at any depth without mutating input', () => {
    const clean = stripSensitive(payload);
    expect(clean.basics.phone).toBeUndefined();
    expect(clean.items[0]!.content.idNumber).toBeUndefined();
    expect((clean.items[0]!.content.nested as Record<string, unknown>).address).toBeUndefined();
    expect(clean.basics.name).toBe('小林');
    expect(payload.basics.phone).toBe('13800000000');
  });
  it('finds sensitive paths for CI scan', () => {
    const hits = findSensitivePaths(payload);
    expect(hits).toContain('$.basics.phone');
    expect(hits).toContain('$.items[0].content.idNumber');
    expect(hits).toContain('$.items[0].content.nested.address');
    expect(findSensitivePaths(stripSensitive(payload))).toHaveLength(0);
  });
});

