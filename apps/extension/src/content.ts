import { detectAdapter, type Registry, type VerifyResult } from '@offerpilot/core';
import { extractFields } from '@offerpilot/adapters';
import { createPageContext, executePlan, resolveField, verifySubmit, waitUntilDomStable } from '@offerpilot/executor';

const w = window as unknown as { __offerpilotInjected?: boolean };
if (w.__offerpilotInjected) { throw new Error('offerpilot already injected'); }
w.__offerpilotInjected = true;

const ctx = createPageContext(window);
const MAX_PAGES = 6;
const SUCCESS_RE = /提交成功|申请已收到|感谢投递|投递成功|申请成功|successfully submitted/i;

const flow: { lastVerify: VerifyResult | null; ready: boolean; pageIndex: number; watching: boolean; plan: any } = {
  lastVerify: null, ready: false, pageIndex: 0, watching: false, plan: null,
};

/* ================= 页内悬浮徽标（Shadow DOM + adoptedStyleSheets，兼容严格 CSP） ================= */
const host = document.createElement('div');
host.id = 'offerpilot-widget-host';
host.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;';
const shadow = host.attachShadow({ mode: 'open' });
const sheet = new CSSStyleSheet();
sheet.replaceSync(`
  .card{width:264px;font:13px/1.5 system-ui,sans-serif;background:#fff;border:1px solid #e0e0e0;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.15);overflow:hidden}
  .hd{display:flex;align-items:center;gap:6px;padding:8px 10px;background:#1565c0;color:#fff;cursor:pointer;font-weight:600}
  .hd .dot{width:8px;height:8px;border-radius:50%;background:#81d4fa;flex:none}
  .bd{padding:8px 10px;color:#333}
  .st{font-weight:600;margin-bottom:4px}
  .dt{font-size:12px;color:#666;white-space:pre-wrap}
  .ok .hd{background:#2e7d32}.ok .dot{background:#a5d6a7}
  .warn .hd{background:#f9a825}.warn .dot{background:#fff59d}
  .err .hd{background:#c62828}.err .dot{background:#ef9a9a}
  .collapsed .bd{display:none}
`);
shadow.adoptedStyleSheets = [sheet];
shadow.innerHTML = `
<div class="card" id="card">
  <div class="hd" id="hd"><span class="dot"></span><span>OfferPilot · 职航</span></div>
  <div class="bd"><div class="st" id="st">就绪</div><div class="dt" id="dt">打开侧栏，点「1 授权并识别」开始</div></div>
</div>`;
document.documentElement.appendChild(host);
const card = shadow.getElementById('card')!;
const stEl = shadow.getElementById('st')!;
const dtEl = shadow.getElementById('dt')!;
shadow.getElementById('hd')!.addEventListener('click', () => card.classList.toggle('collapsed'));

function widget(kind: '' | 'ok' | 'warn' | 'err', st: string, dt: string): void {
  card.className = 'card ' + kind;
  stEl.textContent = st;
  dtEl.textContent = dt;
}

function broadcast(msg: Record<string, unknown>): void {
  chrome.runtime.sendMessage(msg).catch(() => {});
}

/* ================= 字段高亮（填了哪个、什么状态，页面上一眼可见） ================= */
const HL: Record<string, string> = { filled: '#2e7d32', confirmed: '#2e7d32', needs_review: '#f9a825', missing: '#c62828', failed: '#c62828' };
function highlight(fieldId: string, status: string): void {
  const f = flow.plan?.pages?.[0]?.fields?.find((x: any) => x.fieldId === fieldId);
  if (!f) return;
  const located = resolveField(ctx, f.selectors);
  if (!located) return;
  const color = HL[status];
  if (!color) return;
  const el = located.el as HTMLElement;
  el.style.outline = `2px solid ${color}`;
  el.style.outlineOffset = '1px';
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

function showVerify(r: VerifyResult, passive: boolean): void {
  flow.lastVerify = r;
  flow.ready = false;
  if (r.result === 'verified') widget('ok', '✅ 已验证提交成功', '接下来留意邮箱/站内通知即可。');
  else if (r.result === 'unverified') widget('warn', '⚠️ 提交未确认', '请去邮箱或招聘官网个人中心核实！');
  else widget('err', '❌ 未检测到提交成功', '请手动完成提交。');
  broadcast({ type: 'VERIFY_RESULT', result: r, passive });
}

/* 被动提交监测：页面加载即启动——即使不打开侧栏、直接点页面提交按钮，也能看到结果 */
function startSubmitWatcher(): void {
  if (flow.watching) return;
  flow.watching = true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const check = () => {
    if (flow.lastVerify) return;
    const bodyText = ctx.document().body?.textContent ?? '';
    const formGone = !ctx.querySelector('form');
    if (formGone || SUCCESS_RE.test(bodyText)) {
      void verifySubmit(ctx, { successTexts: ['提交成功', '申请已收到', '感谢投递', '投递成功'], formGoneCheck: true, emailCheck: false })
        .then((r) => { if (r.result !== 'failed') showVerify(r, true); });
    }
  };
  const obs = new MutationObserver(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(check, 800);
  });
  obs.observe(ctx.document().body ?? ctx.document().documentElement, { childList: true, subtree: true, characterData: true });
}
startSubmitWatcher();

/* ================= 消息处理 ================= */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg.type === 'INIT') {
      const registry = msg.registry as Registry;
      const det = detectAdapter(registry, ctx);
      broadcast({ type: 'DETECT_RESULT', adapterId: det?.adapterId ?? 'unknown', fingerprintId: det?.fingerprintId ?? '', confidence: det?.confidence ?? 0 });
      const fields = extractFields(ctx);
      broadcast({ type: 'EXTRACT_RESULT', fields, pageIndex: 0 });
      widget('', `已识别：${fields.length} 个字段`, `适配器 ${det?.adapterId ?? 'unknown'}。请在侧栏点「2 生成计划与回答」。`);
      sendResponse({ ok: true });
    } else if (msg.type === 'GET_STATE') {
      sendResponse({ ok: true, injected: true, lastVerify: flow.lastVerify, ready: flow.ready, pageIndex: flow.pageIndex });
    } else if (msg.type === 'EXECUTE_PLAN') {
      flow.plan = msg.plan;
      const rf = msg.resumeFile as { name: string; type: string; dataB64: string } | undefined;
      const fileResolver = rf
        ? async () => {
            const bytes = Uint8Array.from(atob(rf.dataB64), (c) => c.charCodeAt(0));
            return { blob: new Blob([bytes], { type: rf.type || 'application/pdf' }), name: rf.name };
          }
        : undefined;
      const total = msg.plan.pages[0].fields.length;
      let done = 0;
      widget('', '填写中…', `0 / ${total}`);
      const report = await executePlan(ctx, msg.plan, {
        fieldDelayMs: [50, 200],
        fileResolver,
        onProgress: (r) => {
          done++;
          highlight(r.fieldId, r.status);
          widget('', '填写中…', `${done} / ${total}（绿=已填 黄=待确认 红=缺失）`);
          broadcast({ type: 'PROGRESS', result: r });
        },
      });
      broadcast({ type: 'PLAN_DONE', report });
      const okCount = report.results.filter((r) => r.status === 'filled').length;
      const pageIndex = (msg.pageIndex as number) ?? 0;
      flow.pageIndex = pageIndex;
      const next = pageIndex < MAX_PAGES - 1 ? findNextButton() : null;
      if (next) {
        widget('', `第 ${pageIndex + 1} 页完成（${okCount}/${total}）`, '正在翻到下一页…');
        (next as HTMLElement).click();
        await waitUntilDomStable(ctx, 400, 6000);
        broadcast({ type: 'EXTRACT_RESULT', fields: extractFields(ctx), pageIndex: pageIndex + 1 });
      } else {
        flow.ready = true;
        widget('ok', `✅ 填写完成（${okCount}/${total}）`, '请检查页面内容（黄/红字段需手填），然后在侧栏点「3 确认提交」。');
        broadcast({ type: 'READY_TO_SUBMIT' });
      }
      sendResponse({ ok: true });
    } else if (msg.type === 'CONFIRM_SUBMIT') {
      const located = resolveField(ctx, msg.plan.submit.selectors);
      if (!located) {
        showVerify({ result: 'failed', evidence: ['submit_not_found'], checkedAt: ctx.now() }, false);
      } else {
        (located.el as HTMLElement).click();
        await ctx.wait(600);
        showVerify(await verifySubmit(ctx, msg.plan.submit.verify), false);
      }
      sendResponse({ ok: true });
    }
  })().catch((e) => {
    widget('err', '❌ 执行出错', (e as Error).message);
    sendResponse({ ok: false, error: (e as Error).message });
  });
  return true;
});
