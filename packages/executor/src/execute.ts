import type {
  ExecutionReport, FieldPlan, FieldResult, FillPlan, PageContext,
} from '@offerpilot/core';
import { resolveField } from './locate.js';
import { currentValue, setNativeValue } from './native.js';
import { attachFile, type FileLike } from './file.js';
import { pickCombobox } from './combobox.js';
import { validateField } from './validate.js';

export interface ExecuteOptions {
  /** 字段间拟人延迟区间 [min,max] ms */
  fieldDelayMs?: [number, number];
  onProgress?: (r: FieldResult) => void;
  /** fileRef → 本地 Blob（简历 PDF 存 IndexedDB，值不出浏览器） */
  fileResolver?: (ref: string) => Promise<FileLike>;
  maxAttempts?: number;
}

const DEFAULT_DELAY: [number, number] = [50, 200];

function randDelay([min, max]: [number, number]): number {
  return min + Math.random() * (max - min);
}

async function applyValue(ctx: PageContext, field: FieldPlan, el: Element, opts: ExecuteOptions): Promise<void> {
  const text = field.value.text ?? '';
  switch (field.kind) {
    case 'text':
    case 'textarea':
    case 'date':
    case 'richtext':
    case 'custom':
      if (!text) throw new Error('value_not_assembled');
      setNativeValue(el, text);
      return;
    case 'select':
      if (!text) throw new Error('value_not_assembled');
      setNativeValue(el, text);
      return;
    case 'combobox':
      if (!text) throw new Error('value_not_assembled');
      await pickCombobox(ctx, el, text);
      return;
    case 'checkbox': {
      const input = el as HTMLInputElement;
      const desired = text === 'true' || text === '1';
      if (input.checked !== desired) input.click();
      return;
    }
    case 'radio': {
      const input = el as HTMLInputElement;
      if (input.type === 'radio') {
        if (!input.checked) input.click();
        return;
      }
      const target = ctx.querySelector(`input[type="radio"][name="${input.getAttribute('name') ?? ''}"][value="${text}"]`);
      if (!target) throw new Error('radio_option_not_found');
      (target as HTMLInputElement).click();
      return;
    }
    case 'file': {
      if (!field.value.fileRef) throw new Error('fileRef_missing');
      if (!opts.fileResolver) throw new Error('fileResolver_missing');
      const f = await opts.fileResolver(field.value.fileRef);
      const dropzone = el.closest('[data-dropzone]') ?? ctx.querySelector('[data-dropzone]');
      await attachFile(el as HTMLInputElement, f, { dropzone });
      return;
    }
  }
}

/** 单字段执行：定位→写值→校验，失败重试 1 次；missing/user 未确认不写值。 */
export async function executeField(ctx: PageContext, field: FieldPlan, opts: ExecuteOptions = {}): Promise<FieldResult> {
  const base = { fieldId: field.fieldId, attempts: 0, driftUsed: false };
  if (field.value.source === 'missing') return { ...base, status: 'missing' };
  if (field.value.source === 'user' && field.status !== 'confirmed') {
    return { ...base, status: 'needs_review' };
  }
  const located = resolveField(ctx, field.selectors);
  if (!located) return { ...base, status: 'failed', error: 'element_not_found' };

  const maxAttempts = opts.maxAttempts ?? 2;
  let lastError: string | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // 幂等：值已相等则跳过写值
      const desired = field.value.text ?? '';
      const alreadySet = field.kind !== 'file' && desired !== '' && currentValue(located.el) === desired;
      if (!alreadySet) await applyValue(ctx, field, located.el, opts);
      const invalid = validateField(located.el, field.validation, field.kind);
      if (invalid) { lastError = invalid; continue; }
      const status = field.value.source === 'generated' ? 'needs_review' : 'filled';
      return { fieldId: field.fieldId, status, attempts: attempt, driftUsed: located.driftUsed };
    } catch (e) {
      lastError = (e as Error).message;
    }
  }
  return { fieldId: field.fieldId, status: 'failed', attempts: maxAttempts, driftUsed: located.driftUsed, error: lastError };
}

/** DOM 静默判定：MutationObserver 安静 quietMs 即认为稳定；超时兜底返回。 */
export function waitUntilDomStable(ctx: PageContext, quietMs = 300, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve) => {
    const doc = ctx.document();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      obs.disconnect();
      clearTimeout(hard);
      if (timer) clearTimeout(timer);
      resolve();
    };
    const obs = new MutationObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(finish, quietMs);
    });
    obs.observe(doc.body ?? doc.documentElement, { childList: true, subtree: true, attributes: true });
    const hard = setTimeout(finish, timeoutMs);
    timer = setTimeout(finish, quietMs);
  });
}

async function advancePage(ctx: PageContext, page: FillPlan['pages'][number]): Promise<void> {
  if (!page.next) return;
  const located = resolveField(ctx, page.next.selectors);
  if (!located) throw new Error('next_button_not_found');
  const before = ctx.url();
  (located.el as HTMLElement).click();
  if (page.next.waitUntil === 'navigation') {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && ctx.url() === before) await ctx.wait(50);
  } else {
    await waitUntilDomStable(ctx);
  }
}

/** 整表执行：逐页逐字段；永不自动点击 submit（提交由人工确认后单独触发）。 */
export async function executePlan(ctx: PageContext, plan: FillPlan, opts: ExecuteOptions = {}): Promise<ExecutionReport> {
  const startedAt = ctx.now();
  const results: FieldResult[] = [];
  const delay = opts.fieldDelayMs ?? DEFAULT_DELAY;
  for (const page of plan.pages) {
    for (const field of page.fields) {
      const r = await executeField(ctx, field, opts);
      results.push(r);
      opts.onProgress?.(r);
      await ctx.wait(randDelay(delay));
    }
    await advancePage(ctx, page);
  }
  return { planId: plan.id, results, startedAt, finishedAt: ctx.now() };
}
