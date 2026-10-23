# 灵矽语音狼人杀 · 架构设计

赛题：七牛 1024 Hackathon 研发赛道 · 灵矽应用 · 语音类游戏（狼人杀）


## 1. 系统上下文

```
围坐玩家 → 本机虚拟设备(Mac 麦/喇叭)
         → 灵矽 ASR/TTS/Agent Function Call
         → 云端 MCP (本仓库 mcp-server)
         → engine 权威状态机
         → 旁观屏 (评委上帝视角 / 玩家公开视角)
```

LLM 不当裁判。身份、死亡、投票、胜负只由 `packages/engine` 裁决。

## 2. 模块规格

| 模块 | 职责 | 不负责 |
|---|---|---|
| `@werewolf/engine` | 4 人局状态机、三层投影、点名归属 | 网络、音频、LLM |
| `@werewolf/mcp-server` | 灵矽 MCP 六工具、旁观 WS、设备桥、房间 | 规则判定 |
| `@werewolf/voiceprint` | Speaker 注册、绑定智能体、弱校验 | 当裁判 |
| `@werewolf/virtual-device` | 本机当灵矽硬件：OTA、PCM、近句 WAV | 游戏规则 |
| `@werewolf/observer-web` | 路演大屏 | 采集麦克风 |
| `@werewolf/linx-agent` | 法官提示词与控制台绑定说明 | 运行时 |

## 3. 关键链路

1. 报名声纹：点名 → 玩家说话 → 近句 WAV / chat-history → Speaker V2 → 占座
2. 夜间点名：闭眼捂耳 + `currentSeat`；私密台词只进 `spokenScript`
3. 投票校验：点名底线 → 声纹交叉 → 自报家门降级

## 4. 信息隔离

- `publicView`：阶段、存活、票型、公开口播（不含验人/刀口/身份）
- `privateView(seat)`：仅当前被点名座位的身份与验人结果
- `godView`：路演评委用，绝不作为 MCP 工具返回给法官模型

## 5. 运行与部署

见仓库根目录 `README.md`。MCP 需公网 HTTPS；设备端用本机浏览器页，经 mcp-server 桥接灵矽 WebSocket（浏览器不能自定义 WS Header）。

房间键：MCP 读 `Device-Id` / `X-Linx-Device-Id`，缺省与设备页、旁观屏共用 `LINX_DEVICE_MAC`（或 `02:10:24:00:00:01`）。夜间一句 TTS 只服务当前被点名座位，阶段切换走 `werewolf_advance`。
