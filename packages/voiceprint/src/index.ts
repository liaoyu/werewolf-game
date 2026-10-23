export interface LinxConfig {
  apiKey: string;
  agentId: string;
  baseUrl?: string;
}

export interface EnrollResult {
  speakerId: string;
  mocked: boolean;
}

const DEFAULT_BASE = "https://xrobo.qiniu.com";

async function linxFetch(
  config: LinxConfig,
  path: string,
  init: RequestInit,
): Promise<{ code: number; msg?: string; data?: unknown }> {
  const res = await fetch(`${config.baseUrl ?? DEFAULT_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  return (await res.json()) as { code: number; msg?: string; data?: unknown };
}

export async function enrollSpeaker(
  config: LinxConfig | null,
  name: string,
  audioUrl: string | null,
  deviceId: string,
): Promise<EnrollResult> {
  if (!config?.apiKey || !audioUrl) {
    return { speakerId: `mock-${deviceId}-${name}`, mocked: true };
  }

  const created = await linxFetch(config, "/v1/speakers", {
    method: "POST",
    body: JSON.stringify({ name, desc: `werewolf seat ${name}` }),
  });
  const speakerId =
    typeof created.data === "object" && created.data && "speaker_id" in created.data
      ? String((created.data as { speaker_id: string }).speaker_id)
      : null;
  if (created.code !== 0 || !speakerId) {
    return { speakerId: `mock-${deviceId}-${name}`, mocked: true };
  }

  await linxFetch(config, `/v1/speakers/${speakerId}/voiceprint`, {
    method: "POST",
    body: JSON.stringify({
      audio_url: audioUrl,
      source_device_id: deviceId,
    }),
  });

  return { speakerId, mocked: false };
}

export async function bindSpeakers(
  config: LinxConfig | null,
  speakerIds: string[],
): Promise<void> {
  if (!config?.apiKey || speakerIds.some((id) => id.startsWith("mock-"))) return;
  await linxFetch(config, `/v1/agents/${config.agentId}/speaker-config`, {
    method: "PUT",
    body: JSON.stringify({ speaker_ids: speakerIds }),
  });
}

export async function latestChatAudio(
  config: LinxConfig | null,
): Promise<string | null> {
  if (!config?.apiKey) return null;
  const body = await linxFetch(
    config,
    `/v1/agents/${config.agentId}/chat-history`,
    { method: "GET" },
  );
  const records =
    typeof body.data === "object" && body.data && "records" in body.data
      ? (body.data as { records: Array<{ audio_url?: string }> }).records
      : [];
  return records.find((r) => r.audio_url)?.audio_url ?? null;
}

/**
 * 平台公开协议不保证返回 speaker_id。
 * 有 API 时仍以点名为底，这里只给出「是否像已登记样本」的弱信号。
 * 无 API 时返回 null，引擎走点名协议。
 */
export async function verifyAgainstSeat(_args: {
  config: LinxConfig | null;
  audioUrl: string | null;
  expectedSpeakerId: string | null;
}): Promise<{ matched: boolean | null; confidence: "high" | "low" }> {
  if (!_args.expectedSpeakerId) {
    return { matched: null, confidence: "low" };
  }
  if (!_args.config?.apiKey || !_args.audioUrl) {
    return { matched: null, confidence: "low" };
  }
  // 公开协议没有 identify 回 speaker_id：有样本也只当「已登记」，对局仍以点名+自报为底。
  return { matched: null, confidence: "low" };
}
