import type { CompleteOptions, CompleteResult, LlmProvider } from '../types.js';

/** 确定性 mock：responder 返回对象或 JSON 字符串；记录调用供断言。 */
export class MockProvider implements LlmProvider {
  name = 'mock';
  calls: CompleteOptions[] = [];
  constructor(private responder: (opts: CompleteOptions, callIndex: number) => unknown) {}
  async complete(opts: CompleteOptions): Promise<CompleteResult> {
    const idx = this.calls.length;
    this.calls.push(opts);
    const out = this.responder(opts, idx);
    const text = typeof out === 'string' ? out : JSON.stringify(out);
    return { text, usage: { promptTokens: 100, completionTokens: 50 } };
  }
}
