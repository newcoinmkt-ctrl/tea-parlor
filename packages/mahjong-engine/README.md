# @tea-parlor/mahjong-engine

四川麻将核心规则：**血战到底** / **血流成河**。

## 安装

```bash
# monorepo 内
import { createSichuanTable, checkMahjongSettlements } from '@tea-parlor/mahjong-engine';
```

## 快速开始

```js
import {
  createSichuanTable,
  suggestExchangeTiles,
  applyExchange,
  applyDingqueAll,
  applyGang,
  applyHu,
  checkMahjongSettlements,
  GameMode,
  GangType,
} from '@tea-parlor/mahjong-engine';

const table = createSichuanTable({ mode: GameMode.XUEZHAN, baseScore: 1 });

// 1) 换三张
const sets = table.hands.map((h) => suggestExchangeTiles(h));
applyExchange(table, sets);

// 2) 定缺（自动推荐）
applyDingqueAll(table);

// 3) 摸打 / 杠 / 胡 …
// applyGang(table, player, { type: GangType.AN, tile });
// applyHu(table, player, { fromDiscard: false });

// 4) 结算汇总
const report = checkMahjongSettlements(table);
```

## API 摘要

| 函数 | 说明 |
|------|------|
| `exchangeCards` / `applyExchange` | 同门 3 张交换 |
| `chooseMissingSuit` | 推荐定缺 |
| `settleGangImmediate` / `applyGang` | 刮风下雨实时分 |
| `applyHu` | 血战退场 / 血流留场可再胡 |
| `checkMahjongSettlements` | 累加杠分+胡分报告 |

## 测试

```bash
npm test
```
