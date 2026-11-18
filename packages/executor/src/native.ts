/**
 * React 受控组件安全写值：
 * 1) 用原型链上的 native setter 绕过 React 在实例上重定义的 value 描述符；
 * 2) 复位 _valueTracker，让 React 的 change 检测认定"值变了"；
 * 3) 派发 input + change 合成事件。
 * 直接 el.value = x 会被 React restoreControlledState 回滚——本函数即为此而生。
 */
export function setNativeValue(el: Element, value: string): void {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (!desc?.set) throw new Error('native value setter unavailable');
    desc.set.call(el, value);
    const tracker = (el as unknown as { _valueTracker?: { setValue(v: string): void } })._valueTracker;
    if (tracker) tracker.setValue('');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }
  if (el instanceof HTMLSelectElement) {
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }
  if (el instanceof HTMLElement && el.isContentEditable) {
    el.textContent = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  throw new Error(`unsupported element for text value: ${el.tagName}`);
}

export function currentValue(el: Element): string {
  if (el instanceof HTMLInputElement) {
    if (el.type === 'checkbox' || el.type === 'radio') return el.checked ? el.value || 'true' : '';
    if (el.type === 'file') return el.files && el.files.length > 0 ? el.files[0]!.name : '';
    return el.value;
  }
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return el.value;
  return (el.textContent ?? '').trim();
}
