# Tea Parlor TG Bot + H5 棋牌室

本目录用于沉淀 Tea Parlor 棋牌室项目资料、AI 开发规则、monorepo 骨架和当前 Telegram Bot + H5 棋牌室实现。

## 当前目标

做一个 Telegram Bot + H5 Mini App 棋牌室：

- 首发游戏：斗地主、德州扑克、麻将。
- 首发重点：经典三人斗地主，规则参照 JJ 斗地主公开经典规则。
- 视觉方向：大厅和牌桌参照 QQ 斗地主棋牌室的绿桌、木质/金色边框、三人座位、房间场次入口和欢乐豆式资产表达。
- 架构方向：Bot 做触达、通知、分享和轻交互；H5 Mini App 做大厅、牌桌、资产、任务和实时对局。
- 扩展方向：所有游戏按插件式目录接入，预留后续增加跑得快、掼蛋、百家乐等位置。
- 数字货币：先做影子积分和内部账本，真实链上充值、提现、USDT/TON 接入必须等合规与风控方案确认后再启用。

## 目录

| 路径 | 说明 |
|------|------|
| `apps/` | 目标服务骨架：Bot、H5 大厅、API Gateway、Lobby、Wallet、Game Servers |
| `packages/doudizhu-engine/` | 已抽出的 JJ 经典斗地主规则、AI 辅助和本地状态机包 |
| `packages/common/` | 后续共享平台类型与工具 |
| `packages/game-adapter/` | 后续统一游戏插件接口 |
| `docs/00-项目索引/` | 资料分类、项目索引、后续阅读顺序 |
| `docs/01-产品资料/` | Tea Parlor 产品文档源文件 |
| `docs/02-规则资料/` | JJ 斗地主规则与玩法资料 |
| `docs/03-架构实施/` | TG Bot 游戏厅实施、桥接、开发说明 |
| `docs/04-AI开发规则/` | 给 AI/Codex 使用的开发规范、提示词模板和验收口径 |
| `docs/05-GitHub候选游戏/` | 从 GitHub 获取现成游戏前的候选评估记录 |
| `skills/github-game-importer/` | 项目内 GitHub 游戏导入 Skill |
| `config/github-game-import-policy.json` | GitHub 游戏导入策略配置 |
| `external/github-candidates/` | 候选仓库隔离目录 |
| `external/pinus/` | [node-pinus/pinus](https://github.com/node-pinus/pinus) 评估文档（运行时用 npm `pinus`） |
| `external/colyseus/` | [colyseus/colyseus](https://github.com/colyseus/colyseus) 评估文档（运行时用 npm `colyseus`） |
| `apps/pinus-tea-parlor/` | 基于 Pinus 的游戏服（可选联网 · 端口 3010） |
| `apps/colyseus-tea-parlor/` | 基于 Colyseus 的游戏服（**推荐联网** · 端口 2567） |
| `assets/reference-ui/` | UI 参考图和视觉资产 |

## 推荐阅读顺序

1. `docs/00-项目索引/资料整理清单.md`
2. `docs/03-架构实施/棋牌室游戏开发说明.md`
3. `docs/04-AI开发规则/棋牌室AI开发规则.md`
4. `docs/02-规则资料/JJ斗地主规则与玩法说明.md`
5. `docs/03-架构实施/TeaParlor-x-斗地主游戏厅-桥接说明.md`
6. 如需从 GitHub 找现成游戏：`docs/04-AI开发规则/GitHub现成游戏获取设置.md`

## 当前实现

旧 `tg/` 原型中的斗地主规则、AI 辅助和自动演示已经吸收到 `packages/doudizhu-engine/`。Telegram 入口由 `apps/bot/` 承担，牌桌高速交互放在 `apps/web-lobby/` 和游戏服务中。

## Monorepo 骨架

```text
apps/
├── bot/
├── web-lobby/               # H5 · playMode: local | colyseus | pinus
├── colyseus-tea-parlor/     # 推荐联网权威房 :2567
├── pinus-tea-parlor/        # 兼容联网 :3010
├── api-gateway/
├── lobby-service/
├── wallet-service/
└── game-servers/
packages/
├── doudizhu-engine/         # 规则引擎（本地/Colyseus/Pinus 共用）
├── game-adapter/
└── …
external/
├── pinus/
└── colyseus/
```

## 本地审核与演示

```bash
cd /Users/newcoin/Desktop/棋牌室
npm run audit:local
npm run demo
```

## 联网游戏服（Colyseus 推荐 / Pinus 兼容）

```bash
# 推荐：Colyseus（H5 房间）
npm run colyseus:start
# → http://127.0.0.1:2567/health

# 兼容：Pinus
cd apps/pinus-tea-parlor/game-server && npm start
# → ws://127.0.0.1:3010
```

H5 主页「对局模式」循环切换：本地人机 → Colyseus → Pinus。  
详见 `docs/03-架构实施/多人框架整合说明.md`、`apps/colyseus-tea-parlor/README.md`、`apps/pinus-tea-parlor/README.md`。

也可以在 monorepo 根目录运行：

```bash
npm run audit:local
npm run demo
```

- `npm run audit:local`：检查所有 JS 语法并运行斗地主规则/状态机测试。
- `npm run demo`：不依赖 Telegram Token，在终端自动演示一局斗地主并输出结算。

## GitHub 现成游戏获取

已配置 GitHub 游戏导入流程。后续让 AI 找开源游戏时，要求先使用 `skills/github-game-importer/SKILL.md`，并把候选记录到 `docs/05-GitHub候选游戏/候选仓库评估表.md`。未完成许可证、安全、IP 和适配评估前，不允许把 GitHub 代码合入正式源码。
