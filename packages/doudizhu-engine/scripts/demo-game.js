import { DoudizhuEngine, Phase } from '../src/engine.js';
import { decideBid, decidePlay } from '../src/ai.js';
import { rankLabel, sortCards, SUITS } from '../src/card.js';

function formatCard(card) {
  if (!card) return '';
  if (card.isJoker) return card.rank === 17 ? '大王' : '小王';
  return `${SUITS[card.suit] || ''}${rankLabel(card.rank)}`;
}

function formatCards(cards) {
  return sortCards(cards).map(formatCard).join(' ');
}

const engine = new DoudizhuEngine({
  playerNames: ['玩家A', '玩家B', '玩家C'],
  humanIndex: -1,
  baseRoomScore: 1,
});

engine.scheduleAI = () => {};
engine.startGame();

const log = [];
let guard = 0;

while (engine.phase !== Phase.SETTLE && guard++ < 300) {
  const state = engine.getState();

  if (state.phase === Phase.BID) {
    const player = state.bidTurn;
    const score = decideBid(engine.hands[player], state.currentBid);
    log.push(`${state.playerNames[player]} 叫分: ${score || '不叫'}`);
    engine.bid(player, score);
    continue;
  }

  if (state.phase === Phase.PLAY) {
    const player = state.currentPlayer;
    const prevHand = engine.lastPlay && engine.lastPlay.player !== player
      ? engine.lastPlay.hand
      : null;
    const decision = decidePlay({
      hand: engine.hands[player],
      prevHand,
      isLandlord: player === engine.landlordIndex,
      myIndex: player,
      landlordIndex: engine.landlordIndex,
      handCounts: engine.hands.map((h) => h.length),
      prevPlayer: engine.lastPlay ? engine.lastPlay.player : null,
    });

    if (!decision) {
      if (prevHand) {
        engine.pass(player);
        log.push(`${state.playerNames[player]} 不出`);
      } else {
        const smallest = sortCards(engine.hands[player], true)[0];
        engine.play(player, [smallest]);
        log.push(`${state.playerNames[player]} 出 ${formatCards([smallest])}`);
      }
    } else {
      engine.play(player, decision.cards);
      log.push(`${state.playerNames[player]} 出 ${formatCards(decision.cards)}`);
    }
  }
}

if (engine.phase !== Phase.SETTLE) {
  console.error('Demo failed: game did not settle within guard limit.');
  process.exit(1);
}

const state = engine.getState();
const landlord = state.playerNames[state.landlordIndex];
const winner = state.settlement.winnerSide === 'landlord' ? '地主' : '农民';

console.log('Tea Parlor 斗地主引擎演示');
console.log(`地主: ${landlord}`);
console.log(`底牌: ${formatCards(state.bottomCards)}`);
console.log(`过程步数: ${log.length}`);
console.log('最近 12 步:');
for (const line of log.slice(-12)) console.log(`- ${line}`);
console.log('结算:');
console.log(`- 胜方: ${winner}`);
console.log(`- 底分: ${state.settlement.baseScore}`);
console.log(`- 倍数: ${state.settlement.multiplier}`);
console.log(`- 春天/反春: ${state.settlement.spring ? '是' : '否'}`);
console.log(`- 分数: ${state.playerNames.map((name, i) => `${name} ${state.settlement.scores[i]}`).join(' / ')}`);

engine.destroy();
