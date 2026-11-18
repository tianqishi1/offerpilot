import { detectAdapter, type Registry } from '@offerpilot/core';
import { extractFields } from '@offerpilot/adapters';
import { createPageContext, executePlan, resolveField, verifySubmit, waitUntilDomStable } from '@offerpilot/executor';

const w = window as unknown as { __offerpilotInjected?: boolean };
if (w.__offerpilotInjected) { throw new Error('offerpilot already injected'); }
w.__offerpilotInjected = true;

const ctx = createPageContext(window);
const MAX_PAGES = 6;

function broadcast(msg: Record<string, unknown>): void {
  chrome.runtime.sendMessage(msg).catch(() => {});
}

function visible(el: Element): boolean {
  if (el.closest('[hidden]')) return false;
  const style = (el as HTMLElement).style;
  if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
  return true;
}

/** 寻找"下一步"类按钮（排除提交类），用于多页表单推进。 */
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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg.type === 'INIT') {
      const registry = msg.registry as Registry;
      const det = detectAdapter(registry, ctx);
      broadcast({ type: 'DETECT_RESULT', adapterId: det?.adapterId ?? 'unknown', fingerprintId: det?.fingerprintId ?? '', confidence: det?.confidence ?? 0 });
      broadcast({ type: 'EXTRACT_RESULT', fields: extractFields(ctx), pageIndex: 0 });
      sendResponse({ ok: true });
    } else if (msg.type === 'EXECUTE_PLAN') {
      // 简历附件：字节由侧栏随消息传入（base64），值不出浏览器
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
      // 多页推进：填完本页 → 找下一步 → 点击 → 等稳定 → 重新提取下一页
      const pageIndex = (msg.pageIndex as number) ?? 0;
      const next = pageIndex < MAX_PAGES - 1 ? findNextButton() : null;
      if (next) {
        (next as HTMLElement).click();
        await waitUntilDomStable(ctx, 400, 6000);
        broadcast({ type: 'EXTRACT_RESULT', fields: extractFields(ctx), pageIndex: pageIndex + 1 });
      } else {
        broadcast({ type: 'READY_TO_SUBMIT' });
      }
      sendResponse({ ok: true });
    } else if (msg.type === 'CONFIRM_SUBMIT') {
      const located = resolveField(ctx, msg.plan.submit.selectors);
      if (!located) {
        broadcast({ type: 'VERIFY_RESULT', result: { result: 'failed', evidence: ['submit_not_found'], checkedAt: ctx.now() } });
      } else {
        (located.el as HTMLElement).click();
        await ctx.wait(600);
        const result = await verifySubmit(ctx, msg.plan.submit.verify);
        broadcast({ type: 'VERIFY_RESULT', result });
      }
      sendResponse({ ok: true });
    }
  })().catch((e) => sendResponse({ ok: false, error: (e as Error).message }));
  return true;
});

