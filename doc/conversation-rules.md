# AI Town 对话规则速查

这份文档记录当前游戏里的默认对话规则。它不是配置说明，而是方便后续改规则时快速定位代码。

## 核心常量

主要默认值集中在 `convex/constants.ts`：

| 规则 | 当前值 | 代码位置 |
| --- | ---: | --- |
| 两人进入正式聊天的距离 | `< 1.3` 地图单位 | `CONVERSATION_DISTANCE` |
| 接近时直接走向对方的距离阈值 | `< 4` 地图单位 | `MIDPOINT_THRESHOLD` |
| 输入中状态超时 | `15s` | `TYPING_TIMEOUT` |
| 聊完后全局冷却 | `15s` | `CONVERSATION_COOLDOWN` |
| 同一对角色再次聊天冷却 | `60s` | `PLAYER_CONVERSATION_COOLDOWN` |
| AI 接受 AI 邀请概率 | `80%` | `INVITE_ACCEPT_PROBABILITY` |
| 邀请等待超时 | `60s` | `INVITE_TIMEOUT` |
| 等对方先说话的尴尬等待 | `60s` | `AWKWARD_CONVERSATION_TIMEOUT` |
| 单场对话最长持续时间 | `10min` | `MAX_CONVERSATION_DURATION` |
| 单场对话消息数上限 | `8` | `MAX_CONVERSATION_MESSAGES` |
| 连续消息最小间隔 | `2s` | `MESSAGE_COOLDOWN` |
| Agent 操作超时 | `120s` | `ACTION_TIMEOUT` |

## 开始对话

对话由 `Conversation.start` 创建，当前只支持两个人参与。一名玩家不能邀请自己；如果邀请者或被邀请者已经在任意对话中，新的对话会失败。

代码位置：

- `convex/aiTown/conversation.ts` 的 `Conversation.start`
- `convex/aiTown/conversation.ts` 的 `conversationInputs.startConversation`

创建后，发起者状态是 `walkingOver`，被邀请者状态是 `invited`。被邀请者接受后也变为 `walkingOver`。

AI 收到邀请时：

- 如果邀请来自人类玩家，必定接受。
- 如果邀请来自另一个 AI，以 `80%` 概率接受。
- 拒绝邀请会直接结束这场未开始的对话。

代码位置：`convex/aiTown/agent.ts` 的 `member.status.kind === 'invited'` 分支。

## 靠近与正式进入聊天

两个参与者都处于 `walkingOver`，并且距离小于 `CONVERSATION_DISTANCE`，也就是 `1.3`，才会进入 `participating`。

进入正式聊天时会：

- 停止两人的移动路径。
- 把两人的 membership 状态设为 `participating`。
- 尝试把两人移动到相邻、未阻挡的格子。
- 如果两人没有继续移动，会让他们面朝彼此。

代码位置：`convex/aiTown/conversation.ts` 的 `Conversation.tick`。

AI 在走向对方时，如果距离已经小于 `1.3` 会停止继续下发移动；如果距离小于 `4`，会直接走向对方所在格子；否则先走向两人的中点。

代码位置：`convex/aiTown/agent.ts` 的 `member.status.kind === 'walkingOver'` 分支。

## 消息节奏

正式进入 `participating` 后，Agent 会按以下规则发消息：

- 如果别人正在输入，当前 Agent 等待。
- 如果还没有任何消息，发起者会先发开场。
- 如果发起者没有说话，另一方最多等 `60s` 后会开口。
- 如果上一条消息是自己发的，会等 `60s`，给对方先回复的机会。
- 不管是谁发的上一条消息，继续发言前至少等 `2s`，模拟读消息。
- 生成消息前会设置 `isTyping` 锁，防止两边同时发。
- `isTyping` 超过 `15s` 会被自动清理。

代码位置：

- `convex/aiTown/agent.ts` 的 `member.status.kind === 'participating'` 分支
- `convex/aiTown/conversation.ts` 的 `Conversation.tick`
- `convex/aiTown/conversation.ts` 的 `setIsTyping`

LLM 回复限制在 prompt 层，不是硬截断：

- 续聊和告别 prompt 要求“控制在 100 个中文字以内”。
- LLM 请求使用 `max_tokens: 300`。

代码位置：`convex/agent/conversation.ts` 的 `continueConversationMessage` 和 `leaveConversationMessage`。

## 结束对话

Agent 会在以下情况下准备离开：

- 对话开始超过 `10min`。
- `conversation.numMessages > MAX_CONVERSATION_MESSAGES`。

注意这里代码判断是 `>`，而不是 `>=`。当前 `MAX_CONVERSATION_MESSAGES = 8` 时，只有消息数已经大于 8 才触发结束分支；触发后 Agent 通常还会生成一条告别消息。

如果对话还没有任何消息但已经触发过长检查，会直接结束，不生成告别。

对话结束时：

- 当前 conversation 从 world 状态里删除。
- 对参与者对应的 Agent 记录 `lastConversation = now`。
- 设置 `toRemember`，后续触发记忆总结。

代码位置：

- `convex/aiTown/agent.ts` 的 `tooLongDeadline` 和 `MAX_CONVERSATION_MESSAGES` 检查
- `convex/aiTown/conversation.ts` 的 `Conversation.stop`

## 冷却与候选选择

结束一场对话后，Agent 在 `15s` 内不会主动找人聊天。

同一对角色在 `60s` 内不会再次被选为聊天对象。这个限制是在候选查询阶段做的，会查询 `participatedTogether` 里最近一次共同对话结束时间。

代码位置：

- `convex/aiTown/agentOperations.ts` 的 `agentDoSomething`
- `convex/aiTown/agent.ts` 的 `findConversationCandidate`

候选选择当前优先走 LLM 判断；如果 LLM 失败，会 fallback 到最近可聊天对象。

代码位置：`convex/aiTown/agentOperations.ts` 的 `chooseConversationCandidate`。

## 可以考虑调整的点

这些不是必须修改，只是当前规则里比较值得留意的地方：

- `MAX_CONVERSATION_MESSAGES` 的判断可能和直觉不一致。现在是 `numMessages > 8` 才准备结束，因此实际可能超过 8 条后再加一条告别。若想“最多 8 条消息”，应看 `convex/aiTown/agent.ts` 的消息数判断。
- `AWKWARD_CONVERSATION_TIMEOUT = 60s` 对游戏体验可能偏慢，尤其是上一条是自己发的时，会等整整一分钟才继续接话。代码里还保留了原本 `20s` 的注释值。
- `MAX_CONVERSATION_DURATION = 10min` 明显偏本地开发友好，代码注释里也保留了 `2min` 的正常值。如果希望小镇对话更频繁流动，可以优先考虑这个值。
- `CONVERSATION_COOLDOWN = 15s` 和 `PLAYER_CONVERSATION_COOLDOWN = 60s` 是两层不同冷却。调试“为什么不主动聊天”时要同时看这两个。
- `INVITE_ACCEPT_PROBABILITY = 0.8` 会让 AI 对话比较容易开始。如果想要更自然的拒绝行为，可以结合角色关系或记忆调整，而不是只降这个概率。
- 单条回复长度只靠 prompt 约束，没有代码硬限制。LLM 偶尔超长时，应看 `convex/agent/conversation.ts` 的 prompt 或发送前清洗逻辑。
