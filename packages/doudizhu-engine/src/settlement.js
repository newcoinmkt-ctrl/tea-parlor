export function calculateMultiplier(options = {}) {
  const baseMultiplier = options.baseMultiplier ?? 1;
  const bombCount = options.bombCount ?? 0;
  const spring = options.spring ? 1 : 0;
  return baseMultiplier * (2 ** (bombCount + spring));
}

export function detectSpring({ landlordIndex, winnerIndex, turnPlayCount }) {
  const isLandlordWin = winnerIndex === landlordIndex;
  if (isLandlordWin) {
    return [0, 1, 2]
      .filter((idx) => idx !== landlordIndex)
      .every((idx) => (turnPlayCount[idx] ?? 0) === 0);
  }
  return (turnPlayCount[landlordIndex] ?? 0) <= 1;
}

export function calculateSettlement(options) {
  const {
    landlordIndex,
    winnerIndex,
    baseScore = 1,
    baseRoomScore = 1,
    multiplier = 1,
    bombCount = 0,
    spring = false,
    carryScores = null,
    idempotencyKey = null,
  } = options;

  validatePlayerIndex(landlordIndex, 'landlordIndex');
  validatePlayerIndex(winnerIndex, 'winnerIndex');

  const winnerSide = winnerIndex === landlordIndex ? 'landlord' : 'farmer';
  const unit = baseScore * multiplier * baseRoomScore;
  const rawScores = [0, 0, 0];

  if (winnerSide === 'landlord') {
    rawScores[landlordIndex] = 2 * unit;
    for (let idx = 0; idx < 3; idx++) {
      if (idx !== landlordIndex) rawScores[idx] = -unit;
    }
  } else {
    rawScores[landlordIndex] = -2 * unit;
    for (let idx = 0; idx < 3; idx++) {
      if (idx !== landlordIndex) rawScores[idx] = unit;
    }
  }

  const scores = carryScores ? applyWinLossCap(rawScores, carryScores) : rawScores;

  return Object.freeze({
    idempotencyKey,
    winnerSide,
    winnerIndex,
    landlordIndex,
    scores,
    rawScores,
    baseScore,
    baseRoomScore,
    multiplier,
    spring,
    bombCount,
    unit,
  });
}

export function applyWinLossCap(rawScores, carryScores) {
  if (!Array.isArray(rawScores) || rawScores.length !== 3) {
    throw new Error('raw_scores_must_have_3_players');
  }
  if (!Array.isArray(carryScores) || carryScores.length !== 3) {
    throw new Error('carry_scores_must_have_3_players');
  }

  const positiveTotal = rawScores.reduce((sum, score, idx) => {
    if (score <= 0) return sum;
    return sum + Math.min(score, nonNegative(carryScores[idx]));
  }, 0);
  const lossTotal = rawScores.reduce((sum, score, idx) => {
    if (score >= 0) return sum;
    return sum + Math.min(Math.abs(score), nonNegative(carryScores[idx]));
  }, 0);
  const payable = Math.min(positiveTotal, lossTotal);

  if (payable === 0) return [0, 0, 0];

  const winnerCaps = rawScores.map((score, idx) =>
    score > 0 ? Math.min(score, nonNegative(carryScores[idx])) : 0
  );
  const loserCaps = rawScores.map((score, idx) =>
    score < 0 ? Math.min(Math.abs(score), nonNegative(carryScores[idx])) : 0
  );

  const scores = Array(3).fill(0);
  distribute(payable, winnerCaps).forEach((amount, idx) => {
    if (amount > 0) scores[idx] = amount;
  });
  distribute(payable, loserCaps).forEach((amount, idx) => {
    if (amount > 0) scores[idx] = -amount;
  });
  return scores;
}

function distribute(total, caps) {
  const capTotal = caps.reduce((sum, cap) => sum + cap, 0);
  if (capTotal <= 0) return Array(caps.length).fill(0);
  return caps.map((cap) => roundScore((cap / capTotal) * total));
}

function validatePlayerIndex(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 2) {
    throw new Error(`invalid_${label}`);
  }
}

function nonNegative(value) {
  return Math.max(0, Number(value) || 0);
}

function roundScore(value) {
  return Number(value.toFixed(8));
}
