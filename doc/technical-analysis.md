# AI Town 技术解析

这份文档面向想要继续改造项目的人，解释当前 AI Town 的功能、主要模块、数据流和重要实现点。

## 1. 项目功能

AI Town 是一个多 Agent 像素小镇模拟系统。当前功能包括：

- AI 角色在地图上移动、活动和寻找对话对象。
- 两个角色靠近后进入对话状态。
- Agent 调用 LLM 生成开场、续聊和告别消息。
- 对话结束后，Agent 会总结记忆、计算重要性、生成 embedding，并写入向量索引。
- 前端通过 PixiJS 渲染地图、角色、移动动画和聊天面板。
- World 支持无人观看自动暂停，页面重新打开后自动恢复。
- 远程 Convex 保存所有世界状态、消息、记忆和输入队列。

当前 fork 已经将角色、人设、对话 prompt 和记忆 prompt 中文化，并支持 chat 和 embedding 使用不同 API endpoint。

## 2. 总体架构

项目可以分成四层：

```text
React/PixiJS 前端
  -> Convex queries/mutations
  -> AI Town 游戏规则层
  -> 通用模拟引擎 + Agent 异步操作
```

主要目录：

```text
src/                 前端
convex/world.ts      前端可调用的 world 查询和 mutation
convex/aiTown/       AI Town 游戏规则
convex/engine/       通用引擎
convex/agent/        LLM 对话和记忆
convex/util/llm.ts   LLM/embedding 接入
data/characters.ts   角色定义
data/gentle.js       默认地图数据
```

## 3. 前端渲染

前端入口：

- `src/main.tsx`
- `src/App.tsx`
- `src/components/Game.tsx`

`Game` 组件会：

- 查询默认 world：`api.world.defaultWorldStatus`
- 查询 world state：`api.world.worldState`
- 查询地图和角色描述：`api.world.gameDescriptions`
- 发送 heartbeat：`useWorldHeartbeat`
- 用 `Stage` 和 `PixiGame` 渲染地图与角色
- 在右侧面板显示角色详情和聊天记录

地图和角色渲染主要在：

- `src/components/PixiGame.tsx`
- `src/components/PixiStaticMap.tsx`
- `src/components/Character.tsx`
- `src/components/Player.tsx`

聊天 UI 在：

- `src/components/Messages.tsx`
- `src/components/MessageInput.tsx`

## 4. Convex 数据模型

主 schema 在 `convex/schema.ts`，由三部分组成：

- `convex/engine/schema.ts`
- `convex/aiTown/schema.ts`
- `convex/agent/schema.ts`

重要表：

```text
worlds                  当前 world 的玩家、agent、对话状态
worldStatus             world 是否 running/inactive/stoppedByDeveloper
maps                    地图数据
playerDescriptions      玩家名字、人设、角色 sprite
agentDescriptions       Agent 身份和目标
messages                聊天消息
inputs                  游戏输入队列
engines                 模拟引擎状态
memories                Agent 记忆
memoryEmbeddings        记忆向量
embeddingsCache         embedding 请求缓存
archivedConversations   已结束对话
participatedTogether    两个玩家历史对话关系
```

核心设计是：游戏状态由 engine 独占写入，外部行为通过 `inputs` 表排队，再由 engine 顺序处理。这让多人输入和 Agent 行为不会直接互相覆盖。

## 5. 模拟引擎

通用引擎在 `convex/engine/abstractGame.ts`，AI Town 具体实现是 `convex/aiTown/game.ts` 里的 `Game` 类。

当前设置：

```ts
tickDuration = 16;
stepDuration = 1000;
maxTicksPerStep = 600;
maxInputsPerStep = 32;
```

含义：

- tick 约等于 60 FPS，用于移动、碰撞、对话状态等细粒度模拟。
- step 每秒左右保存一次，把多次 tick 的结果批量写入 Convex。
- `HistoricalObject` 会记录位置历史，前端可以平滑回放移动，而不是每秒跳一次。

每个 step 大致流程：

1. 读取 engine 和 world 状态。
2. 处理输入队列。
3. 多次调用 `Game.tick(now)`。
4. 计算 diff。
5. 写回 Convex。
6. 调度 Agent 异步 operation。

## 6. 输入系统

所有可改变游戏状态的行为都通过 input handler。

入口在：

```text
convex/aiTown/inputs.ts
```

它聚合：

- `playerInputs`
- `conversationInputs`
- `agentInputs`

常见 input：

```text
join
leave
moveTo
startConversation
acceptInvite
rejectInvite
leaveConversation
startTyping
finishSendingMessage
createAgent
finishDoSomething
agentFinishSendingMessage
finishRememberConversation
```

前端或 Agent 不直接改 `worlds` 表，而是插入 input。engine 在 step 中按顺序处理 input。

## 7. Agent 行为

Agent 类在：

```text
convex/aiTown/agent.ts
```

Agent 的行为分两种：

- tick 中的即时状态机逻辑
- Convex action 中的异步长任务

### 7.1 tick 状态机

每次 `Game.tick` 会调用每个 Agent 的 `tick`。

Agent 会根据当前状态决定：

- 是否等待已有 operation 完成。
- 是否空闲并启动 `agentDoSomething`。
- 是否接受/拒绝对话邀请。
- 是否朝邀请人走过去。
- 是否在参与对话时生成消息。
- 是否因对话太久或消息太多而离开。
- 是否在对话结束后启动记忆操作。

### 7.2 异步 operations

定义在：

```text
convex/aiTown/agentOperations.ts
```

当前有三个：

```text
agentDoSomething
agentGenerateMessage
agentRememberConversation
```

`agentDoSomething` 目前是规则逻辑，不调用 LLM。它会：

- 随机选择活动。
- 随机选择 wander 目的地。
- 在合适时选择一个空闲玩家作为对话候选人。

`agentGenerateMessage` 会根据消息类型调用 LLM：

- `start`：开场
- `continue`：续聊
- `leave`：告别

`agentRememberConversation` 会总结对话、计算重要性、生成 embedding，并写入记忆表。

## 8. 对话系统

对话对象是 `Conversation`，实现位于：

```text
convex/aiTown/conversation.ts
```

每个对话当前只支持两个参与者。成员状态有：

```text
invited
walkingOver
participating
```

典型流程：

1. A 调用 `Conversation.start` 邀请 B。
2. B 接受或拒绝。
3. 双方进入 `walkingOver`。
4. 距离足够近后进入 `participating`。
5. Agent 轮流调用 LLM 生成消息。
6. 超过时长或消息数限制后离开。
7. 对话归档，Agent 记忆这次对话。

消息文本不存放在 world 内，而是独立存放在 `messages` 表。这减少了核心 world 状态的大小，也避免频繁消息写入干扰模拟状态。

## 9. LLM 和 embedding 接入

接入层在：

```text
convex/util/llm.ts
```

当前支持：

- OpenAI
- Together.ai
- Ollama
- 自定义 OpenAI-compatible API

这个 fork 增强了 custom provider：

- chat 和 embedding 可以使用不同 base URL。
- chat 和 embedding 可以使用不同 API key。
- 可以设置完整 endpoint，适配没有标准 `/v1` 路径的服务。

相关环境变量：

```text
LLM_CHAT_API_URL
LLM_CHAT_COMPLETIONS_URL
LLM_CHAT_API_KEY
LLM_MODEL
LLM_EMBEDDING_API_URL
LLM_EMBEDDINGS_URL
LLM_EMBEDDING_API_KEY
LLM_EMBEDDING_MODEL
```

embedding 维度由代码常量决定：

```ts
export const EMBEDDING_DIMENSION: number = CUSTOM_EMBEDDING_DIMENSION;
```

这个值必须和服务实际返回向量维度一致，也必须和 Convex vector index 的 dimensions 一致。

## 10. 中文化实现

角色数据在：

```text
data/characters.ts
```

当前角色：

```text
乐奇
老鲍
斯黛拉
爱丽丝
皮特
```

对话 prompt 在：

```text
convex/agent/conversation.ts
```

关键约束：

```text
请始终使用自然、口语化的简体中文回复。
不要使用英文。
不要写舞台动作、旁白或星号动作描写。
只输出角色实际说出口的一句话。
```

记忆 prompt 在：

```text
convex/agent/memory.ts
```

包括：

- 对话总结
- 重要性评分
- 高层反思

## 11. 空消息防护

LLM 偶尔可能请求成功但返回空字符串。之前空字符串会写入 `messages` 表，前端就会显示空气泡。

当前修复在：

```text
convex/aiTown/agent.ts
```

`agentSendMessage` 会先执行：

```ts
const text = args.text.trim();
if (!text) {
  // 不写 messages，但结束当前 operation
}
```

记忆总结也有空内容防护：

```text
convex/agent/memory.ts
```

开发环境可以清理历史空消息：

```bash
npx convex run testing:deleteEmptyMessagesForDev
```

## 12. 自动暂停和恢复

相关文件：

```text
src/hooks/useWorldHeartbeat.ts
convex/world.ts
convex/crons.ts
convex/constants.ts
```

前端每 60 秒发送 heartbeat。后端记录 `worldStatus.lastViewed`。

cron 每 5 分钟检查 inactive world。如果 world 超过 5 分钟没有 heartbeat，就会：

```text
status = inactive
stopEngine(...)
```

重新打开页面后，heartbeat 会发现 world 是 `inactive`，然后：

```text
status = running
startEngine(...)
```

这个机制用于节省 Convex action 和 LLM 调用成本。

## 13. 重要扩展点

### 改角色

编辑：

```text
data/characters.ts
```

然后重置数据并重新初始化：

```bash
npx convex run testing:wipeAllTablesForDev
npx convex run init
```

### 改 Agent 决策

规则入口：

```text
convex/aiTown/agent.ts
convex/aiTown/agentOperations.ts
```

如果想让 Agent 根据人设选择行为，可以把 `agentDoSomething` 改为 LLM 决策，让模型在以下行动中选择：

```text
activity
wander
invite
wait
```

### 改对话风格

编辑：

```text
convex/agent/conversation.ts
```

这里决定角色如何开场、续聊、告别，以及如何使用记忆。

### 改记忆系统

编辑：

```text
convex/agent/memory.ts
convex/agent/schema.ts
```

可以调整：

- 记忆总结格式
- 重要性评分规则
- 检索数量
- reflection 触发条件

### 改地图

默认地图从这里加载：

```text
convex/init.ts
data/gentle.js
```

上游提供了 `data/convertMap.js`，可以把 Tiled 导出的 JSON 转成项目使用的地图格式。

## 14. 常见调试命令

构建：

```bash
npm run build
```

同步 Convex functions：

```bash
npx convex dev --once
```

看日志：

```bash
npx convex logs --history 80
```

看默认 world：

```bash
npx convex run world:defaultWorldStatus
```

停止/恢复 engine：

```bash
npx convex run testing:stop
npx convex run testing:resume
```

清理并重新初始化：

```bash
npx convex run testing:wipeAllTablesForDev
npx convex run init
```

## 15. 当前限制

- `agentDoSomething` 仍是规则逻辑，不是 LLM 自主规划。
- 对话只支持两个参与者。
- 活动系统较简单，活动不会真正改变地图对象。
- 当前没有物品、经济、任务、地点语义等更复杂玩法。
- LLM prompt 仍比较轻量，长时间运行后记忆质量依赖模型稳定性。
- 前端后台 tab 仍会 heartbeat，除非浏览器冻结页面。

这些限制也是后续最值得扩展的方向。
