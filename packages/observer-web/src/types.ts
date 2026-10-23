export type SeatId = 1 | 2 | 3 | 4;
export type Role = "werewolf" | "seer" | "witch" | "villager";
export type VoiceprintStatus =
  | "none"
  | "enrolled"
  | "matched"
  | "mismatch"
  | "low_confidence";

export interface SeatView {
  id: SeatId;
  name: string | null;
  alive: boolean;
  enrolled: boolean;
  voiceprintStatus: VoiceprintStatus;
  role?: Role | null;
  speakerId?: string | null;
}

export interface Snapshot {
  publicView: {
    phase: string;
    phaseLabel: string;
    currentSeat: SeatId | null;
    nightNumber: number;
    seats: SeatView[];
    lastDeaths: SeatId[];
    lastExile: SeatId | null;
    votes: Partial<Record<SeatId, SeatId | "abstain">>;
    daySpeeches: Array<{ seat: SeatId; text: string }>;
    winner: "wolves" | "villagers" | null;
    winReason: string | null;
    spokenScript: string;
    lastMismatch: boolean;
    enrolledCount: number;
  };
  godView: {
    phase: string;
    phaseLabel: string;
    currentSeat: SeatId | null;
    nightNumber: number;
    seats: SeatView[];
    lastDeaths: SeatId[];
    lastExile: SeatId | null;
    votes: Partial<Record<SeatId, SeatId | "abstain">>;
    daySpeeches: Array<{ seat: SeatId; text: string }>;
    winner: "wolves" | "villagers" | null;
    winReason: string | null;
    spokenScript: string;
    lastMismatch: boolean;
    enrolledCount: number;
    night: {
      killTarget: SeatId | null;
      seerCheck: { target: SeatId; isWerewolf: boolean } | null;
    };
  };
  spokenScript: string;
}
