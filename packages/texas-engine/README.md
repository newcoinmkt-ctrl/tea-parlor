# @tea-parlor/texas-engine

德州扑克 **7 选 5** 牌型识别与比较（位运算 + 固定组合表）。

## API

```js
import {
  createCard,
  evaluateBest5Of7,
  compareHands,
  HandCategory,
} from '@tea-parlor/texas-engine';

const hole = [createCard(14, 1), createCard(13, 1)]; // A♠ K♠ 示例 suit=1
const board = [
  createCard(12, 1), createCard(11, 1), createCard(10, 1),
  createCard(2, 2), createCard(3, 3),
];

const hand = evaluateBest5Of7(hole, board);
// hand.category === HandCategory.ROYAL_FLUSH
// hand.name === '皇家同花顺'
// hand.value  // 32-bit 可比整数

compareHands(handA, handB); // 1 / -1 / 0（平局分池）
```

### Card

| 字段 | 范围 |
|------|------|
| `rank` | 2–14（A=14） |
| `suit` | 1–4 |

### 牌型（`HandCategory`）

皇家同花顺(9) > 同花顺(8) > 四条(7) > 葫芦(6) > 同花(5) > 顺子(4) > 三条(3) > 两对(2) > 一对(1) > 高牌(0)

踢脚：例如 `A-A-K-J-8` 的 `value` > `A-A-K-10-9`。

## 性能

- 5 张：rank 位图判顺、花色计数判同花，O(1) 计数桶
- 7 张：预计算 `C(7,5)=21` 下标，无递归组合
- `compareHands`：单整数比较

## 多轮下注与边池 `TexasBettingEngine`

```js
import {
  TexasBettingEngine,
  calculatePots,
  distributePots,
  Street,
} from '@tea-parlor/texas-engine';

const g = new TexasBettingEngine({
  playerIds: ['a', 'b', 'c'],
  chips: [1000, 1000, 1000],
  smallBlind: 5,
  bigBlind: 10,
  buttonSeat: 0,
  allowStraddle: true,
});

g.startHand();
g.act('a', 'call');
g.act('b', 'raise', { raiseTo: 30 });
g.act('c', 'fold');
// …

// 边池（纯函数）
const pots = calculatePots([
  { id: 'a', betTotal: 50, allIn: true, seat: 0 },
  { id: 'b', betTotal: 100, seat: 1 },
  { id: 'c', betTotal: 100, seat: 2 },
]);

// 分池：rank 1 最好；奇数筹码靠近 SB
const { awards } = distributePots(pots, [
  { id: 'a', rank: 1, seat: 0 },
  { id: 'b', rank: 2, seat: 1 },
  { id: 'c', rank: 3, seat: 2 },
], { sbSeat: 0, playerCount: 3 });

// 亮牌后
g.distributePots([{ id: 'a', rank: 1 }, { id: 'b', rank: 2 }]);
```

| 街道 | 说明 |
|------|------|
| preflop → flop → turn → river → showdown | 自动推进 |
| SB / BB / Straddle | 盲注与抓牌 |
| check / call / raise / fold / all-in | 标准 NL 动作 |

边池：按 `betTotal` 分层；弃牌者出资但无资格；全押只进覆盖其投入的池。

## 单局状态机 `TexasGameStateMachine`

```
Waiting → DealingHoleCards → PreFlopBetting
  → DealingFlop → FlopBetting → DealingTurn → TurnBetting
  → DealingRiver → RiverBetting → Showdown → Settling
```

```js
import { TexasGameStateMachine, TexasPhase } from '@tea-parlor/texas-engine';

const sm = new TexasGameStateMachine({
  playerIds: ['a', 'b', 'c'],
  chips: [1000, 1000, 1000],
  smallBlind: 5,
  bigBlind: 10,
  buttonSeat: 0,
});

sm.startHand();
// sm.buttonSeat / sm.sbSeat / sm.bbSeat / sm.currentActorIndex

sm.validateAction('a', 'raise', { raiseTo: 30 });
sm.dispatch('raise', { playerId: 'a', raiseTo: 30 });
sm.dispatch('fold', { playerId: 'b' });

// 仅剩 1 人未弃牌 → 直接 Settling（跳过发牌）
// 下注对齐 → 自动 DealingFlop → FlopBetting …

sm.getSnapshot('a'); // 仅自己可见底牌
sm.endSettling({ autoNext: true, rotateButton: true });
```

| 能力 | 说明 |
|------|------|
| 位置 | Button / SB / BB / `currentActorIndex` |
| 校验 | 加注增量 ≥ 上次 Raise；短筹 All-in 例外 |
| 推进 | 未弃牌玩家注额一致 → 下一发牌街 |
| 提前结束 | 仅 1 人未 Fold → 跳过发牌/亮牌，直接分池 |

## AI：`makePokerAIDecision` / `calculateEquity`

```js
import {
  makePokerAIDecision,
  calculateEquity,
  calculatePotOdds,
  PokerStyle,
  PokerAction,
} from '@tea-parlor/texas-engine';

// 蒙特卡洛 Equity
const { equity } = calculateEquity(hole, board, 2, { simulations: 1000 });

// Pot Odds
const { potOdds, breakEvenEquity } = calculatePotOdds(pot, callAmount);
// Call +EV ⇔ equity > potOdds

const d = makePokerAIDecision(
  { id: 'ai', holeCards: hole, style: PokerStyle.TAG, chips: 1000 },
  {
    communityCards: board,
    pot: 120,
    callAmount: 30,
    currentBet: 30,
    minRaiseTo: 60,
    bb: 10,
    street: 'flop',
    activeOpponentsCount: 1,
    isPreflopAggressor: true, // C-Bet
  }
);
// d.action: FOLD|CHECK|CALL|BET|RAISE|ALL_IN
// d.equity / d.potOdds / d.ev / d.reason
```

| 风格 | 特征 |
|------|------|
| **TAG** | 紧凶：低 VPIP、高 C-Bet / 3-Bet |
| **LAG** | 松凶：更多偷盲与半诈唬 |
| **TP / LP** | 紧弱 / 松弱（被动跟注） |

半诈唬：检测同花听 / OESD / 卡顺，Flop/Turn 可 BET/RAISE。

## Provably Fair + Hand History + 共谋检测

### 可证明公平

```js
import {
  fairShuffle,
  toPublicFairCommit,
  toFairReveal,
  verifyFairShuffle,
} from '@tea-parlor/texas-engine';

// 局前
const full = fairShuffle({ clientSeed: 'player-seed', nonce: handId });
broadcast(toPublicFairCommit(full)); // publicHash = HMAC-SHA256(serverSeed, clientSeed:nonce)

// 发牌用 full.deck …

// 局后
const ok = verifyFairShuffle({
  ...toFairReveal(full),
  finalDeck: full.deck,
});
```

### Hand History（PokerStars / PT4 文本）

```js
import { generateHandHistory } from '@tea-parlor/texas-engine';

const text = generateHandHistory({
  handId: 123,
  tableName: 'Tea Table',
  smallBlind: 5,
  bigBlind: 10,
  buttonSeat: 0,
  players: [{ name: 'Alice', seat: 0, chips: 1000 }, ...],
  holeCards: { Alice: [...] }, // 仅亮牌/结算写入
  board: [...],
  actions: [
    { street: 'preflop', player: 'Alice', action: 'raises', amount: 20, raiseTo: 30 },
    { street: 'flop', player: 'Bob', action: 'folds' },
  ],
  pots: [{ player: 'Alice', amount: 80 }],
  publicHash: '...',
});
```

### 共谋检测

```js
import { createCollusionDetector, CollusionAlertType } from '@tea-parlor/texas-engine';

const det = createCollusionDetector();
det.registerSession({ playerId: 'a', ip, deviceId, tableId });
det.recordEvent({ type: 'chip_dump', playerId: 'a', beneficiaryId: 'b', amount: 100, tableId });
det.recordEvent({ type: 'squeeze_fold', playerId: 'a', colluderId: 'b', aggressorId: 'c', tableId });
const { alerts, riskScore } = det.analyzeTable(tableId);
// CHIP_DUMPING | SQUEEZE_SOFT_FOLD | MULTI_ACCOUNT_SAME_IP | …
```

## 测试

```bash
npm test
```
