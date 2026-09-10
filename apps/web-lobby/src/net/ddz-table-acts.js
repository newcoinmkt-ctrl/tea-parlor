/** Rebuild seat play-zones from online snapshot lastPlay (+ inferred passes). */
function isPassSignal(last) {
  if (!last || typeof last !== 'object') return false;
  if (last.pass === true || last.passed === true) return true;
  const kind = String(last.kind || last.action || last.type || '').toLowerCase();
  return kind === 'pass' || kind === '不出' || kind === 'pass_turn';
}

export function tableActsFromOnlineRoom(room, prevActs) {
  const acts = [null, null, null];
  const last = room?.lastPlay;
  const cards = Array.isArray(last?.cards) ? last.cards.filter(Boolean) : [];
  const player = Number.isInteger(last?.player) ? last.player : -1;
  const prev = Array.isArray(prevActs) ? prevActs : [null, null, null];

  if (player >= 0 && player < 3 && cards.length) {
    const parsed = last.type
      ? { type: last.type, cards, weight: last.weight, length: last.length }
      : (last.parsed || null);
    acts[player] = { kind: 'play', cards: cards.slice(), parsed };
  } else if (player >= 0 && player < 3 && isPassSignal(last)) {
    // Pure pass without card faces → persistent seat「不出」bubble.
    acts[player] = { kind: 'pass' };
    for (let i = 0; i < 3; i++) {
      if (i !== player && prev[i]?.kind === 'play') acts[i] = prev[i];
    }
  } else if (player >= 0 && player < 3 && prev[player]?.kind === 'play') {
    // Keep prior visual if snapshot omitted card faces this tick.
    acts[player] = prev[player];
  } else if (player >= 0 && player < 3 && Array.isArray(last?.cards) && !cards.length) {
    // Empty cards[] and nothing to keep → treat as seat pass.
    acts[player] = { kind: 'pass' };
    for (let i = 0; i < 3; i++) {
      if (i !== player && prev[i]?.kind === 'play') acts[i] = prev[i];
    }
  }

  const current = Number.isInteger(room?.currentPlayer) ? room.currentPlayer : -1;
  let passLeft = Math.max(0, Number(room?.passCount) || 0);
  if (player >= 0 && current >= 0 && passLeft > 0) {
    // When lastPlay itself is a pass, remaining passCount covers seats after the passer.
    let p = (player + 1) % 3;
    if (acts[player]?.kind === 'pass' && !cards.length) {
      passLeft = Math.max(0, passLeft - 1);
    }
    while (passLeft > 0 && p !== current && p !== player) {
      acts[p] = { kind: 'pass' };
      passLeft -= 1;
      p = (p + 1) % 3;
    }
  }

  // Preserve bid/double bubbles only when still in those phases.
  if (room?.phase === 'bid' || room?.phase === 'double') {
    for (let i = 0; i < 3; i++) {
      if (prev[i] && (prev[i].kind === 'bid' || prev[i].kind === 'double') && !acts[i]) {
        acts[i] = prev[i];
      }
    }
  }
  return acts;
}
