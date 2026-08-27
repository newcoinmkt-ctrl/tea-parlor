export {
  SUIT,
  SUIT_SYMBOL,
  RANK,
  RANK_LABEL,
  createCard,
  createGuanDanDeck,
  resetCardIds,
  cardText,
  isJoker,
  isWild,
  straightChainRanks,
} from './card.js';

export {
  HandType,
  HAND_TYPE_NAME,
  identifyGuanDanHand,
  identifyFixedRanks,
  bestGuanDanHand,
  compareGuanDanHands,
  canSuppress,
  rankStrength,
  bombTier,
  isBombLike,
  handPower,
  describeCards,
} from './hand-types.js';

export {
  TributePhase,
  TributeKind,
  TributeStateMachine,
  resolveTributeKind,
  checkAntiTribute,
  pickTributeCard,
  listReturnableCards,
  isValidReturnCard,
  countBigJokers,
  teammateOf,
  sameTeam,
} from './tribute.js';
// TributeStateMachine.prototype.autoReturn 见 tribute.js

export {
  LEVEL_A,
  LEVEL_MIN,
  resolvePassWind,
  analyzeFinish,
  calculateLevelProgress,
  advanceLevel,
  GuanDanSettlement,
} from './settlement.js';

export {
  GuanDanAIAction,
  makeGuanDanAIDecision,
  suggestWildComposition,
  detectGuanDanCollusion,
} from './ai-decision.js';
