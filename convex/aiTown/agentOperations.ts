import { v } from 'convex/values';
import { ActionCtx, internalAction } from '../_generated/server';
import { Id } from '../_generated/dataModel';
import { WorldMap, serializedWorldMap } from './worldMap';
import { rememberConversation } from '../agent/memory';
import { GameId, agentId, conversationId, parseGameId, playerId } from './ids';
import {
  continueConversationMessage,
  leaveConversationMessage,
  startConversationMessage,
} from '../agent/conversation';
import { assertNever } from '../util/assertNever';
import { serializedAgent } from './agent';
import { ACTIVITIES, ACTIVITY_COOLDOWN, CONVERSATION_COOLDOWN } from '../constants';
import { api, internal } from '../_generated/api';
import { sleep } from '../util/sleep';
import { SerializedPlayer, serializedPlayer } from './player';
import { chatCompletion } from '../util/llm';

export const agentRememberConversation = internalAction({
  args: {
    worldId: v.id('worlds'),
    playerId,
    agentId,
    conversationId,
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    await rememberConversation(
      ctx,
      args.worldId,
      args.agentId as GameId<'agents'>,
      args.playerId as GameId<'players'>,
      args.conversationId as GameId<'conversations'>,
    );
    await sleep(Math.random() * 1000);
    await ctx.runMutation(api.aiTown.main.sendInput, {
      worldId: args.worldId,
      name: 'finishRememberConversation',
      args: {
        agentId: args.agentId,
        operationId: args.operationId,
      },
    });
  },
});

export const agentGenerateMessage = internalAction({
  args: {
    worldId: v.id('worlds'),
    playerId,
    agentId,
    conversationId,
    otherPlayerId: playerId,
    operationId: v.string(),
    type: v.union(v.literal('start'), v.literal('continue'), v.literal('leave')),
    messageUuid: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      let completionFn;
      switch (args.type) {
        case 'start':
          completionFn = startConversationMessage;
          break;
        case 'continue':
          completionFn = continueConversationMessage;
          break;
        case 'leave':
          completionFn = leaveConversationMessage;
          break;
        default:
          assertNever(args.type);
      }
      const text = await completionFn(
        ctx,
        args.worldId,
        args.conversationId as GameId<'conversations'>,
        args.playerId as GameId<'players'>,
        args.otherPlayerId as GameId<'players'>,
      );

      await ctx.runMutation(internal.aiTown.agent.agentSendMessage, {
        worldId: args.worldId,
        conversationId: args.conversationId,
        agentId: args.agentId,
        playerId: args.playerId,
        text,
        messageUuid: args.messageUuid,
        leaveConversation: args.type === 'leave',
        operationId: args.operationId,
      });
    } catch (e) {
      console.warn(
        `[agentMessage] failed agent=${args.agentId} player=${args.playerId} conversation=${args.conversationId} operation=${args.operationId} error=${formatError(e)}`,
      );
      await ctx.runMutation(api.aiTown.main.sendInput, {
        worldId: args.worldId,
        name: 'agentMessageFailed',
        args: {
          agentId: args.agentId,
          conversationId: args.conversationId,
          operationId: args.operationId,
          messageUuid: args.messageUuid,
          error: formatError(e),
        },
      });
    }
  },
});

export const agentDoSomething = internalAction({
  args: {
    worldId: v.id('worlds'),
    player: v.object(serializedPlayer),
    agent: v.object(serializedAgent),
    map: v.object(serializedWorldMap),
    otherFreePlayers: v.array(v.object(serializedPlayer)),
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    const { player, agent } = args;
    const map = new WorldMap(args.map);
    const now = Date.now();
    // Don't try to start a new conversation if we were just in one.
    const justLeftConversation =
      agent.lastConversation && now < agent.lastConversation + CONVERSATION_COOLDOWN;
    // Don't try again if we recently tried to find someone to invite.
    const recentlyAttemptedInvite =
      agent.lastInviteAttempt && now < agent.lastInviteAttempt + CONVERSATION_COOLDOWN;
    const recentActivity = player.activity && now < player.activity.until + ACTIVITY_COOLDOWN;
    // Decide whether to do an activity or wander somewhere.
    if (!player.pathfinding) {
      if (recentActivity || justLeftConversation) {
        await sleep(Math.random() * 1000);
        await ctx.runMutation(api.aiTown.main.sendInput, {
          worldId: args.worldId,
          name: 'finishDoSomething',
          args: {
            operationId: args.operationId,
            agentId: agent.id,
            destination: wanderDestination(map),
          },
        });
        return;
      } else {
        // TODO: have LLM choose the activity & emoji
        const activity = ACTIVITIES[Math.floor(Math.random() * ACTIVITIES.length)];
        await sleep(Math.random() * 1000);
        await ctx.runMutation(api.aiTown.main.sendInput, {
          worldId: args.worldId,
          name: 'finishDoSomething',
          args: {
            operationId: args.operationId,
            agentId: agent.id,
            activity: {
              description: activity.description,
              emoji: activity.emoji,
              until: Date.now() + activity.duration,
            },
          },
        });
        return;
      }
    }
    const invitee =
      justLeftConversation || recentlyAttemptedInvite
        ? undefined
        : await chooseConversationCandidate(ctx, {
            now,
            worldId: args.worldId,
            player: args.player,
            otherFreePlayers: args.otherFreePlayers,
          });

    // TODO: We hit a lot of OCC errors on sending inputs in this file. It's
    // easy for them to get scheduled at the same time and line up in time.
    await sleep(Math.random() * 1000);
    await ctx.runMutation(api.aiTown.main.sendInput, {
      worldId: args.worldId,
      name: 'finishDoSomething',
      args: {
        operationId: args.operationId,
        agentId: args.agent.id,
        invitee,
      },
    });
  },
});

function wanderDestination(worldMap: WorldMap) {
  // Wander someonewhere at least one tile away from the edge.
  return {
    x: 1 + Math.floor(Math.random() * (worldMap.width - 2)),
    y: 1 + Math.floor(Math.random() * (worldMap.height - 2)),
  };
}

async function chooseConversationCandidate(
  ctx: ActionCtx,
  args: {
    now: number;
    worldId: Id<'worlds'>;
    player: SerializedPlayer;
    otherFreePlayers: SerializedPlayer[];
  },
) {
  const writeDebug = async (event: {
    stage: string;
    candidateIds?: GameId<'players'>[];
    selectedPlayerId?: GameId<'players'>;
    reason?: string;
    raw?: string;
  }) => {
    if (event.stage !== 'llm-selected' && event.stage !== 'llm-declined') {
      return;
    }
    await ctx.runMutation(internal.aiTown.agent.insertSelectionDebug, {
      worldId: args.worldId,
      playerId: parseGameId('players', args.player.id),
      ts: Date.now(),
      stage: event.stage,
      candidateIds:
        event.candidateIds ?? args.otherFreePlayers.map((p) => parseGameId('players', p.id)),
      selectedPlayerId: event.selectedPlayerId,
      reason: event.reason,
      raw: event.raw && event.raw.slice(0, 1000),
    });
  };
  const fallback = async () => {
    const fallbackInvitee = await ctx.runQuery(internal.aiTown.agent.findConversationCandidate, args);
    return fallbackInvitee;
  };

  if (args.otherFreePlayers.length === 0) {
    return undefined;
  }

  try {
    const selectionData = await ctx.runQuery(internal.aiTown.agent.conversationCandidatePromptData, args);
    if (selectionData.candidates.length === 0) {
      return undefined;
    }
    const promptCandidateIds = selectionData.candidates.map((c) =>
      parseGameId('players', c.playerId),
    );
    const candidateIds = new Set(selectionData.candidates.map((c) => c.playerId));
    const exampleCandidate = selectionData.candidates[0];
    const prompt = [
      '[只输出 JSON，不要输出 Markdown，不要输出代码块，不要输出解释]',
      '请始终使用简体中文。',
      '你正在为一个 AI 小镇里的 NPC 决定现在是否要主动找另一个空闲角色聊天。',
      '你必须严格返回一个 JSON 对象，不能返回空内容。',
      '只能从候选 playerId 中选择一个 inviteePlayerId；如果没有特别想聊的人，请返回 inviteePlayerId 为 null。',
      '不要编造候选人，不要输出候选列表之外的 playerId。',
      'inviteePlayerId 必须是候选 playerId 之一，或 null。',
      'reason 必须是简短中文字符串，说明选择或不选择的原因。',
      'confidence 必须是 0 到 1 之间的数字。',
      `当前时间：${new Date(args.now).toLocaleString()}`,
      `当前 NPC：${selectionData.player.name} (${selectionData.player.playerId})`,
      `关于当前 NPC：${selectionData.player.identity}`,
      `当前 NPC 的目标：${selectionData.player.plan}`,
      '候选对象：',
      ...selectionData.candidates.map((candidate, idx) =>
        [
          `${idx + 1}. ${candidate.name} (${candidate.playerId})`,
          `人设：${candidate.description}`,
          `距离：${candidate.distance.toFixed(2)}`,
          `上次共同聊天：${candidate.lastConversationEnded ? new Date(candidate.lastConversationEnded).toLocaleString() : '没有记录'}`,
          candidate.relatedMemories.length
            ? `相关记忆：${candidate.relatedMemories.map((m) => m.description).join('；')}`
            : '相关记忆：无',
        ].join('\n'),
      ),
      `允许的 inviteePlayerId：${selectionData.candidates.map((c) => c.playerId).join(', ')}，或 null。`,
      `返回格式示例一：{"inviteePlayerId":"${exampleCandidate.playerId}","reason":"${selectionData.player.name}想找${exampleCandidate.name}延续之前的话题。","confidence":0.82}`,
      '返回格式示例二：{"inviteePlayerId":null,"reason":"当前没有符合角色动机的聊天对象。","confidence":0.35}',
      '现在只返回 JSON 对象本身：',
    ];
    const { content } = await chatCompletion({
      messages: [{ role: 'user', content: prompt.join('\n') }],
      temperature: 0.2,
      max_tokens: 300,
    });
    const parsed = parseCandidateSelection(content);
    if (parsed.inviteePlayerId === null) {
      console.log(
        `[agentSelect] llm declined player=${args.player.id} reason=${parsed.reason}`,
      );
      await writeDebug({
        stage: 'llm-declined',
        candidateIds: promptCandidateIds,
        reason: parsed.reason,
        raw: content,
      });
      return undefined;
    }
    if (!candidateIds.has(parsed.inviteePlayerId)) {
      console.warn(
        `[agentSelect] llm invalid player=${args.player.id} invitee=${parsed.inviteePlayerId} reason=${parsed.reason}`,
      );
      return await fallback();
    }
    console.log(
      `[agentSelect] llm selected player=${args.player.id} invitee=${parsed.inviteePlayerId} confidence=${parsed.confidence ?? 'unknown'} reason=${parsed.reason}`,
    );
    await writeDebug({
      stage: 'llm-selected',
      candidateIds: promptCandidateIds,
      selectedPlayerId: parsed.inviteePlayerId as GameId<'players'>,
      reason: parsed.reason,
      raw: content,
    });
    return parsed.inviteePlayerId;
  } catch (e) {
    console.warn(`[agentSelect] llm failed player=${args.player.id} error=${formatError(e)}; falling back.`);
    return await fallback();
  }
}

function parseCandidateSelection(content: string): {
  inviteePlayerId: string | null;
  reason: string;
  confidence?: number;
} {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error('empty LLM response');
  }
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const jsonText = withoutFence.match(/\{[\s\S]*\}/)?.[0] ?? withoutFence;
  const parsed = JSON.parse(jsonText);
  const inviteePlayerId = parsed.inviteePlayerId ?? null;
  if (inviteePlayerId !== null && typeof inviteePlayerId !== 'string') {
    throw new Error(`Invalid inviteePlayerId: ${JSON.stringify(inviteePlayerId)}`);
  }
  return {
    inviteePlayerId,
    reason: typeof parsed.reason === 'string' ? parsed.reason : '',
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : undefined,
  };
}

function formatError(error: unknown) {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}
