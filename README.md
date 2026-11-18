# OfferPilot · 职航

**人机协同的 AI 求职 Copilot**：简历解析 → 岗位匹配 → 定向回答 → 网申自动填写 → **人工确认提交** → 提交校验。

> 不是海投机器人。每一份投递都由你确认；敏感/主观问题（薪资、签证等）永远由你本人回答；AI 只基于你的真实经历写作，不编造。

**本地优先，无需服务器/域名**：克隆仓库 → 一条命令启动 → 加载浏览器插件即可使用。你的简历和 Key 只留在自己电脑上。

---

## 🚀 快速开始（3 步）

**准备**：[Node.js](https://nodejs.org/) 20+（含 npm）。AI 模型 Key 可选（推荐 [DeepSeek](https://platform.deepseek.com)，便宜；没有 Key 也能跑离线演示模式）。

```bash
git clone https://github.com/<your-name>/offerpilot.git
cd offerpilot
npm start
```

`npm start` 会自动：安装 pnpm（如缺失）→ 安装依赖 → 构建 → 引导你填 API Key（首次）→ 启动服务。

然后：
1. Chrome 打开 `chrome://extensions` → 开启「开发者模式」
2. 「加载已解压的扩展程序」→ 选择 `offerpilot/apps/extension/dist`
3. 打开 http://127.0.0.1:5173/ （内置演示网申页）→ 点工具栏 OfferPilot 图标
4. 上传简历 → **1 授权并识别** → **2 生成计划与回答** → 审阅 → **确认并填写** → **3 确认提交**

页面右下角有悬浮徽标实时显示进度；填过的字段会高亮（绿=已填 / 黄=待确认 / 红=缺失）。

Windows / macOS / Linux 通用。macOS/Linux 也可 `./start.sh`。详见 [docs/self-deploy.md](docs/self-deploy.md)。

## ✨ 功能

- **简历解析**：PDF/Word → 结构化画像，可视化核对编辑，本地保存
- **网申自动填写**：通用 LLM-DOM 引擎，适配 React 受控组件 / combobox / 文件上传 / 多页表单
- **定向开放题回答**：基于你的真实经历 + 目标岗位 JD 生成，**审阅编辑后才填入**，带溯源
- **附件上传**：自动上传你的简历文件到网申附件栏
- **提交校验**：多证据验证是否真正提交成功（反"草稿幻觉"）；即使你直接点页面提交按钮也能监测到
- **安全护栏**：knockout 问题禁代答 / 敏感字段不出本机 / 永不自动提交 / 遥测白名单

## 🔒 隐私与数据

```
你的浏览器 ── 画像/简历字节存本地(chrome.storage) ── 插件不接触任何 Key
     │ 仅发送：脱敏画像文本 + 字段schema + JD
     ▼
本机 API (127.0.0.1:8787) ── 简历原文件仅内存处理、即刻丢弃、不落盘
     │ 你配置的 LLM 端点（默认 DeepSeek 官方）
     ▼
   AI 模型
```

- 无账号、无云端数据库、无遥测上传（内测版事件仅存本机内存）
- API Key 存 `services/api/.env`（已 gitignore，**不会进入仓库**）
- 本地部署 = 除你自行配置的 LLM API 外，数据不出本机

## 💰 成本

自带 Key，按量付费。DeepSeek-flash 参考价：输入 ¥1-2/百万 tokens、输出 ¥4-8/百万。一次网申填写约 ¥0.02-0.1。无 Key 时离线演示模式免费（启发式映射，无 AI 生成）。

## ❓ FAQ

- **需要域名/服务器/HTTPS 吗？** 不需要。localhost 天然豁免 HTTPS 要求。
- **可以换模型吗？** 可以。任何 OpenAI 兼容端点：改 `.env` 的 `LLM_BASE_URL/LLM_SMALL/LLM_LARGE`（DashScope、GLM、本地 Ollama 均可）。
- **端口被占用？** 8787(API)/5173(演示页)。关闭旧进程或改 `PORT`/`DEMO_PORT` 环境变量。
- **扫描件 PDF？** 暂不支持，请用文本版 PDF/Word。
- **真实招聘网站能用吗？** 通用引擎可尝试任意网申页，但真实站点适配仍在打磨（见 Roadmap）；黄/红字段务必人工核对。

## 🛠 开发者

```bash
pnpm install && pnpm build && pnpm test   # 63 个测试
pnpm typecheck                            # strict TS
```

Monorepo：`packages/core`(契约) / `executor`(执行引擎) / `adapters`(适配器) / `llm`(网关) / `services/api` / `apps/extension`。
设计文档：见仓库根目录《求职Agent可行性调研报告》《产品设计方案》《技术实现方案》（中文）。

## 🗺 Roadmap

- [x] 通用填写引擎 + 简历解析 + 开放题生成 + 提交校验 + 页内反馈
- [ ] 真实站点标杆打磨（百度/美团等，字段准确率 ≥95% 门禁）
- [ ] 飞书招聘 / Moka 专用适配器
- [ ] 岗位聚合匹配 + 投递看板 + 跟进提醒
- [ ] 模拟面试 + 结果数据飞轮

## License

[MIT](LICENSE)
