# AI 使用日志（AI 工程效率）

赛会允许不限工具。本仓库用 Cursor Agent 从空仓生成 TypeScript monorepo。

## 2026-10-23

- 工具：Cursor（Grok 4.6）
- 做了什么：
  - 把赛题约束收成「本机当灵矽硬件 + 4 人声纹围坐 + 状态机裁判」
  - 生成 `engine` 纯函数状态机，并用 Vitest 锁验人隔离、死人不能投票、平票、胜负、声纹降级
  - 手写灵矽风格 MCP SSE（`GET /mcp` + `POST /mcp/message`），不赌 SDK 方言
  - 浏览器不能自定义 WebSocket Header，因此加 mcp-server 设备桥
  - 旁观屏上帝/公开双视，夜间口播与 publicView 拆开，避免评委屏把验人结果漏给玩家
- 提示词迭代：法官 prompt 明确「不要自己判断是几号在说话」
- 未做：把官方 C++ 客户端当主交付；6 条真人声纹

## 后续每天

继续在本文件追加：改了哪条提示词、AI 生成了哪组测试、联调时踩的协议坑。
