import type { PageContext } from '@offerpilot/core';

export * from './locate.js';
export * from './native.js';
export * from './file.js';
export * from './combobox.js';
export * from './validate.js';
export * from './execute.js';
export * from './verify.js';

/** 真实页面（content script）用的 PageContext 工厂。 */
export function createPageContext(win: Window = globalThis.window): PageContext {
  return {
    url: () => win.location.href,
    document: () => win.document,
    querySelector: (s) => win.document.querySelector(s),
    querySelectorAll: (s) => Array.from(win.document.querySelectorAll(s)),
    evaluateXPath: (expr) => {
      const r = win.document.evaluate(expr, win.document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      return (r.singleNodeValue as Element | null) ?? null;
    },
    wait: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: () => new Date().toISOString(),
  };
}
