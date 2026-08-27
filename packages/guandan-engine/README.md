# @tea-parlor/guandan-engine

掼蛋牌型识别、「逢人配」组牌与压制比较。

完整业务规则见：`docs/02-规则资料/掼蛋规则与玩法说明.md`。

## 设定

- 两副牌 **108** 张，四人两两成队
- 当前打级 `currentRank`（如 10）时，**红心 10** 为逢人配（可替代除大小王外任意点数）
- 点数序：大王 > 小王 > **级牌** > A > K > … > 2

## API

```js
import {
  createCard,
  identifyGuanDanHand,
  bestGuanDanHand,
  canSuppress,
  HandType,
} from '@tea-parlor/guandan-engine';

// 打 10，红心 10 为逢人配
const cards = [
  createCard(10, 3), // 逢人配
  createCard(6, 1),
  createCard(7, 1),
  createCard(8, 1),
  createCard(9, 1),
];
const hands = identifyGuanDanHand(cards, 10);
// 可识别为同花顺 6-7-8-9-10 等
const best = bestGuanDanHand(cards, 10);

// 压制：炸弹链 + 同型比点
canSuppress(handA, handB, 10); // boolean
```

### 牌型

| type | 名称 |
|------|------|
| 单张 / 对子 / 三张 / 三带二 | 基础 |
| 三连对（≥3） | 木板 |
| 钢板（≥2 连续三张） | 钢板 |
| 顺子 / 同花顺 | 五张 |
| 炸弹（4+） / 天王炸 | 炸弹 |

### 炸弹压制链

天王炸 > 8+炸 > 7炸 > 6炸 > **同花顺** > 5炸 > 4炸 > 普通牌型。  
同张数同花顺 > 同张数普通炸弹。

`identifyGuanDanHand` 在 1~2 张逢人配时穷举替代，返回所有合法解释并按 `power` 降序。

## 进贡 / 结算 / AI

```js
import {
  TributeStateMachine,
  GuanDanSettlement,
  calculateLevelProgress,
  resolvePassWind,
  makeGuanDanAIDecision,
  detectGuanDanCollusion,
} from '@tea-parlor/guandan-engine';
```

| 模块 | 说明 |
|------|------|
| `TributeStateMachine` | 单/双进贡、抗贡、自动进贡、还贡 ≤10 |
| `GuanDanSettlement` | 接风、升级 3/2/1、打 A 限制、通关 |
| `makeGuanDanAIDecision` | 2v2 队友保护、压残局、逢人配 |
| `detectGuanDanCollusion` | 同 IP / 喂牌 / 协同入座告警 |

规则文档：`docs/02-规则资料/掼蛋规则与玩法说明.md`

## 测试

```bash
npm test
```
