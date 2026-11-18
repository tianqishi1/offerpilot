const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const API = () => $<HTMLInputElement>('api').value.replace(/\/$/, '');

interface Profile { version: number; basics: Record<string, unknown>; items: { id: string; type: string; content: Record<string, unknown> }[]; preferences: { cities: string[]; roles: string[]; industries: string[] }; intent?: string }
interface FieldRow { fieldId: string; kind: string; label: string; required: boolean; selectors: unknown[]; options?: string[] }
interface PlanField { fieldId: string; value: { source: string; text?: string; fileRef?: string }; confidence: number; status: string; label: string; kind: string }

const state: {
  tabId?: number; tabUrl?: string; tabTitle?: string;
  profile?: Profile; resume?: { name: string; type: string; dataB64: string };
  fields: FieldRow[]; plan?: { pages: { fields: PlanField[] }[]; submit: unknown };
  pageIndex: number; ready: boolean;
} = { fields: [], pageIndex: 0, ready: false };

function log(s: string): void { $<HTMLDivElement>('log').textContent += s + '\n'; }
function setStatus(s: string): void { $<HTMLDivElement>('status').textContent = s; }

function abToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/* ---------- 画像表单 ---------- */
const BASIC_FIELDS: [string, string][] = [['name', '姓名'], ['school', '学校'], ['major', '专业'], ['degree', '学历(bachelor/master/phd)'], ['gradYear', '毕业年份'], ['city', '所在城市']];
const ITEM_KEYS = ['company', 'role', 'school', 'major', 'desc', 'skills', 'start', 'end'];

function renderProfileForm(): void {
  const p = state.profile;
  const box = $<HTMLDivElement>('profile-form');
  if (!p) { box.innerHTML = '<i>尚未上传简历</i>'; return; }
  let html = '<b>基本信息</b><table>';
  for (const [k, label] of BASIC_FIELDS) {
    html += `<tr><td>${label}</td><td><input data-basic="${k}" value="${String(p.basics[k] ?? '')}" /></td></tr>`;
  }
  html += '</table><b>经历条目</b>';
  p.items.forEach((it, i) => {
    html += `<div class="item"><i>${it.type} #${it.id}</i><table>`;
    for (const k of ITEM_KEYS) {
      if (it.content[k] !== undefined || ['company', 'role', 'desc'].includes(k)) {
        html += `<tr><td>${k}</td><td><input data-item="${i}" data-key="${k}" value="${String(it.content[k] ?? '')}" /></td></tr>`;
      }
    }
    html += '</table></div>';
  });
  box.innerHTML = html;
}

function collectProfileForm(): Profile | undefined {
  const p = state.profile;
  if (!p) return undefined;
  for (const el of Array.from(document.querySelectorAll<HTMLInputElement>('[data-basic]'))) {
    const k = el.dataset.basic!;
    const v = el.value.trim();
    if (v === '') delete p.basics[k];
    else p.basics[k] = k === 'gradYear' ? Number(v) : v;
  }
  for (const el of Array.from(document.querySelectorAll<HTMLInputElement>('[data-item]'))) {
    const i = Number(el.dataset.item); const k = el.dataset.key!;
    const v = el.value.trim();
    if (v === '') delete p.items[i]!.content[k];
    else p.items[i]!.content[k] = v;
  }
  p.version += 1;
  return p;
}

async function persist(): Promise<void> {
  await chrome.storage.local.set({ profile: state.profile, resume: state.resume });
}

/* ---------- 简历上传解析 ---------- */
$<HTMLButtonElement>('btn-upload').addEventListener('click', async () => {
  try {
    if (!$<HTMLInputElement>('consent').checked) { setStatus('请先勾选解析同意项'); return; }
    const file = $<HTMLInputElement>('resume-file').files?.[0];
    if (!file) { setStatus('请选择 PDF/Word 简历'); return; }
    setStatus('解析中（原文件不会落盘）…');
    const fd = new FormData();
    fd.append('consent', 'true');
    fd.append('file', file, file.name);
    const res = await fetch(API() + '/profile/parse', { method: 'POST', body: fd });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error + (e.hint ? ` (${e.hint})` : '')); }
    const data = await res.json();
    state.profile = data.profile;
    state.resume = { name: file.name, type: file.type, dataB64: abToB64(await file.arrayBuffer()) };
    await persist();
    renderProfileForm();
    setStatus(`简历解析完成（${data.textLength} 字符）。请核对下方信息后保存。`);
    if (data.strippedPaths?.length) log('已剔除敏感字段: ' + data.strippedPaths.join(', '));
  } catch (e) { setStatus('解析失败: ' + (e as Error).message); }
});

$<HTMLButtonElement>('btn-save-profile').addEventListener('click', async () => {
  const p = collectProfileForm();
  if (!p) { setStatus('无画像可保存'); return; }
  state.profile = p;
  await persist();
  setStatus('画像已保存（本地）。');
});

/* ---------- 字段表格 ---------- */
function confClass(c: number, source: string): string {
  if (source === 'missing') return 'r';
  if (c >= 0.9) return 'g';
  if (c >= 0.6) return 'y';
  return 'r';
}
function renderFields(): void {
  const tbody = $<HTMLTableElement>('fields').querySelector('tbody')!;
  tbody.innerHTML = '';
  const pf = new Map<string, PlanField>((state.plan?.pages[0]?.fields ?? []).map((f) => [f.fieldId, f]));
  for (const f of state.fields) {
    const p = pf.get(f.fieldId);
    const tr = document.createElement('tr');
    if (p) tr.className = confClass(p.confidence, p.value.source);
    tr.innerHTML = `<td>${f.label || f.fieldId}${f.required ? ' *' : ''}</td><td>${f.kind}</td><td>${p?.value?.source ?? '-'}</td><td>${p ? Math.round(p.confidence * 100) + '%' : '-'}</td><td id="st-${f.fieldId}">${p?.status ?? '待计划'}</td>`;
    tbody.appendChild(tr);
  }
}

/* ---------- 开放题审阅 ---------- */
function renderReview(): void {
  const box = $<HTMLDivElement>('review');
  const gen = (state.plan?.pages[0]?.fields ?? []).filter((f) => f.value.source === 'generated');
  if (gen.length === 0) { box.innerHTML = ''; return; }
  box.innerHTML = '<b>开放题回答（AI 生成，请核对/编辑后才会填入）</b>' +
    gen.map((f) => `<div class="item"><i>${f.label}</i><textarea data-gen="${f.fieldId}" rows="4">${f.value.text ?? ''}</textarea></div>`).join('');
}

function currentJd(): Record<string, unknown> {
  return {
    id: 'job-' + Date.now(), source: 'plugin', url: state.tabUrl ?? '', title: state.tabTitle ?? '目标岗位',
    company: state.tabUrl ? new URL(state.tabUrl).hostname : '', jdText: $<HTMLTextAreaElement>('jd-text').value || state.tabTitle || '',
    dedupHash: 'x', freshnessAt: new Date().toISOString(),
  };
}

async function planCurrentPage(): Promise<void> {
  const res = await fetch(API() + '/fillplan', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ schema: state.fields, profile: state.profile, jd: currentJd() }),
  });
  if (!res.ok) throw new Error('fillplan_http_' + res.status);
  const data = await res.json();
  state.plan = data.plan;
  // 为开放题生成回答（事实护栏在后端提示词；用户可编辑）
  for (const f of state.plan!.pages[0]!.fields) {
    if (f.value.source === 'generated') {
      try {
        const g = await fetch(API() + '/generate', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ profile: state.profile, jd: currentJd(), question: f.label }),
        });
        if (g.ok) { const a = await g.json(); f.value.text = a.answer; }
      } catch { /* 生成失败留空，用户手填 */ }
    }
    if (f.kind === 'file' && state.resume) { f.value.fileRef = 'resume:primary'; f.value.source = 'profile'; f.value.text = ''; }
  }
  renderFields();
  renderReview();
  $<HTMLButtonElement>('btn-execute').disabled = false;
  setStatus(`第 ${state.pageIndex + 1} 页计划就绪：请核对黄/红字段与开放题回答，然后点「确认并填写」。`);
}

/* ---------- 主流程 ---------- */
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'DETECT_RESULT') {
    setStatus(`适配器: ${msg.adapterId}（${msg.fingerprintId}）。提取字段中…`);
  } else if (msg.type === 'EXTRACT_RESULT') {
    state.fields = msg.fields;
    state.pageIndex = msg.pageIndex ?? 0;
    state.ready = false;
    renderFields();
    $<HTMLButtonElement>('btn-plan').disabled = state.fields.length === 0;
    log(`第 ${state.pageIndex + 1} 页提取到 ${state.fields.length} 个字段`);
    if (state.pageIndex > 0 && state.profile) { void planCurrentPage().catch((e) => log('错误: ' + e.message)); }
  } else if (msg.type === 'PROGRESS') {
    const cell = document.getElementById(`st-${msg.result.fieldId}`);
    if (cell) cell.textContent = msg.result.status + (msg.result.error ? ` (${msg.result.error})` : '');
  } else if (msg.type === 'PLAN_DONE') {
    const ok = msg.report.results.filter((r: { status: string }) => r.status === 'filled').length;
    log(`本页填写：${ok}/${msg.report.results.length} 成功`);
  } else if (msg.type === 'READY_TO_SUBMIT') {
    state.ready = true;
    $<HTMLButtonElement>('btn-submit').disabled = false;
    setStatus('全部页面填写完成。请最后检查，然后人工确认提交。');
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
    if (!state.profile) { setStatus('请先上传并解析简历'); return; }
    const granted = await chrome.permissions.request({ origins: ['*://*/*'] });
    if (!granted) { setStatus('未授权站点权限'); return; }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url) { setStatus('未找到活动标签页'); return; }
    state.tabId = tab.id; state.tabUrl = tab.url; state.tabTitle = tab.title;
    const res = await chrome.runtime.sendMessage({ type: 'ENABLE_TAB', tabId: tab.id, url: tab.url });
    if (!res?.ok) throw new Error(res?.error ?? 'enable_failed');
  } catch (e) { setStatus('错误: ' + (e as Error).message); }
});

$<HTMLButtonElement>('btn-plan').addEventListener('click', async () => {
  try { await planCurrentPage(); } catch (e) { setStatus('错误: ' + (e as Error).message); }
});

$<HTMLButtonElement>('btn-execute').addEventListener('click', async () => {
  if (!state.plan) return;
  for (const ta of Array.from(document.querySelectorAll<HTMLTextAreaElement>('[data-gen]'))) {
    const f = state.plan.pages[0]!.fields.find((x) => x.fieldId === ta.dataset.gen);
    if (f) { f.value.text = ta.value; f.status = 'confirmed'; }
  }
  $<HTMLButtonElement>('btn-execute').disabled = true;
  await chrome.runtime.sendMessage({ type: 'EXECUTE_PLAN', tabId: state.tabId, plan: state.plan, pageIndex: state.pageIndex, resumeFile: state.resume });
  log('执行中…');
});

$<HTMLButtonElement>('btn-submit').addEventListener('click', async () => {
  if (!state.plan || !state.ready) return;
  await chrome.runtime.sendMessage({ type: 'CONFIRM_SUBMIT', tabId: state.tabId, plan: state.plan });
  log('已按你的确认点击提交，校验中…');
});

/* ---------- 启动：恢复本地画像 ---------- */
(async () => {
  const saved = await chrome.storage.local.get(['profile', 'resume']);
  if (saved.profile) { state.profile = saved.profile as Profile; renderProfileForm(); setStatus('已恢复本地画像。打开网申页后点「1 授权并识别」。'); }
  if (saved.resume) state.resume = saved.resume as { name: string; type: string; dataB64: string };
})();
