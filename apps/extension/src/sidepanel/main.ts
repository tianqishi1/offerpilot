const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const demoProfile = {
  version: 1,
  basics: { name: '小林', school: '某大学', major: '计算机科学与技术', degree: 'master', gradYear: 2027, city: '北京' },
  items: [{ id: 'i1', type: 'internship', content: { company: 'X公司', role: '后端开发实习生', desc: 'Go 微服务开发' } }],
  preferences: { cities: ['北京', '上海'], roles: ['后端开发'], industries: ['互联网'] },
};
$<HTMLTextAreaElement>('profile').value = JSON.stringify(demoProfile, null, 2);

interface FieldRow { fieldId: string; kind: string; label: string; required: boolean; selectors: unknown[]; options?: string[] }
const state: { tabId?: number; tabUrl?: string; tabTitle?: string; fields: FieldRow[]; plan?: any; done: boolean } = { fields: [], done: false };

function log(s: string): void {
  $<HTMLDivElement>('log').textContent += s + '\n';
}
function setStatus(s: string): void { $<HTMLDivElement>('status').textContent = s; }

function confClass(c: number, source: string): string {
  if (source === 'missing') return 'r';
  if (c >= 0.9) return 'g';
  if (c >= 0.6) return 'y';
  return 'r';
}

function renderFields(): void {
  const tbody = $<HTMLTableElement>('fields').querySelector('tbody')!;
  tbody.innerHTML = '';
  const planFields = new Map<string, any>((state.plan?.pages?.[0]?.fields ?? []).map((f: any) => [f.fieldId, f]));
  for (const f of state.fields) {
    const pf = planFields.get(f.fieldId);
    const tr = document.createElement('tr');
    if (pf) tr.className = confClass(pf.confidence, pf.value.source);
    tr.innerHTML = `<td>${f.label || f.fieldId}</td><td>${f.kind}</td><td>${pf?.value?.source ?? '-'}</td><td>${pf ? Math.round(pf.confidence * 100) + '%' : '-'}</td><td id="st-${f.fieldId}">${pf?.status ?? '待计划'}</td>`;
    tbody.appendChild(tr);
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'DETECT_RESULT') {
    setStatus(`适配器: ${msg.adapterId} (指纹 ${msg.fingerprintId}, 置信度 ${msg.confidence})`);
  } else if (msg.type === 'EXTRACT_RESULT') {
    state.fields = msg.fields;
    renderFields();
    $<HTMLButtonElement>('btn-fill').disabled = state.fields.length === 0;
    log(`提取到 ${state.fields.length} 个字段`);
  } else if (msg.type === 'PROGRESS') {
    const cell = document.getElementById(`st-${msg.result.fieldId}`);
    if (cell) cell.textContent = msg.result.status + (msg.result.error ? ` (${msg.result.error})` : '');
  } else if (msg.type === 'PLAN_DONE') {
    state.done = true;
    $<HTMLButtonElement>('btn-submit').disabled = false;
    const ok = msg.report.results.filter((r: any) => r.status === 'filled').length;
    log(`填写完成：${ok}/${msg.report.results.length} 成功。请检查黄/红字段，然后人工确认提交。`);
  } else if (msg.type === 'VERIFY_RESULT') {
    const v = $<HTMLDivElement>('verify');
    const r = msg.result;
    v.textContent = r.result === 'verified' ? '✅ 已验证提交成功' : r.result === 'unverified' ? '⚠️ 提交未确认，请去状态页/邮箱核实' : '❌ 提交失败，请手动完成';
    v.style.background = r.result === 'verified' ? '#e8f5e9' : r.result === 'unverified' ? '#fff8e1' : '#ffebee';
    log('校验证据: ' + r.evidence.join(', '));
  }
});

$<HTMLButtonElement>('btn-detect').addEventListener('click', async () => {
  try {
    const granted = await chrome.permissions.request({ origins: ['*://*/*'] });
    if (!granted) { setStatus('未授权站点权限'); return; }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url) { setStatus('未找到活动标签页'); return; }
    state.tabId = tab.id; state.tabUrl = tab.url; state.tabTitle = tab.title;
    const res = await chrome.runtime.sendMessage({ type: 'ENABLE_TAB', tabId: tab.id, url: tab.url });
    if (!res?.ok) throw new Error(res?.error ?? 'enable_failed');
    setStatus('已注入，等待识别…');
  } catch (e) {
    setStatus('错误: ' + (e as Error).message);
  }
});

$<HTMLButtonElement>('btn-fill').addEventListener('click', async () => {
  try {
    const profile = JSON.parse($<HTMLTextAreaElement>('profile').value);
    const jd = {
      id: 'demo-' + Date.now(), source: 'plugin', url: state.tabUrl ?? '', title: state.tabTitle ?? '演示岗位',
      company: new URL(state.tabUrl ?? 'https://example.com').hostname, jdText: state.tabTitle ?? '', dedupHash: 'demo', freshnessAt: new Date().toISOString(),
    };
    const res = await fetch($<HTMLInputElement>('api').value + '/fillplan', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ schema: state.fields, profile, jd }),
    });
    if (!res.ok) throw new Error('fillplan_http_' + res.status);
    const data = await res.json();
    state.plan = data.plan;
    if (data.strippedSensitivePaths?.length) log('已端侧剔除敏感字段: ' + data.strippedSensitivePaths.join(', '));
    renderFields();
    await chrome.runtime.sendMessage({ type: 'EXECUTE_PLAN', tabId: state.tabId, plan: state.plan });
    log('计划已下发执行…');
  } catch (e) {
    log('错误: ' + (e as Error).message);
  }
});

$<HTMLButtonElement>('btn-submit').addEventListener('click', async () => {
  if (!state.plan || !state.done) return;
  await chrome.runtime.sendMessage({ type: 'CONFIRM_SUBMIT', tabId: state.tabId, plan: state.plan });
  log('已按你的确认点击提交，校验中…');
});
