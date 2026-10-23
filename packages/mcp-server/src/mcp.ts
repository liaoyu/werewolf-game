import type { Context } from "hono";
import { callTool, TOOLS } from "./tools.js";
import type { LinxConfig } from "@werewolf/voiceprint";

interface RpcRequest {
  jsonrpc?: string;
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
}

const sessions = new Map<string, Set<ReadableStreamDefaultController<Uint8Array>>>();

function encodeSse(event: string, data: string): Uint8Array {
  return new TextEncoder().encode(`event: ${event}\ndata: ${data}\n\n`);
}

export function mcpGet(c: Context, publicUrl: string): Response {
  const sessionId = crypto.randomUUID();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const set = sessions.get(sessionId) ?? new Set();
      set.add(controller);
      sessions.set(sessionId, set);
      const endpoint = `${publicUrl.replace(/\/$/, "")}/mcp/message?sessionId=${sessionId}`;
      controller.enqueue(encodeSse("endpoint", endpoint));
    },
    cancel() {
      sessions.delete(sessionId);
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function pushSession(sessionId: string, payload: unknown): void {
  const set = sessions.get(sessionId);
  if (!set) return;
  const bytes = encodeSse("message", JSON.stringify(payload));
  for (const controller of set) {
    try {
      controller.enqueue(bytes);
    } catch {
      set.delete(controller);
    }
  }
}

export async function handleRpc(
  body: RpcRequest,
  deviceId: string,
  linx: LinxConfig | null,
  sessionId?: string,
): Promise<unknown> {
  const id = body.id ?? 0;
  const method = body.method ?? "";
  const params = body.params ?? {};

  let result: unknown;
  switch (method) {
    case "initialize":
      result = {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "werewolf-mcp", version: "0.1.0" },
      };
      break;
    case "notifications/initialized":
      return null;
    case "tools/list":
      result = { tools: TOOLS };
      break;
    case "tools/call": {
      const name = String(params.name ?? "");
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      const called = await callTool(name, args, deviceId, linx);
      result = {
        content: [{ type: "text", text: called.text }],
        isError: called.isError,
      };
      break;
    }
    case "ping":
      result = {};
      break;
    default:
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Unknown method ${method}` },
      };
  }

  const response = { jsonrpc: "2.0", id, result };
  if (sessionId) pushSession(sessionId, response);
  return response;
}

/** 设备页 / 旁观屏 / MCP 缺省房间键，与 LINX_DEVICE_MAC 缺省值保持一致 */
export const DEFAULT_DEVICE_ID = "02:10:24:00:00:01";

export function normalizeDeviceId(raw: string | undefined | null): string {
  const value = (raw ?? "").trim();
  return (value || DEFAULT_DEVICE_ID).toLowerCase();
}

export function deviceIdFromHeaders(c: Context, fallback?: string): string {
  const deviceHeader =
    c.req.header("Device-Id") ||
    c.req.header("device-id") ||
    c.req.header("X-Linx-Device-Id") ||
    c.req.header("x-linx-device-id");
  const agentHeader = c.req.header("Agent-Id") || c.req.header("X-Linx-Agent-Id");
  const sessionHeader = c.req.header("Session-Id") || c.req.header("X-Linx-Session-Id");
  const id = normalizeDeviceId(
    deviceHeader || c.req.query("deviceId") || process.env.LINX_DEVICE_MAC || fallback,
  );
  console.log(
    `[mcp] room=${id} Device-Id=${deviceHeader ?? "-"} Agent-Id=${agentHeader ?? "-"} Session-Id=${sessionHeader ?? "-"}`,
  );
  return id;
}
