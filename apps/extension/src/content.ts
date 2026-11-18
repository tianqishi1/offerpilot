import { detectAdapter, type Registry, type VerifyResult } from '@offerpilot/core';
import { extractFields } from '@offerpilot/adapters';
import { createPageContext, executePlan, resolveField, verifySubmit, waitUntilDomStable } from '@offerpilot/executor';

const w = window as unknown as { __offerpilotInjected?: boolean };
if (w.__offerpilotInjected) { throw new Error('offerpilot already injected'); }
w.__offerpilotInjected = true;

const ctx = createPageContext(window);
const MAX_PAGES = 6;
const SUCCESS_RE = /提交成功|申请已收到|感谢投递|投递成功|申请成功|successfully submitted/i;

const flow: { lastVerify: VerifyResult | null; ready: boolean; pageIndex: number; watching: boolean } = {
  lastVerify: null, ready: false, pageIndex: 0, watching: false,
};

function broadcast(msg: Record<string, unknown>): void {
  chrome.runtime.sendMessage(msg).catch(() => {});
}

function visible(el: Element): boolean {
  if (el.closest('[hidden]')) return false;
  const style = (el as HTMLElement).style;
  if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
  return true;
}

function findNextButton(): Element | null {
  const candidates = Array.from(ctx.document().querySelectorAll('button,[role="button"],input[type="button"],a'));
  for (const el of candidates) {
    const text = (el.textContent ?? (el as HTMLInputElement).value ?? '').trim();
    if (!visible(el)) continue;
    if (/提交|submit|投递/i.test(text)) continue;
    if (/^(下一步|继续|下一页| next|continue)/i.test(text) || /下一步|继续填写|下一页/.test(text)) return el;
  }
  return null;
}

/** 被动提交监测：即使用户直接点了页面自带的提交按钮，侧栏也能显示校验结果。 */
function startSubmitWatcher(): void {
  if (flow.watching) return;
  flow.watching = true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const check = () => {
    if (flow.lastVerify) return;
    const bodyText = ctx.document().body?.textContent ?? '';
    const formGone = !ctx.querySelector('form');
    const successText = SUCCESS_RE.test(bodyText);
    if (formGone || successText) {
      void verifySubmit(ctx, { successTexts: ['提交成功', '申请已收到', '感谢投递', '投递成功'], formGoneCheck: true, emailCheck: false })
        .then((r) => {
          if (r.result !== 'failed') {
            flow.lastVerify = r;
            flow.ready = false;
            broadcast({ type: 'VERIFY_RESULT', result: r, passive: true });
          }
        });
    }
  };
  const obs = new MutationObserver(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(check, 800);
  });
  obs.observe(ctx.document().body ?? ctx.document().documentElement, { childList: true, subtree: true, characterData: true });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg.type === 'INIT') {
      const registry = msg.registry as Registry;
      const det = detectAdapter(registry, ctx);
      broadcast({ type: 'DETECT_RESULT', adapterId: det?.adapterId ?? 'unknown', fingerprintId: det?.fingerprintId ?? '', confidence: det?.confidence ?? 0 });
      broadcast({ type: 'EXTRACT_RESULT', fields: extractFields(ctx), pageIndex: 0 });
      startSubmitWatcher();
      sendResponse({ ok: true });
    } else if (msg.type === 'GET_STATE') {
      sendResponse({ ok: true, injected: true, lastVerify: flow.lastVerify, ready: flow.ready, pageIndex: flow.pageIndex });
    } else if (msg.type === 'EXECUTE_PLAN') {
      const rf = msg.resumeFile as { name: string; type: string; dataB64: string } | undefined;
      const fileResolver = rf
        ? async () => {
            const bytes = Uint8Array.from(atob(rf.dataB64), (c) => c.charCodeAt(0));
            return { blob: new Blob([bytes], { type: rf.type || 'application/pdf' }), name: rf.name };
          }
        : undefined;
      const report = await executePlan(ctx, msg.plan, {
        fieldDelayMs: [50, 200],
        fileResolver,
        onProgress: (r) => broadcast({ type: 'PROGRESS', result: r }),
      });
      broadcast({ type: 'PLAN_DONE', report });
      const pageIndex = (msg.pageIndex as number) ?? 0;
      flow.pageIndex = pageIndex;
      const next = pageIndex < MAX_PAGES - 1 ? findNextButton() : null;
      if (next) {
        (next as HTMLElement).click();
        await waitUntilDomStable(ctx, 400, 6000);
        broadcast({ type: 'EXTRACT_RESULT', fields: extractFields(ctx), pageIndex: pageIndex + 1 });
      } else {
        flow.ready = true;
        broadcast({ type: 'READY_TO_SUBMIT' });
      }
      sendResponse({ ok: true });
    } else if (msg.type === 'CONFIRM_SUBMIT') {
      const located = resolveField(ctx, msg.plan.submit.selectors);
      if (!located) {
        const r: VerifyResult = { result: 'failed', evidence: ['submit_not_found'], checkedAt: ctx.now() };
        flow.lastVerify = r;
        broadcast({ type: 'VERIFY_RESULT', result: r });
      } else {
        (located.el as HTMLElement).click();
        await ctx.wait(600);
        const result = await verifySubmit(ctx, msg.plan.submit.verify);
        flow.lastVerify = result;
        flow.ready = false;
        broadcast({ type: 'VERIFY_RESULT', result });
      }
      sendResponse({ ok: true });
    }
  })().catch((e) => sendResponse({ ok: false, error: (e as Error).message }));
  return true;
});
