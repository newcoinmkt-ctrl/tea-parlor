# Tea Parlor × 斗地主游戏厅 · 桥接说明

> **用途**：把《Tea Parlor 产品开发文档 V2.6》与《TG-Bot 斗地主游戏厅实施与操作指南》合成**同一条交付链**，避免两套架构、两套账本、两套排期。  
> **读者**：产品 / 架构 / 研发 / 运营  
> **日期**：2026-07-15  
> **状态**：团队对齐用（可贴仓库 `docs/BRIDGE.md`）

---

## 0. 一句话定义（当前冲刺）

| 字段 | 取值 |
|------|------|
| 产品名 | **Tea Parlor（茶馆）** |
| 首发垂线 | **经典三人斗地主**（规则对齐 JJ 经典场） |
| 入口 | **Telegram Bot + Mini App** |
| 资产模式 | **V2.6 Phase 1A · 影子积分**（不上真金提现） |
| 架构约束 | **V2.6 五层 + GEaaS + Monorepo 红线** |
| 首发明确不做 | 真金/Vault 主网、TEE、Graph AI、多链 Driver、锦标赛、NFT |
| 验收口径 | 游戏厅指南 §十一 + 本文 §5 出门清单 |
| 下一刀（二选一） | 第二玩法（德州/麻将）**或** Phase 1B Vault（勿并行过多） |

**原则：**

- V2.6 = **平台宪法**（边界、安全、扩展性）  
- 游戏厅指南 = **第一栋楼施工图**（斗地主厅从 0 到可玩）  
- 斗地主 = `game-servers/doudizhu` 上 **第一个 GEaaS 实现**，不是独立产品  

---

## 1. 两份文档的角色

| | Tea Parlor V2.6 | TG 斗地主游戏厅指南 |
|--|-----------------|---------------------|
| 文件（桌面） | `Tea Parlor 产品开发文档 V2.6.docx` | `TG-Bot斗地主游戏厅-实施与操作指南.docx` / `.md` |
| 回答 | 如何建可扩展、安全、可运营的棋牌平台 | 如何在 TG 做出 JJ 式「厅」并跑通经典斗 |
| 粒度 | 架构、账本、Vault、PF、风控、1A/1B、GEaaS | BotFather、匹配、状态机、联调、工期 |
| 类比 | 城市规划 + 建筑规范 | 第一栋馆施工与验收 |

**禁止：** 另起一套只服务斗地主的 Gateway / 账本 / 用户体系。  
**必须：** 同一 monorepo、同一 Wallet、同一 Session、同一 Lobby 配置模型。

---

## 2. 概念映射表（开发时对照）

| # | V2.6 章节 / 概念 | 游戏厅指南章节 | 落地约定 |
|---|------------------|----------------|----------|
| 1 | 三 / 二十一 · 五层 + GEaaS | §四 架构 | 斗地主只做 Game Server；资产只走 gRPC 意图 |
| 2 | 3.3 Monorepo 红线 | monorepo 目录 | 统一目录名见 §3；CI 拦 game→database |
| 3 | 四 · 账号 / wallet-adapter | TG initData | 仅启用 Telegram adapter；Session 统一 |
| 4 | 五 / 六 · Ledger + Active Lock | 影子积分、带入锁 | 1A：`chain_id` 用测试链 ID；积分 = token |
| 5 | 5.4 Paymaster / 动态 Gas | — | 积分场 **不做**；进 1B 再开 |
| 6 | 6.3.1–6.3.2 超时解冻 / 丧尸房间 | 托管、断线 | 解冻前 **ForceTearDown** |
| 7 | 七 · Provably Fair | 规则 + 回放 | MVP：可回放；现金房再上 commit-reveal |
| 8 | 八 · 娱乐房 / 现金房 / 公会 | 场次、匹配、好友房 | 娱乐=积分场；现金=1B 后；公会=群绑定后 |
| 9 | 九 · 状态机 + 9.5 gRPC | §七 引擎 | `doudizhu` 实现 CreateRoom / Join / TearDown / Lock / Settle |
| 10 | 十 · 规则风控（去 AI） | §九 风控 | Phase 3 前 SQL/Redis 规则即可 |
| 11 | 十一 · Bot 授权 | Bot 触达 | Bot 不写余额；公会 `/bind_group` |
| 12 | 十五 · Phase 1A / 1B | Phase 0–5 | 时间轴以本文 §4 为准 |
| 13 | 十九 · 1A 检查清单 | §十一 验收 | 合并为 §5 出门清单 |
| 14 | 二十一 · IChainDriver | — | 1A 用 MockChainDriver |
| 15 | JJ 规则说明（桌面 md） | §七 牌型 | 引擎单测以规则文档为准 |

---

## 3. 统一 Monorepo 落点（命名合并）

以 **Tea Parlor monorepo** 为准（游戏厅指南中的 `tg-ddz-hall` 仅作别名理解）：

```
tea-parlor/
├── apps/
│   ├── bot/                      # TG 触达（指南 W3）
│   ├── web-lobby/                # Mini App 大厅 + 牌桌壳（指南 W4/W7）
│   ├── api-gateway/              # initData → Session（V2.6）
│   ├── lobby-service/            # 场次、匹配（指南 W5）
│   ├── wallet-service/           # 唯一写 Ledger（V2.6）
│   │   └── src/drivers/
│   │         └── mock-driver.ts  # 1A
│   │         └── ton-driver.ts   # 1B 以后
│   └── game-servers/
│         └── doudizhu/           # 首发垂线（指南 W6）
├── packages/
│   ├── common/                   # gRPC proto（GEaaS）
│   ├── doudizhu-engine/          # 纯规则，可单测
│   ├── database/                 # 仅 wallet/lobby 可依赖
│   └── wallet-adapter/           # telegram 优先
└── docs/
      └── BRIDGE.md               # 本文
```

### 红线（与 V2.6 一致，CI 拦截）

1. `game-servers/**` **禁止** 依赖 `@tea/database` / ORM。  
2. `api-gateway` **禁止** 直连账本库。  
3. `web-lobby` 进房后 WS 连 **对应 game-server**，不经大厅长连打牌。  
4. 链细节只存在于 `IChainDriver` 实现，不散落在结算业务里。

---

## 4. 合并 Phase 看板（执行顺序）

### 4.1 总览

| 合并阶段 | V2.6 | 游戏厅指南 | 目标产出 | 建议工期 |
|----------|------|------------|----------|----------|
| **M0 底座** | Phase 0 | Phase 0 | Bot + Mini App 登录 + monorepo + CI 红线 | 3–5 天 |
| **M1 厅壳** | Phase 1A 前半 | Phase 1 | 场次列表 + 影子积分展示 | 1–2 周 |
| **M2 可玩** | Phase 1A + Game 核心 | Phase 2 | 匹配 + 经典斗完整一局 + 结算流水 | 3–5 周 |
| **M3 像厅** | 配置后台 / 任务 | Phase 3 | 好友房、战绩、任务、公告 | 2 周 |
| **M4 可运营** | Phase 3 规则风控 | Phase 4 | 多开/同桌规则、举报、回放查账 | 1–2 周 |
| **M5 增强** | 1B / 多玩法 / 二十一 | Phase 5 | Vault 或第二游戏或轻赛事 | 按需 |

**MVP 出门 = M0 + M1 + M2 验收通过**（约 6–10 周，1 名熟练全栈）。

### 4.2 M0 任务卡

| ID | 任务 | 依据 |
|----|------|------|
| M0-1 | BotFather / Mini App 域名 / Token | 指南 §6.2 |
| M0-2 | monorepo + docker-compose PG/Redis | V2.6 3.3 + 指南 §4 |
| M0-3 | Gateway 校验 initData → JWT Session | V2.6 四 / 4.1 |
| M0-4 | CI：game 依赖 database 则失败 | V2.6 红线 |
| M0-5 | 空大厅「你好 @user」 | 指南 Phase 0 验收 |

### 4.3 M1 任务卡

| ID | 任务 | 依据 |
|----|------|------|
| M1-1 | 用户 / 余额 / 场次配置表 | V2.6 6.2.1（1A 简化可用） |
| M1-2 | Lobby API：玩法 + 场次 | 指南 W2/W4 |
| M1-3 | Mini App 二级入口（玩法→场次） | 指南 §8.1（JJ 心智） |
| M1-4 | 新用户赠送积分 | 指南 Phase 1 |
| M1-5 | Bot `/start` `/balance` 拉起 WebApp | 指南 §6 / §8.2 |

### 4.4 M2 任务卡（核心）

| ID | 任务 | 依据 |
|----|------|------|
| M2-1 | 按场次 Redis 匹配队列 | 指南 W5 |
| M2-2 | `doudizhu-engine` 牌型/叫分/胜负单测 | JJ 规则 + 指南 §七 |
| M2-3 | game-server 状态机 + WS 广播 | V2.6 九 + 指南 W6/W7 |
| M2-4 | gRPC：BuyInLock / Settlement / ForceTearDown | V2.6 9.5 / 6.3.2 |
| M2-5 | Wallet：lock / settle / ledger 流水 | V2.6 六 · 1A |
| M2-6 | 超时托管 + 断线重连 | 指南 Phase 2 验收 |
| M2-7 | 三人联调脚本（A/B/C 号） | 指南 §6.5 |

### 4.5 M3–M4 任务卡（摘要）

| ID | 任务 |
|----|------|
| M3-1 | 好友房 / 房间号 / 分享深链 |
| M3-2 | 战绩、再来一局 |
| M3-3 | 每日任务 + 运营公告 |
| M3-4 | 后台改场次热更新 |
| M4-1 | 同 IP/设备规则分 |
| M4-2 | 牌谱查询给客服 |
| M4-3 | 软限制话术（若扣分） |

### 4.6 M5 分叉（只选一条主路径）

| 选项 | 何时选 | 主要依据 |
|------|--------|----------|
| **A. 第二玩法** | TG 流量够、要留存 | V2.6 二十一 GEaaS 复制目录 |
| **B. Phase 1B 真链** | 有合规结论、要真资产 | V2.6 五/5.4/1B |
| **C. 轻赛事** | 要传播与 DAU | 指南 Phase 5 + V2.6 赛事房间 |

---

## 5. MVP 出门清单（合并验收）

### 5.1 必须全绿

- [ ] TG 内打开 Mini App，initData 登录成功  
- [ ] 大厅：≥1 玩法（斗地主）× ≥2 场次  
- [ ] 3 人匹配进同一 `room_id`  
- [ ] 完整：发牌 → 叫分 → 出牌 → 有人出完  
- [ ] 结算后三人余额与 `t_ledger` 一致  
- [ ] 对局中余额被 Active Lock，不可「提走」影子分  
- [ ] 断线重连恢复视角；托管可完局  
- [ ] Game 进程无数据库账号 / 无 ORM 依赖  
- [ ] 核心牌型与叫分单测通过  
- [ ] Bot 能拉起大厅；结算后可「再来一局」（App 内即可）  

### 5.2 明确不验收（避免范围漂移）

- 主网 TON/USDT 充提  
- TEE / Mental Poker  
- GNN 风控  
- 锦标赛完整赛程  
- NFT / TEA 代币  

---

## 6. 接口与数据最小契约（两文档共用）

### 6.1 GEaaS（V2.6 9.5）— 斗地主必须实现

```
GameEngineService
  CreateRoom / PlayerJoin / ForceTearDown

GameWalletCallbackService（Wallet 实现，Game 调用）
  RequestBuyInLock / SubmitSettlement
```

### 6.2 1A 资产语义

| 字段 | 1A 取值示例 |
|------|-------------|
| chain_id | `0` 或 `900001`（内部测试链） |
| token_address | `native` 或 `POINT` |
| amount 精度 | 可用 `NUMERIC(36,18)`，积分按整数展示 |
| 驱动 | `MockChainDriver`（无链上 tx） |

### 6.3 房间 / 场次配置（Lobby）

| 字段 | 说明 |
|------|------|
| game_type | `doudizhu_classic` |
| room_kind | `entertainment`（1A） |
| base_score / bid 规则 | 对齐 JJ 叫分 1/2/3 |
| entry_min | 最低携带积分 |
| multiplier_cap | 可选封顶 |

---

## 7. 文档使用手册（谁读什么）

| 角色 | 主读 | 辅读 |
|------|------|------|
| 老板 / 产品 | 本文 §0 §4 §5 | V2.6 一/十五；指南 §一（JJ 心智） |
| 架构 | V2.6 三/六/九/二十一 + 本文 §2 §3 | 指南 §四 |
| 后端 Game | 指南 §五 Phase2 + §七；JJ 规则 md | V2.6 九、6.3.2 |
| 后端 Wallet | V2.6 五/六 | 指南结算联调 §6.5 |
| 前端 | 指南 §六 §八 | V2.6 十一 Bot/Mini App |
| 运营 | 指南 §八 §六.6 | V2.6 十三 后台 |
| 合规 | V2.6 十八；指南 §九 | 真金前再开专题 |

### 周会固定三问

1. 本周任务落在 M0–M4 哪一张卡？  
2. 有没有违反四条红线？  
3. 有没有把 M5（真金/多链/多游戏）偷塞进 MVP？  

---

## 8. 风险与仲裁

| 风险 | 仲裁（默认） |
|------|----------------|
| 两套用户 ID | 以 Telegram UID → 平台 user_id 为唯一主键 |
| 两套余额 | 只认 Wallet Ledger |
| 只做 Bot 文字出牌 | **否决**；牌桌必须 Mini App |
| 先做 Vault 再做游戏 | **否决**；坚持 1A → 可玩 → 1B |
| 游戏服图省事写 SQL | **否决**；CI 失败 |
| 规则与 JJ 不一致 | 以《JJ 斗地主规则说明》+ 房间配置为准，文档化 diff |

---

## 9. 相关文件索引（桌面）

| 文件 | 角色 |
|------|------|
| `Tea Parlor 产品开发文档 V2.6.docx` | 平台总规 |
| `TG-Bot斗地主游戏厅-实施与操作指南.md` / `.docx` | 斗地主厅施工与操作 |
| `JJ斗地主规则与玩法说明.md` | 规则与牌型 |
| **本文** `TeaParlor-x-斗地主游戏厅-桥接说明.md` | 两文档桥接与合并看板 |

---

## 10. 变更记录

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.0 | 2026-07-15 | 首版：映射表 + 合并 Phase + MVP 出门清单 |

---

*Tea Parlor · 桥接说明 v1.0 · 与 V2.6 / 游戏厅指南配套使用*
