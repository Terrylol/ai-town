# AI Town 中文版

AI Town 是一个可部署、可定制的 AI 小镇模拟项目。玩家可以在像素小镇里观察多个 AI 角色移动、相遇、聊天，并让角色在对话结束后形成记忆。

这个 fork 已经做了几项本地化和接入改造：

- 角色名、人设、对话 prompt、记忆总结 prompt 已中文化。
- 支持聊天模型和 embedding 模型使用不同的 OpenAI-compatible endpoint。
- 支持完整 endpoint 覆盖，例如没有 `/v1` 前缀的聊天接口。
- embedding 维度按当前接入服务配置为 `3072`。
- 防止 LLM 偶发空回复写入空消息。

## 文档

- [技术解析](./doc/technical-analysis.md)：项目功能、架构、模拟循环、Agent 行为、LLM/embedding 接入、数据模型和扩展点。
- [原始架构说明](./ARCHITECTURE.md)：上游项目的英文架构文档。

## 技术栈

- 前端：React、Vite、PixiJS、Tailwind CSS
- 后端：Convex functions、Convex database、Convex scheduler、Convex vector search
- 模拟引擎：自定义 TypeScript game loop，运行在 Convex action/mutation 上
- LLM：OpenAI-compatible chat completion API
- 记忆检索：embedding + Convex vector index

## 目录结构

```text
src/                 前端界面和 PixiJS 游戏渲染
convex/              Convex 后端函数、schema、游戏引擎、Agent 逻辑
convex/aiTown/       AI Town 具体游戏规则
convex/agent/        对话 prompt、记忆、embedding 缓存
convex/engine/       通用模拟引擎
data/                角色、人设、地图数据、spritesheet 描述
public/assets/       前端静态资源
doc/                 中文项目文档
```

## 推荐启动方式：本地自托管 Convex

为了避免 Convex 云端容量限制，推荐把 Convex backend 跑在本机 Docker 里，前端继续用本机 Vite 开发服务器。

本地服务：

- 前端：`http://localhost:5173/ai-town`
- Convex backend：`http://localhost:3210`
- Convex dashboard：`http://localhost:6791`

### 首次配置

安装依赖：

```bash
npm install
```

创建 Docker 环境文件：

```bash
cp .env.docker.example .env.docker
```

编辑 `.env.docker`：

- 填入 `LLM_CHAT_*` 和 `LLM_EMBEDDING_*` 配置。
- 设置 `INSTANCE_SECRET`，必须是 hex 字符串，可用 `openssl rand -hex 32` 生成。

启动本地 Convex backend 和 dashboard：

```bash
docker compose --env-file .env.docker up -d backend dashboard
```

生成本地 Convex admin key：

```bash
docker compose --env-file .env.docker exec backend ./generate_admin_key.sh
```

把输出的 key 填回 `.env.docker` 的 `CONVEX_SELF_HOSTED_ADMIN_KEY`，并创建 CLI 专用文件 `.env.selfhost.local`：

```bash
cp .env.selfhost.example .env.selfhost.local
```

然后把 admin key 填入 `.env.selfhost.local`。

`.env.selfhost.local` 和 `.env.docker` 都已被 `.gitignore` 忽略，不要提交。

把 Convex functions 部署到本地 backend，并初始化默认 world：

```bash
npx convex dev --env-file .env.selfhost.local --run init --once
```

创建前端环境文件，并确认 `.env.local` 指向本地 Convex：

```bash
cp .env.example .env.local
```

启动前端：

```bash
npm run dev:frontend -- --host 0.0.0.0
```

### 日常启动

```bash
docker compose --env-file .env.docker up -d backend dashboard
npm run dev:frontend -- --host 0.0.0.0
```

### 后端代码改动后

如果修改了 `convex/` 下的后端函数、schema 或 Agent 逻辑，重新部署到本地 Convex：

```bash
npx convex dev --env-file .env.selfhost.local --once
```

如果需要重置数据并重新初始化：

```bash
npx convex run --env-file .env.selfhost.local testing:wipeAllTablesForDev
npx convex run --env-file .env.selfhost.local init
```

## 可选：使用 Convex 云端开发

安装依赖：

```bash
npm install
```

启动前端和 Convex 后端开发模式：

```bash
npm run dev
```

也可以分开启动：

```bash
npm run dev:frontend
npm run dev:backend
```

默认前端地址：

```text
http://localhost:5173/ai-town
```

如果你已经绑定远程 Convex，前端会从 `.env.local` 读取：

```env
VITE_CONVEX_URL=https://your-deployment.convex.cloud
```

## 云端部署初始化

如果使用 Convex 云端，首次部署或重置数据后运行：

```bash
npx convex run init
```

这个函数会创建默认 world、map、engine，并提交 `createAgent` 输入来生成默认 AI 角色。

如果修改了角色数据、人设、地图或 embedding 维度，建议重置数据后重新初始化。当前 fork 提供了 dev 清理命令：

```bash
npx convex run testing:wipeAllTablesForDev
npx convex run init
```

注意：清理命令会删除当前 Convex deployment 中的游戏数据，请只在开发环境使用。本地自托管时请使用前文带 `--env-file .env.selfhost.local` 的命令。

## LLM 配置

LLM 运行时配置存放在 Convex 环境变量中，而不是 `.env.local`。`.env.local` 只负责让前端知道要连接哪个 Convex deployment。

当前代码的配置入口在：

```text
convex/util/llm.ts
```

支持的自定义环境变量：

```bash
npx convex env set LLM_CHAT_API_URL 'https://chat-api-host'
npx convex env set LLM_CHAT_COMPLETIONS_URL 'https://chat-api-host/chat/completions'
npx convex env set LLM_CHAT_API_KEY 'your-chat-key'
npx convex env set LLM_MODEL 'your-chat-model'

npx convex env set LLM_EMBEDDING_API_URL 'https://embedding-api-host'
npx convex env set LLM_EMBEDDINGS_URL 'https://embedding-api-host/v1/embeddings'
npx convex env set LLM_EMBEDDING_API_KEY 'your-embedding-key'
npx convex env set LLM_EMBEDDING_MODEL 'your-embedding-model'
```

本地自托管时，给上述命令加上 `--env-file .env.selfhost.local`，例如：

```bash
npx convex env --env-file .env.selfhost.local set LLM_MODEL 'your-chat-model'
```

如果你的服务符合标准 OpenAI 路径，可以只设置 base URL；如果服务路径不是标准 `/v1/chat/completions` 或 `/v1/embeddings`，请设置完整 URL：

```bash
npx convex env set LLM_CHAT_COMPLETIONS_URL 'https://example.com/custom/chat/completions'
npx convex env set LLM_EMBEDDINGS_URL 'https://example.com/custom/embeddings'
```

embedding 维度必须和 `convex/util/llm.ts` 里的 `EMBEDDING_DIMENSION` 一致，否则 Convex vector index 会报错。

## 常用命令

构建检查：

```bash
npm run build
```

查看 Convex 日志：

```bash
npx convex logs --env-file .env.selfhost.local --history 80
```

查看 Convex 环境变量：

```bash
npx convex env --env-file .env.selfhost.local list
```

停止模拟引擎：

```bash
npx convex run --env-file .env.selfhost.local testing:stop
```

恢复模拟引擎：

```bash
npx convex run --env-file .env.selfhost.local testing:resume
```

清理空消息：

```bash
npx convex run --env-file .env.selfhost.local testing:deleteEmptyMessagesForDev
```

## 自动暂停机制

前端会定期向后端发送 heartbeat。若 world 超过 5 分钟没有被页面观看，后端 cron 会把 world 标记为 `inactive` 并停止 engine。重新打开页面后，heartbeat 会自动恢复 world。

相关文件：

- `src/hooks/useWorldHeartbeat.ts`
- `convex/world.ts`
- `convex/crons.ts`
- `convex/constants.ts`

## 授权与来源

本项目基于 AI Town starter kit 改造，灵感来自论文 [Generative Agents: Interactive Simulacra of Human Behavior](https://arxiv.org/pdf/2304.03442.pdf)。

主要依赖和素材来源包括 Convex、PixiJS、OpenGameArt、ansimuz、Mounir Tohami 等。完整授权信息请参考 [LICENSE](./LICENSE) 和上游项目说明。
