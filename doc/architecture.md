# AI Town 架构说明

这份文档说明 AI Town 的高层架构和主要分层。它适合在修改游戏规则、Agent 行为或理解模拟引擎边界之前阅读。

如果只是想快速了解当前 fork 的功能、数据表和 LLM 接入细节，可以先看 [技术解析](./technical-analysis.md)。本文更偏向解释上游设计思想：游戏状态如何推进、输入如何进入引擎、Agent 如何把异步 LLM 操作接回游戏循环。

本文假设读者已经了解 Convex 的基本概念：query、mutation、action、scheduler 和数据库表。

## 总览

AI Town 可以分成四层：

- `convex/aiTown`：服务端游戏规则层。它定义 AI Town 维护哪些状态、状态如何随时间变化，以及如何响应玩家和 Agent 提交的输入。
- `src/`：客户端游戏 UI。项目使用 React、PixiJS 和 `@pixi/react` 把游戏状态渲染到浏览器。
- `convex/engine`：通用游戏引擎层。它和 AI Town 具体规则解耦，负责从数据库加载/保存游戏状态、处理输入队列、推进模拟时间，并在 Convex 函数中调度运行。
- `convex/agent`：Agent 异步逻辑层。Agent 是游戏循环的一部分，但它们可以启动较长时间的 Convex action，例如调用 LLM、总结记忆、生成 embedding，再通过输入把结果写回游戏状态。

如果想修改 Agent 的对话、记忆或 LLM 行为，重点看：

- `convex/agent`
- `convex/aiTown/agent.ts`
- `convex/aiTown/agentOperations.ts`

如果想增加新的玩法元素，例如新增可交互对象或新的玩家动作，通常需要同时修改：

- `convex/aiTown` 中的状态和输入处理
- `src/` 中的渲染和交互
- `convex/aiTown/agent.ts` 中 Agent 对新玩法的响应

如果某些功能对延迟非常敏感，可以考虑不要完全放进游戏引擎，而是使用普通 Convex 表、query 和 mutation，只把关键状态记录回游戏状态。聊天消息模型就是这种做法。

## AI Town 游戏规则层

目录：`convex/aiTown`

### 数据模型

AI Town 的核心概念包括：

- World：一个地图和其中的所有玩家、Agent、会话状态。
- Player：游戏里的角色。Player 有名字、人设描述、当前位置、移动路径，也可能关联真实用户。
- Conversation：一次对话，由玩家或 Agent 发起，并在某个时间结束。
- Conversation membership：玩家参与对话的关系。一个玩家同一时间只能在一个对话中。

对话成员状态主要有三种：

- `invited`：已被邀请，但还没有接受。
- `walkingOver`：已接受邀请，但距离太远，正在走向对方。
- `participating`：正在参与对话。

### Schema

数据表大致分为三类：

1. `convex/engine/schema.ts`：引擎内部状态，例如输入队列和引擎运行状态。
2. `convex/aiTown/schema.ts`：AI Town 游戏状态，例如 world、地图、玩家、会话和参与关系。
3. `convex/agent/schema.ts`：Agent 自己的状态，例如记忆和 embedding 缓存。

### 输入系统

目录：`convex/aiTown/inputs.ts`

AI Town 通过“输入”修改游戏状态。输入可以来自真人玩家，也可以来自 Agent。输入会先写入引擎的 `inputs` 表，再由游戏引擎按顺序处理。

常见输入包括：

- `join` / `leave`：加入或离开游戏。
- `moveTo`：移动到指定位置。玩家只指定目标点，路径规划由引擎计算。
- `startConversation` / `acceptInvite` / `rejectInvite` / `leaveConversation`：对话生命周期。
- `startTyping` / `finishSendingMessage`：用于维护输入中状态。
- Agent 相关输入：由 `convex/aiTown/agentInputs.ts` 定义，例如记忆、决策和对话操作完成后的状态回写。

每个输入处理函数会检查业务约束并修改游戏状态。例如 `moveTo` 会检查玩家是否正在参与对话，如果正在对话中，则要求先离开对话，再更新移动路径。

### 模拟推进

除了处理输入，游戏状态还会随时间自然变化。例如：

- 玩家沿路径平滑移动。
- 玩家遇到障碍或碰撞后重新规划路径。
- 对话、Agent 决策和超时逻辑随时间推进。

这类变化由游戏引擎不断调用 `tick` 完成。

## 消息模型

聊天消息没有直接放进游戏引擎状态，而是放在普通 Convex 表里。

这样设计有几个原因：

- 核心模拟不需要知道完整消息内容，保持 game state 更小。
- 消息更新频率高，尤其是 LLM 流式输出时，不适合全部通过引擎输入队列处理。
- 普通 query/mutation 的延迟更低，更适合聊天 UI。

消息表定义在 `convex/schema.ts`。消息属于某个 conversation，包含作者和文本内容。Conversation 表中也会保存 typing 状态，用于避免 Agent 或用户互相抢话。

## 游戏引擎层

目录：`convex/engine`

`convex/engine/abstractGame.ts` 中的 `AbstractGame` 提供通用模拟框架。AI Town 通过 `Game` 子类实现具体规则。

引擎主要负责：

- 协调玩家和 Agent 输入，并把结果或错误回写给客户端。
- 推进模拟时间。
- 从数据库加载和保存游戏状态。
- 控制 Convex 函数调用频率，尽量降低输入延迟和资源开销。

### 输入处理流程

用户通过 `insertInput` 提交输入。这个函数会：

1. 把输入写入 `inputs` 表。
2. 分配单调递增的 input number。
3. 记录服务端收到输入的时间。
4. 等待引擎处理后，把结果写回同一行。

客户端可以通过 `inputStatus` query 订阅输入状态。

`Game` 暴露抽象方法 `handleInput`，AI Town 在自己的实现中根据输入类型修改游戏状态。

### Tick 和 Step

`tick(now)` 表示把模拟推进到某个时间点。

AI Town 为了实现平滑移动，会以较高频率 tick，默认接近 60 FPS。但如果每一帧都运行一次 Convex mutation，成本会很高，也会很慢。

因此引擎把多个 tick 合并成一次 step：

1. 从数据库加载当前 game state。
2. 判断这次 step 要模拟到哪个时间。
3. 在内存中循环处理输入并执行多个 tick。
4. 把最终状态和历史轨迹写回数据库。

AI Town 的 step 频率远低于 tick 频率，通常约每秒一次。

### 单线程约束

每个 world 的游戏引擎被设计成“逻辑单线程”：同一时间不能有两个 step 同时运行。

这样可以让游戏规则代码不用处理复杂并发问题。但实现上需要避免调度竞态。例如引擎空闲后有输入进来，系统希望立刻唤醒引擎；如果刚好有旧的定时任务也要运行，就可能重复启动。

项目使用 generation number 解决这个问题：

- 每次计划运行引擎时都带上期望的 generation。
- 如果需要取消未来运行，就把 generation 加一。
- 旧任务启动后发现 generation 不匹配，会立即退出。

### 状态加载和保存

一次 step 的典型流程：

1. Convex scheduler 调用 `convex/aiTown/main.ts` 中的 `runStep` action。
2. `runStep` 调用 `convex/aiTown/game.ts` 中的 `loadWorld` 加载状态。
3. `Game.load` 从多个表读取 world、players、agents、conversations 等序列化状态。
4. `Game` 构造函数把数据库里的序列化对象转换成内存里的 `World`、`Player`、`Conversation`、`Agent` 等类实例。
5. 引擎在内存中处理输入并推进模拟。
6. step 结束时调用 `Game.saveStep` 计算状态 diff。
7. `saveWorld` mutation 把 diff 应用到数据库，归档删除对象，更新参与关系图，并调度后续任务。

因为游戏引擎是这些游戏状态表的唯一写入方，外部代码不应直接修改这些表。外部行为应该通过输入系统进入引擎。

### 历史值

step 大约每秒保存一次，但玩家移动需要看起来连续。如果只保存每秒一个位置，前端会看到明显跳动。

为了解决这个问题，引擎在 step 内记录连续数值的历史变化，例如位置、朝向、速度。客户端拿到当前值和历史 buffer 后，可以在本地重放这段历史，让运动看起来平滑。

这些历史值由 `HistoricalObject` 管理。它会高效记录数值字段随时间的变化，并序列化成客户端可解析的 buffer。

限制：

- 只能追踪数字字段。
- 不支持嵌套对象或可选字段。
- 必须明确声明要追踪哪些字段。

AI Town 会把玩家的 `location` 写入 `HistoricalObject`，包括位置、朝向和速度。

## 客户端 UI

目录：`src/`

AI Town 尽量保持普通 Convex 应用的使用方式：游戏状态存在普通表里，前端用普通 `useQuery` 订阅，再渲染 UI。

特殊点在于历史值。前端会用：

- `useHistoricalValue`：解析历史 buffer，并按当前时间重放。
- `useHistoricalTime`：提供统一的客户端历史时间，保证多个历史对象同步播放。

发送输入则由 `useSendInput` 封装。它基于 Convex mutation，把输入发送到服务端，并等待引擎处理完成。

## Agent 架构

目录：`convex/agent`、`convex/aiTown/agent.ts`

Agent 的核心原则是：短逻辑放在游戏循环里，长任务放到异步 Convex function 里。

大致流程：

1. `Agent.tick` 在游戏循环中观察当前状态，例如是否靠近某个玩家、是否应该开始对话。
2. 如果需要调用 LLM 或访问非游戏表，Agent 调用 `startOperation` 启动一个异步 Convex function，通常是 `internalAction`。
3. 异步函数可以通过 `internalQuery` 读取游戏状态和其他表。
4. 异步函数执行长任务，例如调用 LLM、总结记忆、生成 embedding。
5. 异步函数不直接写游戏状态，而是通过输入系统提交结果。
6. 输入由游戏引擎处理，和真人玩家输入走同一套规则。
7. 操作完成后清理 `inProgressOperation`，保证一个 Agent 同一时间只做一件长任务。
8. 后续 `Agent.tick` 看到新状态后继续决策。

### 对话

`convex/agent/conversation.ts` 负责 Agent 对话相关的 prompt 组装和 LLM 调用。

它会处理：

- 开始对话。
- 延续对话。
- 礼貌结束对话。

每次生成回复前，它会从数据库读取角色描述、对话上下文和相关记忆，把这些信息注入 prompt，再调用 `convex/util/llm.ts` 中的 OpenAI-compatible 客户端。

### 记忆

目录：`convex/agent/memory.ts`

每次对话结束后，Agent 会：

1. 总结对话历史。
2. 计算总结文本的重要性。
3. 为总结生成 embedding。
4. 写入 Convex vector index。

下次与某个角色对话时，Agent 会把“我怎么看这个角色”这类查询也转成 embedding，然后检索最相似的几条记忆，把记忆摘要注入 prompt。

### Embedding 缓存

目录：`convex/agent/embeddingsCache.ts`

为了避免同一段文本反复计算 embedding，项目会按文本 hash 缓存 embedding。重复文本命中缓存后，可以减少 API 调用和等待时间。

## 设计目标和限制

AI Town 的设计目标：

- 尽量像普通 Convex 应用一样工作，优先使用普通表和普通客户端 hooks。
- 使用常见的 `tick()` 模型，便于理解和修改游戏行为。
- 解耦 Agent 和游戏引擎，让真人玩家和 AI Agent 尽量通过同一套输入系统影响游戏。

这些目标也带来一些限制：

- 每次 step 会把活跃 game state 加载到内存。游戏状态应该保持较小，适合几十 KB 量级，不适合数万个对象同时复杂交互。
- 所有输入都通过数据库中的 `inputs` 表，因此不适合超高频或体积极大的输入流。
- 输入延迟大约是一次网络往返时间，再加上等待下一次 step 的时间。历史值重放也会引入一点额外延迟。当前配置更适合模拟和轻交互，不适合竞技类实时游戏。
- 引擎逻辑是单线程模型。如果模拟计算非常重，当前架构可能不适合，需要拆分或换更专门的实时引擎。
