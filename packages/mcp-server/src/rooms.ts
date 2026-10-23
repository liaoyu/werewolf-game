import {
  createGame,
  godView,
  privateView,
  publicView,
  reduce,
  type GameEvent,
  type GameState,
  type GodView,
  type PublicView,
  type SeatId,
} from "@werewolf/engine";

export interface Room {
  deviceId: string;
  state: GameState;
  lastAudioUrl: string | null;
  updatedAt: number;
}

const rooms = new Map<string, Room>();
const listeners = new Set<(room: Room) => void>();

export function subscribe(fn: (room: Room) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(room: Room): void {
  room.updatedAt = Date.now();
  for (const fn of listeners) fn(room);
}

export function getRoom(deviceId: string): Room {
  const key = deviceId.toLowerCase();
  let room = rooms.get(key);
  if (!room) {
    room = {
      deviceId: key,
      state: createGame(Date.now() % 1_000_000),
      lastAudioUrl: null,
      updatedAt: Date.now(),
    };
    rooms.set(key, room);
  }
  return room;
}

export function applyEvent(deviceId: string, event: GameEvent): {
  ok: boolean;
  error?: string;
  state: GameState;
  publicView: PublicView;
  godView: GodView;
  spokenScript: string;
} {
  const room = getRoom(deviceId);
  const result = reduce(room.state, event);
  room.state = result.state;
  emit(room);
  return {
    ok: result.ok,
    error: result.ok ? undefined : result.error,
    state: result.state,
    publicView: publicView(result.state),
    godView: godView(result.state),
    spokenScript: result.state.spokenScript,
  };
}

export function snapshot(deviceId: string): {
  publicView: PublicView;
  godView: GodView;
  spokenScript: string;
  privateCurrent: ReturnType<typeof privateView> | null;
} {
  const room = getRoom(deviceId);
  const current = room.state.currentSeat as SeatId | null;
  return {
    publicView: publicView(room.state),
    godView: godView(room.state),
    spokenScript: room.state.spokenScript,
    privateCurrent: current ? privateView(room.state, current) : null,
  };
}

export function setLastAudio(deviceId: string, url: string | null): void {
  const room = getRoom(deviceId);
  room.lastAudioUrl = url;
  emit(room);
}

export function listRooms(): string[] {
  return [...rooms.keys()];
}
