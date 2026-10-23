import { describe, expect, it } from "vitest";
import { createGame, reduce, seatByRole } from "./game.js";
import { godView, privateView, publicView } from "./views.js";
import type { GameState, Phase, SeatId } from "./types.js";

function must(result: ReturnType<typeof reduce>): GameState {
  expect(result.ok, result.ok ? "" : result.error).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

function enrollFour(seed = 1): GameState {
  let state = createGame(seed);
  for (const [seat, name] of [
    [1, "甲"],
    [2, "乙"],
    [3, "丙"],
    [4, "丁"],
  ] as const) {
    state = must(
      reduce(state, {
        type: "enroll",
        name,
        claimedSeat: seat,
        speakerId: `spk-${seat}`,
      }),
    );
  }
  return state;
}

function playTo(state: GameState, phase: Phase): GameState {
  let next = state;
  for (let i = 0; i < 40; i++) {
    if (next.phase === phase) return next;
    if (next.phase === "game_over") {
      throw new Error(`ended at game_over before ${phase}`);
    }
    if (next.phase === "day_talk") {
      next = must(reduce(next, { type: "act", intent: "speak", speech: "过" }));
    } else {
      next = must(reduce(next, { type: "advance" }));
    }
  }
  throw new Error(`stuck at ${next.phase}, wanted ${phase}`);
}

describe("报名与开局", () => {
  it("未报满四人不能开局", () => {
    let state = createGame();
    state = must(reduce(state, { type: "enroll", name: "甲", claimedSeat: 1 }));
    const result = reduce(state, { type: "start" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/未报满/);
  });

  it("四人报名后可以开局并发牌", () => {
    const state = must(reduce(enrollFour(), { type: "start" }));
    expect(state.phase).toBe("deal_private");
    expect(state.currentSeat).toBe(1);
    expect(state.seats.every((s) => s.role)).toBe(true);
    const roles = state.seats.map((s) => s.role).sort();
    expect(roles).toEqual(["seer", "villager", "werewolf", "witch"].sort());
  });

  it("reset 清空身份回到报名", () => {
    const started = must(reduce(enrollFour(), { type: "start" }));
    const reset = must(reduce(started, { type: "reset" }));
    expect(reset.phase).toBe("lobby_enroll");
    expect(reset.seats.every((s) => !s.enrolled && s.role === null)).toBe(true);
  });
});

describe("信息隔离", () => {
  it("预言家验人结果不进入 publicView，也不带进女巫口播", () => {
    let state = must(reduce(enrollFour(7), { type: "start" }));
    state = playTo(state, "night_wolf");
    const wolf = seatByRole(state, "werewolf")!;
    const seer = seatByRole(state, "seer")!;
    const target = state.seats.find((s) => s.id !== wolf.id && s.alive)!;
    state = must(
      reduce(state, { type: "act", intent: "kill", targetSeat: target.id }),
    );
    expect(state.phase).toBe("night_wolf");
    expect(state.spokenScript).toMatch(/闭眼离开/);
    expect(publicView(state).spokenScript).not.toMatch(/刀/);

    state = must(reduce(state, { type: "advance" }));
    expect(state.phase).toBe("night_seer");
    expect(state.currentSeat).toBe(seer.id);
    state = must(
      reduce(state, { type: "act", intent: "check", targetSeat: wolf.id }),
    );
    expect(state.phase).toBe("night_seer");
    expect(state.night.seerCheck?.isWerewolf).toBe(true);
    expect(state.spokenScript).toMatch(/查验结果/);
    expect(state.spokenScript).toMatch(/狼人/);
    expect(state.spokenScript).not.toMatch(/女巫/);
    const pub = publicView(state);
    expect(pub.spokenScript).not.toMatch(/狼人/);
    expect(pub.spokenScript).not.toMatch(/查验结果/);
    expect(JSON.stringify(pub.seats)).not.toMatch(/werewolf|seer|witch/);
    const seerPrivate = privateView(state, seer.id);
    expect(seerPrivate.seerCheck?.target).toBe(wolf.id);

    state = must(reduce(state, { type: "advance" }));
    expect(state.phase).toBe("night_witch");
    expect(state.spokenScript).toMatch(/女巫/);
    expect(state.spokenScript).not.toMatch(/查验结果/);
    expect(publicView(state).spokenScript).not.toMatch(/查验结果|狼人/);
    expect(privateView(state, seer.id).seerCheck).toBeNull();
    const god = godView(state);
    expect(god.night.seerCheck?.target).toBe(wolf.id);
  });
});

describe("女巫", () => {
  it("解药可以救下被刀的人", () => {
    let state = must(reduce(enrollFour(11), { type: "start" }));
    state = playTo(state, "night_wolf");
    const wolf = seatByRole(state, "werewolf")!;
    const victim = state.seats.find((s) => s.id !== wolf.id)!;
    state = must(
      reduce(state, { type: "act", intent: "kill", targetSeat: victim.id }),
    );
    state = playTo(state, "night_witch");
    state = must(reduce(state, { type: "act", intent: "witch", save: true }));
    expect(state.phase).toBe("day_announce");
    expect(seatByRole(state, "werewolf")).toBeTruthy();
    expect(state.seats.find((s) => s.id === victim.id)?.alive).toBe(true);
    expect(state.lastDeaths).toEqual([]);
  });
});

describe("投票与胜负", () => {
  it("死人不能投票", () => {
    let state = must(reduce(enrollFour(3), { type: "start" }));
    state = playTo(state, "night_wolf");
    const wolf = seatByRole(state, "werewolf")!;
    const victim = state.seats.find((s) => s.id !== wolf.id)!;
    state = must(
      reduce(state, { type: "act", intent: "kill", targetSeat: victim.id }),
    );
    state = playTo(state, "night_witch");
    state = must(reduce(state, { type: "act", intent: "witch" }));
    expect(state.seats.find((s) => s.id === victim.id)?.alive).toBe(false);
    state = playTo(state, "day_vote");
    expect(state.currentSeat).not.toBe(victim.id);
    expect(state.seats.find((s) => s.id === state.currentSeat)?.alive).toBe(true);
  });

  it("平票不放逐", () => {
    let state = must(reduce(enrollFour(5), { type: "start" }));
    state = playTo(state, "day_vote");
    const alive = state.seats.filter((s) => s.alive);
    expect(alive).toHaveLength(4);
    const a = alive[0]!.id;
    const b = alive[1]!.id;
    const c = alive[2]!.id;
    const d = alive[3]!.id;
    const votes: Array<[SeatId, SeatId]> = [
      [a, b],
      [b, a],
      [c, b],
      [d, a],
    ];
    for (const [, target] of votes) {
      expect(state.phase).toBe("day_vote");
      state = must(
        reduce(state, { type: "act", intent: "vote", targetSeat: target }),
      );
    }
    expect(state.lastExile).toBeNull();
    expect(state.seats.every((s) => s.alive)).toBe(true);
    expect(state.phase).toBe("night_wolf");
  });

  it("放逐唯一狼人则好人胜", () => {
    let state = must(reduce(enrollFour(9), { type: "start" }));
    state = playTo(state, "day_vote");
    const wolf = seatByRole(state, "werewolf")!;
    while (state.phase === "day_vote") {
      state = must(
        reduce(state, { type: "act", intent: "vote", targetSeat: wolf.id }),
      );
    }
    expect(state.phase).toBe("game_over");
    expect(state.winner).toBe("villagers");
  });

  it("狼人刀到只剩一名好人则狼人胜", () => {
    let state = must(reduce(enrollFour(13), { type: "start" }));
    state = playTo(state, "night_wolf");
    const wolf = seatByRole(state, "werewolf")!;
    const others = state.seats.filter((s) => s.id !== wolf.id);
    state = must(
      reduce(state, { type: "act", intent: "kill", targetSeat: others[0]!.id }),
    );
    state = playTo(state, "night_witch");
    state = must(reduce(state, { type: "act", intent: "witch" }));
    expect(state.seats.filter((s) => s.alive)).toHaveLength(3);
    state = playTo(state, "day_vote");
    while (state.phase === "day_vote") {
      const target = others[1]!.id;
      state = must(
        reduce(state, { type: "act", intent: "vote", targetSeat: target }),
      );
    }
    if (state.phase === "game_over") {
      expect(state.winner).toBe("wolves");
      return;
    }
    expect(state.phase).toBe("night_wolf");
    const stillAlive = state.seats.filter(
      (s) => s.alive && s.id !== wolf.id,
    );
    state = must(
      reduce(state, {
        type: "act",
        intent: "kill",
        targetSeat: stillAlive[0]!.id,
      }),
    );
    state = playTo(state, "night_witch");
    state = must(reduce(state, { type: "act", intent: "witch" }));
    expect(state.phase).toBe("game_over");
    expect(state.winner).toBe("wolves");
  });
});

describe("声纹校验", () => {
  it("声纹不匹配且未自报家门则拒绝记票", () => {
    let state = must(reduce(enrollFour(17), { type: "start" }));
    state = playTo(state, "day_vote");
    const current = state.currentSeat!;
    const result = reduce(state, {
      type: "act",
      intent: "vote",
      targetSeat: 1,
      voiceprintMatched: false,
    });
    expect(result.ok).toBe(false);
    expect(result.state.votes[current]).toBeUndefined();
    expect(result.state.spokenScript).toMatch(/请本人靠近/);
  });

  it("声纹不匹配但自报当前座位仍可记票", () => {
    let state = must(reduce(enrollFour(19), { type: "start" }));
    state = playTo(state, "day_vote");
    const current = state.currentSeat!;
    const target = state.seats.find((s) => s.id !== current)!.id;
    state = must(
      reduce(state, {
        type: "act",
        intent: "vote",
        targetSeat: target,
        voiceprintMatched: false,
        claimedSeat: current,
      }),
    );
    expect(state.votes[current]).toBe(target);
  });
});
