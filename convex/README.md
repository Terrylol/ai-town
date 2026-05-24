# Convex 后端目录

这个目录存放 AI Town 的 Convex 后端代码，包括数据库 schema、query、mutation、action、调度任务、游戏引擎和 Agent 逻辑。

主要入口：

- `schema.ts`：组合项目的所有 Convex 数据表定义。
- `world.ts`：前端使用的 world 查询和控制接口。
- `init.ts`：初始化默认地图、角色和 world。
- `crons.ts`：定时任务配置。
- `http.ts`：Convex HTTP 路由入口。
- `aiTown/`：AI Town 具体游戏规则、输入处理、玩家移动、对话和 Agent tick。
- `engine/`：通用模拟引擎、输入队列、历史值压缩和相关测试。
- `agent/`：Agent 对话、记忆、embedding 缓存和 prompt 逻辑。
- `util/llm.ts`：OpenAI-compatible chat/embedding API 接入。

常用命令请看根目录 [README](../README.md)。架构说明见 [doc/architecture.md](../doc/architecture.md)，数据表速查见 [doc/data-tables.md](../doc/data-tables.md)。
