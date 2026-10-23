import { useEffect, useMemo, useState } from "react";
import type { SeatView, Snapshot } from "./types";

const ROLE: Record<string, string> = {
  werewolf: "狼",
  seer: "预言家",
  witch: "女巫",
  villager: "民",
};

const VP: Record<string, string> = {
  none: "未录入",
  enrolled: "已录入",
  matched: "命中",
  mismatch: "不匹配",
  low_confidence: "低置信",
};

function wsUrl(deviceId: string): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/observer?deviceId=${encodeURIComponent(deviceId)}`;
}

export function App() {
  const [deviceId, setDeviceId] = useState(() => {
    const q = new URLSearchParams(location.search).get("deviceId");
    return q || localStorage.getItem("werewolf-device") || "local-mac";
  });
  const [god, setGod] = useState(true);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [alive, setAlive] = useState(false);

  useEffect(() => {
    localStorage.setItem("werewolf-device", deviceId);
    const ws = new WebSocket(wsUrl(deviceId));
    ws.onopen = () => setAlive(true);
    ws.onclose = () => setAlive(false);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data as string) as Snapshot & { type?: string };
      setSnap(msg);
    };
    return () => ws.close();
  }, [deviceId]);

  const view = god ? snap?.godView : snap?.publicView;
  const seats: SeatView[] = view?.seats ?? [];
  const script = god ? snap?.spokenScript : view?.spokenScript;

  const votes = useMemo(() => {
    if (!view) return [];
    return Object.entries(view.votes).map(([from, to]) => `${from}→${to}`);
  }, [view]);

  return (
    <div className="app">
      <header className="top">
        <div>
          <h1>灵局</h1>
          <div className="sub">
            旁观屏 · {alive ? "在线" : "未连接"} · 夜间请背对玩家
          </div>
        </div>
        <div className="controls">
          <input
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            placeholder="Device-Id"
          />
          <button className={god ? "active" : ""} onClick={() => setGod(true)}>
            上帝
          </button>
          <button className={!god ? "active" : ""} onClick={() => setGod(false)}>
            公开
          </button>
        </div>
      </header>

      <div className="phase">
        <strong>{view?.phaseLabel ?? "等待开局"}</strong>
        <span>第 {view?.nightNumber ?? 0} 夜</span>
        {view?.winner ? <span className="warn">{view.winReason}</span> : null}
      </div>
      <p className="script">{script ?? "连接 mcp-server 后显示口播。"}</p>
      {view?.lastMismatch ? (
        <p className="warn">声纹与被点名座位不符，请本人靠近。</p>
      ) : null}

      <div className="table">
        {(seats.length ? seats : [1, 2, 3, 4].map((id) => ({ id }))).map((seat) => {
          const s = seat as SeatView;
          const called = view?.currentSeat === s.id;
          return (
            <article
              key={s.id}
              className={`seat ${called ? "called" : ""} ${s.alive === false ? "dead" : ""}`}
            >
              <div className="num">{s.id}</div>
              <div className="name">{s.name ?? "空位"}</div>
              <div className="meta">
                {s.enrolled ? <span className="tag enrolled">入座</span> : <span className="tag">待报名</span>}
                {s.voiceprintStatus ? (
                  <span className={`tag ${s.voiceprintStatus}`}>{VP[s.voiceprintStatus]}</span>
                ) : null}
                {god && s.role ? <span className="tag role">{ROLE[s.role]}</span> : null}
                {s.alive === false ? <span className="tag dead">出局</span> : null}
                {called ? <span className="tag role">点名</span> : null}
              </div>
            </article>
          );
        })}
      </div>

      <TextPlay deviceId={deviceId} />

      <div className="logs">
        <div>
          <h2>发言</h2>
          <ul>
            {(view?.daySpeeches ?? []).map((line, i) => (
              <li key={i}>
                {line.seat}号：{line.text}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2>投票 / 夜间</h2>
          <ul>
            {votes.map((v) => (
              <li key={v}>{v}</li>
            ))}
            {god && snap?.godView.night.killTarget ? (
              <li>刀口 {snap.godView.night.killTarget}号</li>
            ) : null}
            {god && snap?.godView.night.seerCheck ? (
              <li>
                验 {snap.godView.night.seerCheck.target}号 →{" "}
                {snap.godView.night.seerCheck.isWerewolf ? "狼" : "好人"}
              </li>
            ) : null}
            {view?.lastDeaths?.length ? (
              <li>出局 {view.lastDeaths.join("、")}号</li>
            ) : null}
          </ul>
        </div>
      </div>
    </div>
  );
}

function TextPlay({ deviceId }: { deviceId: string }) {
  const [name, setName] = useState("甲");
  const [seat, setSeat] = useState("1");
  const [intent, setIntent] = useState("speak");
  const [target, setTarget] = useState("2");
  const [speech, setSpeech] = useState("我觉得二号有点可疑。我说完了。");
  const [msg, setMsg] = useState("");

  async function send(event: unknown) {
    const res = await fetch(`/api/rooms/${encodeURIComponent(deviceId)}/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });
    const data = (await res.json()) as { ok: boolean; error?: string; spokenScript: string };
    setMsg(`${data.ok ? "OK" : data.error} · ${data.spokenScript}`);
  }

  return (
    <section className="script" style={{ marginTop: 8 }}>
      <div className="sub">文字对局（麦不可用时的降级）</div>
      <div className="controls" style={{ marginTop: 10, flexWrap: "wrap" }}>
        <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: 80 }} />
        <input value={seat} onChange={(e) => setSeat(e.target.value)} style={{ width: 48 }} />
        <button onClick={() => send({ type: "enroll", name, claimedSeat: Number(seat) })}>
          报名
        </button>
        <button onClick={() => send({ type: "start" })}>开局</button>
        <button onClick={() => send({ type: "advance" })}>下一阶段</button>
        <select value={intent} onChange={(e) => setIntent(e.target.value)}>
          <option value="speak">发言</option>
          <option value="vote">投票</option>
          <option value="kill">刀</option>
          <option value="check">查验</option>
          <option value="witch">女巫过</option>
          <option value="skip">跳过</option>
        </select>
        <input value={target} onChange={(e) => setTarget(e.target.value)} style={{ width: 48 }} />
        <input value={speech} onChange={(e) => setSpeech(e.target.value)} />
        <button
          className="active"
          onClick={() =>
            send({
              type: "act",
              intent,
              targetSeat: Number(target),
              speech,
              save: intent === "witch" && speech.includes("救"),
            })
          }
        >
          行动
        </button>
      </div>
      {msg ? <p style={{ margin: "10px 0 0" }}>{msg}</p> : null}
    </section>
  );
}
