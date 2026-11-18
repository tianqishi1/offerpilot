import type { FieldKind, ValidationRule } from '@offerpilot/core';
import { currentValue } from './native.js';

/** 执行后校验；返回 null 表示通过，否则返回失败规则名。 */
export function validateField(el: Element, rules: ValidationRule[] | undefined, kind: FieldKind): string | null {
  for (const r of rules ?? []) {
    const v = currentValue(el);
    switch (r.type) {
      case 'nonempty':
        if (!v) return 'nonempty';
        break;
      case 'maxLength': {
        const max = Number(r.args?.max ?? Number.POSITIVE_INFINITY);
        if (v.length > max) return 'maxLength';
        break;
      }
      case 'pattern': {
        const re = new RegExp(String(r.args?.pattern ?? ''));
        if (!re.test(v)) return 'pattern';
        break;
      }
      case 'optionExists': {
        if (el instanceof HTMLSelectElement) {
          const ok = Array.from(el.options).some((o) => o.value === v || o.text === v);
          if (!ok) return 'optionExists';
        }
        break;
      }
      case 'fileAccepted': {
        if (kind === 'file') {
          const input = el as HTMLInputElement;
          if (!input.files || input.files.length === 0) return 'fileAccepted';
        }
        break;
      }
    }
  }
  return null;
}
