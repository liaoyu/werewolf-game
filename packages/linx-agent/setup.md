# 灵矽控制台绑定

1. 打开 https://xrobo.qiniu.com/ 创建智能体「狼人杀法官」
2. 角色设定粘贴 `prompt.md`
3. LLM 选支持 Function Call 的模型（如 DeepSeek V4 Flash）
4. 意图识别：Function Call；记忆：无记忆
5. 启动 `pnpm dev`，把 MCP 暴露到公网：

```bash
cloudflared tunnel --url http://127.0.0.1:8787
```

隧道地址填进仓库根 `.env` 的 `MCP_PUBLIC_URL`（变了必须重启 `pnpm dev`）。

6. 控制台开通 MCP：SSE URL = `https://<隧道>/mcp`（有下拉就选 SSE；没有再试 Streamable HTTP）
7. 把该 MCP **勾选绑定到「狼人杀法官」智能体**，保存配置。控制台应能列出 `werewolf_enroll` 等六个工具。
8. 打开 `http://127.0.0.1:5174` 本机设备页，上报 OTA，用 6 位激活码在「设备管理」绑定
9. 设备页复制 Device-Id，旁观屏打开 `http://127.0.0.1:5173?deviceId=<Device-Id>`（与设备页一致；也可把同一伪 MAC 写进 `.env` 的 `LINX_DEVICE_MAC`）
10. 环境变量写在仓库根 `.env`（参考 `.env.example`）
