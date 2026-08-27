export const BidAction = {
  PASS: 0,
  ONE: 1,
  TWO: 2,
  THREE: 3,
};

export function createBiddingState(options = {}) {
  const playerCount = options.playerCount ?? 3;
  const starter = options.starter ?? 0;
  if (!Number.isInteger(playerCount) || playerCount !== 3) {
    throw new Error('classic_doudizhu_requires_3_players');
  }
  if (!isPlayerIndex(starter, playerCount)) {
    throw new Error('invalid_bid_starter');
  }

  return {
    playerCount,
    starter,
    turn: starter,
    currentBid: 0,
    landlordIndex: -1,
    bidScores: Array(playerCount).fill(null),
    actionCount: 0,
    finished: false,
    baseScore: 0,
    reason: null,
  };
}

export function getLegalBids(state) {
  if (!state || state.finished) return [];
  const bids = [BidAction.PASS];
  for (let score = 1; score <= 3; score++) {
    if (score > state.currentBid) bids.push(score);
  }
  return bids;
}

export function applyBid(state, player, score) {
  if (!state || state.finished) {
    return { ok: false, reason: 'bid_finished', state };
  }
  if (!isPlayerIndex(player, state.playerCount) || player !== state.turn) {
    return { ok: false, reason: 'not_bid_turn', state };
  }
  if (!getLegalBids(state).includes(score)) {
    return { ok: false, reason: 'invalid_bid_score', state };
  }

  const next = cloneBiddingState(state);
  next.bidScores[player] = score;
  next.actionCount += 1;

  if (score > next.currentBid) {
    next.currentBid = score;
    next.landlordIndex = player;
  }

  if (score === BidAction.THREE) {
    next.finished = true;
    next.baseScore = BidAction.THREE;
    next.reason = 'bid_3';
    return { ok: true, state: next };
  }

  if (next.actionCount >= next.playerCount) {
    next.finished = true;
    if (next.currentBid === 0) {
      next.landlordIndex = next.starter;
      next.baseScore = 1;
      next.reason = 'all_pass_starter_landlord';
    } else {
      next.baseScore = next.currentBid;
      next.reason = 'highest_bid';
    }
    return { ok: true, state: next };
  }

  next.turn = (player + 1) % next.playerCount;
  return { ok: true, state: next };
}

function cloneBiddingState(state) {
  return {
    playerCount: state.playerCount,
    starter: state.starter,
    turn: state.turn,
    currentBid: state.currentBid,
    landlordIndex: state.landlordIndex,
    bidScores: state.bidScores.slice(),
    actionCount: state.actionCount,
    finished: state.finished,
    baseScore: state.baseScore,
    reason: state.reason,
  };
}

function isPlayerIndex(value, playerCount) {
  return Number.isInteger(value) && value >= 0 && value < playerCount;
}
