/** Rebuild seat play-zones from online snapshot lastPlay (+ inferred passes). */
export function tableActsFromOnlineRoom(room, prevActs) {
  const acts = [null, null, null];
  const last = room?.lastPlay;
  const cards = Array.isArray(last?.cards) ? last.cards.filter(Boolean) : [];
  const player = Number.isInteger(last?.player) ? last.player : -1;
  if (player >= 0 && player < 3 && cards.length) {
    const parsed = last.type
      ? { type: last.type, cards, weight: last.weight, length: last.length }
      : (last.parsed || null);
    acts[player] = { kind: 'play', cards: cards.slice(), parsed };
  } else if (player >= 0 && player < 3 && Array.isArray(prevActs) && prevActs[player]?.kind === 'play') {
    // Keep prior visual if snapshot omitted card faces this tick.
    acts[player] = prevActs[player];
  }
  const current = Number.isInteger(room?.currentPlayer) ? room.currentPlayer : -1;
  let passLeft = Math.max(0, Number(room?.passCount) || 0);
  if (player >= 0 && current >= 0 && passLeft > 0) {
    let p = (player + 1) % 3;
    while (passLeft > 0 && p !== current && p !== player) {
      acts[p] = { kind: 'pass' };
      passLeft -= 1;
      p = (p + 1) % 3;
    }
  }
  // Preserve bid/double bubbles only when still in those phases.
  if (room?.phase === 'bid' || room?.phase === 'double') {
    for (let i = 0; i < 3; i++) {
      const prev = Array.isArray(prevActs) ? prevActs[i] : null;
      if (prev && (prev.kind === 'bid' || prev.kind === 'double') && !acts[i]) acts[i] = prev;
    }
  }
  return acts;
}
