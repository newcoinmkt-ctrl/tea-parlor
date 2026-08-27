# Tea Parlor · Colyseus 游戏服

基于 [colyseus/colyseus](https://github.com/colyseus/colyseus) 的权威多人房服务。

| 路径 | 说明 |
|------|------|
| `external/colyseus/` | 框架源码克隆（参考 / 二次开发） |
| `apps/colyseus-tea-parlor/` | **本业务服**（npm 包 `colyseus` 运行） |
| `packages/doudizhu-engine` | JJ 斗地主规则 + AI（权威逻辑） |

## 为何优先 Colyseus（H5 房间）

| | **Colyseus（推荐联网）** | **Pinus（已保留）** |
|--|--------------------------|---------------------|
| 定位 | 房间 / 匹配 / 状态同步 | 大型游戏服 / 多进程 |
| H5 接入 | 消息房间模型简单 | Pomelo 协议 + pinusclient |
| 规则引擎 | 同构复用 doudizhu-engine | 同构复用 |
| 默认端口 | **2567** | **3010** |

> 策略：**本地人机**默认；联网优先 **Colyseus**；**Pinus** 作为可选后端兼容。

## 启动

```bash
# 仓库根
npm run colyseus:start

# 或
cd apps/colyseus-tea-parlor && npm start
```

健康检查：http://127.0.0.1:2567/health

## 房间协议

- 房间名：`doudizhu`
- 加入 options：`{ uid, name, roomKey, currency }`
- 客户端 → 服：`bid` / `play` / `pass` / `hint` / `state`
- 服 → 客户端：`room`（`{ room }` 快照，与 Pinus publicState 同构）、`error`、`hint`

## H5

1. 启动本服  
2. 打开 `http://127.0.0.1:5173/`  
3. 主页 **对局模式** 切到 **Colyseus 联网**  
4. 进斗地主场次  

失败会自动回退本地人机。

## 与 Pinus 对照

```text
apps/pinus-tea-parlor/     → ws://127.0.0.1:3010  Pomelo 协议
apps/colyseus-tea-parlor/  → ws://127.0.0.1:2567  Colyseus 协议
apps/web-lobby/src/net/    → 统一 playMode 适配
```
