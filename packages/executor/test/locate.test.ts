import { describe, expect, it } from 'vitest';
import { resolveField, resolveOne } from '../src/locate.js';
import { loadFixture } from './helpers.js';

describe('selector strategies', () => {
  it('resolves by label[for]', () => {
    const ctx = loadFixture('react-form.html');
    const el = resolveOne(ctx, { type: 'label', value: '姓名' });
    expect(el?.id).toBe('name');
  });
  it('resolves by aria-labelledby', () => {
    const ctx = loadFixture('combobox.html');
    const el = resolveOne(ctx, { type: 'aria', role: 'combobox', name: '期望城市' });
    expect(el?.id).toBe('city-input');
  });
  it('resolves by name and placeholder', () => {
    const ctx = loadFixture('react-form.html');
    expect(resolveOne(ctx, { type: 'nameAttr', value: 'city' })?.id).toBe('city');
  });
  it('falls through the chain and flags drift', () => {
    const ctx = loadFixture('react-form.html');
    const located = resolveField(ctx, [
      { type: 'css', value: '#does-not-exist' },
      { type: 'label', value: '姓名' },
    ]);
    expect(located?.el.id).toBe('name');
    expect(located?.driftUsed).toBe(true);
    expect(located?.usedIndex).toBe(1);
  });
  it('returns null when nothing matches', () => {
    const ctx = loadFixture('react-form.html');
    expect(resolveField(ctx, [{ type: 'css', value: '#nope' }])).toBeNull();
  });
});
