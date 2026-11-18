export interface FileLike {
  blob: Blob;
  name: string;
}

/**
 * 文件上传：DataTransfer 构造 FileList 赋给 input.files（浏览器安全限制下唯一可行路径），
 * 并对拖拽区兜底派发 dragenter/dragover/drop。
 */
export async function attachFile(
  input: HTMLInputElement,
  file: FileLike,
  opts?: { dropzone?: Element | null },
): Promise<void> {
  const DT = (globalThis as unknown as { DataTransfer?: new () => DataTransfer }).DataTransfer;
  if (typeof DT !== 'function') throw new Error('DataTransfer unavailable in this environment');
  const f = new File([file.blob], file.name, { type: file.blob.type || 'application/octet-stream' });
  const dt = new DT();
  dt.items.add(f);
  input.files = dt.files;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  if (opts?.dropzone) {
    for (const type of ['dragenter', 'dragover', 'drop']) {
      const ev = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'dataTransfer', { value: dt, configurable: true });
      opts.dropzone.dispatchEvent(ev);
    }
  }
}
