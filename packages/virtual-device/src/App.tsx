import { useMemo, useRef, useState } from "react";
import { PCM_HELLO, PcmPlayer, floatTo16, resample } from "./audio";
import { loadIdentity } from "./identity";

type Ota = {
  activation?: { code: string; message: string };
  websocket?: { url: string; token?: string };
};

export function App() {
  const id = useMemo(loadIdentity, []);
  const [log, setLog] = useState<string[]>([]);
  const [ota, setOta] = useState<Ota | null>(null);
  const [status, setStatus] = useState("未连接");
  const [listening, setListening] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const playerRef = useRef<PcmPlayer | null>(null);
  const procRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const leftover = useRef<Float32Array>(new Float32Array(0));

  const append = (line: string) => {
    setLog((prev) => [...prev.slice(-200), `${new Date().toLocaleTimeString()} ${line}`]);
  };

  async function reportOta() {
    const res = await fetch("/linx/ota", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: id.deviceId, clientId: id.clientId }),
    });
    const data = (await res.json()) as Ota;
    setOta(data);
    if (data.activation?.code) {
      setStatus("待绑定");
      append(`激活码 ${data.activation.code}，到智控台法官智能体「设备管理」填写。`);
    } else if (data.websocket?.token) {
      setStatus("已绑定");
      append("设备已绑定，可以开始通话。");
    } else {
      append(`OTA: ${JSON.stringify(data)}`);
    }
  }

  async function pollBound() {
    const res = await fetch("/linx/ota/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: id.deviceId }),
    });
    const data = (await res.json()) as { bound: boolean };
    append(data.bound ? "绑定成功，重新上报 OTA 取 token。" : "尚未绑定。");
    if (data.bound) await reportOta();
  }

  function ensureAudio(): AudioContext {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext({ sampleRate: 48000 });
      playerRef.current = new PcmPlayer(ctxRef.current);
    }
    return ctxRef.current;
  }

  async function connect() {
    const token = ota?.websocket?.token;
    if (!token) {
      append("还没有 websocket token，先 OTA 并在控制台绑定激活码。");
      return;
    }
    await ensureAudio().resume();
    const wsUrl = ota.websocket?.url ?? "wss://xrobo-io.qiniuapi.com/v1/ws/";
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const bridge = `${proto}://${location.host}/linx/device?deviceId=${encodeURIComponent(id.deviceId)}&clientId=${encodeURIComponent(id.clientId)}&token=${encodeURIComponent(token)}&wsUrl=${encodeURIComponent(wsUrl)}`;
    const ws = new WebSocket(bridge);
    ws.binaryType = "arraybuffer";
    ws.onopen = () => {
      setStatus("上游连接中");
      append("已连上本机设备桥。");
    };
    ws.onmessage = (ev) => {
      if (typeof ev.data === "string") {
        append(ev.data.slice(0, 240));
        try {
          const msg = JSON.parse(ev.data) as { type?: string };
          if (msg.type === "upstream_open") {
            ws.send(JSON.stringify(PCM_HELLO));
            append("已发送 hello (PCM 16k)。");
            setStatus("可对话");
          }
        } catch {
          /* text log */
        }
        return;
      }
      const pcm = new Int16Array(ev.data as ArrayBuffer);
      playerRef.current?.enqueue(pcm);
    };
    ws.onclose = () => {
      setStatus("断开");
      append("连接关闭");
    };
    wsRef.current = ws;
  }

  async function startListen() {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      append("请先连接。");
      return;
    }
    const ctx = ensureAudio();
    await ctx.resume();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    streamRef.current = stream;
    const source = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    proc.onaudioprocess = (event) => {
      if (!listeningRef.current) return;
      const input = event.inputBuffer.getChannelData(0);
      const merged = new Float32Array(leftover.current.length + input.length);
      merged.set(leftover.current);
      merged.set(input, leftover.current.length);
      const resampled = resample(merged, ctx.sampleRate, 16000);
      const frame = 320;
      let offset = 0;
      while (offset + frame <= resampled.length) {
        const slice = resampled.subarray(offset, offset + frame);
        const pcm = floatTo16(slice);
        ws.send(pcm.buffer);
        offset += frame;
      }
      leftover.current = resampled.subarray(offset);
    };
    source.connect(proc);
    proc.connect(ctx.destination);
    procRef.current = proc;
    leftover.current = new Float32Array(0);
    ws.send(
      JSON.stringify({
        type: "listen",
        state: "start",
        mode: "realtime",
      }),
    );
    listeningRef.current = true;
    setListening(true);
    append("开始监听（realtime）。请靠近电脑说话。");
  }

  const listeningRef = useRef(false);

  function stopListen() {
    listeningRef.current = false;
    setListening(false);
    procRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    wsRef.current?.send(JSON.stringify({ type: "listen", state: "stop" }));
    append("停止监听，已缓存近句 WAV。");
  }

  return (
    <div className="wrap">
      <h1>本机即灵矽</h1>
      <div className="mac">Device-Id {id.deviceId}</div>
      {ota?.activation?.code ? <div className="code">{ota.activation.code}</div> : null}
      <p className="hint">
        1. 上报 OTA 拿到 6 位激活码 → 2. 智控台绑定到法官智能体 → 3. 检查绑定并连接 → 4. 点「开始监听」，允许麦克风后对着这台电脑说话。旁观屏只看局，不在 5173 说话。
      </p>
      <div className="status">{status}</div>
      <div className="row">
        <button onClick={reportOta}>上报 OTA</button>
        <button onClick={pollBound}>检查绑定</button>
        <button className="primary" onClick={connect}>
          连接通话
        </button>
        {listening ? (
          <button onClick={stopListen}>停止监听</button>
        ) : (
          <button onClick={startListen}>开始监听</button>
        )}
      </div>
      <div className="log">{log.join("\n")}</div>
    </div>
  );
}
