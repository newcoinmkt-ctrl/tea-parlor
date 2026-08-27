# @tea-parlor/zhajinhua-engine

炸金花（三张牌）**牌型识别与比较**模块。

## 牌型（强 → 弱）

| 类型 | 说明 |
|------|------|
| 豹子 | 三点相同，AAA > KKK > … > 222 |
| 顺金 | 同花顺，QKA 最大，A23 最小 |
| 金花 | 同花非顺，比高牌再比次牌 |
| 顺子 | 连续非同花，A23 最小 |
| 对子 | 对子点 + 单张踢脚 |
| 散牌 | 高牌 |

### 特殊：235（豹子杀手）

- **1v1 比牌**（`compareHands`）：场上有豹子时，2·3·5 **仅克豹子**；其它牌型下 235 仍为最小
- **场上无豹子**：2·3·5 为**最小散牌**
- **多人亮牌**（`rankHands`）：同时有 235 与豹子时，豹子垫底、235 仅高于豹子，其余按常规强度（避免非传递循环）

## API

```js
import {
  createCard,
  identifyHandType,
  compareHands,
  HandType,
} from '@tea-parlor/zhajinhua-engine';

const a = [createCard(14, 1), createCard(14, 2), createCard(14, 3)]; // AAA
const b = [createCard(2, 1), createCard(3, 2), createCard(5, 3)];   // 235

identifyHandType(a); // { type: TRIPLE, name: '豹子', ... }
compareHands(b, a, true);  // >0  有豹子时 235 杀豹子
compareHands(b, a, false); // <0  无豹子时 豹子胜，235 最小
```


- `Card`: `{ rank: 2–14, suit: 1–4 }`
- `compareHands(A, B, hasLeopardInGame)` → `>0` A 大，`<0` B 大，`0` 平

## 状态机引擎 `ZajinhuaGameEngine`

多轮下注与筹码控制（状态机）：

```
WAITING → DEALING → BETTING → SETTLING
```

| 玩家状态 | 含义 |
|----------|------|
| `men` | 未看牌（闷牌） |
| `looked` | 已看牌 |
| `folded` | 已弃牌 |
| `lost` | 比牌输掉 |

```js
import { ZajinhuaGameEngine, PlayerStatus } from '@tea-parlor/zhajinhua-engine';

const g = new ZajinhuaGameEngine({
  playerIds: ['a', 'b', 'c'],
  chips: [1000, 1000, 1000],
  ante: 10,
  baseStake: 10,
  maxMenStake: 200,
  maxRounds: 20,
});

g.startGame();
g.lookCards('a');                 // 看牌 → 单注 ×2
g.bet('a', 20);                   // 看牌跟注
g.fold('b');                      // 弃牌
g.comparePlayerCards('a', 'c');   // 比牌，费用=当前单注×2
g.getSnapshot('a');               // 视角快照
```

规则摘要：

- 看牌玩家下注 = 闷牌单注 × **2**
- 比牌消耗 = 发起方当前单注 × **2**，输者 → `lost`
- 仅剩 1 人存活 → 立即结算，赢家收 **pot**
- `pot === sum(betTotal)` 全程守恒

### All-in / 边池

```js
import {
  ZajinhuaGameEngine,
  buildSidePots,
  settleAllPots,
} from '@tea-parlor/zhajinhua-engine';

// 筹码不足当前单注
g.allIn(playerId);

// 纯函数：拆池 + 按牌力分配
const { pots, awards, deltas } = settleAllPots([
  { id: 'a', betTotal: 30, status: 'all_in', cards: [...] },
  { id: 'b', betTotal: 100, status: 'looked', cards: [...] },
]);
// a 只参与主池（30×n）；更高边池仅 b 等长码有资格
```

| 能力 | 说明 |
|------|------|
| `allIn(id)` | 投入剩余筹码 → `all_in`，跳过后续跟注 |
| `buildSidePots` | 按 `betTotal` 分层主池/边池 |
| `settleAllPots` | 各池独立比牌发奖；All-in 仅覆盖其投入层级 |
| 开牌触发 | 全员 All-in / 仅 1 人仍有筹码+他人 All-in / 轮数上限 |

## AI 决策 `makeAIDecision`

```js
import {
  makeAIDecision,
  AIPersonality,
  AIAction,
  applyAIDecision,
  gameStateFromSnapshot,
} from '@tea-parlor/zhajinhua-engine';

const decision = makeAIDecision(
  {
    id: 'ai',
    personality: AIPersonality.AGGRESSIVE, // 或 conservative
    looked: true,
    cards: myThreeCards,
    chips: 500,
  },
  {
    pot: 120,
    currentMenStake: 20,
    maxMenStake: 200,
    round: 3,
    maxRounds: 20,
    canCompare: true,
    players: [/* 含 status / betTotal / chips */],
    betHistory: [
      { playerId: 'op1', type: 'raise', amount: 40 },
    ],
  }
);
// → { action: 'RAISE'|'CALL'|'FOLD'|'LOOK'|'COMPARE', amount?, targetId?, winRate, reason }
```

| 性格 | 行为特征 |
|------|----------|
| **aggressive** | 爱闷牌、常加注、弱牌诈唬、更敢比牌 |
| **conservative** | 早看；散牌直接弃；小对遇猛加注弃；金花+才积极 |
| **balanced** | 居中 |

决策综合考虑：胜率估算、轮数、池热度、对手加注史。

## 安全：Provably Fair / 胜率 / 防作弊

### 1. 可验证洗牌

```js
import {
  fairShuffle,
  toPublicFairProof,
  toRevealFairProof,
  verifyFairShuffle,
} from '@tea-parlor/zhajinhua-engine';

// 开局
const full = fairShuffle({ clientSeed: 'user-seed', tableId: 'T1', handId: 'H1' });
broadcast(toPublicFairProof(full)); // commitHash + publicCode（不含 serverSeed）

// 发牌用 full.deck …

// 局后
const reveal = toRevealFairProof(full);
const ok = verifyFairShuffle({ ...reveal, finalDeck: full.deck, tableId: 'T1', handId: 'H1' });
```

- Fisher-Yates + HMAC-DRBG（`serverSeed:salt:clientSeed:nonce`）
- `commitHash = SHA256(serverSeed:salt)` 开局公开，防事后改种子

### 2. 蒙特卡洛胜率

```js
import { getWinProbability } from '@tea-parlor/zhajinhua-engine';

const r = getWinProbability(myThreeCards, 3, seenCards, { simulations: 3000 });
// r.winProbability / equity / loseProbability
```

### 3. 协同作弊检测

```js
import { createCollusionDetector, AlertType } from '@tea-parlor/zhajinhua-engine';

const det = createCollusionDetector();
det.registerSession({ playerId: 'a', ip, deviceId, tableId });
det.recordAction({ type: 'fold', playerId: 'a', beneficiaryId: 'b', tableId });
det.recordAction({ type: 'compare', playerId: 'a', targetId: 'b', winnerId: 'a', loserId: 'b' });
const { alerts, riskScore } = det.analyzeTable(tableId);
// MULTI_ACCOUNT_SAME_IP | CHIP_FEEDING | COLLUSIVE_COMPARE | …
```

## 测试

```bash
npm test
```
