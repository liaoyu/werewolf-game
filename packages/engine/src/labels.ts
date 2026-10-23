import type { Phase, Role, SeatId } from "./types.js";

export const PHASE_LABEL: Record<Phase, string> = {
  lobby_enroll: "报名入座",
  deal_private: "捂耳听身份",
  night_wolf: "夜晚 · 狼人",
  night_seer: "夜晚 · 预言家",
  night_witch: "夜晚 · 女巫",
  day_announce: "天亮公告",
  day_talk: "白天发言",
  day_vote: "白天投票",
  resolve: "放逐结算",
  game_over: "终局",
};

export const ROLE_LABEL: Record<Role, string> = {
  werewolf: "狼人",
  seer: "预言家",
  witch: "女巫",
  villager: "村民",
};

export function seatLabel(seat: SeatId, name?: string | null): string {
  return name ? `${seat}号${name}` : `${seat}号`;
}
