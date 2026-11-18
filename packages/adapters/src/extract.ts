import type { FieldSchema, PageContext, SelectorStrategy } from '@offerpilot/core';

const SKIP_INPUT_TYPES = new Set(['hidden', 'button', 'submit', 'reset', 'image']);

function kindOf(el: Element): FieldSchema['kind'] {
  const role = el.getAttribute('role');
  if (role === 'combobox') return 'combobox';
  if (role === 'radio') return 'radio';
  if (role === 'checkbox') return 'checkbox';
  if (el instanceof HTMLSelectElement) return 'select';
  if (el instanceof HTMLTextAreaElement) return 'textarea';
  if (el instanceof HTMLInputElement) {
    switch (el.type) {
      case 'file': return 'file';
      case 'checkbox': return 'checkbox';
      case 'radio': return 'radio';
      case 'date': return 'date';
      default: return 'text';
    }
  }
  if ((el as HTMLElement).isContentEditable) return 'richtext';
  return 'custom';
}

function labelOf(ctx: PageContext, el: Element): string {
  const doc = ctx.document();
  const id = el.getAttribute('id');
  if (id) {
    const lab = doc.querySelector(`label[for="${id}"]`);
    if (lab?.textContent?.trim()) return lab.textContent.trim();
  }
  const wrap = el.closest('label');
  if (wrap?.textContent?.trim()) return wrap.textContent.trim();
  const labelledby = el.getAttribute('aria-labelledby');
  if (labelledby) {
    const text = labelledby.split(/\s+/).map((i) => doc.getElementById(i)?.textContent ?? '').join(' ').trim();
    if (text) return text;
  }
  const aria = el.getAttribute('aria-label');
  if (aria) return aria.trim();
  const ph = el.getAttribute('placeholder');
  if (ph) return ph.trim();
  return el.getAttribute('name') ?? '';
}

function selectorsOf(el: Element, label: string): SelectorStrategy[] {
  const chain: SelectorStrategy[] = [];
  if (label) chain.push({ type: 'label', value: label });
  const role = el.getAttribute('role');
  const aria = el.getAttribute('aria-label');
  if (role && aria) chain.push({ type: 'aria', role, name: aria });
  const id = el.getAttribute('id');
  if (id) chain.push({ type: 'css', value: `#${id}` });
  const name = el.getAttribute('name');
  if (name) chain.push({ type: 'nameAttr', value: name });
  const ph = el.getAttribute('placeholder');
  if (ph) chain.push({ type: 'placeholder', value: ph });
  if (chain.length === 0) chain.push({ type: 'css', value: el.tagName.toLowerCase() });
  return chain;
}

/** 通用字段提取：渲染后 DOM + a11y 关联；不采集任何已填值。 */
export function extractFields(ctx: PageContext): FieldSchema[] {
  const doc = ctx.document();
  const nodes = Array.from(doc.querySelectorAll(
    'input,select,textarea,[contenteditable="true"],[role="combobox"],[role="radio"],[role="checkbox"]',
  ));
  const out: FieldSchema[] = [];
  const seen = new Set<Element>();
  let auto = 0;
  for (const el of nodes) {
    if (seen.has(el)) continue;
    seen.add(el);
    if (el instanceof HTMLInputElement && SKIP_INPUT_TYPES.has(el.type)) continue;
    if (el.closest('[hidden]')) continue;
    const label = labelOf(ctx, el);
    const kind = kindOf(el);
    const required = (el as HTMLInputElement).required === true
      || el.getAttribute('aria-required') === 'true'
      || /[*＊]|必填/.test(label);
    const options: string[] = [];
    if (el instanceof HTMLSelectElement) {
      for (const o of Array.from(el.options)) if (o.value) options.push(o.text);
    } else if (kind === 'combobox') {
      const owns = el.getAttribute('aria-owns') ?? el.getAttribute('aria-controls');
      const lb = owns ? doc.getElementById(owns) : doc.querySelector('[role="listbox"]');
      if (lb) for (const o of Array.from(lb.querySelectorAll('[role="option"],li'))) options.push((o.textContent ?? '').trim());
    }
    const maxLengthAttr = el.getAttribute('maxlength');
    out.push({
      fieldId: el.getAttribute('id') ?? el.getAttribute('name') ?? `f-${auto++}`,
      kind,
      label,
      required,
      options: options.length > 0 ? options : undefined,
      maxLength: maxLengthAttr ? Number(maxLengthAttr) : undefined,
      accept: el instanceof HTMLInputElement && el.type === 'file' ? (el.accept || undefined) : undefined,
      selectors: selectorsOf(el, label),
    });
  }
  return out;
}
