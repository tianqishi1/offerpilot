import type { PageContext, SelectorStrategy } from '@offerpilot/core';

export interface Located {
  el: Element;
  driftUsed: boolean;
  usedIndex: number;
}

function escAttr(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function resolveOne(ctx: PageContext, s: SelectorStrategy): Element | null {
  const doc = ctx.document();
  switch (s.type) {
    case 'css':
      return ctx.querySelector(s.value);
    case 'xpath':
      return ctx.evaluateXPath(s.value);
    case 'nameAttr':
      return ctx.querySelector(`[name="${escAttr(s.value)}"]`);
    case 'placeholder':
      return ctx.querySelector(`[placeholder="${escAttr(s.value)}"]`);
    case 'aria': {
      const direct = ctx.querySelector(`[role="${escAttr(s.role)}"][aria-label="${escAttr(s.name)}"]`);
      if (direct) return direct;
      for (const n of ctx.querySelectorAll(`[role="${escAttr(s.role)}"]`)) {
        const ids = (n.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean);
        const text = ids.map((id) => doc.getElementById(id)?.textContent ?? '').join(' ').trim();
        if (text === s.name) return n;
      }
      return null;
    }
    case 'label': {
      for (const lab of Array.from(doc.querySelectorAll('label'))) {
        if ((lab.textContent ?? '').trim() !== s.value) continue;
        const forId = lab.getAttribute('for');
        if (forId) {
          const el = doc.getElementById(forId);
          if (el) return el;
        }
        const inner = lab.querySelector('input,select,textarea,[contenteditable="true"]');
        if (inner) return inner;
      }
      return ctx.querySelector(`[aria-label="${escAttr(s.value)}"]`);
    }
  }
}

/** 弹性定位链：按序尝试，命中非首选项记为 drift（上报注册中心告警）。 */
export function resolveField(ctx: PageContext, selectors: SelectorStrategy[]): Located | null {
  for (let i = 0; i < selectors.length; i++) {
    const el = resolveOne(ctx, selectors[i]!);
    if (el) return { el, driftUsed: i > 0, usedIndex: i };
  }
  return null;
}
