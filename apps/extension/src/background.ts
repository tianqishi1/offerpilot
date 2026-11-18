import type { Registry } from '@offerpilot/core';

const API_BASE = 'http://127.0.0.1:8787';
let registry: Registry | null = null;

async function syncRegistry(): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/registry`);
    const signed = await res.json();
    // dev：从 /registry/key 取公钥验签；生产应内置固定公钥。
    const keyRes = await fetch(`${API_BASE}/registry/key`);
    const { publicKeyPem } = await keyRes.json();
    const ok = await verifyEd25519(publicKeyPem, signed.payload, signed.signature);
    if (!ok) throw new Error('registry_signature_invalid');
    registry = signed.payload as Registry;
    await chrome.storage.local.set({ registry, registryVersion: registry.version });
    console.log('[offerpilot] registry synced', registry.version);
  } catch (e) {
    console.warn('[offerpilot] registry sync failed', e);
    const cached = await chrome.storage.local.get('registry');
    registry = (cached.registry as Registry) ?? null;
  }
}

async function verifyEd25519(pem: string, payload: unknown, sigB64: string): Promise<boolean> {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('spki', der, { name: 'Ed25519' }, false, ['verify']);
  const sig = Uint8Array.from(atob(sigB64), (c) => c.charCodeAt(0));
  return crypto.subtle.verify('Ed25519', key, sig, new TextEncoder().encode(JSON.stringify(payload)));
}

chrome.runtime.onInstalled.addListener(() => { void syncRegistry(); });
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
chrome.runtime.onStartup.addListener(() => { void syncRegistry(); });

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // 只处理路由类消息；广播类消息（PROGRESS/VERIFY_RESULT 等）不占用应答通道
  if (!['ENABLE_TAB', 'EXECUTE_PLAN', 'CONFIRM_SUBMIT', 'GET_REGISTRY'].includes(msg.type)) return false;
  (async () => {
    if (msg.type === 'ENABLE_TAB') {
      if (!registry) await syncRegistry();
      const origin = new URL(msg.url as string).origin + '/*';
      const id = 'offerpilot-' + new URL(msg.url as string).hostname.replace(/\W/g, '-');
      try {
        await chrome.scripting.registerContentScripts([{ id, matches: [origin], js: ['content.js'], runAt: 'document_idle' }]);
      } catch {
        await chrome.scripting.updateContentScripts([{ id, matches: [origin], js: ['content.js'], runAt: 'document_idle' }]).catch(() => {});
      }
      // 已打开的页面不会自动注入，需立即 executeScript（content 侧有防重复注入守卫）
      await chrome.scripting.executeScript({ target: { tabId: msg.tabId as number }, files: ['content.js'] }).catch(() => {});
      await chrome.tabs.sendMessage(msg.tabId as number, { type: 'INIT', registry });
      sendResponse({ ok: true });
    } else if (msg.type === 'EXECUTE_PLAN' || msg.type === 'CONFIRM_SUBMIT') {
      await chrome.tabs.sendMessage(msg.tabId as number, msg);
      sendResponse({ ok: true });
    } else if (msg.type === 'GET_REGISTRY') {
      sendResponse({ registry });
    }
  })().catch((e) => sendResponse({ ok: false, error: (e as Error).message }));
  return true;
});


