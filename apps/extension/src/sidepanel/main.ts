const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const API = () => $<HTMLInputElement>('api').value.replace(/\/$/, '');

interface Profile { version: number; basics: Record<string, unknown>; items: { id: string; type: string; content: Record<string, unknown> }[]; preferences: { cities: string[]; roles: string[]; industries: string[] }; intent?: string }
interface FieldRow { fieldId: string; kind: string; label: string; required: boolean; selectors: unknown[]; options?: string[] }
interface PlanField { fieldId: string; value: { source: string; text?: string; fileRef?: string }; confidence: number; status: string; label: string; kind: string }
interface VerifyResult { result: string; evidence: string[]; checkedAt: string }

const state: {
  tabId?: number; tabUrl?: string; tabTitle?: string;
  profile?: Profile; resume?: { name: string; type: string; dataB64: string };
  fields: FieldRow[]; plan?: { pages: { fields: PlanField[] }[]; submit: unknown };
  pageIndex: number; ready: boolean;
} = { fields: [], pageIndex: 0, ready: false };

function log(s: string): void {
  const el = $<HTMLDivElement>('log');
  const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  el.textContent += `[${time}] ${s}\n`;
  el.scrollTop = el.scrollHeight;
}
function setStatus(s: string): void { $<HTMLDivElement>('status').textContent = s; }

function abToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function renderResumeChip(): void {
  const chip = $<HTMLDivElement>('resume-chip');
  chip.textContent = state.resume ? `📎 附件将使用：${state.resume.name}` : '';
}

function showVerify(r: VerifyResult, passive = false): void {
  const v = $<HTMLDivElement>('verify');
  if (r.result === 'verified') {
    v.textContent = '✅ 已验证提交成功——接下来留意邮箱/站内通知即可。';
    v.style.background = '#e8f5e9';
    setStatus('投递完成（已验证）。可以继续下一家。');
  } else if (r.result === 'unverified') {
    v.textContent = '⚠️ 页面已变化但未确认提交成功——请去邮箱或招聘官网个人中心核实！';
    v.style.background = '#fff8e1';
    setStatus('提交未确认，请人工核实。');
  } else {
    v.textContent = '❌ 未检测到提交成功——请手动完成提交。';
    v.style.background = '#ffebee';
  }
  log((passive ? '（监测到页面提交）' : '') + '校验证据: ' + r.evidence.join(', '));
  v.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ---------- 画像表单 ---------- */
const BASIC_FIELDS: [string, string][] = [['name', '姓名'], ['school', '学校'], ['major', '专业'], ['degree', '学历(bachelor/master/phd)'], ['gradYear', '毕业年份'], ['city', '所在城市']];
const ITEM_KEYS = ['company', 'role', 'school', 'major', 'desc', 'skills', 'start', 'end'];

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderProfileForm(): void {
  const p = state.profile;
  const box = $<HTMLDivElement>('profile-form');
  if (!p) { box.innerHTML = '<i>尚未上传简历</i>'; return; }
  let html = '<b>基本信息</b><table>';
  for (const [k, label] of BASIC_FIELDS) {
    html += `<tr><td>${label}</td><td><input data-basic="${k}" value="${esc(String(p.basics[k] ?? ''))}" /></td></tr>`;
  }
  html += '</table><b>经历条目</b>';
  p.items.forEach((it, i) => {
    html += `<div class="item"><i>${it.type} #${it.id}</i><table>`;
    for (const k of ITEM_KEYS) {
      if (it.content[k] !== undefined || ['company', 'role', 'desc'].includes(k)) {
        html += `<tr><td>${k}</td><td><input data-item="${i}" data-key="${k}" value="${esc(String(it.content[k] ?? ''))}" /></td></tr>`;
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
    log(`上传 ${file.name}（${Math.round(file.size / 1024)}KB）`);
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
    renderResumeChip();
    setStatus(`✅ 简历解析完成（${data.textLength} 字符）。请核对下方信息，点「保存画像」后开始网申。`);
    log('解析成功：' + JSON.stringify(data.profile.basics));
    if (data.strippedPaths?.length) log('已剔除敏感字段: ' + data.strippedPaths.join(', '));
  } catch (e) {
    setStatus('❌ 解析失败: ' + (e as Error).message);
    log('解析失败: ' + (e as Error).message);
  }
});

$<HTMLButtonElement>('btn-save-profile').addEventListener('click', async () => {
  const p = collectProfileForm();
  if (!p) { setStatus('无画像可保存'); return; }
  state.profile = p;
  await persist();
  setStatus('✅ 画像已保存（仅存本地）。打开网申页后点「1 授权并识别」。');
  log('画像已保存 v' + p.version);
});

/* ---------- 字段表格 ---------- */
function confClass(c: number, source: string): string {
  if (source === 'missing') return 'r';
  if (c >= 0.9) return 'g';
  if (c >= 0.6) return 'y';
  return 'r';
}

function valuePreview(f: PlanField): string {
  if (f.value.source === 'user') return '⌨️ 需你在页面手填';
  if (f.value.source === 'missing') return '⚠️ 画像缺失，请补填';
  if (f.kind === 'file') return '📎 ' + (state.resume?.name ?? '附件');
  const t = f.value.text ?? '';
  if (!t) return '（待生成）';
  return esc(t.length > 24 ? t.slice(0, 24) + '…' : t);
}

function renderFields(): void {
  const tbody = $<HTMLTableElement>('fields').querySelector('tbody')!;
  tbody.innerHTML = '';
  const pf = new Map<string, PlanField>((state.plan?.pages[0]?.fields ?? []).map((f) => [f.fieldId, f]));
  for (const f of state.fields) {
    const p = pf.get(f.fieldId);
    const tr = document.createElement('tr');
    if (p) tr.className = confClass(p.confidence, p.value.source);
    const star = f.required ? ' <span class="req">*</span>' : '';
    tr.innerHTML = `<td>${esc(f.label || f.fieldId)}${star}</td><td>${f.kind}</td><td>${p?.value?.source ?? '-'}</td><td>${p ? Math.round(p.confidence * 100) + '%' : '-'}</td><td>${p ? valuePreview(p) : '-'}</td><td id="st-${f.fieldId}">${p?.status ?? '待计划'}</td>`;
    tbody.appendChild(tr);
  }
}

/* ---------- 开放题审阅 ---------- */
function renderReview(): void {
  const box = $<HTMLDivElement>('review');
  const gen = (state.plan?.pages[0]?.fields ?? []).filter((f) => f.value.source === 'generated');
  const userFields = (state.plan?.pages[0]?.fields ?? []).filter((f) => f.value.source === 'user');
  let html = '';
  if (userFields.length > 0) {
    html += `<div class="hint">⌨️ 以下字段需你<b>直接在页面中填写</b>（敏感/主观项不由 AI 代答）：${userFields.map((f) => esc(f.label)).join('、')}</div>`;
  }
  if (gen.length > 0) {
    html += '<b>开放题回答（AI 生成，请核对/编辑后才会填入）</b>' +
      gen.map((f) => `<div class="item"><i>${esc(f.label)}</i><textarea data-gen="${f.fieldId}" rows="4">${esc(f.value.text ?? '')}</textarea></div>`).join('');
  }
  box.innerHTML = html;
}

function currentJd(): Record<string, unknown> {
  return {
    id: 'job-' + Date.now(), source: 'plugin', url: state.tabUrl ?? '', title: state.tabTitle ?? '目标岗位',
    company: state.tabUrl ? new URL(state.tabUrl).hostname : '', jdText: $<HTMLTextAreaElement>('jd-text').value || state.tabTitle || '',
    dedupHash: 'x', freshnessAt: new Date().toISOString(),
  };
}

async function planCurrentPage(): Promise<void> {
  setStatus(`第 ${state.pageIndex + 1} 页：生成计划与回答中…`);
  const res = await fetch(API() + '/fillplan', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ schema: state.fields, profile: state.profile, jd: currentJd() }),
  });
  if (!res.ok) throw new Error('fillplan_http_' + res.status);
  const data = await res.json();
  state.plan = data.plan;
  for (const f of state.plan!.pages[0]!.fields) {
    if (f.value.source === 'generated') {
      try {
        const g = await fetch(API() + '/generate', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ profile: state.profile, jd: currentJd(), question: f.label }),
        });
        if (g.ok) { const a = await g.json(); f.value.text = a.answer; log(`开放题「${f.label}」已生成（引用 ${a.resumeItemIds?.join(',') ?? '-'}）`); }
      } catch { log(`开放题「${f.label}」生成失败，请手填`); }
    }
    if (f.kind === 'file' && state.resume) { f.value.fileRef = 'resume:primary'; f.value.source = 'profile'; f.value.text = ''; }
  }
  renderFields();
  renderReview();
  $<HTMLButtonElement>('btn-execute').disabled = false;
  setStatus(`第 ${state.pageIndex + 1} 页计划就绪：核对下表（绿=自动 / 黄=待确认 / 红=缺失）与开放题回答，然后点「确认并填写」。`);
}

/* ---------- 消息处理 ---------- */
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'DETECT_RESULT') {
    setStatus(`适配器: ${msg.adapterId}（${msg.fingerprintId}）。提取字段中…`);
    log(`识别: ${msg.adapterId} / ${msg.fingerprintId}`);
  } else if (msg.type === 'EXTRACT_RESULT') {
    state.fields = msg.fields;
    state.pageIndex = msg.pageIndex ?? 0;
    state.ready = false;
    renderFields();
    $<HTMLButtonElement>('btn-plan').disabled = state.fields.length === 0;
    log(`第 ${state.pageIndex + 1} 页提取到 ${state.fields.length} 个字段`);
    if (state.pageIndex > 0 && state.profile) {
      void planCurrentPage().catch((e) => { setStatus('❌ ' + e.message); log('错误: ' + e.message); });
    }
  } else if (msg.type === 'PROGRESS') {
    const cell = document.getElementById(`st-${msg.result.fieldId}`);
    if (cell) cell.textContent = msg.result.status + (msg.result.error ? ` (${msg.result.error})` : '');
  } else if (msg.type === 'PLAN_DONE') {
    const ok = msg.report.results.filter((r: { status: string }) => r.status === 'filled').length;
    log(`本页填写：${ok}/${msg.report.results.length} 成功`);
  } else if (msg.type === 'READY_TO_SUBMIT') {
    state.ready = true;
    $<HTMLButtonElement>('btn-submit').disabled = false;
    $<HTMLButtonElement>('btn-submit').classList.add('pulse');
    setStatus('✅ 全部页面填写完成。请最后检查页面内容，然后点「3 确认提交」。');
    log('等待人工确认提交');
  } else if (msg.type === 'VERIFY_RESULT') {
    showVerify(msg.result, msg.passive === true);
  }
});

/* ---------- 主流程按钮 ---------- */
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
    log('已注入: ' + tab.url);
  } catch (e) { setStatus('❌ ' + (e as Error).message); log('错误: ' + (e as Error).message); }
});

$<HTMLButtonElement>('btn-plan').addEventListener('click', async () => {
  try { await planCurrentPage(); } catch (e) { setStatus('❌ ' + (e as Error).message); log('错误: ' + (e as Error).message); }
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
  $<HTMLButtonElement>('btn-submit').classList.remove('pulse');
  await chrome.runtime.sendMessage({ type: 'CONFIRM_SUBMIT', tabId: state.tabId, plan: state.plan });
  log('已按你的确认点击提交，校验中…');
});

/* ---------- 启动：恢复本地画像 + 恢复页面状态 ---------- */
(async () => {
  const saved = await chrome.storage.local.get(['profile', 'resume']);
  if (saved.profile) { state.profile = saved.profile as Profile; renderProfileForm(); }
  if (saved.resume) { state.resume = saved.resume as { name: string; type: string; dataB64: string }; renderResumeChip(); }
  if (state.profile) setStatus('已恢复本地画像。打开网申页后点「1 授权并识别」。');
  // 侧栏重开时恢复页面侧状态（含已发生的提交校验）
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      state.tabId = tab.id; state.tabUrl = tab.url; state.tabTitle = tab.title;
      const st = await chrome.tabs.sendMessage(tab.id, { type: 'GET_STATE' }).catch(() => null);
      if (st?.injected) {
        log('已恢复页面状态（第 ' + ((st.pageIndex ?? 0) + 1) + ' 页）');
        if (st.lastVerify) showVerify(st.lastVerify);
        if (st.ready) { state.ready = true; $<HTMLButtonElement>('btn-submit').disabled = false; }
      }
    }
  } catch { /* 页面未注入，忽略 */ }
})();
