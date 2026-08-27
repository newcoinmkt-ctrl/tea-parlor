# colyseus/colyseus 候选评估

评估日期：2026-08-15

仓库：https://github.com/colyseus/colyseus

本地隔离目录：`external/colyseus`（完整源码克隆已移除；运行时使用 npm 包 `colyseus`。需要对照上游源码时按下方 commit 重新 clone）

Commit：`1dcf9e5b3dce8485e4a1a809dd98af9b328da149`

License：MIT

## 结论

状态：`adapter-ready`

评分：`11/12`

Colyseus 更适合作为 Tea Parlor H5 棋牌室的默认联网房间框架。它的 Room / matchmake / authoritative server 模型比 Pinus 更贴合 H5 小房间实时对局；当前项目已新增 `apps/colyseus-tea-parlor`，并通过 H5 `playMode=colyseus` 接入。

## 可复用范围

- Colyseus Room 生命周期、joinOrCreate、消息同步模型。
- H5 Colyseus SDK 接入方式。
- 权威房间服务进程结构。

## 禁止复用范围

- 不复制 Colyseus 示例游戏逻辑作为棋牌游戏规则。
- 不让 Colyseus 房间直接修改余额。
- 不接入真实充值、提现、现金下注或链上资产。

## 适配策略

- 联网默认选 Colyseus，Pinus 作为兼容后端。
- 斗地主规则由 `packages/doudizhu-engine` 提供。
- Colyseus Room 只同步状态和动作，资产结算仍必须走 wallet-service / ledger。
