import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPageContext } from '../src/index.js';
import type { PageContext } from '@offerpilot/core';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

export function loadFixture(name: string, url = 'https://example.com/apply'): PageContext {
  const html = readFileSync(join(fixturesDir, name), 'utf8');
  document.body.innerHTML = html;
  (globalThis as unknown as { happyDOM?: { setURL(u: string): void } }).happyDOM?.setURL(url);
  return createPageContext(window);
}

/**
 * 模拟 React 受控组件的 value tracker 语义：
 * - 实例级 value 描述符：普通赋值会同步 tracker（React track() 行为）；
 * - input 事件时若 tracker === 当前值，判定"无变化"，回滚 DOM 到 state（restoreControlledState）。
 * 这正是 naive el.value=x 失效、必须 native setter + tracker 复位的原因。
 */
export function trackControlled(input: HTMLInputElement | HTMLTextAreaElement, initial = ''): void {
  let state = initial;
  let trackerValue = initial;
  const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'value')!;
  (input as unknown as { _valueTracker: { getValue(): string; setValue(v: string): void } })._valueTracker = {
    getValue: () => trackerValue,
    setValue: (v: string) => { trackerValue = String(v); },
  };
  Object.defineProperty(input, 'value', {
    configurable: true,
    get() { return desc.get!.call(this); },
    set(v: string) { trackerValue = String(v); desc.set!.call(this, v); },
  });
  input.addEventListener('input', () => {
    const current = desc.get!.call(input);
    if (trackerValue === current) {
      desc.set!.call(input, state);
      trackerValue = state;
      return;
    }
    state = current;
    trackerValue = current;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

export function setupCombobox(): void {
  const input = document.getElementById('city-input') as HTMLInputElement;
  const list = document.getElementById('city-list')!;
  const options = Array.from(list.querySelectorAll('li'));
  input.addEventListener('input', () => {
    const q = input.value.trim();
    let any = false;
    for (const li of options) {
      const show = q === '' || (li.textContent ?? '').includes(q);
      li.hidden = !show;
      any = any || show;
    }
    list.hidden = !any;
  });
  for (const li of options) {
    li.addEventListener('click', () => {
      input.value = (li.textContent ?? '').trim();
      input.setAttribute('aria-activedescendant', li.id);
      list.hidden = true;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
}

export function setupUpload(): void {
  const input = document.getElementById('resume') as HTMLInputElement;
  const dz = document.getElementById('dropzone')!;
  const w = window as unknown as { __uploaded?: string; __dropped?: boolean };
  input.addEventListener('change', () => { w.__uploaded = input.files?.[0]?.name; });
  dz.addEventListener('drop', () => { w.__dropped = true; });
}

export function setupMultipage(): void {
  const p1 = document.getElementById('page1')!;
  const p2 = document.getElementById('page2')!;
  document.getElementById('next')!.addEventListener('click', () => {
    p1.hidden = true;
    p2.hidden = false;
  });
  document.getElementById('submit')!.addEventListener('click', () => {
    document.body.innerHTML = '<div id="done">提交成功，申请已收到</div>';
    (globalThis as unknown as { happyDOM?: { setURL(u: string): void } }).happyDOM?.setURL('https://example.com/apply/success');
  });
}

export function makeField(overrides: Record<string, unknown> = {}) {
  return {
    fieldId: 'f1',
    kind: 'text' as const,
    label: '姓名',
    required: true,
    selectors: [{ type: 'label' as const, value: '姓名' }],
    value: { source: 'profile' as const, profilePath: 'basics.name', text: '小林' },
    confidence: 0.95,
    status: 'pending' as const,
    ...overrides,
  };
}

export function makePlan(fields: ReturnType<typeof makeField>[], overrides: Record<string, unknown> = {}) {
  return {
    id: 'plan-test',
    adapterId: 'generic',
    adapterVersion: '0.1.0',
    pageFingerprint: 'fp-test',
    pages: [{ pageIndex: 0, fields }],
    submit: { selectors: [{ type: 'css' as const, value: '#submit' }], verify: { successTexts: ['提交成功'], formGoneCheck: true, emailCheck: false } },
    meta: { modelTier: 'small', promptVersion: 'v1', schemaHash: 'h', createdAt: new Date().toISOString() },
    ...overrides,
  };
}
