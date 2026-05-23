# AI Town 数据表速查

这份文档简单说明 Convex 里的主要数据表。表定义入口在 `convex/schema.ts`，并组合了：

- `convex/aiTown/schema.ts`
- `convex/agent/schema.ts`
- `convex/engine/schema.ts`

## 核心 World 状态

| 表 | 作用 | 关键内容 |
| --- | --- | --- |
| `worlds` | 当前小镇的实时游戏状态 | players、agents、conversations、历史位置、nextId |
| `worldStatus` | world 的运行状态 | worldId、engineId、lastViewed、running/inactive/stoppedByDeveloper |
| `maps` | world 对应的地图数据 | 地图尺寸、tile 数据、碰撞等序列化地图信息 |
| `playerDescriptions` | 玩家可读描述 | 名字、人设、sprite 等 |
| `agentDescriptions` | Agent 可读描述 | identity、plan 等 |

`worlds` 是游戏规则层最核心的状态表。玩家移动、当前对话、Agent 状态都会在这里保存。`maps` 和描述类表变化较少，所以单独存放。

## 聊天消息

| 表 | 作用 | 关键内容 |
| --- | --- | --- |
| `messages` | 保存对话消息 | worldId、conversationId、messageUuid、author、text |

`messages` 不直接存在 `worlds` 里，而是单独保存，方便按 conversation 拉聊天记录。

常用索引：

- `conversationId`: 按 worldId + conversationId 查询消息。
- `messageUuid`: 防止或定位重复消息。

## 归档数据

| 表 | 作用 | 关键内容 |
| --- | --- | --- |
| `archivedPlayers` | 保存离开 world 的玩家快照 | worldId + serializedPlayer |
| `archivedConversations` | 保存已结束对话摘要 | creator、created、ended、lastMessage、numMessages、participants |
| `archivedAgents` | 保存已删除 Agent 快照 | worldId + serializedAgent |
| `participatedTogether` | 记录两名玩家曾经聊过 | player1、player2、conversationId、ended |

游戏引擎为了保持 `worlds` 小而快，会从实时状态里删除已结束对话、离开的玩家等。需要历史查询时，就看这些归档表。

`participatedTogether` 更像一个关系图边表，Agent 用它判断两个人上次什么时候聊过，避免短时间内重复找同一个人聊天。

## Agent 记忆

| 表 | 作用 | 关键内容 |
| --- | --- | --- |
| `memories` | Agent 的长期记忆 | playerId、description、importance、lastAccess、data |
| `memoryEmbeddings` | 记忆向量 | playerId、embedding |
| `embeddingsCache` | embedding 请求缓存 | textHash、embedding |

`memories.data` 当前有三种类型：

- `relationship`: 关于某个玩家的关系记忆。
- `conversation`: 某次对话总结。
- `reflection`: 基于多条记忆生成的反思。

`memoryEmbeddings` 有 vector index，用于按相似度搜索相关记忆。`embeddingsCache` 用文本 hash 缓存 embedding，减少重复请求。

## 引擎与输入队列

| 表 | 作用 | 关键内容 |
| --- | --- | --- |
| `engines` | 模拟引擎状态 | currentTime、lastStepTs、processedInputNumber、running、generationNumber |
| `inputs` | 游戏输入队列 | engineId、number、name、args、returnValue、received |

前端和 Agent 不直接修改 `worlds`，而是写入 `inputs`。引擎按顺序处理 input，再统一推进 world 状态。

常见 input 包括：

- `join`
- `leave`
- `moveTo`
- `startConversation`
- `acceptInvite`
- `rejectInvite`
- `leaveConversation`
- `startTyping`
- `finishSendingMessage`
- `finishDoSomething`
- `agentFinishSendingMessage`
- `finishRememberConversation`

## 调试与资源

| 表 | 作用 | 关键内容 |
| --- | --- | --- |
| `agentSelectionDebug` | 记录 Agent 选择聊天对象的调试信息 | candidateIds、selectedPlayerId、reason、raw、error |
| `music` | 保存音乐资源 | storageId、type |

`agentSelectionDebug` 主要用于排查“为什么这个 Agent 选择/没有选择某个人聊天”。`music` 是资源表，和核心模拟逻辑关系不大。

## 快速阅读顺序

如果要理解数据流，可以按这个顺序看：

1. `worlds`: 当前状态长什么样。
2. `inputs`: 外部行为如何进入引擎。
3. `engines`: 引擎如何记录处理进度。
4. `messages`: 聊天正文保存在哪里。
5. `archivedConversations` 和 `participatedTogether`: 历史对话如何影响后续 Agent 行为。
6. `memories` 和 `memoryEmbeddings`: Agent 如何记住和检索过去。
