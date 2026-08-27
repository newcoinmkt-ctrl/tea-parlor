/**
 * 结算表「玩家」列头像
 * - 优先使用个人设置的形象（由 app 注入 resolveSeatSrc）
 * - 全身立绘用 is-fullbody 对焦头部入圆
 */

export const SEAT_PORTRAITS = [
  './public/avatars/player-me.jpg',
  './public/avatars/player-a.jpg',
  './public/avatars/player-b.jpg',
  './public/avatars/player-a.jpg',
];

/** @type {null | ((seat: number) => string)} */
let resolveSeatSrc = null;

/** 由 app.js 注入：返回座位当前形象 URL（含自己的装扮） */
export function setResultAvatarResolver(fn) {
  resolveSeatSrc = typeof fn === 'function' ? fn : null;
}

/** 结算用头像：优先个人设置 */
export function getResultSeatSrc(seat = 0) {
  const i = Number(seat) || 0;
  try {
    const src = resolveSeatSrc?.(i);
    if (src) return src;
  } catch (_) { /* ignore */ }
  return SEAT_PORTRAITS[i % SEAT_PORTRAITS.length] || SEAT_PORTRAITS[0];
}

/** 是否像全身立绘（需顶部裁切） */
export function isFullBodySrc(src) {
  if (!src) return false;
  if (src.startsWith('data:image')) return true;
  return /\.png(\?|$)/i.test(src) || /characters\//i.test(src);
}

/**
 * @param {{ seat:number, name:string, isMe?:boolean, src?:string, badge?:string }} opts
 */
export function resultPlayerHtml(opts) {
  const seat = opts.seat ?? 0;
  const name = escapeHtml(opts.name || `玩家${seat + 1}`);
  const me = opts.isMe ? '（我）' : '';
  // 未显式传 src 时，自动跟随个人/座位形象设置
  const src = opts.src || getResultSeatSrc(seat);
  const full = isFullBodySrc(src);
  const badge = opts.badge ? `<i class="result-badge">${escapeHtml(opts.badge)}</i>` : '';
  const safeSrc = String(src).replace(/'/g, '%27').replace(/"/g, '%22');
  return (
    `<div class="result-player${opts.isMe ? ' is-me' : ''}">`
    + `<span class="result-avatar ${full ? 'is-fullbody' : 'is-portrait'}" `
    + `style="background-image:url('${safeSrc}')" role="img" aria-label="${name}"></span>`
    + `<span class="result-name-col">`
    + `<span class="result-name">${name}${me}</span>`
    + badge
    + `</span>`
    + `</div>`
  );
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
