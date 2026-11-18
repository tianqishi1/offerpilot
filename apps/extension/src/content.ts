import { detectAdapter, type Registry } from '@offerpilot/core';
import { extractFields } from '@offerpilot/adapters';
import { createPageContext, executePlan, resolveField, verifySubmit } from '@offerpilot/executor';

const ctx = createPageContext(window);

function broadcast(msg: Record<string, unknown>): void {
  chrome.runtime.sendMessage(msg).catch(() => {});
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg.type === 'INIT') {
      const registry = msg.registry as Registry;
      const det = detectAdapter(registry, ctx);
      broadcast({ type: 'DETECT_RESULT', adapterId: det?.adapterId ?? 'unknown', fingerprintId: det?.fingerprintId ?? '', confidence: det?.confidence ?? 0 });
      const fields = extractFields(ctx);
      broadcast({ type: 'EXTRACT_RESULT', fields });
      sendResponse({ ok: true });
    } else if (msg.type === 'EXECUTE_PLAN') {
      const report = await executePlan(ctx, msg.plan, {
        fieldDelayMs: [50, 200],
        onProgress: (r) => broadcast({ type: 'PROGRESS', result: r }),
      });
      broadcast({ type: 'PLAN_DONE', report });
      sendResponse({ ok: true });
    } else if (msg.type === 'CONFIRM_SUBMIT') {
      const located = resolveField(ctx, msg.plan.submit.selectors);
      if (!located) {
        broadcast({ type: 'VERIFY_RESULT', result: { result: 'failed', evidence: ['submit_not_found'], checkedAt: ctx.now() } });
      } else {
        (located.el as HTMLElement).click();
        await ctx.wait(500);
        const result = await verifySubmit(ctx, msg.plan.submit.verify);
        broadcast({ type: 'VERIFY_RESULT', result });
      }
      sendResponse({ ok: true });
    }
  })().catch((e) => sendResponse({ ok: false, error: (e as Error).message }));
  return true;
});
