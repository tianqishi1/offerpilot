import { describe, expect, it } from 'vitest';
import { pickCombobox } from '../src/combobox.js';
import { loadFixture, setupCombobox } from './helpers.js';

describe('pickCombobox', () => {
  it('searches, waits for options, clicks and confirms selection', async () => {
    const ctx = loadFixture('combobox.html');
    setupCombobox();
    const input = document.getElementById('city-input') as HTMLInputElement;
    await pickCombobox(ctx, input, '北京');
    expect(input.value).toBe('北京');
    expect(input.getAttribute('aria-activedescendant')).toBe('opt-bj');
  });
  it('throws option_not_found for missing option', async () => {
    const ctx = loadFixture('combobox.html');
    setupCombobox();
    const input = document.getElementById('city-input') as HTMLInputElement;
    await expect(pickCombobox(ctx, input, '广州', 300)).rejects.toThrow('option_not_found');
  });
});
