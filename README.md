# OfferPilot · 职航

人机协同求职 Copilot —— 网申自动填写，**提交永远由人确认**。
本仓库是《求职Agent技术实现方案.md》§17 第一批任务的落地：契约 → 夹具 → 执行 → 模型 最小闭环。

## 仓库结构

```
packages/core       共享契约（Zod）：FillPlan/SelectorStrategy/Adapter协议/状态机/注册中心/消息/遥测白名单
packages/executor   通用执行引擎：native setter(React受控)/DataTransfer文件上传/combobox/多页状态机/提交校验
packages/adapters   通用 LLM-DOM 适配器：字段提取 + schema→画像映射 + knockout 保护
packages/llm        LLM 网关：分层路由/JSON Schema+Zod校验/重试反馈/降级/缓存/月度预算；OpenAI兼容供应商+Mock
services/api        Fastify：/health /registry(Ed25519签名) /registry/key /fillplan /events(白名单)
apps/extension      MV3 插件（WXT 前的最小实现）：background/content/sidepanel + 演示网申页
```

## 快速开始

```bash
pnpm install
pnpm build        # 拓扑序构建全部包
pnpm test         # 59 个测试（core 18 / llm 10 / executor 21 / adapters 6 / api 4）
pnpm typecheck    # strict + noUncheckedIndexedAccess

# 启动 API（无 DASHSCOPE_API_KEY 时自动进入离线 mock 模式，全链路可跑）
pnpm --filter @offerpilot/api start          # :8787

# 启动演示网申页（React 受控组件语义模拟 + combobox + 上传 + 多页 + 提交成功页）
pnpm demo                                     # http://127.0.0.1:5173/

# 加载插件：Chrome → chrome://extensions → 开发者模式 → 加载已解压的扩展程序
#   选择 apps/extension/dist
# 打开 http://127.0.0.1:5173/ → 点插件图标打开侧栏 →
#   1 授权并识别 → 2 生成计划并填写 → 检查黄/红字段 → 3 确认提交 → ✅ 已验证提交成功
```

接入真实 LLM（已验证 DeepSeek）：复制 `services/api/.env.example` 为 `services/api/.env` 填入 Key：

```
LLM_API_KEY=<你的Key>
LLM_BASE_URL=https://api.deepseek.com
LLM_SMALL=deepseek-flash      # 抽取/映射档
LLM_LARGE=deepseek-flash      # 生成档；要更高质量可改 deepseek-v4-pro
```

`pnpm --filter @offerpilot/api start` 自动加载 .env（Node --env-file-if-exists）。
无 Key 时自动进入离线 mock 模式。兼容任何 OpenAI 格式端点（DashScope/GLM 等改 BASE_URL+模型名即可）。
实测：deepseek-flash 7 字段映射 ~6s，姓名/学校/专业/城市正确映射，薪资→user、开放题→generated、内推码→missing。

## 已实现的安全护栏（测试覆盖）

- **反草稿幻觉**：提交后多证据校验（URL/成功文案/表单消失），≥2 项才记 verified；状态机禁止 submitted 跳过 verified。
- **knockout 禁代答**：薪资/签证/竞业等字段一律 source=user，AI 不代填。
- **敏感数据不出浏览器**：上传前 stripSensitive 深度剔除 + findSensitivePaths 扫描；API 冒烟验证响应无手机号泄漏。
- **遥测白名单**：/events 只接受白名单事件名，props 仅标量。
- **注册中心签名**：Ed25519 签名下发，篡改即验签失败；killSwitch 可分钟级下线适配器。
- **永不自动提交**：执行引擎只填表，submit 由 sidepanel「确认提交」人工触发。

## 关键测试场景

- naive `el.value=x` 被 React 受控状态回滚 vs native setter+tracker 复位存活（executor/native.test）
- DataTransfer 文件上传 + dropzone 兜底（executor/file.test）
- combobox search→等选项→点击→选中确认；选项不存在抛 option_not_found（executor/combobox.test）
- 多页表单推进 + 两页字段填写（executor/execute.test）
- 指纹判定：zhiye.com 租户子域 / mokahr 标准路径与短链 / channelToken / killSwitch / generic 兜底（core/registry.test）
- 结构化调用：非法 JSON 重试带错误反馈 / Zod 校验失败重试 / 降级供应商 / 缓存命中 / 预算超限（llm/structured.test）
- API：签名验签+篡改检测 / fillplan 映射+knockout+敏感剔除 / events 白名单 400（api/api.test）

## 下一步（按技术方案排期）

- W2：百度/美团真实站点标杆打磨 + 夹具录制（当前夹具为语义模拟，需补真实 DOM 快照）
- W3-4：飞书 jobs.feishu.cn / Moka app.mokahr.com 专用适配器（Moka 上传简历借平台解析路径）
- 匹配管线（pgvector + LLM 复核）、定向简历管线（事实护栏 + PDF 渲染）、投递看板
- 插件迁移 WXT + React sidepanel；公钥内置固定（当前 dev 从 /registry/key 获取）
- Prisma 迁移落库（schema 已备：services/api/prisma/schema.prisma）

## 已知限制（dev 阶段）

- sidepanel 为原生 TS 最小实现（非 React）；权限请求为开发便利一次性申请全部站点
- content.js 未做 tree-shaking 优化（~800kb，含 zod）
- LLM 离线模式为启发式 mock，仅用于链路验证
- 演示页为受控组件语义模拟，非真实 React 运行时（真实站点验证在 W2）

