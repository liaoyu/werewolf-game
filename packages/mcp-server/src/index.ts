import { serve } from "@hono/node-server";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { LinxConfig } from "@werewolf/voiceprint";
import type { GameEvent } from "@werewolf/engine";
import { DEFAULT_DEVICE_ID, deviceIdFromHeaders, handleRpc, mcpGet } from "./mcp.js";
import { applyEvent, getRoom, listRooms, setLastAudio, snapshot, subscribe } from "./rooms.js";
import { pollActivate, requestOta } from "./linx.js";
import { pcmToWav } from "./pcm.js";

function loadEnv(): void {
  const path = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "../../.env"),
  ].find((p) => existsSync(p));
  if (!path) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv();

const PORT = Number(process.env.PORT ?? 8787);
const PUBLIC_URL = process.env.MCP_PUBLIC_URL ?? `http://127.0.0.1:${PORT}`;

function linxConfig(): LinxConfig | null {
  const apiKey = process.env.LINX_API_KEY ?? "";
  const agentId = process.env.LINX_AGENT_ID ?? "";
  if (!apiKey) return null;
  return { apiKey, agentId };
}

const wavStore = new Map<string, Buffer>();
const app = new Hono();
app.use("*", cors());

app.get("/health", (c) =>
  c.json({ ok: true, rooms: listRooms(), publicUrl: PUBLIC_URL }),
);

app.get("/mcp", (c) => mcpGet(c, PUBLIC_URL));

async function mcpPost(c: Context) {
  const body = await c.req.json();
  const deviceId = deviceIdFromHeaders(c);
  const sessionId = c.req.query("sessionId");
  const result = await handleRpc(body, deviceId, linxConfig(), sessionId);
  if (result == null) return c.body(null, 204);
  return c.json(result);
}

app.post("/mcp/message", mcpPost);
app.post("/mcp", mcpPost);

app.get("/api/rooms", (c) => c.json({ rooms: listRooms() }));

app.get("/api/rooms/:id", (c) => {
  const id = c.req.param("id");
  return c.json(snapshot(id));
});

app.post("/api/rooms/:id/event", async (c) => {
  const id = c.req.param("id");
  const event = (await c.req.json()) as GameEvent;
  const result = applyEvent(id, event);
  return c.json(result);
});

app.post("/api/rooms/:id/utterance", async (c) => {
  const id = c.req.param("id").toLowerCase();
  const buf = Buffer.from(await c.req.arrayBuffer());
  wavStore.set(id, buf);
  const url = `${PUBLIC_URL.replace(/\/$/, "")}/audio/${id}/last.wav`;
  setLastAudio(id, url);
  return c.json({ audioUrl: url, bytes: buf.length });
});

app.get("/audio/:id/last.wav", (c) => {
  const buf = wavStore.get(c.req.param("id").toLowerCase());
  if (!buf) return c.body("missing", 404);
  return new Response(buf, {
    headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" },
  });
});

app.post("/linx/ota", async (c) => {
  const { deviceId, clientId } = (await c.req.json()) as {
    deviceId: string;
    clientId: string;
  };
  const result = await requestOta(deviceId, clientId);
  return c.json(result);
});

app.post("/linx/ota/activate", async (c) => {
  const { deviceId } = (await c.req.json()) as { deviceId: string };
  const bound = await pollActivate(deviceId);
  return c.json({ bound });
});

const server = serve({
  fetch: app.fetch,
  port: PORT,
  hostname: "0.0.0.0",
});

const wss = new WebSocketServer({ noServer: true });

function observerHandler(client: WebSocket, url: URL): void {
  const deviceId = (url.searchParams.get("deviceId") || process.env.LINX_DEVICE_MAC || DEFAULT_DEVICE_ID).toLowerCase();
  const send = () => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: "state", ...snapshot(deviceId) }));
    }
  };
  send();
  const unsub = subscribe((room) => {
    if (room.deviceId === deviceId) send();
  });
  client.on("close", unsub);
}

function deviceBridge(client: WebSocket, url: URL): void {
  const deviceId = (url.searchParams.get("deviceId") ?? "").toUpperCase();
  const clientId = url.searchParams.get("clientId") ?? crypto.randomUUID();
  const token = url.searchParams.get("token") ?? "";
  const upstreamUrl =
    url.searchParams.get("wsUrl") ?? "wss://xrobo-io.qiniuapi.com/v1/ws/";

  if (!deviceId) {
    client.send(JSON.stringify({ type: "error", message: "missing deviceId" }));
    client.close();
    return;
  }

  const upstream = new WebSocket(upstreamUrl, {
    headers: {
      Authorization: token ? `Bearer ${token}` : "",
      "Device-Id": deviceId,
      "Client-Id": clientId,
      "Protocol-Version": "1",
      Pragma: "no-cache",
      "Cache-Control": "no-cache",
    },
  });

  const pcmChunks: Buffer[] = [];

  upstream.on("open", () => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: "upstream_open" }));
    }
  });
  upstream.on("message", (data, isBinary) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data, { binary: isBinary });
    }
  });
  upstream.on("close", () => client.close());
  upstream.on("error", (err) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: "error", message: String(err) }));
    }
  });

  client.on("message", (data, isBinary) => {
    if (upstream.readyState !== WebSocket.OPEN) return;
    if (isBinary) {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
      pcmChunks.push(buf);
      upstream.send(buf);
      return;
    }
    const text = data.toString();
    try {
      const msg = JSON.parse(text) as { type?: string; state?: string };
      if (msg.type === "listen" && msg.state === "stop" && pcmChunks.length) {
        const wav = pcmToWav(Buffer.concat(pcmChunks));
        wavStore.set(deviceId.toLowerCase(), wav);
        const audioUrl = `${PUBLIC_URL.replace(/\/$/, "")}/audio/${deviceId.toLowerCase()}/last.wav`;
        setLastAudio(deviceId.toLowerCase(), audioUrl);
        pcmChunks.length = 0;
      }
      if (msg.type === "listen" && msg.state === "start") {
        pcmChunks.length = 0;
      }
    } catch {
      /* ignore */
    }
    upstream.send(text);
  });
  client.on("close", () => upstream.close());
}

server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/observer") {
    wss.handleUpgrade(req, socket, head, (ws) => observerHandler(ws, url));
    return;
  }
  if (url.pathname === "/linx/device") {
    wss.handleUpgrade(req, socket, head, (ws) => deviceBridge(ws, url));
    return;
  }
  socket.destroy();
});

const defaultRoom = (process.env.LINX_DEVICE_MAC || DEFAULT_DEVICE_ID).toLowerCase();
console.log(`werewolf mcp-server http://127.0.0.1:${PORT}`);
console.log(`MCP SSE: ${PUBLIC_URL}/mcp`);
console.log(`default room: ${defaultRoom}`);
console.log(`observer: ws://127.0.0.1:${PORT}/observer?deviceId=`);
console.log(`device bridge: ws://127.0.0.1:${PORT}/linx/device`);
console.log(`隧道 URL 变了要改 .env 的 MCP_PUBLIC_URL 并重启 pnpm dev`);
