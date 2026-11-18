import { describe, expect, it } from 'vitest';
import { setNativeValue } from '../src/native.js';
import { loadFixture, trackControlled } from './helpers.js';

describe('setNativeValue vs React controlled input', () => {
  it('naive assignment is reverted by controlled state', () => {
    loadFixture('react-form.html');
    const input = document.getElementById('name') as HTMLInputElement;
    trackControlled(input, '');
    input.value = '黑客值';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(input.value).toBe('');
  });
  it('native setter + tracker reset survives and fires change', () => {
    loadFixture('react-form.html');
    const input = document.getElementById('name') as HTMLInputElement;
    trackControlled(input, '');
    let changed = 0;
    input.addEventListener('change', () => changed++);
    setNativeValue(input, '小林');
    expect(input.value).toBe('小林');
    expect(changed).toBeGreaterThanOrEqual(1);
  });
  it('works on textarea and select', () => {
    loadFixture('react-form.html');
    const ta = document.getElementById('intro') as HTMLTextAreaElement;
    trackControlled(ta, '');
    setNativeValue(ta, '三年后端经验');
    expect(ta.value).toBe('三年后端经验');
    const sel = document.getElementById('city') as HTMLSelectElement;
    setNativeValue(sel, '北京');
    expect(sel.value).toBe('北京');
  });
});

