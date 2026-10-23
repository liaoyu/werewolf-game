import { describe, expect, it } from "vitest";
import { DEFAULT_DEVICE_ID, normalizeDeviceId } from "./mcp.js";

describe("device id", () => {
  it("缺省落到共用伪 MAC", () => {
    expect(normalizeDeviceId("")).toBe(DEFAULT_DEVICE_ID.toLowerCase());
    expect(normalizeDeviceId("  AA:BB:CC:DD:EE:FF  ")).toBe("aa:bb:cc:dd:ee:ff");
  });
});
