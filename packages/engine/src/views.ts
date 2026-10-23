import { PHASE_LABEL } from "./labels.js";
import type { GameState, GodView, PrivateView, PublicView, SeatId } from "./types.js";

export function publicView(state: GameState): PublicView {
  return {
    phase: state.phase,
    phaseLabel: PHASE_LABEL[state.phase],
    currentSeat: state.currentSeat,
    nightNumber: state.nightNumber,
    seats: state.seats.map((s) => ({
      id: s.id,
      name: s.name,
      alive: s.alive,
      enrolled: s.enrolled,
      voiceprintStatus: s.voiceprintStatus,
    })),
    lastDeaths: state.lastDeaths,
    lastExile: state.lastExile,
    votes: state.votes,
    daySpeeches: state.daySpeeches,
    winner: state.winner,
    winReason: state.winReason,
    spokenScript: state.publicScript,
    lastMismatch: state.lastMismatch,
    enrolledCount: state.seats.filter((s) => s.enrolled).length,
  };
}

export function privateView(state: GameState, seat: SeatId): PrivateView {
  const found = state.seats.find((s) => s.id === seat);
  const isCurrent = state.currentSeat === seat;
  return {
    seat,
    name: found?.name ?? null,
    role: isCurrent ? found?.role ?? null : null,
    alive: found?.alive ?? false,
    seerCheck:
      isCurrent && found?.role === "seer" ? state.night.seerCheck : null,
  };
}

export function godView(state: GameState): GodView {
  const pub = publicView(state);
  return {
    ...pub,
    spokenScript: state.spokenScript,
    seats: state.seats.map((s) => ({
      id: s.id,
      name: s.name,
      alive: s.alive,
      enrolled: s.enrolled,
      voiceprintStatus: s.voiceprintStatus,
      role: s.role,
      speakerId: s.speakerId,
    })),
    night: structuredClone(state.night),
  };
}
