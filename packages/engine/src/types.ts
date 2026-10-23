export const SEATS = [1, 2, 3, 4] as const;
export type SeatId = (typeof SEATS)[number];

export type Role = "werewolf" | "seer" | "witch" | "villager";
export type Faction = "wolves" | "villagers";

export type Phase =
  | "lobby_enroll"
  | "deal_private"
  | "night_wolf"
  | "night_seer"
  | "night_witch"
  | "day_announce"
  | "day_talk"
  | "day_vote"
  | "resolve"
  | "game_over";

export type ActIntent = "speak" | "vote" | "kill" | "check" | "witch" | "skip";

export type VoiceprintStatus =
  | "none"
  | "enrolled"
  | "matched"
  | "mismatch"
  | "low_confidence";

export interface Seat {
  id: SeatId;
  name: string | null;
  speakerId: string | null;
  role: Role | null;
  alive: boolean;
  enrolled: boolean;
  voiceprintStatus: VoiceprintStatus;
}

export interface NightState {
  killTarget: SeatId | null;
  seerCheck: { target: SeatId; isWerewolf: boolean } | null;
  witchChoseSave: boolean | null;
  witchPoisonTarget: SeatId | null;
  witchHasSave: boolean;
  witchHasPoison: boolean;
}

export interface GameState {
  phase: Phase;
  seats: Seat[];
  currentSeat: SeatId | null;
  nightNumber: number;
  night: NightState;
  votes: Partial<Record<SeatId, SeatId | "abstain">>;
  daySpeeches: Array<{ seat: SeatId; text: string }>;
  lastDeaths: SeatId[];
  lastExile: SeatId | null;
  winner: Faction | null;
  winReason: string | null;
  /** 法官可以播的完整台词，夜间私密句也在这里 */
  spokenScript: string;
  /** 旁观公开屏使用，不含验人/刀口 */
  publicScript: string;
  lastMismatch: boolean;
  rngSeed: number;
}

export type GameEvent =
  | { type: "enroll"; name: string; claimedSeat?: SeatId; speakerId?: string }
  | { type: "start" }
  | { type: "advance" }
  | {
      type: "act";
      intent: ActIntent;
      targetSeat?: SeatId;
      speech?: string;
      save?: boolean;
      claimedSeat?: SeatId;
      /** null/undefined = 只靠点名；true/false = 声纹结果 */
      voiceprintMatched?: boolean | null;
      voiceprintConfidence?: "high" | "low";
    };

export interface PublicView {
  phase: Phase;
  phaseLabel: string;
  currentSeat: SeatId | null;
  nightNumber: number;
  seats: Array<{
    id: SeatId;
    name: string | null;
    alive: boolean;
    enrolled: boolean;
    voiceprintStatus: VoiceprintStatus;
  }>;
  lastDeaths: SeatId[];
  lastExile: SeatId | null;
  votes: Partial<Record<SeatId, SeatId | "abstain">>;
  daySpeeches: Array<{ seat: SeatId; text: string }>;
  winner: Faction | null;
  winReason: string | null;
  spokenScript: string;
  lastMismatch: boolean;
  enrolledCount: number;
}

export interface PrivateView {
  seat: SeatId;
  name: string | null;
  role: Role | null;
  alive: boolean;
  seerCheck: { target: SeatId; isWerewolf: boolean } | null;
}

export interface GodView extends PublicView {
  seats: Array<{
    id: SeatId;
    name: string | null;
    alive: boolean;
    enrolled: boolean;
    voiceprintStatus: VoiceprintStatus;
    role: Role | null;
    speakerId: string | null;
  }>;
  night: NightState;
}

export type ReduceResult =
  | { ok: true; state: GameState }
  | { ok: false; error: string; state: GameState };
