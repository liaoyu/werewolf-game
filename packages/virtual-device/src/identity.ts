/** 与 mcp-server DEFAULT_DEVICE_ID / 旁观屏缺省值保持一致 */
export const DEFAULT_DEVICE_ID = "02:10:24:00:00:01";

function pinnedMac(): string {
  return String(import.meta.env.VITE_LINX_DEVICE_MAC ?? "").trim().toUpperCase();
}

function randomMac(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  bytes[0] = (bytes[0]! & 0xfe) | 0x02;
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join(":").toUpperCase();
}

function canonicalMac(value: string): string {
  return value.trim().toUpperCase();
}

export function loadIdentity(): { deviceId: string; clientId: string } {
  const pinned = pinnedMac();
  let deviceId = pinned || localStorage.getItem("werewolf-mac") || DEFAULT_DEVICE_ID;
  if (!deviceId) deviceId = randomMac();
  deviceId = canonicalMac(deviceId);
  localStorage.setItem("werewolf-mac", deviceId);

  let clientId = localStorage.getItem("werewolf-client");
  if (!clientId) {
    clientId = crypto.randomUUID();
    localStorage.setItem("werewolf-client", clientId);
  }
  return { deviceId, clientId };
}
