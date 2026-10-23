import { ROLE_LABEL, seatLabel } from "./labels.js";
import { mulberry32, shuffle } from "./rng.js";
import type {
  GameEvent,
  GameState,
  NightState,
  ReduceResult,
  Role,
  Seat,
  SeatId,
} from "./types.js";
import { SEATS } from "./types.js";

const ROLES: Role[] = ["werewolf", "seer", "witch", "villager"];

function emptyNight(hasSave = true, hasPoison = true): NightState {
  return {
    killTarget: null,
    seerCheck: null,
    witchChoseSave: null,
    witchPoisonTarget: null,
    witchHasSave: hasSave,
    witchHasPoison: hasPoison,
  };
}

export function createGame(seed = 20261023): GameState {
  return {
    phase: "lobby_enroll",
    seats: SEATS.map((id) => ({
      id,
      name: null,
      speakerId: null,
      role: null,
      alive: true,
      enrolled: false,
      voiceprintStatus: "none",
    })),
    currentSeat: 1,
    nightNumber: 0,
    night: emptyNight(),
    votes: {},
    daySpeeches: [],
    lastDeaths: [],
    lastExile: null,
    winner: null,
    winReason: null,
    spokenScript: "欢迎来到灵矽狼人杀。请靠近电脑报名：说「我是一号，我叫某某」。",
    publicScript: "欢迎来到灵矽狼人杀。请靠近电脑报名：说「我是一号，我叫某某」。",
    lastMismatch: false,
    rngSeed: seed,
  };
}

function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

function say(state: GameState, spoken: string, pub?: string): void {
  state.spokenScript = spoken;
  state.publicScript = pub ?? spoken;
}

function fail(state: GameState, error: string, spoken?: string): ReduceResult {
  const next = cloneState(state);
  if (spoken) say(next, spoken);
  return { ok: false, error, state: next };
}

function ok(state: GameState): ReduceResult {
  return { ok: true, state };
}

export function seatById(state: GameState, id: SeatId): Seat {
  const seat = state.seats.find((s) => s.id === id);
  if (!seat) throw new Error(`missing seat ${id}`);
  return seat;
}

export function seatByRole(state: GameState, role: Role): Seat | undefined {
  return state.seats.find((s) => s.role === role);
}

export function aliveSeats(state: GameState): Seat[] {
  return state.seats.filter((s) => s.alive);
}

function aliveWolves(state: GameState): Seat[] {
  return aliveSeats(state).filter((s) => s.role === "werewolf");
}

function aliveVillagers(state: GameState): Seat[] {
  return aliveSeats(state).filter((s) => s.role !== "werewolf");
}

function isSeatId(value: number | undefined): value is SeatId {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

function nextAliveAfter(state: GameState, seat: SeatId): SeatId | null {
  const alive = aliveSeats(state).map((s) => s.id);
  const idx = alive.indexOf(seat);
  if (idx < 0) return alive[0] ?? null;
  return alive[idx + 1] ?? null;
}

function firstAlive(state: GameState): SeatId | null {
  return aliveSeats(state)[0]?.id ?? null;
}

function checkWin(state: GameState): boolean {
  const wolves = aliveWolves(state).length;
  const good = aliveVillagers(state).length;
  if (wolves === 0) {
    state.phase = "game_over";
    state.winner = "villagers";
    state.winReason = "狼人已全部出局，好人获胜。";
    state.currentSeat = null;
    say(state, `${state.winReason}请睁眼看旁观屏对身份。`);
    return true;
  }
  if (wolves >= good) {
    state.phase = "game_over";
    state.winner = "wolves";
    state.winReason = "场上狼人不少于好人，狼人获胜。";
    state.currentSeat = null;
    say(state, `${state.winReason}请睁眼看旁观屏对身份。`);
    return true;
  }
  return false;
}

function assignRoles(state: GameState): void {
  const rand = mulberry32(state.rngSeed);
  const roles = shuffle(ROLES, rand);
  state.seats.forEach((seat, i) => {
    seat.role = roles[i] ?? "villager";
  });
}

function privateDealScript(state: GameState, seat: SeatId): string {
  const s = seatById(state, seat);
  const role = s.role ? ROLE_LABEL[s.role] : "未知";
  const more = nextAliveAfter(state, seat);
  const closing = more
    ? `请记住后闭眼。下一位，请${seatLabel(more, seatById(state, more).name)}靠近，其他人继续捂耳。`
    : "身份发完。所有人捂耳，天黑请闭眼。";
  return `请其他人捂耳。${seatLabel(seat, s.name)}，你的身份是${role}。${closing}`;
}

function enterNight(state: GameState): void {
  const prevSave = state.night.witchHasSave;
  const prevPoison = state.night.witchHasPoison;
  state.nightNumber += 1;
  state.night = emptyNight(prevSave, prevPoison);
  state.votes = {};
  state.daySpeeches = [];
  state.lastExile = null;
  goNightWolf(state);
}

function goNightWolf(state: GameState): void {
  const wolf = seatByRole(state, "werewolf");
  if (!wolf?.alive) {
    checkWin(state);
    return;
  }
  state.phase = "night_wolf";
  state.currentSeat = wolf.id;
  const line =
    state.nightNumber === 1
      ? `天黑请闭眼。狼人请靠近电脑，说要刀的号码，例如「刀三号」。`
      : `天黑请闭眼。第${state.nightNumber}夜，狼人请靠近电脑刀人。`;
  say(state, line, "天黑请闭眼。狼人行动中。");
}

function goNightSeer(state: GameState): void {
  const seer = seatByRole(state, "seer");
  if (!seer?.alive) {
    goNightWitch(state);
    return;
  }
  state.phase = "night_seer";
  state.currentSeat = seer.id;
  say(
    state,
    `狼人请闭眼。预言家请靠近电脑，说要查验的号码，例如「查验二号」。`,
    "狼人请闭眼。预言家行动中。",
  );
}

function goNightWitch(state: GameState): void {
  const witch = seatByRole(state, "witch");
  if (!witch?.alive) {
    goDawn(state);
    return;
  }
  state.phase = "night_witch";
  state.currentSeat = witch.id;
  const diedHint = state.night.killTarget
    ? `今晚${seatLabel(state.night.killTarget, seatById(state, state.night.killTarget).name)}被刀了。`
    : `今晚是平安夜，没有人被刀。`;
  const saveHint = state.night.witchHasSave ? `你可以说「救」或「不救」。` : `解药已经用过。`;
  const poisonHint = state.night.witchHasPoison ? `要用毒药就说「毒N号」，否则说「过」。` : `毒药已经用过。`;
  say(
    state,
    `预言家请闭眼。女巫请靠近电脑。${diedHint}${saveHint}${poisonHint}`,
    "预言家请闭眼。女巫行动中。",
  );
}

function goDawn(state: GameState): void {
  const deaths = new Set<SeatId>();
  if (state.night.killTarget && state.night.witchChoseSave !== true) {
    deaths.add(state.night.killTarget);
  }
  if (state.night.witchPoisonTarget) {
    deaths.add(state.night.witchPoisonTarget);
  }
  for (const id of deaths) {
    seatById(state, id).alive = false;
  }
  state.lastDeaths = [...deaths];
  state.phase = "day_announce";
  state.currentSeat = null;
  if (checkWin(state)) return;
  if (deaths.size === 0) {
    say(state, `天亮了，昨晚是平安夜。请睁眼。说「开始发言」进入白天讨论。`);
  } else {
    const names = state.lastDeaths
      .map((id) => seatLabel(id, seatById(state, id).name))
      .join("、");
    say(state, `天亮了，昨晚出局的是${names}。请睁眼。说「开始发言」进入白天讨论。`);
  }
}

function startTalk(state: GameState): void {
  const first = firstAlive(state);
  state.phase = "day_talk";
  state.currentSeat = first;
  state.daySpeeches = [];
  if (!first) {
    checkWin(state);
    return;
  }
  say(state, `请从${seatLabel(first, seatById(state, first).name)}开始发言，每人一两句。说完请说「我说完了」。`);
}

function startVote(state: GameState): void {
  const first = firstAlive(state);
  state.phase = "day_vote";
  state.currentSeat = first;
  state.votes = {};
  if (!first) {
    checkWin(state);
    return;
  }
  say(state, `发言结束。请${seatLabel(first, seatById(state, first).name)}靠近投票，说「投N号」或「弃票」。`);
}

function resolveVotes(state: GameState): void {
  state.phase = "resolve";
  const counts = new Map<SeatId, number>();
  for (const vote of Object.values(state.votes)) {
    if (vote && vote !== "abstain") {
      counts.set(vote, (counts.get(vote) ?? 0) + 1);
    }
  }
  let top: SeatId | null = null;
  let topCount = 0;
  let tie = false;
  for (const [seat, count] of counts) {
    if (count > topCount) {
      top = seat;
      topCount = count;
      tie = false;
    } else if (count === topCount && count > 0) {
      tie = true;
    }
  }
  if (!top || tie || topCount === 0) {
    state.lastExile = null;
    say(state, `平票或无人过半，今天没有放逐。天黑请闭眼。`);
    if (checkWin(state)) return;
    enterNight(state);
    return;
  }
  seatById(state, top).alive = false;
  state.lastExile = top;
  state.lastDeaths = [top];
  const name = seatLabel(top, seatById(state, top).name);
  if (checkWin(state)) {
    say(state, `${name}被放逐。${state.winReason}`);
    return;
  }
  say(state, `${name}被放逐。天黑请闭眼。`);
  enterNight(state);
}

function verifyActor(
  state: GameState,
  event: Extract<GameEvent, { type: "act" }>,
): ReduceResult | null {
  if (state.currentSeat == null) {
    return fail(state, "当前没有被点名的座位");
  }
  const actor = seatById(state, state.currentSeat);
  if (!actor.alive) {
    return fail(state, "出局玩家不能行动", "已经出局，请下一位。");
  }

  if (event.voiceprintMatched === false) {
    const claimedOk = event.claimedSeat === state.currentSeat;
    if (claimedOk) {
      actor.voiceprintStatus = "low_confidence";
      state.lastMismatch = false;
      return null;
    }
    actor.voiceprintStatus = "mismatch";
    state.lastMismatch = true;
    return fail(
      state,
      "声纹与当前被点名座位不符",
      `这不是${seatLabel(state.currentSeat, actor.name)}的声音。请本人靠近电脑再说一次，或自报「我是${state.currentSeat}号」。`,
    );
  }

  if (event.voiceprintConfidence === "low") {
    actor.voiceprintStatus = "low_confidence";
  } else if (event.voiceprintMatched === true) {
    actor.voiceprintStatus = "matched";
  }
  state.lastMismatch = false;
  return null;
}

function enroll(state: GameState, event: Extract<GameEvent, { type: "enroll" }>): ReduceResult {
  if (state.phase !== "lobby_enroll") {
    return fail(state, "只有报名阶段可以入座");
  }
  const name = event.name.trim();
  if (!name) return fail(state, "名字不能为空", "请报上你的名字。");

  let seatId = event.claimedSeat;
  if (seatId) {
    const taken = seatById(state, seatId);
    if (taken.enrolled) {
      return fail(state, "该座位已被占用", `${seatId}号已经有人了，请换一个号码。`);
    }
  } else {
    seatId = state.seats.find((s) => !s.enrolled)?.id;
  }
  if (!isSeatId(seatId)) {
    return fail(state, "座位已满", "四个人已经齐了，说「开始狼人杀」发牌。");
  }

  const seat = seatById(state, seatId);
  seat.name = name;
  seat.enrolled = true;
  seat.speakerId = event.speakerId ?? null;
  seat.voiceprintStatus = event.speakerId ? "enrolled" : "none";
  state.currentSeat = seatId;

  const remaining = state.seats.filter((s) => !s.enrolled);
  if (remaining.length === 0) {
    say(state, `${seatLabel(seatId, name)}入座，声纹已记下。四个人齐了，说「开始狼人杀」发牌。`);
  } else {
    const nextSeat = remaining[0]!;
    state.currentSeat = nextSeat.id;
    say(state, `${seatLabel(seatId, name)}入座。请${nextSeat.id}号靠近电脑说「我是${nextSeat.id}号，我叫某某」。`);
  }
  return ok(state);
}

function start(state: GameState): ReduceResult {
  if (state.phase !== "lobby_enroll") {
    return fail(state, "已经开局");
  }
  if (state.seats.some((s) => !s.enrolled)) {
    return fail(
      state,
      "未报满四人不能开局",
      `还没坐满。还差${state.seats.filter((s) => !s.enrolled).map((s) => s.id).join("、")}号。`,
    );
  }
  assignRoles(state);
  state.phase = "deal_private";
  state.currentSeat = 1;
  state.nightNumber = 0;
  const line = privateDealScript(state, 1);
  say(state, line, "请按座位靠近听身份，其他人捂耳。");
  return ok(state);
}

function advance(state: GameState): ReduceResult {
  switch (state.phase) {
    case "deal_private": {
      const cur = state.currentSeat;
      if (!cur) return fail(state, "没有当前座位");
      const next = cur === 4 ? null : ((cur + 1) as SeatId);
      if (next) {
        state.currentSeat = next;
        say(state, privateDealScript(state, next), "请按座位靠近听身份，其他人捂耳。");
        return ok(state);
      }
      enterNight(state);
      return ok(state);
    }
    case "night_wolf":
      goNightSeer(state);
      return ok(state);
    case "night_seer":
      goNightWitch(state);
      return ok(state);
    case "night_witch":
      goDawn(state);
      return ok(state);
    case "day_announce":
      startTalk(state);
      return ok(state);
    case "day_talk": {
      if (!state.currentSeat) return fail(state, "没有当前发言人");
      const next = nextAliveAfter(state, state.currentSeat);
      if (next) {
        state.currentSeat = next;
        say(state, `请${seatLabel(next, seatById(state, next).name)}发言。说完请说「我说完了」。`);
        return ok(state);
      }
      startVote(state);
      return ok(state);
    }
    case "day_vote": {
      if (!state.currentSeat) return fail(state, "没有当前投票人");
      const voter = state.currentSeat;
      state.votes[voter] = "abstain";
      const next = nextAliveAfter(state, voter);
      if (next) {
        state.currentSeat = next;
        say(
          state,
          `${seatLabel(voter, seatById(state, voter).name)}超时记弃票。请${seatLabel(next, seatById(state, next).name)}投票。`,
        );
        return ok(state);
      }
      resolveVotes(state);
      return ok(state);
    }
    case "lobby_enroll":
      return fail(state, "报名阶段请先入座或开局");
    case "game_over":
      return fail(state, "游戏已结束", state.spokenScript);
    default:
      return fail(state, `阶段 ${state.phase} 不能推进`);
  }
}

function act(state: GameState, event: Extract<GameEvent, { type: "act" }>): ReduceResult {
  const denied = verifyActor(state, event);
  if (denied) return denied;

  switch (event.intent) {
    case "skip":
      return advance(state);
    case "kill": {
      if (state.phase !== "night_wolf") {
        return fail(state, "现在不是狼人刀人阶段");
      }
      if (!isSeatId(event.targetSeat)) {
        return fail(state, "请指定刀口", "请说要刀几号，例如「刀三号」。");
      }
      const target = seatById(state, event.targetSeat);
      if (!target.alive) return fail(state, "目标已出局", "那个人已经出局了，换一个。");
      if (event.targetSeat === state.currentSeat) {
        return fail(state, "不能刀自己", "不能刀自己，换一个。");
      }
      state.night.killTarget = event.targetSeat;
      goNightSeer(state);
      return ok(state);
    }
    case "check": {
      if (state.phase !== "night_seer") {
        return fail(state, "现在不是预言家查验阶段");
      }
      if (!isSeatId(event.targetSeat)) {
        return fail(state, "请指定查验对象", "请说查验几号，例如「查验二号」。");
      }
      const target = seatById(state, event.targetSeat);
      const isWerewolf = target.role === "werewolf";
      state.night.seerCheck = { target: event.targetSeat, isWerewolf };
      const result = isWerewolf ? "狼人" : "好人";
      goNightWitch(state);
      const witch = seatByRole(state, "witch");
      const diedHint =
        witch?.alive && state.night.killTarget
          ? `今晚${seatLabel(state.night.killTarget, seatById(state, state.night.killTarget).name)}被刀了。`
          : witch?.alive
            ? "今晚是平安夜。"
            : "";
      const privateLine = `查验结果：${seatLabel(event.targetSeat, target.name)}是${result}。请闭眼。${
        witch?.alive
          ? `女巫请靠近。${diedHint}${state.night.witchHasSave ? "可救或过。" : ""}`
          : ""
      }`;
      say(state, privateLine, "预言家已查验。女巫行动中。");
      return ok(state);
    }
    case "witch": {
      if (state.phase !== "night_witch") {
        return fail(state, "现在不是女巫行动阶段");
      }
      if (event.save && state.night.witchHasSave && state.night.killTarget) {
        state.night.witchChoseSave = true;
        state.night.witchHasSave = false;
      } else {
        state.night.witchChoseSave = false;
      }
      if (isSeatId(event.targetSeat) && state.night.witchHasPoison) {
        if (event.save) {
          return fail(state, "同一晚不能又救又毒", "同一晚只能选救、毒或过。");
        }
        const target = seatById(state, event.targetSeat);
        if (!target.alive) return fail(state, "目标已出局");
        state.night.witchPoisonTarget = event.targetSeat;
        state.night.witchHasPoison = false;
      }
      goDawn(state);
      return ok(state);
    }
    case "speak": {
      if (state.phase === "day_announce") {
        return startTalk(state), ok(state);
      }
      if (state.phase !== "day_talk") {
        return fail(state, "现在不是发言阶段");
      }
      if (!state.currentSeat) return fail(state, "没有当前发言人");
      const text = (event.speech ?? "").trim() || "过。";
      state.daySpeeches.push({ seat: state.currentSeat, text });
      return advance(state);
    }
    case "vote": {
      if (state.phase !== "day_vote") {
        return fail(state, "现在不是投票阶段");
      }
      if (!state.currentSeat) return fail(state, "没有当前投票人");
      if (event.targetSeat === "abstain" as unknown) {
        state.votes[state.currentSeat] = "abstain";
      } else if (!isSeatId(event.targetSeat)) {
        state.votes[state.currentSeat] = "abstain";
      } else {
        const target = seatById(state, event.targetSeat);
        if (!target.alive) return fail(state, "不能投出局玩家", "那个人已经出局，请改投。");
        state.votes[state.currentSeat] = event.targetSeat;
      }
      const voter = state.currentSeat;
      const next = nextAliveAfter(state, voter);
      if (next) {
        state.currentSeat = next;
        say(
          state,
          `${seatLabel(voter, seatById(state, voter).name)}投票完毕。请${seatLabel(next, seatById(state, next).name)}靠近投票。`,
        );
        return ok(state);
      }
      resolveVotes(state);
      return ok(state);
    }
    default:
      return fail(state, "未知行动");
  }
}

export function reduce(state: GameState, event: GameEvent): ReduceResult {
  const next = cloneState(state);
  next.lastMismatch = false;
  switch (event.type) {
    case "enroll":
      return enroll(next, event);
    case "start":
      return start(next);
    case "advance":
      return advance(next);
    case "act":
      return act(next, event);
  }
}
