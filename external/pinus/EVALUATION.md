# node-pinus/pinus 候选评估

评估日期：2026-08-15

仓库：https://github.com/node-pinus/pinus

本地隔离目录：`external/pinus`（完整源码克隆已移除；运行时使用 npm 包 `pinus`。需要对照上游源码时按下方 commit 重新 clone）

Commit：`07541bb4cbe3936921a7cafcf7de65182a75d360`

License：MIT

## 结论

状态：`adapter-ready`

评分：`10/12`

Pinus 可作为 Tea Parlor 的兼容联网后端，适合多进程 connector / handler / remoter 模型。当前项目已保留 `apps/pinus-tea-parlor/game-server`，通过 `@tea-parlor/doudizhu-engine` 执行斗地主规则。

## 可复用范围

- Pinus 应用结构、connector 配置和 handler/remoter 模型。
- hybridconnector 与 H5 `pinusclient.js` 对接方式。
- 多进程游戏服部署思路。

## 禁止复用范围

- 不把 Pinus 示例业务逻辑当作 Tea Parlor 规则实现。
- 不让 Pinus 直接读写 wallet 或 ledger。
- 不引入任何示例中的无关账号、资产或外部服务逻辑。

## 适配策略

- 规则继续由 `packages/doudizhu-engine` 负责。
- 游戏服只产生牌桌状态和结算意图。
- H5 对局模式中 Pinus 作为 `pinus` 兼容后端，默认推荐仍为 Colyseus。

