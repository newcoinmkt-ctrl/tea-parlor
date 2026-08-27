# GitHub 现成游戏获取设置

## 当前能力

- 已安装 GitHub 插件：用于后续搜索/读取 GitHub 仓库、PR、Issues。
- 已新增项目 Skill 包：`skills/github-game-importer/SKILL.md`。
- 已新增候选仓库登记表：`docs/05-GitHub候选游戏/候选仓库评估表.md`。

后续让 AI 从 GitHub 找现成游戏时，先明确说：

```text
请使用 github-game-importer 流程，从 GitHub 查找 [斗地主/德州扑克/麻将/H5 游戏厅] 的开源项目。
只做候选评估，不要直接合入代码。
必须检查许可证、是否含真钱/钱包逻辑、是否有测试、是否适合 Tea Parlor Game Adapter。
```

## 目录设置

| 路径 | 用途 |
|------|------|
| `skills/github-game-importer/SKILL.md` | 项目内 GitHub 游戏导入 Skill |
| `docs/05-GitHub候选游戏/候选仓库评估表.md` | 记录候选仓库、许可证、风险和建议 |
| `external/github-candidates/` | 隔离放置候选仓库，不进入正式源码 |
| `external/adapted-snippets/` | 只放已经评估过的最小适配片段 |
| `docs/04-AI开发规则/GitHub现成游戏获取设置.md` | 本设置说明 |

## 允许优先寻找的类型

| 类型 | 优先级 | 说明 |
|------|--------|------|
| 纯规则引擎 | P0 | 最适合复用，必须可测试 |
| 牌型/胜负判定库 | P0 | 德州扑克、麻将优先找成熟判定库 |
| H5 牌桌 UI 模板 | P1 | 只能参考布局，不能复制品牌素材 |
| Bot 示例 | P2 | 只参考 Telegram/Telegraf 交互结构 |
| 完整真钱棋牌/赌场源码 | 禁止直接采用 | 只能做反面安全评估，不合入 |

## 许可证策略

可优先采用：

- MIT
- Apache-2.0
- BSD-2-Clause
- BSD-3-Clause
- ISC

必须隔离并等待确认：

- GPL
- AGPL
- LGPL
- 未声明 License
- 商业授权不明
- 素材授权不明

禁止直接使用：

- QQ 斗地主、JJ 斗地主、真实产品客户端资产。
- 不明来源图片、音效、字体。
- 明确用于真钱赌博、绕过合规、作弊、刷流水的代码。

## 候选评估分数

每个候选仓库按 0-2 分评分：

| 维度 | 0 | 1 | 2 |
|------|---|---|---|
| License | 不明/高风险 | 可用但有约束 | MIT/Apache/BSD/ISC 清晰 |
| 规则正确性 | 无说明 | 有基础实现 | 有规则文档和测试 |
| 工程质量 | 难读/耦合重 | 可读但需整理 | 模块清晰 |
| 安全风险 | 有远程脚本/钱包/真钱逻辑 | 有少量风险 | 纯本地逻辑 |
| 适配成本 | 需要重写 | 可拆部分 | 可包装为 adapter |
| UI/IP 风险 | 复制品牌素材 | 只需替换素材 | 无明显侵权风险 |

建议：

- 10-12 分：可进入 adapter 适配。
- 7-9 分：reference-only，先抽测试向量或思路。
- 4-6 分：quarantine，只能留档。
- 0-3 分：reject。

## GitHub 搜索关键词

斗地主：

- `doudizhu javascript rules engine`
- `dou dizhu typescript`
- `landlord poker h5`
- `斗地主 h5 source`

德州扑克：

- `texas holdem engine typescript`
- `poker hand evaluator javascript`
- `holdem game server node`
- `texas holdem react`

麻将：

- `mahjong rules engine typescript`
- `mahjong hand evaluator javascript`
- `riichi mahjong engine`
- `mahjong h5 source`

游戏厅/H5：

- `card game lobby h5`
- `poker table react`
- `mobile card game ui react`
- `board game lobby react`

## 合入前检查

任何来自 GitHub 的代码合入前必须满足：

- 候选表已登记。
- License 已记录。
- 不含 `.env`、私钥、远程执行脚本。
- 不含真钱充值、提现、下注钱包逻辑。
- 不含第三方品牌素材。
- 已放入隔离目录评估。
- 已转换为 Tea Parlor adapter 接口或独立规则包。
- 已补测试。
- 已运行本地审核。

当前本地检查命令：

```bash
cd /Users/newcoin/Desktop/棋牌室
npm run audit:local
npm run demo
```
