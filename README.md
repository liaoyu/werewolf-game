# 灵局 · 灵矽语音狼人杀

七牛 1024 Hackathon 研发赛道 · 灵矽应用 · 语音类游戏。

## 怎么跑

需要 Node 22+ 与 pnpm（`nvm use` 会读 `.nvmrc`）。

```bash
pnpm install
cp .env.example .env   # 填 LINX_API_KEY / LINX_AGENT_ID
pnpm test              # 引擎规则测试
pnpm dev               # MCP + 旁观 WS + 设备桥  :8787
```

另开两个终端：

```bash
pnpm dev:observer      # http://127.0.0.1:5173
pnpm dev:device        # http://127.0.0.1:5174
```

灵矽云端要能回调 MCP，把 8787 打到公网：

```bash
cloudflared tunnel --url http://127.0.0.1:8787
```

把隧道地址填进 `.env` 的 `MCP_PUBLIC_URL`，并按 [packages/linx-agent/setup.md](packages/linx-agent/setup.md) 绑定智能体与设备。

## 一局怎么玩

1. 设备页上报 OTA，用 6 位码在智控台绑定这台 Mac
2. 旁观屏 `?deviceId=` 填设备页上的 Device-Id（夜间把屏背对玩家）
3. 四人靠近电脑报名：「我是一号，我叫某某」
4. 「开始狼人杀」→ 捂耳听身份 → 天黑请闭眼
5. 点名刀人 / 查验 / 女巫 → 白天发言 → 点名投票
6. 麦不可用时，旁观屏下方「文字对局」可走完同一套状态机

## 仓库

| 包 | 作用 |
|---|---|
| `packages/engine` | 权威状态机（LLM 不当裁判） |
| `packages/mcp-server` | 灵矽 MCP 六工具 + 设备桥 |
| `packages/voiceprint` | 报名注册与弱校验 |
| `packages/virtual-device` | 本机当灵矽硬件 |
| `packages/observer-web` | 路演旁观屏 |
| `packages/linx-agent` | 法官提示词 |

架构与分工：[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)  
路演脚本：[docs/pitch.md](docs/pitch.md)  
AI 过程：[docs/ai-log.md](docs/ai-log.md)  
Demo：[docs/demo.md](docs/demo.md)

