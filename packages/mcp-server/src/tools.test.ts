import { describe, expect, it } from "vitest";
import { callTool } from "./tools.js";

describe("mcp smoke", () => {
  const device = "smoke-device";

  it("enroll → start → scene 的 publicView 不含角色", async () => {
    for (const [seat, name] of [
      [1, "甲"],
      [2, "乙"],
      [3, "丙"],
      [4, "丁"],
    ] as const) {
      const enrolled = await callTool(
        "werewolf_enroll",
        { name, claimed_seat: seat },
        device,
        null,
      );
      expect(enrolled.isError).toBe(false);
    }
    const started = await callTool("werewolf_start", {}, device, null);
    expect(started.isError).toBe(false);
    const scene = JSON.parse(
      (await callTool("werewolf_scene", {}, device, null)).text,
    ) as {
      publicView: { seats: Array<{ role?: string }> };
      spokenScript: string;
    };
    expect(JSON.stringify(scene.publicView)).not.toMatch(/werewolf|seer|witch/);
    expect(scene.publicView.seats.every((seat) => !seat.role)).toBe(true);

    const reset = await callTool("werewolf_reset", {}, device, null);
    expect(reset.isError).toBe(false);
    const lobby = JSON.parse(reset.text) as {
      publicView: { seats: Array<{ enrolled?: boolean; role?: string }> };
    };
    expect(lobby.publicView.seats.every((seat) => !seat.enrolled && !seat.role)).toBe(
      true,
    );
  });
});
