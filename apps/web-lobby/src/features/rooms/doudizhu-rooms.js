export function formatEntryRange(room) {
  const fmtK = (n) => {
    if (n >= 10000) {
      const w = n / 10000;
      return Number.isInteger(w) ? `${w}万` : `${w.toFixed(1)}万`.replace(/\.0万$/, '万');
    }
    if (n >= 1000) {
      const k = n / 1000;
      return Number.isInteger(k) ? `${k}千` : `${k}千`;
    }
    return String(n);
  };
  if (room.maxEntry) return `${fmtK(room.minEntry)}-${fmtK(room.maxEntry)}`;
  return `${fmtK(room.minEntry)}以上`;
}

export function formatOnline(n) {
  return Number(n || 0).toLocaleString('zh-CN');
}

export function buildDoudizhuRoomCards(rooms, variantId) {
  return rooms.map((room, idx) => {
    const primary = idx === 0 ? ' primary-room' : '';
    const tier = idx <= 2 ? ' room-tier-cool' : ' room-tier-violet';
    const action = idx === 0 ? '快速开始' : '进入';
    const actionCls = idx === 0 ? '' : (idx === 2 ? ' secondary' : '');
    const recent = idx === 0
      ? '<span class="room-ad-tag" data-ad-slot="room-card-low">最近</span>'
      : '';

    return (
      `<button class="room-card room-card-qq${primary}${tier}" type="button" data-game-room="doudizhu" data-room="${room.id}" data-ddz-mode="${variantId}">`
      + recent
      + `<span class="room-stake-tl" aria-label="底分 ${room.stake}">`
      + `<em>底分</em><b>${room.stake}</b>`
      + `</span>`
      + `<strong class="room-name-center">${room.name}</strong>`
      + `<span class="room-meta">${formatOnline(room.online)} · ${formatEntryRange(room)}</span>`
      + `<span class="room-action${actionCls}">${action}</span>`
      + `</button>`
    );
  }).join('');
}
