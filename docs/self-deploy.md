# 本地自助部署指南

面向最终用户：不需要服务器、域名、HTTPS。所有数据留在本机。

## 1. 安装 Node.js
- 下载 https://nodejs.org/ （LTS，≥20），一路下一步。
- 验证：终端执行 `node -v`。

## 2. 获取代码
```bash
git clone https://github.com/<your-name>/offerpilot.git
cd offerpilot
```
（或下载仓库 ZIP 解压。）

## 3. 启动
```bash
npm start
```
首次运行自动安装依赖并构建（1-2 分钟），然后提示输入 API Key。

### 获取 DeepSeek Key（推荐）
1. 打开 https://platform.deepseek.com → 注册/登录
2. 左侧「API Keys」→ 创建 → 复制（sk- 开头）
3. 粘贴到启动脚本的提示中（回车跳过 = 离线演示模式）
4. Key 保存在 `services/api/.env`，仅本机可见

### 换其他模型
编辑 `services/api/.env`：
```
# 阿里 DashScope
LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
LLM_SMALL=qwen-flash
LLM_LARGE=qwen-plus
# 或本地 Ollama（完全离线，免费）
LLM_BASE_URL=http://127.0.0.1:11434/v1
LLM_SMALL=qwen2.5:7b
LLM_LARGE=qwen2.5:7b
LLM_API_KEY=ollama
```
改完重启 `npm start`。

## 4. 加载插件
1. Chrome/Edge 打开 `chrome://extensions`
2. 右上角「开发者模式」
3. 「加载已解压的扩展程序」→ 选 `offerpilot/apps/extension/dist`
4. 工具栏出现 OfferPilot 图标（点它打开侧栏）

## 5. 使用
- 演示页：http://127.0.0.1:5173/
- 真实网申页：打开目标公司招聘官网的申请页 → 侧栏「1 授权并识别」→ 后续步骤
- 页面右下角徽标显示实时状态；字段高亮：绿=已填 / 黄=待确认 / 红=缺失

## 更新代码后
```bash
git pull
npm start        # 自动重新构建
```
然后 `chrome://extensions` 点插件的 🔄 重新加载，刷新网申页。

## 故障排查

| 现象 | 处理 |
|---|---|
| `npm start` 报 pnpm 错误 | 手动 `npm install -g pnpm` 后重试 |
| 端口 8787/5173 被占用 | 已有实例在运行：直接用；或关闭旧终端窗口再启动 |
| 侧栏上传简历失败 | 确认 API 在运行（浏览器开 http://127.0.0.1:8787/health）；确认勾选同意项 |
| 解析报 empty_text | 扫描件 PDF 不支持，换文本版 PDF/Word |
| 页面右下角无徽标 | 先在侧栏点一次「1 授权并识别」完成注入；之后刷新会自动注入 |
| 字段填错/没填 | 黄/红字段人工核对补填；把现象反馈给项目（issue） |
| AI 回答质量差 | `.env` 把 LLM_LARGE 换成更强模型（如 deepseek-v4-pro / qwen-plus） |
| 提交后显示"未确认" | 去邮箱/招聘官网个人中心核实；不要重复提交 |

## 安全提醒
- 不要把 `.env` 发给任何人或提交到仓库（已 gitignore）
- 在聊天/截图中分享过 Key 的话，去平台重置
- 插件请求"所有站点"权限为内测便利；正式版将改为按站点授权
- 本项目不代管任何招聘平台账号；所有提交由你本人确认
