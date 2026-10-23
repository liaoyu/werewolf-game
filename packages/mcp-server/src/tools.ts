import type { ActIntent, SeatId } from "@werewolf/engine";
import {
  bindSpeakers,
  enrollSpeaker,
  latestChatAudio,
  verifyAgainstSeat,
  type LinxConfig,
} from "@werewolf/voiceprint";
import { applyEvent, getRoom, snapshot } from "./rooms.js";

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const TOOLS: ToolDef[] = [
  {
    name: "werewolf_enroll",
    description:
      "报名入座。玩家说「我是N号，我叫某某」时调用。不要猜测是谁在说话，号码用玩家自称。",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "玩家自称的名字" },
        claimed_seat: {
          type: "integer",
          description: "玩家自称的座位 1-4",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "werewolf_start",
    description: "四个人齐了或用户说「开始狼人杀」时开局发牌。",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "werewolf_scene",
    description: "查询现在点谁、什么阶段、下一句该说什么。不确定时先调这个。",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "werewolf_act",
    description:
      "当前被点名玩家的行动。intent: speak/vote/kill/check/witch/skip。行动记在系统点名的座位上，不要自己填谁在说话。若玩家自报「我是N号」，填 claimed_seat。",
    inputSchema: {
      type: "object",
      properties: {
        intent: {
          type: "string",
          enum: ["speak", "vote", "kill", "check", "witch", "skip"],
        },
        target_seat: { type: "integer", description: "刀/验/毒/投的目标 1-4" },
        speech: { type: "string", description: "白天发言原文" },
        save: { type: "boolean", description: "女巫是否用解药" },
        claimed_seat: { type: "integer", description: "玩家自报的座位" },
      },
      required: ["intent"],
    },
  },
  {
    name: "werewolf_advance",
    description: "超时、闭眼、听完身份、进入下一阶段。",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "werewolf_status",
    description: "只返回公开信息：存活、阶段、票型。禁止用它编造死亡或身份。",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "werewolf_reset",
    description: "新开一局，清空报名与身份。用户说「新开一局 / 重新开始」时调用。",
    inputSchema: { type: "object", properties: {} },
  },
];

function asSeat(value: unknown): SeatId | undefined {
  const n = Number(value);
  if (n === 1 || n === 2 || n === 3 || n === 4) return n;
  return undefined;
}

function pack(deviceId: string, extra?: Record<string, unknown>): string {
  const snap = snapshot(deviceId);
  return JSON.stringify(
    {
      spokenScript: snap.spokenScript,
      publicView: snap.publicView,
      currentPrivate: snap.privateCurrent,
      hint: "只朗读 spokenScript。不要把 publicView 里没有的身份说出去。白天每人一两句，卡住就 werewolf_advance。抢麦时请本人靠近。",
      ...extra,
    },
    null,
    2,
  );
}

export async function callTool(
  name: string,
  args: Record<string, unknown>,
  deviceId: string,
  linx: LinxConfig | null,
): Promise<{ text: string; isError: boolean }> {
  try {
    switch (name) {
      case "werewolf_enroll": {
        const room = getRoom(deviceId);
        const nameArg = String(args.name ?? "").trim();
        const claimed = asSeat(args.claimed_seat);
        const audioUrl =
          room.lastAudioUrl ?? (await latestChatAudio(linx));
        const enrolled = await enrollSpeaker(
          linx,
          nameArg || "玩家",
          audioUrl,
          deviceId,
        );
        const result = applyEvent(deviceId, {
          type: "enroll",
          name: nameArg || "玩家",
          claimedSeat: claimed,
          speakerId: enrolled.speakerId,
        });
        const ids = result.state.seats
          .map((s) => s.speakerId)
          .filter((id): id is string => Boolean(id));
        await bindSpeakers(linx, ids);
        return {
          text: pack(deviceId, {
            ok: result.ok,
            error: result.error,
            voiceprintMocked: enrolled.mocked,
          }),
          isError: !result.ok,
        };
      }
      case "werewolf_start": {
        const result = applyEvent(deviceId, { type: "start" });
        return {
          text: pack(deviceId, { ok: result.ok, error: result.error }),
          isError: !result.ok,
        };
      }
      case "werewolf_scene":
      case "werewolf_status":
        return { text: pack(deviceId), isError: false };
      case "werewolf_advance": {
        const result = applyEvent(deviceId, { type: "advance" });
        return {
          text: pack(deviceId, { ok: result.ok, error: result.error }),
          isError: !result.ok,
        };
      }
      case "werewolf_reset": {
        const result = applyEvent(deviceId, { type: "reset" });
        return {
          text: pack(deviceId, { ok: result.ok, error: result.error }),
          isError: !result.ok,
        };
      }
      case "werewolf_act": {
        const room = getRoom(deviceId);
        const expected = room.state.currentSeat
          ? room.state.seats.find((s) => s.id === room.state.currentSeat)
              ?.speakerId ?? null
          : null;
        const audioUrl = room.lastAudioUrl ?? (await latestChatAudio(linx));
        const verified = await verifyAgainstSeat({
          config: linx,
          audioUrl,
          expectedSpeakerId: expected,
        });
        const intent = String(args.intent ?? "skip") as ActIntent;
        const result = applyEvent(deviceId, {
          type: "act",
          intent,
          targetSeat: asSeat(args.target_seat),
          speech: args.speech ? String(args.speech) : undefined,
          save: Boolean(args.save),
          claimedSeat: asSeat(args.claimed_seat),
          voiceprintMatched: verified.matched,
          voiceprintConfidence: verified.confidence,
        });
        return {
          text: pack(deviceId, { ok: result.ok, error: result.error }),
          isError: !result.ok,
        };
      }
      default:
        return { text: `未知工具: ${name}`, isError: true };
    }
  } catch (err) {
    return {
      text: err instanceof Error ? err.message : String(err),
      isError: true,
    };
  }
}
