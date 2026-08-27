export * from './card.js';
export * from './rules.js';
export * from './bidding.js';
export * from './settlement.js';
export * from './ai.js';
export * from './engine.js';
export * from './adapter.js';
// 牌型识别与比较（identifyHandType / compareHands）
export {
  HandType as HandTypeV2,
  createCard as createHandCard,
  cardsFromRanks,
  identifyHandType,
  compareHands,
} from './hand-types.js';
// 癞子组合搜索
export {
  isWildCard,
  getBestLaiziCombinations,
  parseHandLaizi,
  canBeatLaizi,
  compareLaiziComboPriority,
  estimateLaiziSearchSpace,
} from './laizi-combinations.js';
// 单局状态机
export {
  CardGameStateMachine,
  GamePhase,
  TurnTimer,
  BaseState,
  snapshotContext,
} from './state-machine/index.js';
// 连炸斗地主
export {
  ChainBombType,
  evaluateChainBomb,
  compareChainBombs,
  canBeatWithChainBomb,
  chainBombMultiplier,
  accumulateBombMultiplier,
  bombEventFromPlay,
  parseHandWithChainBomb,
  canBeatWithChainBombRules,
  isChainBombRank,
} from './chain-bomb.js';
// 欢乐斗地主 · 叫抢/加倍/倍率结算
export {
  AuctionMode,
  ScoreAction,
  RobAction,
  DoubleAction,
  AuctionPhase,
  DoublePhase,
  createAuctionState,
  getLegalAuctionActions,
  applyAuctionAction,
  assignBottomToLandlord,
  createDoublingState,
  applyDoubleAction,
  finalizeDoublingDefaults,
  calculateFinalMultipliers,
  buildMultiplierInputFromStates,
} from './huanle-auction.js';
