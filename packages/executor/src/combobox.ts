import type { PageContext } from '@offerpilot/core';
import { setNativeValue } from './native.js';

function isVisible(el: Element): boolean {
  if (el.hasAttribute('hidden')) return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;
  const style = (el as HTMLElement).style;
  if (style && style.display === 'none') return false;
  let p: Element | null = el;
  while (p) {
    if (p.hasAttribute('hidden')) return false;
    p = p.parentElement;
  }
  return true;
}

function listboxFor(ctx: PageContext, el: Element): Element | null {
  const doc = ctx.document();
  const owns = el.getAttribute('aria-owns') ?? el.getAttribute('aria-controls');
  if (owns) {
    const lb = doc.getElementById(owns);
    if (lb) return lb;
  }
  return doc.querySelector('[role="listbox"]');
}

async function waitForOption(ctx: PageContext, el: Element, text: string, timeoutMs: number): Promise<Element | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const lb = listboxFor(ctx, el);
    const opts = lb ? Array.from(lb.querySelectorAll('[role="option"],li')) : [];
    const hit = opts.find((o) => (o.textContent ?? '').trim() === text && isVisible(o));
    if (hit) return hit;
    await ctx.wait(40);
  }
  return null;
}

async function waitForSelected(ctx: PageContext, el: Element, text: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = (el as HTMLInputElement).value ?? '';
    if (value === text) return true;
    const active = el.getAttribute('aria-activedescendant');
    if (active) {
      const opt = ctx.document().getElementById(active);
      if (opt && (opt.textContent ?? '').trim() === text) return true;
    }
    await ctx.wait(40);
  }
  return false;
}

/** combobox / React Select：focus → 输入搜索 → 等选项出现 → 点击 → 校验选中态。 */
export async function pickCombobox(ctx: PageContext, el: Element, optionText: string, timeoutMs = 3000): Promise<void> {
  (el as HTMLElement).focus?.();
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    setNativeValue(el, optionText);
  } else {
    el.textContent = optionText;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  const opt = await waitForOption(ctx, el, optionText, timeoutMs);
  if (!opt) throw new Error('option_not_found');
  (opt as HTMLElement).click();
  const ok = await waitForSelected(ctx, el, optionText, 1000);
  if (!ok) throw new Error('selection_not_confirmed');
}
