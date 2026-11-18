# 封闭内测部署指南（v0.2-beta）

## 架构现实
- 插件（用户浏览器）→ API（你部署的服务）→ DeepSeek。
- **API Key 只存在服务端**，插件永远不接触。
- 简历原文件只在 API 内存中处理，请求结束即丢弃，不落盘；LLM 只接收文本；敏感字段双重剔除（提示词约束 + stripSensitive）。
- 用户画像/简历字节存在用户浏览器本地（chrome.storage.local），服务端无账号体系（内测期单用户本地画像）。

## 部署（任选其一）

### A. Docker（推荐，一台 2C4G 云主机即可）
```bash
docker build -t offerpilot-api .
docker run -d --name offerpilot-api -p 8787:8787 \
  -e LLM_API_KEY=<你的Key> \
  -e LLM_BASE_URL=https://api.deepseek.com \
  -e LLM_SMALL=deepseek-flash -e LLM_LARGE=deepseek-flash \
  offerpilot-api
```

### B. 直接 Node
```bash
pnpm install && pnpm build
LLM_API_KEY=<Key> pnpm --filter @offerpilot/api start
```

### HTTPS（必须）
插件侧栏 fetch 需要 HTTPS 端点（localhost 除外）。用 Caddy 一行反代：
```
api.yourdomain.com {
  reverse_proxy 127.0.0.1:8787
}
```
或 nginx + certbot。内测期也可用 cloudflared tunnel 临时暴露。

## 分发给内测用户
1. `pnpm --filter @offerpilot/extension build` → 压缩 `apps/extension/dist` 发给用户。
2. 用户：chrome://extensions → 开发者模式 → 加载已解压的扩展程序。
3. 侧栏 API 地址改为你的 HTTPS 端点。
4. 上传简历 → 勾选同意 → 解析 → 核对保存 → 打开网申页 → 1 识别 / 2 计划 / 确认并填写 / 3 确认提交。

## 内测期已知限制（务必告知用户）
- 真实站点字段准确率尚未达标验证（W2 打磨中）；黄/红字段必须人工核对。
- 开放题回答为 AI 生成，**必须人工审阅编辑后才会填入**。
- 提交永远人工点击；提交后请留意"已验证/未确认"提示，未确认时去邮箱/状态页核实。
- 扫描件 PDF 暂不支持（请用文本版 PDF/Word）。
- 多页表单自动推进上限 6 页；复杂定制组件可能需手动补填。

## 安全清单
- [ ] Key 仅在服务端环境变量；仓库无 .env（已 gitignore）
- [ ] HTTPS 端点
- [ ] 告知用户解析同意项含义
- [ ] 建议内测结束后轮换 Key
