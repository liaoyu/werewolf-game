function randomMac(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  bytes[0] = (bytes[0]! & 0xfe) | 0x02;
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join(":").toUpperCase();
}

export function loadIdentity(): { deviceId: string; clientId: string } {
  let deviceId = localStorage.getItem("werewolf-mac");
  let clientId = localStorage.getItem("werewolf-client");
  if (!deviceId) {
    deviceId = randomMac();
    localStorage.setItem("werewolf-mac", deviceId);
  }
  if (!clientId) {
    clientId = crypto.randomUUID();
    localStorage.setItem("werewolf-client", clientId);
  }
  return { deviceId, clientId };
}
