#!/usr/bin/env node
/**
 * OfferPilot 一键本地启动（跨平台）：
 *   检查 Node → 确保 pnpm → 安装依赖 → 构建 → 首次运行引导填 Key → 启动 API + 演示页
 * 用法：node scripts/start.mjs （或双击 start.bat / 运行 ./start.sh）
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import readline from 'node:readline/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const isWin = process.platform === 'win32';

function run(cmd, args, opts = {}) {
  return spawnSync([cmd, ...args].join(' '), { stdio: 'inherit', shell: true, ...opts });
}
function ok(cmd, args) {
  const r = spawnSync([cmd, ...args].join(' '), { shell: true, encoding: 'utf8' });
  return r.status === 0;
}
function portInUse(port) {
  return new Promise((res) => {
    const s = net.connect(port, '127.0.0.1');
    s.on('connect', () => { s.destroy(); res(true); });
    s.on('error', () => res(false));
  });
}

console.log('🧭 OfferPilot · 职航 — 本地一键启动\n');

const major = Number(process.versions.node.split('.')[0]);
if (major < 20) { console.error('❌ 需要 Node.js >= 20，当前 ' + process.versions.node); process.exit(1); }
console.log('✓ Node ' + process.versions.node);

if (!ok('pnpm', ['-v'])) {
  console.log('… 未检测到 pnpm，尝试 corepack 启用');
  run('corepack', ['enable']);
  run('corepack', ['prepare', 'pnpm@11.22.0', '--activate']);
  if (!ok('pnpm', ['-v'])) {
    console.log('… corepack 不可用，尝试 npm 全局安装 pnpm');
    run('npm', ['install', '-g', 'pnpm']);
  }
  if (!ok('pnpm', ['-v'])) { console.error('❌ pnpm 安装失败，请手动执行 npm install -g pnpm 后重试'); process.exit(1); }
}
console.log('✓ pnpm 就绪');

if (!existsSync('node_modules')) {
  console.log('… 首次运行：安装依赖（约 1-2 分钟）');
  if (run('pnpm', ['install']).status !== 0) process.exit(1);
}
console.log('✓ 依赖就绪');

if (!existsSync('services/api/dist/index.js') || !existsSync('apps/extension/dist/manifest.json')) {
  console.log('… 构建全部包');
  if (run('pnpm', ['build']).status !== 0) process.exit(1);
}
console.log('✓ 构建就绪');

const envPath = 'services/api/.env';
if (!existsSync(envPath)) {
  console.log('\n── 配置 AI 模型 ──');
  console.log('推荐 DeepSeek（便宜）：https://platform.deepseek.com 注册 → API Keys → 创建');
  console.log('也兼容任何 OpenAI 格式端点（DashScope/GLM/本地 Ollama 等），改 .env 即可。');
  let key = '';
  if (process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    key = (await rl.question('粘贴你的 API Key（直接回车 = 离线演示模式）: ')).trim();
    rl.close();
  }
  writeFileSync(envPath, [
    'LLM_API_KEY=' + key,
    'LLM_BASE_URL=https://api.deepseek.com',
    'LLM_SMALL=deepseek-flash',
    'LLM_LARGE=deepseek-flash',
    'LLM_TIMEOUT_MS=90000',
    '',
  ].join('\n'));
  console.log(key ? '✓ Key 已写入 services/api/.env（仅存本机，已被 gitignore）' : '✓ 离线演示模式（字段映射为启发式，无 AI 生成）');
}

if (await portInUse(8787) || await portInUse(5173)) {
  console.log('\n⚠️ 端口 8787/5173 已被占用——服务可能已在运行。');
  console.log('   直接刷新演示页/重载插件即可；如需重启，请先关闭旧进程再运行本脚本。');
  process.exit(0);
}

console.log('\n🚀 启动中…\n');
const api = spawn(process.execPath, ['--env-file-if-exists=.env', 'dist/index.js'], { cwd: 'services/api', stdio: 'inherit' });
const demo = spawn(process.execPath, ['scripts/demo-server.mjs'], { stdio: 'inherit' });
const shutdown = () => { api.kill(); demo.kill(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
api.on('exit', (c) => { if (c !== 0 && c !== null) { console.error('API 退出码 ' + c); shutdown(); } });

setTimeout(() => {
  console.log('\n────────────────────────────────────────────');
  console.log('✅ 服务已启动：');
  console.log('   API      http://127.0.0.1:8787');
  console.log('   演示网申页 http://127.0.0.1:5173/');
  console.log('\n📌 下一步（仅首次）：');
  console.log('   1. Chrome 打开 chrome://extensions → 开发者模式');
  console.log('   2. 「加载已解压的扩展程序」→ 选择本目录下的 apps/extension/dist');
  console.log('   3. 打开 http://127.0.0.1:5173/ → 点工具栏 OfferPilot 图标');
  console.log('   4. 上传简历 → 1 授权并识别 → 2 生成计划 → 确认并填写 → 3 确认提交');
  console.log('\n   关闭本窗口即停止服务。数据仅存本机；Key 在 services/api/.env。');
  console.log('────────────────────────────────────────────\n');
}, 1500);


