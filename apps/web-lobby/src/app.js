/**
 * Tea Parlor H5 — JJ 经典三人叫分斗地主人机桌
 * 规则：docs/02-规则资料/平台玩法说明.md 及各玩法说明（斗地主见 JJ 文档；与引擎一致）
 * 交互：鼠标按住划动手牌可选中区间；真人头像
 */
import {
  createDeck,
  sortCards,
  RANK_LABEL,
} from './jj/card.js';
import {
  cryptoRandom,
  riffleShuffle,
  unwashedShuffle,
  dealRoundRobin,
} from './shared/deal.js';
import {
  parseHand,
  canBeat,
  getHint,
  findBeatingHands,
  HandType,
  evaluateChainBomb,
} from './jj/rules.js';
import {
  chainBombMultiplier,
} from './jj/chain-bomb.js';
import {
  parseHandMode,
  canBeatMode,
  getHintLaizi,
  isWildCard,
} from './jj/laizi-rules.js';
import { decideBid, decidePlay, makeAIDecision } from './jj/ai.js';
import { createTexasUI } from './texas/ui.js';
import { createMahjongUI } from './games/mahjong/ui.js';
import { createZhajinhuaUI } from './games/zhajinhua/ui.js';
import { createBlackjackUI } from './games/blackjack/ui.js';
// 掼蛋改为按需加载，避免 /vendor 失败时整站白屏
import * as pinusClient from './pinus/client.js';
import * as colyseusClient from './net/colyseus-client.js';
import { initHandFit, fitAllHands } from './net/hand-layout.js?v=play9e2';
import { initTableOrientation } from './net/table-orient.js';
import { stripGuandanChrome, stripGuandanChromeFromDocument } from './net/strip-gd-chrome.js';
import {
  loadPlayMode,
  savePlayMode,
  nextPlayMode,
  playModeLabel,
  playModeHint,
  isOnlineMode,
  normalizePlayMode,
} from './net/play-mode.js';
import {
  fetchChainAssets,
  reportOpsRevenue,
} from './net/ops-client.js';
import {
  loginWithTelegramInitData,
  fetchWalletSummary,
  fetchDailySupply,
  claimDailySupply as claimDailySupplyApi,
} from './net/wallet-client.js';
import {
  DAILY_SUPPLY_AMOUNT,
  DAILY_SUPPLY_LIMIT,
  DAILY_SUPPLY_TG_PROMPT,
  DAILY_SUPPLY_NON_CASH,
  formatDailySupplyStatus,
  formatDailySupplyClaimSuccess,
  formatDailySupplyExhaustedReason,
  claimButtonLabel,
} from './net/daily-supply-copy.js';
import {
  ddzMatchFailureCopy,
  ddzMatchFailureTitle,
  DDZ_LOCAL_PLAY_HINT,
  DDZ_LOCAL_PLAY_LABEL,
} from './net/ddz-match-copy.js';
import {
  createChainCenterController,
  normalizeChainCenterState,
} from './features/assets/chain-center.js';
import {
  buildDoudizhuRoomCards,
  formatOnline,
} from './features/rooms/doudizhu-rooms.js';
import {
  cardFaceHtml,
  cardText,
  typeLabel,
} from './features/table/doudizhu-table-view.js';
import { quotePlatformFee } from './shared/revenue.js';
import { resultPlayerHtml, SEAT_PORTRAITS, setResultAvatarResolver } from './shared/result-avatar.js';
import { mountCharLogos } from './shared/char-logos.js';
import { playCharAction, playSettleActions, resetAllCharActions } from './shared/char-motion.js';
import { dyeClothesSrc } from './shared/dye-clothes.js';
import {
  ACTIVE_BRAND,
  brandCardBadgeHtml,
  brandMiniBadgeHtml,
  brandMiniBackBadgeHtml,
} from './shared/branding.js';
import { initAdPlacements, syncOpsCatalog as syncOpsCatalogFeature, syncOpsPlayerStatus } from './features/ads/index.js';
import { getThemeMeta, initThemeSystem, setEnabledThemes, listEnabledThemes, applyTheme } from './theme-system.js';
import {
  ACTIVE_EQUIPMENT_SLOTS,
  AVATAR_ITEMS,
  AVATAR_OUTFITS,
  DEFAULT_EQUIPMENT,
  DEV_DEFAULT_INVENTORY,
  applyOutfit,
  cancelPreview,
  clothingIdForTheme,
  equipItem,
  initializeDefaultAvatar,
  listClothingStyles,
  listOverlayItems,
  listSkinItems,
  resetToDefault,
  resolveClothingStyle,
  saveEquipment as commitAvatarEquipment,
  skinCategoryLabel,
  unequipItem,
} from '/vendor/avatar-system/index.js';
import { CHARACTERS as CHARACTER_DEFS } from '/vendor/character-catalog/index.js';
import { clearGearOverlays, mountAvatarRenderer, mountGearOverlays } from './avatar/AvatarRenderer.js';

const STORAGE_KEY = 'tea-parlor-h5-jj-v4';
const DAILY_CLAIM_LIMIT = DAILY_SUPPLY_LIMIT;
const DAILY_CLAIM_AMOUNT = DAILY_SUPPLY_AMOUNT;
const HUMAN = 0;
const PINUS_MODE_KEY = 'tea-parlor-play-mode'; // 'local' | 'colyseus' | 'pinus'

/**
 * 斗地主场次（参照 QQ 斗地主大厅：底分 + 在线 + 入场门槛）
 * stake = 底分（金币）
 */
const ROOMS = {
  // 通用快捷 id
  novice: { id: 'novice', name: '新手场', stake: 12, minEntry: 1000, maxEntry: 15000, unit: 1, currency: 'ingot', online: 41286 },
  classic: { id: 'classic', name: '经典场', stake: 40, minEntry: 3000, maxEntry: 40000, unit: 1, currency: 'ingot', online: 8358 },
  friend: { id: 'friend', name: '好友房', stake: 100, minEntry: 1000, unit: 1, currency: 'ingot', online: 1200 },
  normal: { id: 'normal', name: '普通场', stake: 100, minEntry: 12000, unit: 1, currency: 'ingot', online: 7739 },
  mid: { id: 'mid', name: '中级场', stake: 300, minEntry: 45000, unit: 1, currency: 'ingot', online: 1989 },
  high: { id: 'high', name: '高级场', stake: 1000, minEntry: 120000, unit: 1, currency: 'ingot', online: 560 },
  top: { id: 'top', name: '顶级场', stake: 2500, minEntry: 300000, unit: 1, currency: 'ingot', online: 494 },
  // 链游
  // 链游测试场（赛季积分）— 与金币场次档位对齐
  c_novice: { id: 'c_novice', name: '链游·新手场', stake: 0.5, minEntry: 2, maxEntry: 50, unit: 1, currency: 'crypto', online: 1280 },
  c_micro: { id: 'c_micro', name: '链游·微桌', stake: 1, minEntry: 3, maxEntry: 80, unit: 1, currency: 'crypto', online: 960 },
  c_classic: { id: 'c_classic', name: '链游·经典场', stake: 2, minEntry: 6, maxEntry: 120, unit: 1, currency: 'crypto', online: 720 },
  c_std: { id: 'c_std', name: '链游·标准', stake: 3, minEntry: 10, maxEntry: 200, unit: 1, currency: 'crypto', online: 540 },
  c_mid: { id: 'c_mid', name: '链游·中级场', stake: 5, minEntry: 15, maxEntry: 300, unit: 1, currency: 'crypto', online: 320 },
  c_high: { id: 'c_high', name: '链游·高级场', stake: 10, minEntry: 30, maxEntry: 500, unit: 1, currency: 'crypto', online: 180 },
  c_top: { id: 'c_top', name: '链游·顶级场', stake: 25, minEntry: 80, maxEntry: 2000, unit: 1, currency: 'crypto', online: 90 },
};

/**
 * QQ 斗地主风格玩法 Tab
 * - buxipai  不洗牌：牌堆少洗，长牌多
 * - huanle   欢乐经典：叫分 + 加倍阶段
 * - classic  经典：标准叫分
 * - lianzha  连炸：支持连续炸弹牌型与 2^N 倍率
 * - laizi    天地癞子：随机癞子可当任意牌
 */
const DDZ_VARIANTS = {
  buxipai: {
    id: 'buxipai',
    label: '不洗牌',
    desc: '不洗牌 · 长牌多 · 炸弹连炸多',
    title: '不洗牌',
    tip: '牌堆少洗，顺子/连对更多，适合连炸',
    rooms: ['novice', 'classic', 'normal', 'mid', 'high', 'top'],
    bombExtra: 1,
    enableDouble: true,
    enableChainBomb: true,
  },
  huanle: {
    id: 'huanle',
    label: '欢乐经典',
    desc: '欢乐经典 · 叫分 · 加倍反加倍',
    title: '欢乐经典',
    tip: '叫分 1/2/3 · 加倍/超级加倍 · 炸弹翻倍',
    rooms: ['novice', 'classic', 'normal', 'mid', 'high', 'top'],
    bombExtra: 1,
    enableDouble: true,
    enableChainBomb: true,
    allowSuperDouble: true,
  },
  classic: {
    id: 'classic',
    label: '经典',
    desc: '经典三人 · 标准叫分 1/2/3',
    title: '经典',
    tip: 'JJ/QQ 经典规则 · 标准洗牌',
    rooms: ['novice', 'classic', 'normal', 'mid', 'high', 'top'],
    bombExtra: 0,
    enableDouble: false,
    enableChainBomb: true,
  },
  lianzha: {
    id: 'lianzha',
    label: '连炸',
    desc: '连炸斗地主 · 连续炸弹 · 2^N 倍',
    title: '连炸',
    tip: '支持二连炸及以上 · N 连炸倍率 2^N · 王炸最大',
    rooms: ['novice', 'classic', 'normal', 'mid', 'high', 'top'],
    bombExtra: 0,
    enableDouble: true,
    enableChainBomb: true,
    chainBombPow: true,
  },
  laizi: {
    id: 'laizi',
    label: '天地癞子',
    desc: '天地癞子 · 随机癞子可当任意牌',
    title: '天地癞子',
    tip: '随机一点数为癞子（王除外）· 可凑顺子/对子/软炸',
    rooms: ['novice', 'classic', 'normal', 'mid', 'high', 'top'],
    bombExtra: 0,
    enableDouble: false,
    enableChainBomb: false,
  },
};

let ddzVariant = 'classic';
let ddzLane = 'gold';
let ddzMatchTimer = 0;
let ddzKeepOverlay = false;
let ddzMatchAborted = false;

const DDZ_TIER_IDS = {
  gold: ['novice', 'classic', 'high'],
  season: ['c_novice', 'c_classic', 'c_high'],
};
const DDZ_QUEUE = ['经典叫分 · 超时 AI 补位', '经典叫分 · 超时 AI 补位', '经典叫分 · 超时 AI 补位'];
const DDZ_TIER_LABEL = ['新手', '经典', '高级'];
let _txDealerSyncing = false;

/** 链游测试区结算币种标签（内部键仍为 crypto，余额走赛季积分账本） */
const CRYPTO_SYMBOL = '赛季积分';
/** 内部折算：3 赛季积分 = 60,000 金币 */
const INTERNAL_PACK_UNITS = 3;
const INGOT_PER_PACK = 60000;
const INGOT_PER_INTERNAL_UNIT = INGOT_PER_PACK / INTERNAL_PACK_UNITS; // 20000
/** 链游测试区汇总（currency:crypto 表示走 赛季积分 余额） */
const REAL_ROOMS = {
  ddz_novice: { game: 'doudizhu', room: 'c_novice', label: '斗地主·新手', stake: 0.5, minEntry: 2, currency: 'crypto' },
  ddz_micro: { game: 'doudizhu', room: 'c_micro', label: '斗地主·微桌', stake: 1, minEntry: 3, currency: 'crypto' },
  ddz_classic: { game: 'doudizhu', room: 'c_classic', label: '斗地主·经典', stake: 2, minEntry: 6, currency: 'crypto' },
  ddz_std: { game: 'doudizhu', room: 'c_std', label: '斗地主·标准', stake: 3, minEntry: 10, currency: 'crypto' },
  ddz_mid: { game: 'doudizhu', room: 'c_mid', label: '斗地主·中级', stake: 5, minEntry: 15, currency: 'crypto' },
  ddz_high: { game: 'doudizhu', room: 'c_high', label: '斗地主·高级', stake: 10, minEntry: 30, currency: 'crypto' },
  ddz_top: { game: 'doudizhu', room: 'c_top', label: '斗地主·顶级', stake: 25, minEntry: 80, currency: 'crypto' },
  texas_micro: { game: 'texas', texas: 'c_micro', label: '德州·微盲', buyIn: 10, minEntry: 10, currency: 'crypto' },
  texas_mid: { game: 'texas', texas: 'c_mid', label: '德州·常规', buyIn: 25, minEntry: 25, currency: 'crypto' },
  texas_high: { game: 'texas', texas: 'c_high', label: '德州·高盲', buyIn: 50, minEntry: 50, currency: 'crypto' },
  zjh_micro: { game: 'zhajinhua', zjh: 'micro', label: '炸金花·微注', ante: 1, stake: 1, minEntry: 5, currency: 'crypto' },
  zjh_mid: { game: 'zhajinhua', zjh: 'c_mid', label: '炸金花·进阶', ante: 2, stake: 2, minEntry: 10, currency: 'crypto' },
  zjh_high: { game: 'zhajinhua', zjh: 'c_high', label: '炸金花·高手', ante: 5, stake: 5, minEntry: 20, currency: 'crypto' },
  mj_er: { game: 'mahjong', mode: 'er_c', label: '二人麻将·链游', stake: 2, minEntry: 8, currency: 'crypto' },
  mj_siren: { game: 'mahjong', mode: 'siren_c', label: '四人麻将·链游', stake: 2, minEntry: 10, currency: 'crypto' },
  mj_xuezhan: { game: 'mahjong', mode: 'xuezhan_c', label: '血战·链游', stake: 2, minEntry: 10, currency: 'crypto' },
  mj_xueliu: { game: 'mahjong', mode: 'xueliu_c', label: '血流·链游', stake: 3, minEntry: 15, currency: 'crypto' },
  gd_micro: { game: 'guandan', gd: 'micro', label: '掼蛋·链游微注', stake: 2, minEntry: 8, currency: 'crypto' },
  gd_std: { game: 'guandan', gd: 'std', label: '掼蛋·链游标准', stake: 5, minEntry: 20, currency: 'crypto' },
  gd_high: { game: 'guandan', gd: 'high', label: '掼蛋·链游高桌', stake: 10, minEntry: 40, currency: 'crypto' },
};

/**
 * 形象库（去重）
 * - group: 女性 | 男性 | 动物  —— 顶部分类 tab
 * - style: 卡片角标（平铺展示，不再按 style 分子栏）
 * - costumes: 专属换装图；通用染色见 COSTUME_OPTIONS
 */
const CHAR_ASSET_V = 'qchibi2';
const charUrl = (path) => `${path}?v=${CHAR_ASSET_V}`;

/**
 * 换装 = 同一人物的不同衣服图（同一脸/身材）
 * 染色 = 在当前立绘上改衣服色相（不换人）
 * 禁止把「别的角色立绘」挂进 costumes
 */
const OUTFIT_META = {
  default: { label: '默认衣服', color: '#c9a227' },
  red_dress: { label: '红色短裙', color: '#e05040' },
  black_dress: { label: '黑色短裙', color: '#2a2a35' },
  gold_dress: { label: '金色礼服', color: '#f0c040' },
  purple_dress: { label: '紫色长裙', color: '#9b6bff' },
  office: { label: '职场丝袜', color: '#f5e6d3' },
  casual: { label: '休闲装', color: '#6a8ab0' },
  violet: { label: '紫霞狐装', color: '#8b5cf6' },
};

/**
 * 染色：只改「衣服」颜色，不改肤色/头发。
 * color = 目标衣服色；不再使用整图 CSS hue-rotate（会连皮肤一起染）。
 */
const DYE_OPTIONS = [
  { id: 'cyan', label: '青云染', color: '#3db8a0', kind: 'dye' },
  { id: 'ice', label: '霜华染', color: '#7ec8ff', kind: 'dye' },
  { id: 'rose', label: '蔷薇染', color: '#ff7eb3', kind: 'dye' },
  { id: 'jade', label: '翡翠染', color: '#2ecc71', kind: 'dye' },
  { id: 'night', label: '玄夜染', color: '#5b6cff', kind: 'dye' },
  { id: 'sunset', label: '晚霞染', color: '#ff9f43', kind: 'dye' },
  { id: 'custom', label: '自定义染色', color: '#e8d5ff', kind: 'dye' },
];

/** 兼容 getCostume：default + 各换装 id + 染色 id */
const COSTUME_OPTIONS = [
  { id: 'default', label: '默认衣服', color: '#c9a227', kind: 'outfit', exclusive: false, filter: '' },
  ...Object.entries(OUTFIT_META)
    .filter(([id]) => id !== 'default')
    .map(([id, m]) => ({ id, label: m.label, color: m.color, kind: 'outfit', exclusive: true, filter: '' })),
  ...DYE_OPTIONS.map((d) => ({ ...d, exclusive: false })),
];

/** 仅挂「同一人物」的衣服图 */
function samePersonOutfits(basePath, outfitMap = {}) {
  const base = charUrl(basePath);
  const costumes = { default: base };
  for (const [id, path] of Object.entries(outfitMap)) {
    costumes[id] = charUrl(path);
  }
  return costumes;
}

const CHAR_OPTIONS = CHARACTER_DEFS.map((c) => ({
  id: c.id,
  label: c.name,
  kind: c.kind,
  group: c.group,
  style: c.style,
  defaultOutfit: c.defaultOutfit || undefined,
  base: charUrl(`./public/characters/${c.file}`),
  costumes: samePersonOutfits(
    `./public/characters/${c.file}`,
    Object.fromEntries(Object.entries(c.outfits || {}).map(([k, f]) => [k, `./public/characters/${f}`])),
  ),
}));

/** 衣橱主推 Q 版立绘，点选即可换人 */
const FEATURED_CHAR_IDS = Object.freeze([
  'f_ea_red_qipao',
  'f_ea_black',
  'f_ea_gold',
  'tea_qipao_girl',
  'male_hero',
  'male_charm',
  'm_cool',
  'tea_uncle',
  'tea_panda',
  'animal_fox',
  'tea_tiger',
]);

// 兼容旧 id → 新东方形象
const LEGACY_AVATAR_MAP = {
  me: 'male_hero',
  a: 'f_ea_gold',
  b: 'male_charm',
  tea_lele: 'm_sport',
  tea_xiaoming: 'm_sport',
  tea_coolgirl: 'f_ea_office',
  tea_qipao: 'f_ea_red_qipao',
  tea_xiaomei: 'f_ea_office',
  tea_tuhao: 'm_cool',
  tea_congming: 'm_cool',
  tea_shushu: 'm_cool',
  tea_dashen: 'm_cool',
  tea_panda2: 'tea_panda',
  tea_tiger2: 'tea_tiger',
  // 旧欧美写实 id → 东方形象
  f_real_redlips: 'f_ea_red_qipao',
  f_real_fishnet: 'f_ea_black',
  f_real_gold: 'f_ea_gold',
  f_real_stockings: 'f_ea_office',
  f_real_purple: 'f_ea_purple',
  f_sexy: 'f_ea_red_qipao',
  f_sexy_black: 'f_ea_black',
  f_sexy_purple: 'f_ea_purple',
  f_sexy_gold: 'f_ea_gold',
  female_glam: 'f_ea_gold',
  f_pure: 'f_ea_office',
  f_cold: 'f_ea_black',
  f_sweet: 'f_ea_red_qipao',
  f_smart: 'f_ea_teal',
};

/** AI 对手默认形象（各不相同，且避开玩家当前形象） */
const SEAT_DEFAULT_CHARS = ['male_hero', 'm_cool', 'tea_panda', 'f_ea_gold'];

/** 形象分类 tab 状态 */
let charPickerTab = '女性';

const DEFAULT_PROFILE = {
  name: '茶馆',
  avatarId: 'male_hero',
  costumeId: 'default',
  customAvatarSrc: '',
  customAvatarLabel: '我的形象',
  customSkinColor: '#c084fc',
  customSkinHue: 270,
  customSkinSat: 1.15,
  customSkinBright: 1.05,
  linkSkinAndClothes: true,
  payAddress: '',
  usdtNetwork: '测试网A',
  bio: '人机对战 · 影子金币',
  playerId: '830126',
  level: 12,
};

// 兼容旧头像选择器命名
const AVATAR_OPTIONS = CHAR_OPTIONS.map((c) => ({
  id: c.id,
  src: c.base,
  label: c.label,
  kind: c.kind,
  group: c.group,
}));

/** 运行时显示名：索引 0 随个人中心变化 */
const NAMES = ['茶馆', '茶友A', '茶友B'];

let appState = loadState();
initThemeSystem();
const WARDROBE_TABS = Object.freeze([
  { id: 'characters', label: '人物' },
  { id: 'clothes', label: '衣服' },
  { id: 'styles', label: '样式' },
  { id: 'dyes', label: '染色' },
  { id: 'gear', label: '配饰' },
  { id: 'outfits', label: '套装' },
  { id: 'skins', label: '桌布' },
  { id: 'cardbacks', label: '牌背' },
  { id: 'frames', label: '头像框' },
]);
let wardrobeTab = 'characters';
let applyingLinkedAppearance = false;
let wardrobeSavedSnapshot = null;
let wardrobePreviewAvatar = null;
/** 设备自适应：给 html 打 data-device / data-orient，供 CSS 与逻辑使用 */
function applyDeviceAdapt() {
  let w = window.innerWidth || document.documentElement.clientWidth || 360;
  let h = window.innerHeight || document.documentElement.clientHeight || 640;
  if (document.documentElement.classList.contains('css-landscape') && h > w) {
    const swapped = w;
    w = h;
    h = swapped;
  }
  const coarse = window.matchMedia?.('(pointer: coarse)')?.matches;
  let device = 'desktop';
  if (w <= 480) device = 'phone';
  else if (w <= 900) device = 'tablet';
  else device = 'desktop';
  // 宽高比接近手机竖屏但宽度略大时仍当 phone
  if (w <= 720 && h > w * 1.15) device = w <= 480 ? 'phone' : 'tablet';
  const orient = w > h ? 'landscape' : 'portrait';
  const root = document.documentElement;
  root.dataset.device = device;
  root.dataset.orient = orient;
  root.dataset.pointer = coarse ? 'coarse' : 'fine';
  root.style.setProperty('--vvh', `${h * 0.01}px`);
  root.style.setProperty('--app-w', `${w}px`);
  root.style.setProperty('--app-h', `${h}px`);
  document.body?.classList.toggle('is-mobile', device === 'phone' || device === 'tablet');
  document.body?.classList.toggle('is-phone', device === 'phone');
  document.body?.classList.toggle('is-desktop', device === 'desktop');
  document.body?.classList.toggle('is-landscape', orient === 'landscape');
}
applyDeviceAdapt();
let _deviceAdaptTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(_deviceAdaptTimer);
  _deviceAdaptTimer = setTimeout(applyDeviceAdapt, 80);
});
window.addEventListener('orientationchange', () => {
  setTimeout(applyDeviceAdapt, 120);
});
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => {
    clearTimeout(_deviceAdaptTimer);
    _deviceAdaptTimer = setTimeout(applyDeviceAdapt, 80);
  });
}
let game = null;
let selected = new Set();
let trustee = false;
let hintText = '';
let aiTimer = null;
let texasUI = null;
let texasBuyIn = 0;
let multiUI = null; // zhajinhua | mahjong | guandan
let multiBuyIn = 0;
let activeGame = null; // 'doudizhu' | 'texas' | 'zhajinhua' | 'mahjong' | 'guandan'
let lobbyView = 'home';
let recordFilter = 'all';
/** 'local' 前端人机 | 'colyseus' 推荐联网 | 'pinus' 兼容联网 */
let playMode = loadPlayMode();
let pinusUid = null;
let telegramLoginPromise = Promise.resolve(null);
let onlineBackend = null; // 'colyseus' | 'pinus' | null

const TEXAS_TABLES = {
  micro: { label: '微盲桌', sb: 10, bb: 20, buyIn: 1000, minEntry: 1000, currency: 'ingot' },
  mid: { label: '常规桌', sb: 25, bb: 50, buyIn: 2500, minEntry: 2500, currency: 'ingot' },
  high: { label: '高盲桌', sb: 50, bb: 100, buyIn: 5000, minEntry: 5000, currency: 'ingot' },
  c_micro: { label: '候选·微盲', sb: 10, bb: 20, buyIn: 1000, minEntry: 1000, currency: 'ingot' },
  c_mid: { label: '候选·常规', sb: 25, bb: 50, buyIn: 2500, minEntry: 2500, currency: 'ingot' },
  c_high: { label: '候选·高盲', sb: 50, bb: 100, buyIn: 5000, minEntry: 5000, currency: 'ingot' },
};

const MAHJONG_TABLES = {
  er: { label: '二人麻将', mode: 'er', stake: 100, buyIn: 1000, minEntry: 1000 },
  siren: { label: '四人麻将', mode: 'siren', stake: 100, buyIn: 1200, minEntry: 1200 },
  xuezhan: { label: '血战到底', mode: 'xuezhan', stake: 100, buyIn: 1500, minEntry: 1500 },
  xueliu: { label: '血流成河', mode: 'xueliu', stake: 200, buyIn: 2000, minEntry: 2000 },
  er_c: { label: '二人麻将·链游', mode: 'er', stake: 2, buyIn: 8, minEntry: 8, currency: 'crypto' },
  siren_c: { label: '四人麻将·链游', mode: 'siren', stake: 2, buyIn: 10, minEntry: 10, currency: 'crypto' },
  xuezhan_c: { label: '血战·链游', mode: 'xuezhan', stake: 2, buyIn: 10, minEntry: 10, currency: 'crypto' },
  xueliu_c: { label: '血流·链游', mode: 'xueliu', stake: 3, buyIn: 15, minEntry: 15, currency: 'crypto' },
};

const ZHAJINHUA_TABLES = {
  novice: { label: '炸金花·新手', ante: 50, stake: 50, minEntry: 500, currency: 'ingot' },
  mid: { label: '炸金花·进阶', ante: 100, stake: 100, minEntry: 1500, currency: 'ingot' },
  high: { label: '炸金花·高手', ante: 200, stake: 200, minEntry: 3000, currency: 'ingot' },
  micro: { label: '炸金花·链游微注', ante: 1, stake: 1, minEntry: 5, currency: 'crypto' },
  c_mid: { label: '炸金花·链游进阶', ante: 2, stake: 2, minEntry: 10, currency: 'crypto' },
  c_high: { label: '炸金花·链游高手', ante: 5, stake: 5, minEntry: 20, currency: 'crypto' },
};

const GUANDAN_TABLES = {
  novice: { label: '掼蛋·新手', stake: 100, minEntry: 800, currency: 'ingot' },
  mid: { label: '掼蛋·进阶', stake: 200, minEntry: 2000, currency: 'ingot' },
  micro: { label: '掼蛋·链游微注', stake: 2, minEntry: 8, currency: 'crypto' },
  std: { label: '掼蛋·链游标准', stake: 5, minEntry: 20, currency: 'crypto' },
  high: { label: '掼蛋·链游高桌', stake: 10, minEntry: 40, currency: 'crypto' },
};

/** 二十一点：minBet 最低注，chips 为本桌带入筹码 */
const BLACKJACK_TABLES = {
  novice: { label: '二十一点·新手', minBet: 50, maxBet: 1000, chips: 2000, minEntry: 500, currency: 'ingot' },
  mid: { label: '二十一点·进阶', minBet: 100, maxBet: 3000, chips: 5000, minEntry: 1500, currency: 'ingot' },
  high: { label: '二十一点·高手', minBet: 200, maxBet: 8000, chips: 10000, minEntry: 3000, currency: 'ingot' },
  micro: { label: '二十一点·链游微注', minBet: 1, maxBet: 20, chips: 30, minEntry: 10, currency: 'crypto' },
  c_mid: { label: '二十一点·链游进阶', minBet: 2, maxBet: 50, chips: 60, minEntry: 20, currency: 'crypto' },
  c_high: { label: '二十一点·链游高手', minBet: 5, maxBet: 100, chips: 150, minEntry: 40, currency: 'crypto' },
};

// 链游德州：buyIn 用 赛季积分
TEXAS_TABLES.c_micro = { label: '链游·微盲', sb: 0.5, bb: 1, buyIn: 10, minEntry: 10, currency: 'crypto' };
TEXAS_TABLES.c_mid = { label: '链游·常规', sb: 1, bb: 2, buyIn: 25, minEntry: 25, currency: 'crypto' };
TEXAS_TABLES.c_high = { label: '链游·高盲', sb: 2, bb: 5, buyIn: 50, minEntry: 50, currency: 'crypto' };
// 链游测试场已在 ROOMS 中定义

// 划选状态
let dragActive = false;
let dragMoved = false;
let dragStartIndex = -1;
let dragBaseSelected = null; // Set snapshot at drag start
let suppressNextHandClick = false;

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const nodes = {
  playerName: $('#playerName'),
  ingotBalance: $('#ingotBalance'),
  claimStatus: $('#claimStatus'),
  claimButton: $('#claimIngotButton'),
  tableView: $('#tableView'),
  roomName: $('#roomName'),
  tableStatus: $('#tableStatus'),
  stakeLabel: $('#stakeLabel'),
  lastPlayText: $('#lastPlayText'),
  bottomCards: $('#bottomCards'),
  handArea: $('#handArea'),
  bidControls: $('#bidControls'),
  doubleControls: $('#doubleControls'),
  superDoubleBtn: $('#superDoubleBtn'),
  playControls: $('#playControls'),
  settleControls: $('#settleControls'),
  opponentLeft: $('#opponentLeft'),
  opponentRight: $('#opponentRight'),
  selfSeat: $('#selfSeat'),
  playZones: [$('#playZone0'), $('#playZone1'), $('#playZone2')],
  remain1: $('#remain1'),
  remain2: $('#remain2'),
  roleBadges: [$('#roleBadge0'), $('#roleBadge1'), $('#roleBadge2')],
  multBadge: $('#multBadge'),
  footerMult: $('#footerMult'),
  deckMeter: $('#deckMeter'),
  selfBeanDisplay: $('#selfBeanDisplay'),
  turnTimer: $('#turnTimer'),
  chatBtn: $('#chatToastBtn'),
  hintButton: $('#hintButton'),
  playButton: $('#playButton'),
  passButton: $('#passButton'),
  trusteeButton: $('#trusteeButton'),
  backBtn: $('#backToLobbyButton'),
  againBtn: $('#againButton'),
  settleBackBtn: $('#settleBackButton'),
  shell: $('.lobby-shell'),
  ddzModal: $('#ddzResultModal'),
  ddzBanner: $('#ddzResultBanner'),
  ddzTitle: $('#ddzResultTitle'),
  ddzSub: $('#ddzResultSub'),
  ddzBody: $('#ddzResultBody'),
  ddzYou: $('#ddzResultYou'),
  ddzAgain: $('#ddzResultAgain'),
  ddzLobby: $('#ddzResultLobby'),
};

/** 结算表头像：0 用玩家形象（立绘顶部裁切），1/2 用清晰肖像 */
const DDZ_AVATARS = SEAT_PORTRAITS.slice();
let ddzSettleShown = false;
let opsDisabledGames = new Set();
let opsDisabledCharacters = new Set();
let opsPlayerFrozen = null;
const chainCenterController = createChainCenterController({
  getAppState: () => appState,
  getProfile,
  getSeasonPoints: getUsdt,
  fetchChainAssets,
  saveState,
  setStatus: (text) => {
    if (nodes.claimStatus) nodes.claimStatus.textContent = text;
  },
  format,
  formatCrypto,
  escapeHtml,
});

queueMicrotask(() => { boot(); });

async function boot() {
  try {
    if (!nodes.claimButton || !nodes.tableView) {
      console.error('[TeaParlor] DOM 未就绪', {
        claim: !!nodes.claimButton,
        table: !!nodes.tableView,
      });
      // 尽量仍绑定大厅，避免整页不可用
    }
    // 启动时确保 multi 桌不挡大厅
    forceCloseMultiView();
    migrateLegacyState();
    applyDeviceAdapt();
    getWardrobeState();
    applyProfileToRuntime();
    bindUi();
    bindProfileUi();
    bindWardrobeUi();
    bindAppearanceSync();
    chainCenterController.bindChainCenterUi();
    bindDragSelect();
    bindDdzVariantTabs();
    bindP0Lobby();
    renderDdzRooms(ddzVariant);
    initTelegramMiniApp();
    try { initHandFit(); } catch (e) { console.warn('[hand-fit]', e); }
    try { initTableOrientation(); } catch (e) { console.warn('[table-orient]', e); }
    try { initTexas(); } catch (e) { console.warn('[TeaParlor] initTexas', e); }
    renderAccount();
    try {
      if (typeof telegramLoginPromise !== 'undefined' && telegramLoginPromise) {
        await telegramLoginPromise;
      }
      await syncDailySupplyFromServer();
      renderAccount();
    } catch (_) { /* non-TG / offline lobby */ }
    renderProfileUi();
    renderAvatarMounts();
    updatePinusModeLabel();
    initAdPlacements({ search: window.location.search });
    try { await syncOpsCatalog(); } catch (e) { console.warn('[TeaParlor] ops catalog', e); }
    try { await syncOpsPlayer(); } catch (e) { console.warn('[TeaParlor] ops player', e); }
    window.__teaParlor = {
      state: () => ({ appState, game, selected: [...selected], trustee, activeGame, texasBuyIn, playMode }),
      start: startRoom,
      startTexas,
      startGuanDan,
      startZhajinhua,
      startMahjong,
      startBlackjack,
      leaveMulti: leaveMultiTable,
      lobby: setLobbyView,
      brand: ACTIVE_BRAND,
      setPlayMode: (m) => {
        playMode = savePlayMode(m);
        updatePinusModeLabel();
      },
    };
    console.log('[TeaParlor] 全玩法已就绪 · 品牌', ACTIVE_BRAND.name, '· 模式', playMode);
  } catch (e) {
    console.error('[TeaParlor] boot failed', e);
    if (nodes.claimStatus) nodes.claimStatus.textContent = `启动异常：${e?.message || e}`;
  }
}

async function syncOpsCatalog() {
  return syncOpsCatalogFeature({
    setDisabledGames: (next) => { opsDisabledGames = next; },
    setDisabledCharacters: (next) => { opsDisabledCharacters = next; },
    setEnabledThemes,
    applyOpsCatalogToLobby,
    renderProfileUi,
  });
}

function applyOpsCatalogToLobby() {
  const profile = typeof getProfile === 'function' ? getProfile() : null;
  if (profile && opsDisabledCharacters.has(resolveCharId(profile.avatarId))) {
    const fallback = CHAR_OPTIONS.find((char) => !opsDisabledCharacters.has(char.id));
    if (fallback) {
      profile.avatarId = fallback.id;
      profile.costumeId = 'default';
      applyProfileToRuntime();
    }
  }
  document.querySelectorAll('[data-side-game]').forEach((node) => {
    const id = node.getAttribute('data-side-game');
    const offline = opsDisabledGames.has(id);
    node.classList.toggle('is-offline', offline);
    node.toggleAttribute('hidden', offline);
    if (offline) node.setAttribute('aria-disabled', 'true');
    else node.removeAttribute('aria-disabled');
  });
  document.querySelectorAll('[data-room-game]').forEach((node) => {
    node.classList.toggle('is-offline', opsDisabledGames.has(node.getAttribute('data-room-game')));
  });
}

async function syncOpsPlayer() {
  const playerId = String(getProfile()?.playerId || '830126');
  opsPlayerFrozen = await syncOpsPlayerStatus({ playerId });
}

function isGameOnline(gameId) {
  return !opsDisabledGames.has(gameId);
}

function assertCanEnter(gameId) {
  if (!isGameOnline(gameId)) {
    if (nodes.claimStatus) nodes.claimStatus.textContent = '该玩法已下线';
    return false;
  }
  if (opsPlayerFrozen?.frozen) {
    if (nodes.claimStatus) nodes.claimStatus.textContent = `账号已冻结：${opsPlayerFrozen.reason || '请联系客服'}`;
    return false;
  }
  return true;
}

function updatePinusModeLabel() {
  const el = document.getElementById('pinusModeLabel');
  if (el) el.textContent = playModeLabel(playMode);
}

function togglePlayMode() {
  playMode = savePlayMode(nextPlayMode(playMode));
  updatePinusModeLabel();
  if (nodes.claimStatus) {
    nodes.claimStatus.textContent = playModeHint(playMode);
  }
}

/** 当前联网后端客户端（与 pinus 协议同构的 ddz* 方法） */
function getOnlineNet() {
  if (onlineBackend === 'colyseus' || playMode === 'colyseus') return colyseusClient;
  return pinusClient;
}

function migrateLegacyState() {
  // 兼容旧 key
  if (!localStorage.getItem(STORAGE_KEY)) {
    try {
      const old = localStorage.getItem('tea-parlor-h5-jj-v3');
      if (old) {
        const parsed = JSON.parse(old);
        appState = {
          ...loadStateDefaults(),
          ...parsed,
          profile: { ...DEFAULT_PROFILE, ...(parsed.profile || {}) },
          records: Array.isArray(parsed.records) ? parsed.records : [],
        };
        refreshClaims();
        saveState();
      }
    } catch (_) {}
  }
}

function loadStateDefaults() {
  return {
    ingots: 128600,
    usdt: 100, // 链游 / 赛季积分演示账本
    claims: { date: todayKey(), count: 0 },
    records: [],
    profile: { ...DEFAULT_PROFILE },
    avatarWardrobe: createDefaultWardrobeState(),
    chainCenter: normalizeChainCenterState(),
  };
}

/** 发放赛季积分账本余额（链游测试场统一用此余额） */
function getUsdt() {
  if (typeof appState.usdt !== 'number' || Number.isNaN(appState.usdt)) {
    appState.usdt = 100;
  }
  return appState.usdt;
}

/** @deprecated 兼容旧调用：链游余额 = 赛季积分 */
function getCrypto() {
  return getUsdt();
}

function setUsdtBalance(v) {
  appState.usdt = Math.max(0, Math.round((Number(v) || 0) * 100) / 100);
  return appState.usdt;
}

function adjustUsdt(delta) {
  return setUsdtBalance(getUsdt() + (Number(delta) || 0));
}

function formatCrypto(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * 生成本地测试编号（每人固定 · 不连接外部网络）
 * 测试网 A / B / C 仅用于展示不同测试编号。
 */
function getUsdtDepositAddress(network) {
  const p = getProfile();
  const net = network || p.usdtNetwork || '测试网A';
  const seed = `${p.playerId || '830126'}-tea-parlor-usdt-${net}`;
  const h = hashStr(seed).toString(16).padStart(8, '0');
  const h2 = hashStr(seed + '-b').toString(16).padStart(8, '0');
  if (net === '测试网A') {
    return `TP-A-${h}-${h2}`.toUpperCase();
  }
  const suffix = net.includes('B') ? 'B' : 'C';
  return `TP-${suffix}-${h}-${h2}`.toUpperCase();
}

function getUsdtMemo() {
  const p = getProfile();
  return `TP${p.playerId || '830126'}`;
}

function ensureUsdtAddress() {
  const p = getProfile();
  const net = p.usdtNetwork || '测试网A';
  p.usdtNetwork = net;
  p.payAddress = getUsdtDepositAddress(net);
  return p.payAddress;
}

function currencyLabel(currency) {
  return currency === 'crypto' ? CRYPTO_SYMBOL : '金币';
}

function getProfile() {
  if (!appState.profile) appState.profile = { ...DEFAULT_PROFILE };
  return appState.profile;
}

function resolveCharId(id) {
  if (!id) return DEFAULT_PROFILE.avatarId;
  if (id === 'custom') return 'custom';
  if (LEGACY_AVATAR_MAP[id]) return LEGACY_AVATAR_MAP[id];
  if (CHAR_OPTIONS.some((c) => c.id === id)) return id;
  return DEFAULT_PROFILE.avatarId;
}

function getCharOption(charId = getProfile().avatarId) {
  const id = resolveCharId(charId);
  if (id === 'custom') {
    const p = getProfile();
    return {
      id: 'custom',
      label: p.customAvatarLabel || '我的形象',
      kind: 'custom',
      group: '自定义',
      base: p.customAvatarSrc || CHAR_OPTIONS[0].base,
      costumes: { default: p.customAvatarSrc || CHAR_OPTIONS[0].base },
    };
  }
  return CHAR_OPTIONS.find((c) => c.id === id) || CHAR_OPTIONS[0];
}

function getAvatarSrc(avatarId = getProfile().avatarId, costumeId = getProfile().costumeId) {
  const id = resolveCharId(avatarId);
  if (id === 'custom') {
    const p = getProfile();
    return p.customAvatarSrc || CHAR_OPTIONS[0].base;
  }
  const ch = getCharOption(id);
  const cos = costumeId || 'default';
  if (isClothingStyleCostume(cos)) {
    const resolved = resolveClothingStyle(cos, ch);
    if (resolved.ok && resolved.mode === 'outfit' && ch.costumes?.[resolved.costumeId]) {
      return ch.costumes[resolved.costumeId];
    }
  }
  // 染色 / 自定义色：绝不换人，始终用当前形象默认立绘（或最近一套本人物换装）
  if (isDyeCostume(cos) || cos === 'custom') {
    // 若用户先选了本人物换装再染色，尽量保留该衣服底图
    const p = getProfile();
    const lastOutfit = p._lastOutfitId;
    if (lastOutfit && ch.costumes?.[lastOutfit]) return ch.costumes[lastOutfit];
    return ch.costumes?.default || ch.base;
  }
  // 换装：只允许本人物 costumes 内的图
  if (ch.costumes && ch.costumes[cos]) return ch.costumes[cos];
  return ch.costumes?.default || ch.base;
}

/** 座位形象：0=自己，其余对手默认 */
function getSeatCharacterSrc(seatIndex) {
  if (seatIndex === 0) return getAvatarSrc();
  const mine = resolveCharId(getProfile().avatarId);
  const pool = FEATURED_CHAR_IDS.filter((id) => id !== mine);
  const id = pool[(seatIndex - 1) % pool.length] || SEAT_DEFAULT_CHARS[seatIndex] || CHAR_OPTIONS[seatIndex % CHAR_OPTIONS.length].id;
  return getAvatarSrc(id, 'default');
}

/** 地主形象：男→经典地主（大叔）；女→地主婆（旗袍） */
const LANDLORD_FIGURE_SRC = {
  male: charUrl('./public/characters/tea-shushu.png'),
  female: charUrl('./public/characters/tea-qipao.png'),
};

/** 座位角色性别：female | male（动物等归为 male 用经典地主形象） */
function getSeatCharKind(seatIndex) {
  let charId;
  if (seatIndex === 0) {
    charId = resolveCharId(getProfile().avatarId);
    if (charId === 'custom') {
      // 自定义图无法判性别：按当前默认形象库偏好，默认男
      charId = DEFAULT_PROFILE.avatarId || 'male_hero';
    }
  } else {
    charId = SEAT_DEFAULT_CHARS[seatIndex] || 'male_hero';
  }
  const kind = getCharOption(charId).kind || 'male';
  return kind === 'female' ? 'female' : 'male';
}

function getLandlordLabel(seatIndex) {
  return getSeatCharKind(seatIndex) === 'female' ? '地主婆' : '地主';
}

function getLandlordFigureSrc(seatIndex) {
  return getSeatCharKind(seatIndex) === 'female'
    ? LANDLORD_FIGURE_SRC.female
    : LANDLORD_FIGURE_SRC.male;
}

/**
 * 斗地主：明确地主身份
 * - 角标显示「地主 / 地主婆」
 * - 地主位切换为经典地主/地主婆立绘
 * - 座位容器加 is-landlord-seat 高亮
 */
function applyDdzLandlordVisuals() {
  if (!game || !nodes.tableView || nodes.tableView.hidden) return;
  for (let i = 0; i < 3; i++) {
    const isLd = game.landlord >= 0 && game.landlord === i;
    const gender = getSeatCharKind(i);
    const panels = document.querySelectorAll(`#tableView [data-char="${i}"]`);
    panels.forEach((panel) => {
      panel.classList.toggle('is-landlord-seat', isLd);
      panel.classList.toggle('is-landlord-female', isLd && gender === 'female');
      panel.classList.toggle('is-landlord-male', isLd && gender === 'male');
    });
    document.querySelectorAll(`#tableView [data-char="${i}"] .char-figure`).forEach((img) => {
      if (img.tagName !== 'IMG') return;
      if (isLd) {
        const src = getLandlordFigureSrc(i);
        if (img.getAttribute('src') !== src) {
          img.src = src;
        }
        img.dataset.kind = gender;
        img.alt = getLandlordLabel(i);
        // 地主立绘不再叠个人服装滤镜，避免「不像地主」
        img.style.filter = 'drop-shadow(0 10px 14px rgba(0,0,0,0.35))';
        img.classList.add('is-landlord-figure');
        const wrap = img.closest('.char-figure-wrap');
        if (wrap) clearGearOverlays(wrap);
      } else {
        img.classList.remove('is-landlord-figure');
        const base = getSeatCharacterSrc(i);
        if (img.getAttribute('src') !== base) img.src = base;
        img.alt = i === 0 ? NAMES[0] : (NAMES[i] || `茶友${i}`);
        applyFigureSkin(img, i === 0);
      }
    });
  }
}

function getClothingStyleById(styleId) {
  return listClothingStyles().find((item) => item.id === styleId) || null;
}

function getCostume(costumeId = getProfile().costumeId) {
  const style = getClothingStyleById(costumeId);
  if (style) {
    return { id: style.id, label: style.name, color: style.dyeColor, kind: 'style', exclusive: false, filter: '' };
  }
  return COSTUME_OPTIONS.find((c) => c.id === costumeId) || COSTUME_OPTIONS[0];
}

/** 当前形象是否有某件衣服的专属立绘图（真正换装，不含 default） */
function hasExclusiveCostume(charId, costumeId) {
  if (!costumeId || costumeId === 'default') return false;
  const ch = getCharOption(charId);
  return !!(ch.costumes && ch.costumes[costumeId]);
}

function isDyeCostume(costumeId) {
  if (DYE_OPTIONS.some((d) => d.id === costumeId)) return true;
  return Boolean(getClothingStyleById(costumeId)?.dyeColor);
}

function isClothingStyleCostume(costumeId) {
  return Boolean(getClothingStyleById(costumeId));
}

/** 换装 id：非染色；图必须来自本人物 costumes */
function isOutfitCostume(costumeId) {
  if (!costumeId || isDyeCostume(costumeId) || isClothingStyleCostume(costumeId)) return false;
  return true;
}

/**
 * 衣服列表：
 * - 换装：仅本人物 costumes 里的衣服图（同一张脸）
 * - 染色：目标衣服色；预览用 canvas 只染衣服（不改肤色）
 */
function listCostumesForChar(charId = getProfile().avatarId) {
  const ch = getCharOption(charId);
  const baseImg = ch.costumes?.default || ch.base;
  const outfitIds = Object.keys(ch.costumes || { default: true });
  const outfits = outfitIds.map((oid) => {
    const meta = OUTFIT_META[oid] || { label: oid === 'default' ? '默认衣服' : oid, color: '#c9a227' };
    return {
      id: oid,
      label: meta.label,
      color: meta.color,
      kind: 'outfit',
      exclusive: oid !== 'default',
      filter: '',
      hasExclusiveImg: true,
      thumb: ch.costumes[oid] || baseImg,
      kindLabel: oid === 'default' ? '默认' : '换装',
    };
  });

  // 衣服样式：大厅皮肤互配 + 额外时装；有专属换装图则换装，否则染色
  const styles = listClothingStyles()
    .filter((item) => item.gender === 'unisex' || item.gender === ch.kind)
    .map((item) => {
      const resolved = resolveClothingStyle(item, ch);
      const thumb = resolved.mode === 'outfit' && ch.costumes?.[resolved.costumeId]
        ? ch.costumes[resolved.costumeId]
        : baseImg;
      return {
        id: item.id,
        label: item.name,
        color: item.dyeColor,
        kind: 'style',
        exclusive: resolved.mode === 'outfit',
        filter: '',
        hasExclusiveImg: resolved.mode === 'outfit',
        thumb,
        kindLabel: '样式',
        themeId: item.themeId || null,
      };
    });

  // 染色：预览用本人物 default 缩略图（真正染色时不切换 src）
  const dyes = DYE_OPTIONS.map((d) => ({
    ...d,
    exclusive: false,
    hasExclusiveImg: true,
    thumb: baseImg,
    kindLabel: d.id === 'custom' ? '自定义' : '染色',
  }));

  return [...outfits, ...styles, ...dyes];
}

/**
 * 已废弃整图 CSS 滤镜染色（会改肤色）。
 * 保留函数以免旧调用报错；始终返回空。
 */
function getCostumeFilter(_costumeId = getProfile().costumeId) {
  return '';
}

/** 染色目标色：衣服色，不是肤色 */
function getDyeTargetColor(costumeId = getProfile().costumeId) {
  const p = getProfile();
  const id = costumeId || p.costumeId || 'default';
  if (id === 'custom') return p.customSkinColor || '#c084fc';
  const style = getClothingStyleById(id);
  if (style?.dyeColor) return style.dyeColor;
  const d = DYE_OPTIONS.find((x) => x.id === id);
  return d?.color || '#7ec8ff';
}

/**
 * 当前展示用立绘：染色时 canvas 只染衣服，肤色/头发保持原样。
 * @returns {Promise<string>}
 */
async function getDisplayAvatarSrc(avatarId = getProfile().avatarId, costumeId = getProfile().costumeId) {
  const base = getAvatarSrc(avatarId, costumeId);
  if (!isDyeCostume(costumeId)) return base;
  const color = getDyeTargetColor(costumeId);
  try {
    return await dyeClothesSrc(base, color, {
      cacheKey: `${base}|${costumeId}|${color}`,
      strength: 0.9,
    });
  } catch (err) {
    console.warn('[dye] cloth dye failed, fallback base', err);
    return base;
  }
}

/** 给 <img> 套衣服染色（异步）；非染色则还原底图 */
function applyClothDyeToImg(img, isSelf) {
  if (!img || img.tagName !== 'IMG' || !isSelf) {
    if (img) img.style.filter = 'none';
    return;
  }
  img.style.filter = 'none';
  const p = getProfile();
  const base = getAvatarSrc(p.avatarId, p.costumeId);
  const token = `${p.avatarId}|${p.costumeId}|${getDyeTargetColor(p.costumeId)}`;
  img.dataset.dyeToken = token;
  if (!isDyeCostume(p.costumeId)) {
    if (img.getAttribute('src') !== base) img.src = base;
    delete img.dataset.dyed;
    return;
  }
  // 先显示底图，再换成只染衣服的结果（肤色保持）
  if (img.getAttribute('src') !== base && img.dataset.dyed !== '1') {
    img.src = base;
  } else if (img.dataset.dyed !== '1') {
    img.src = base;
  }
  getDisplayAvatarSrc(p.avatarId, p.costumeId).then((dyed) => {
    if (img.dataset.dyeToken !== token) return; // 已切换其它装扮
    img.src = dyed;
    img.dataset.dyed = '1';
  });
}

function applyProfileToRuntime() {
  const p = getProfile();
  p.avatarId = resolveCharId(p.avatarId);
  NAMES[0] = p.name || DEFAULT_PROFILE.name;
  // 结算 / 牌桌：自己跟装扮；对手用默认角色立绘
  DDZ_AVATARS[0] = getAvatarSrc(p.avatarId, p.costumeId);
  DDZ_AVATARS[1] = getSeatCharacterSrc(1);
  DDZ_AVATARS[2] = getSeatCharacterSrc(2);
  // 供 texas / blackjack / 掼蛋等结算弹窗统一取头像
  setResultAvatarResolver((seat) => {
    if (seat === 0) return getAvatarSrc();
    return getSeatCharacterSrc(seat);
  });
  // 染色完成后再把结算头像换成「只染衣服」图
  if (isDyeCostume(p.costumeId)) {
    getDisplayAvatarSrc(p.avatarId, p.costumeId).then((dyed) => {
      if (getProfile().costumeId !== p.costumeId) return;
      DDZ_AVATARS[0] = dyed;
      setResultAvatarResolver((seat) => {
        if (seat === 0) return dyed;
        return getSeatCharacterSrc(seat);
      });
    });
  }
  if (nodes.playerName) nodes.playerName.textContent = NAMES[0];
  const meta = document.getElementById('playerMeta');
  const metaText = `ID ${p.playerId || '830126'} · Lv.${p.level || 12}`;
  if (meta) meta.textContent = metaText;
  const homePlayerName = document.getElementById('homePlayerName');
  if (homePlayerName) homePlayerName.textContent = NAMES[0];
  const homePlayerMeta = document.querySelector('.home-player-copy small');
  if (homePlayerMeta) homePlayerMeta.textContent = metaText;
  updateTopAvatar();
  updateAllTableCharacters();
  renderAvatarMounts();
  applyCostumeTheme(p.costumeId);
  syncCharacterOverlays();
  applySavedCosmeticsToRuntime();
}

function applySavedCosmeticsToRuntime() {
  const equipment = getSavedAvatar().equipment || DEFAULT_EQUIPMENT;
  const root = document.documentElement;
  const body = document.body;
  const cardBack = equipment.card_back || DEFAULT_EQUIPMENT.card_back;
  const avatarFrame = equipment.avatar_frame || DEFAULT_EQUIPMENT.avatar_frame;
  const tableSkin = equipment.table_skin || DEFAULT_EQUIPMENT.table_skin;
  root.dataset.cardBack = cardBack;
  root.dataset.avatarFrame = avatarFrame;
  root.dataset.tableSkinItem = tableSkin;
  if (body) {
    body.dataset.cardBack = cardBack;
    body.dataset.avatarFrame = avatarFrame;
    body.dataset.tableSkinItem = tableSkin;
  }
  document.querySelectorAll('#topAvatar, [data-char="0"] .char-figure-wrap, .char-figure-wrap[data-char="0"], [data-texas-seat="0"] .char-figure-wrap, [data-mg-seat="0"] .char-figure-wrap')
    .forEach((el) => {
      el.dataset.avatarFrame = avatarFrame;
      el.dataset.cobrandedFrame = findAvatarItem(avatarFrame)?.coBranded ? 'true' : 'false';
    });
}

function updateTopAvatar() {
  const el = document.getElementById('topAvatar');
  if (!el) return;
  const src = getAvatarSrc();
  if (!src) {
    el.textContent = (NAMES[0] || '茶').slice(0, 1);
    el.classList.remove('has-avatar', 'is-fullbody-avatar', 'is-head-avatar');
    return;
  }
  // 用 <img> 显示头像，避免 background 被主题 CSS 盖掉
  let img = el.querySelector('img.top-avatar-img');
  if (!img) {
    el.textContent = '';
    img = document.createElement('img');
    img.className = 'top-avatar-img';
    img.alt = NAMES[0] || '头像';
    img.decoding = 'async';
    el.appendChild(img);
  }
  // 顶栏只做头像，不套立绘动作/滤镜 class
  img.className = 'top-avatar-img';
  img.alt = NAMES[0] || '头像';
  if (img.getAttribute('src') !== src) img.src = src;
  img.style.filter = 'none';
  applyClothDyeToImg(img, true);
  img.onerror = () => {
    el.classList.remove('has-avatar', 'is-fullbody-avatar', 'is-head-avatar');
    el.textContent = (NAMES[0] || '茶').slice(0, 1);
  };
  img.onload = () => {
    el.classList.add('has-avatar');
    // 同步背景（染色完成后 src 可能变成 dataURL）
    const show = img.getAttribute('src') || src;
    el.style.setProperty('background-image', `url("${show}")`, 'important');
  };
  const full = /\.png/i.test(src) || /characters\//i.test(src) || src.startsWith('data:');
  // 全身立绘：圆内完整显示人物（contain，不裁成大头）
  el.classList.toggle('is-fullbody-avatar', full);
  el.classList.remove('is-head-avatar');
  el.classList.add('has-avatar', 'is-full-figure-avatar');
  el.style.setProperty('background-image', `url("${src}")`, 'important');
  el.style.setProperty('background-repeat', 'no-repeat', 'important');
  el.style.setProperty('background-size', full ? 'contain' : 'cover', 'important');
  el.style.setProperty('background-position', 'center bottom', 'important');
  const heroFrame = document.getElementById('homeHeroAvatar');
  if (heroFrame) {
    heroFrame.style.backgroundImage = `url("${src}")`;
    heroFrame.style.backgroundSize = 'contain';
    heroFrame.style.backgroundPosition = 'center bottom';
    heroFrame.style.backgroundRepeat = 'no-repeat';
  }
}

function getAppearanceAvatar(overrides = {}) {
  const wardrobe = getWardrobeState();
  const profile = getProfile();
  const saved = wardrobe.savedAvatar || initializeDefaultAvatar({ baseAvatarId: profile.avatarId });
  return {
    ...saved,
    baseAvatarId: profile.avatarId,
    ...overrides,
  };
}

function syncCharacterOverlays(avatar = getAppearanceAvatar()) {
  const hosts = document.querySelectorAll(
    '[data-char="0"] .char-figure-wrap, [data-texas-seat="0"] .char-figure-wrap, [data-mg-seat="0"] .char-figure-wrap, .profile-preview-figure, #topAvatar',
  );
  hosts.forEach((host) => {
    mountGearOverlays(host, avatar);
    host.dataset.avatarFrame = avatar.equipment?.avatar_frame || DEFAULT_EQUIPMENT.avatar_frame;
    host.dataset.cobrandedFrame = findAvatarItem(avatar.equipment?.avatar_frame)?.coBranded ? 'true' : 'false';
  });
}

function renderAvatarMounts() {
  const avatar = getAppearanceAvatar();
  const preview = document.getElementById('profileAvatarRenderer');
  if (preview) {
    mountAvatarRenderer(preview, {
      avatar,
      baseSrc: getAvatarSrc(),
      size: 'profile',
      label: `${NAMES[0] || '玩家'}装扮`,
    });
  }
  const tableMount = document.getElementById('tableSelfAvatarRenderer');
  if (tableMount) {
    tableMount.hidden = true;
    tableMount.innerHTML = '';
  }
  syncCharacterOverlays(avatar);
}

function openWardrobe() {
  const profile = getProfile();
  const saved = getSavedAvatar();
  wardrobeSavedSnapshot = {
    avatarId: resolveCharId(profile.avatarId),
    costumeId: profile.costumeId || 'default',
    lastOutfitId: profile._lastOutfitId || 'default',
    equipment: cancelPreview(saved.equipment),
  };
  wardrobePreviewAvatar = {
    ...saved,
    baseAvatarId: wardrobeSavedSnapshot.avatarId,
    equipment: cancelPreview(saved.equipment),
    costumeId: wardrobeSavedSnapshot.costumeId,
    lastOutfitId: wardrobeSavedSnapshot.lastOutfitId,
  };
  renderWardrobe();
}

function renderWardrobe() {
  if (!wardrobePreviewAvatar) openWardrobe();
  const preview = wardrobePreviewAvatar;
  const charId = resolveCharId(preview.baseAvatarId || getProfile().avatarId);
  const costumeId = preview.costumeId || 'default';
  const previewSrc = getAvatarSrc(charId, costumeId);
  const mount = document.getElementById('wardrobeAvatarPreview');
  mountAvatarRenderer(mount, {
    avatar: preview,
    baseSrc: previewSrc,
    size: 'large',
    label: '衣橱预览',
  });
  const img = mount?.querySelector('.avatar-layer-base');
  if (img) {
    img.src = previewSrc;
    applyClothDyeToImgFor(img, charId, costumeId);
  }
  const legacy = document.getElementById('profilePreviewImg');
  if (legacy) {
    legacy.hidden = true;
    legacy.setAttribute('hidden', '');
    legacy.style.setProperty('display', 'none', 'important');
    legacy.removeAttribute('src');
  }
  const ch = getCharOption(charId);
  const title = document.getElementById('wardrobePreviewTitle');
  if (title) title.textContent = ch.label;
  const costumeTag = document.getElementById('profileCostumeTag');
  if (costumeTag) costumeTag.textContent = ch.label;
  const meta = document.getElementById('wardrobePreviewMeta');
  if (meta) {
    const costume = getCostume(costumeId);
    const overlayCount = (preview.equipment && ACTIVE_EQUIPMENT_SLOTS.filter((slot) => preview.equipment[slot]).length) || 0;
    const skinCount = ['table_skin', 'card_back', 'avatar_frame'].filter((slot) => preview.equipment?.[slot]).length;
    meta.textContent = `${costume.label} · ${overlayCount} 件配饰 · ${skinCount} 件皮肤 · 点选即可预览`;
  }
  renderWardrobeCosmeticPreview(preview);
  renderWardrobeTabs();
  renderWardrobeGrid();
}

function renderWardrobeCosmeticPreview(preview = wardrobePreviewAvatar) {
  const equipment = preview?.equipment || DEFAULT_EQUIPMENT;
  const table = findAvatarItem(equipment.table_skin);
  const cardBack = findAvatarItem(equipment.card_back);
  const frame = findAvatarItem(equipment.avatar_frame);
  const previewFigure = document.getElementById('profilePreviewAvatar');
  if (previewFigure) {
    previewFigure.dataset.avatarFrame = frame?.id || '';
    previewFigure.dataset.cobrandedFrame = frame?.coBranded ? 'true' : 'false';
  }
  setCosmeticChip('wardrobeTablePreview', '桌布', table);
  setCosmeticChip('wardrobeCardBackPreview', '牌背', cardBack);
  setCosmeticChip('wardrobeFramePreview', '头像框', frame);
}

function setCosmeticChip(id, label, item) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = `${label}：${item?.name || '默认'}`;
  el.dataset.rarity = item?.rarity || 'common';
  el.dataset.cobranded = item?.coBranded ? 'true' : 'false';
}

function findAvatarItem(itemId) {
  return AVATAR_ITEMS.find((item) => item.id === itemId) || null;
}

function renderWardrobeDetail(item, fallbackTitle = '皮肤详情') {
  const panel = document.getElementById('wardrobeDetailPanel');
  if (!panel) return;
  if (!item) {
    panel.innerHTML = `
      <span class="wardrobe-detail-kicker">${escapeHtml(fallbackTitle)}</span>
      <strong>基础衣橱</strong>
      <p>选择桌布、牌背或头像框查看来源与联名信息。</p>
    `;
    return;
  }
  const themeMeta = item.themeId ? getThemeMeta(item.themeId) : null;
  const category = skinCategoryLabel(item.skinCategory || themeMeta?.category || 'normal');
  const source = item.source || themeMeta?.source || '内部配置';
  panel.innerHTML = `
    <span class="wardrobe-detail-kicker">${escapeHtml(slotSkinLabel(item.category) || fallbackTitle)}</span>
    <strong>${escapeHtml(item.name)}</strong>
    <p>${escapeHtml(category)} · ${escapeHtml(rarityLabel(item.rarity))} · 来源：${escapeHtml(source)}</p>
    <div class="wardrobe-detail-tags">
      <span>${item.limited ? '限时' : '常驻'}</span>
      <span>${item.coBranded ? '广告联名' : '非联名'}</span>
      ${item.coBranded ? `<span class="wardrobe-ad-logo">${escapeHtml(item.adLogoId || 'Brand')}</span>` : ''}
    </div>
  `;
}

function applyClothDyeToImgFor(img, avatarId, costumeId) {
  if (!img) return;
  img.style.filter = 'none';
  const base = getAvatarSrc(avatarId, costumeId);
  const color = getDyeTargetColor(costumeId);
  const token = `${avatarId}|${costumeId}|${color}`;
  img.dataset.dyeToken = token;
  if (!isDyeCostume(costumeId)) {
    if (img.getAttribute('src') !== base) img.src = base;
    return;
  }
  if (img.getAttribute('src') !== base) img.src = base;
  getDisplayAvatarSrc(avatarId, costumeId).then((dyed) => {
    if (img.dataset.dyeToken !== token) return;
    img.src = dyed;
  });
}

function renderWardrobeTabs() {
  const tabs = document.getElementById('wardrobeTabs');
  if (!tabs) return;
  tabs.innerHTML = WARDROBE_TABS.map((tab) => `
    <button type="button" class="wardrobe-tab ${tab.id === wardrobeTab ? 'active' : ''}" data-wardrobe-tab="${tab.id}" role="tab" aria-selected="${tab.id === wardrobeTab ? 'true' : 'false'}">
      ${escapeHtml(tab.label)}
    </button>
  `).join('');
}

function renderWardrobeGrid() {
  const grid = document.getElementById('wardrobeGrid');
  if (!grid) return;
  const wardrobe = getWardrobeState();
  const inventory = new Set(wardrobe.inventory);
  const preview = wardrobePreviewAvatar || wardrobe.savedAvatar;
  const equipment = preview.equipment || DEFAULT_EQUIPMENT;
  const charId = resolveCharId(preview.baseAvatarId || getProfile().avatarId);
  const costumeId = preview.costumeId || getProfile().costumeId;
  const ch = getCharOption(charId);

  if (wardrobeTab === 'characters') {
    const groups = ['女性', '男性', '动物'];
    const featured = new Set(FEATURED_CHAR_IDS);
    grid.classList.add('wardrobe-grid-chars');
    grid.innerHTML = groups.map((group) => {
      const list = CHAR_OPTIONS.filter((c) => c.group === group && featured.has(c.id) && !opsDisabledCharacters.has(c.id));
      if (!list.length) return '';
      return `<div class="wardrobe-char-group"><p class="costume-block-title">${group}</p><div class="wardrobe-char-row">${list.map((a) => `
        <button type="button" class="wardrobe-item wardrobe-char ${charId === a.id ? 'active' : ''}" data-wardrobe-char="${escapeHtml(a.id)}" role="option" aria-selected="${charId === a.id ? 'true' : 'false'}">
          <img src="${escapeHtml(a.base)}" alt="" loading="lazy" decoding="async" />
          <strong>${escapeHtml(a.label)}</strong>
          <span>Q 版立绘</span>
        </button>`).join('')}</div></div>`;
    }).join('');
    return;
  }

  grid.classList.remove('wardrobe-grid-chars');

  if (wardrobeTab === 'clothes') {
    const outfits = listCostumesForChar(charId).filter((c) => c.kindLabel === '默认' || c.kindLabel === '换装');
    grid.innerHTML = outfits.map((c) => `
      <button type="button" class="wardrobe-item ${costumeId === c.id ? 'active' : ''}" data-wardrobe-costume="${escapeHtml(c.id)}" role="option" aria-selected="${costumeId === c.id ? 'true' : 'false'}">
        <img src="${escapeHtml(c.thumb)}" alt="" loading="lazy" decoding="async" />
        <strong>${escapeHtml(c.label)}</strong>
        <span>${escapeHtml(c.kindLabel)}</span>
      </button>
    `).join('');
    return;
  }

  if (wardrobeTab === 'styles') {
    const styles = listCostumesForChar(charId).filter((c) => c.kindLabel === '样式');
    grid.innerHTML = styles.map((c) => `
      <button type="button" class="wardrobe-item ${costumeId === c.id || equipment.full_body === c.id ? 'active' : ''}" data-wardrobe-style="${escapeHtml(c.id)}" role="option" aria-selected="${costumeId === c.id ? 'true' : 'false'}">
        <img src="${escapeHtml(c.thumb)}" alt="" loading="lazy" decoding="async" />
        <strong>${escapeHtml(c.label)}</strong>
        <span>${c.themeId ? '皮肤互配' : '时装'}</span>
      </button>
    `).join('');
    return;
  }

  if (wardrobeTab === 'dyes') {
    const dyes = listCostumesForChar(charId).filter((c) => c.kindLabel === '染色' || c.kindLabel === '自定义');
    grid.innerHTML = dyes.map((c) => `
      <button type="button" class="wardrobe-item ${costumeId === c.id ? 'active' : ''}" data-wardrobe-costume="${escapeHtml(c.id)}" role="option" aria-selected="${costumeId === c.id ? 'true' : 'false'}">
        <span class="wardrobe-dye-chip" style="background:${escapeHtml(c.color)}"></span>
        <strong>${escapeHtml(c.label)}</strong>
        <span>只染衣服</span>
      </button>
    `).join('');
    return;
  }

  if (wardrobeTab === 'gear') {
    const items = listOverlayItems().filter((item) => item.gender === 'unisex' || item.gender === ch.kind);
    grid.innerHTML = `<button type="button" class="wardrobe-item wardrobe-empty ${!ACTIVE_EQUIPMENT_SLOTS.some((slot) => equipment[slot]) ? 'active' : ''}" data-wardrobe-clear-gear="1" role="option">卸下配饰</button>`
      + items.map((item) => {
        const owned = inventory.has(item.id);
        const active = equipment[item.category] === item.id;
        return `
          <button type="button" class="wardrobe-item ${active ? 'active' : ''}" data-wardrobe-item="${escapeHtml(item.id)}" ${owned ? '' : 'disabled'} role="option" aria-selected="${active ? 'true' : 'false'}">
            <img src="${escapeHtml(item.thumbnail)}" alt="" loading="lazy" decoding="async" />
            <strong>${escapeHtml(item.name)}</strong>
            <span>${owned ? overlaySlotLabel(item.category) : '未拥有'}</span>
          </button>
        `;
      }).join('');
    return;
  }

  if (wardrobeTab === 'skins') {
    renderWardrobeSkinGrid(grid, 'table_skin', equipment, inventory);
    return;
  }

  if (wardrobeTab === 'cardbacks') {
    renderWardrobeSkinGrid(grid, 'card_back', equipment, inventory);
    return;
  }

  if (wardrobeTab === 'frames') {
    renderWardrobeSkinGrid(grid, 'avatar_frame', equipment, inventory);
    return;
  }

  grid.innerHTML = AVATAR_OUTFITS.map((outfit) => {
    const owned = Object.values(outfit.items).every((itemId) => inventory.has(itemId));
    const active = Object.entries(outfit.items).every(([slot, itemId]) => equipment[slot] === itemId);
    return `
      <button type="button" class="wardrobe-item wardrobe-outfit ${active ? 'active' : ''}" data-wardrobe-outfit="${escapeHtml(outfit.id)}" ${owned ? '' : 'disabled'} role="option" aria-selected="${active ? 'true' : 'false'}">
        <img src="${escapeHtml(outfit.thumbnail)}" alt="" loading="lazy" decoding="async" />
        <strong>${escapeHtml(outfit.name)}</strong>
        <span>${owned ? `${outfit.pieceCount} 件套` : '未解锁'}</span>
      </button>
    `;
  }).join('');
}

function renderWardrobeSkinGrid(grid, slot, equipment, inventory) {
  const enabledThemeIds = new Set(listEnabledThemes().map((theme) => theme.id));
  const items = listSkinItems(AVATAR_ITEMS, slot).filter((item) => !item.themeId || enabledThemeIds.has(item.themeId));
  const activeItem = findAvatarItem(equipment[slot]) || items[0] || null;
  renderWardrobeDetail(activeItem, slotSkinLabel(slot));
  grid.innerHTML = items.map((item) => {
    const owned = inventory.has(item.id);
    const active = equipment[slot] === item.id;
    return `
      <button type="button" class="wardrobe-item wardrobe-skin-item ${active ? 'active' : ''}" data-wardrobe-skin-item="${escapeHtml(item.id)}" ${owned ? '' : 'disabled'} role="option" aria-selected="${active ? 'true' : 'false'}">
        <span class="wardrobe-skin-preview rarity-${escapeHtml(item.rarity)}" data-slot="${escapeHtml(slot)}">
          ${item.themeId ? `<i class="theme-swatch theme-swatch-${escapeHtml(item.themeId)}" aria-hidden="true"></i>` : `<img src="${escapeHtml(item.thumbnail)}" alt="" loading="lazy" decoding="async" />`}
          ${item.coBranded ? '<em class="wardrobe-cobrand-mark">LOGO</em>' : ''}
        </span>
        <strong>${escapeHtml(item.name)}</strong>
        <span>${owned ? skinCategoryLabel(item.skinCategory || 'normal') : '未解锁'}</span>
        <span class="wardrobe-badges">
          <em>${escapeHtml(rarityLabel(item.rarity))}</em>
          ${item.limited ? '<em>限时</em>' : ''}
          ${item.coBranded ? '<em>联名</em>' : ''}
        </span>
      </button>
    `;
  }).join('');
}

function overlaySlotLabel(slot) {
  return {
    headwear: '头饰',
    glasses: '眼镜',
    earrings: '耳饰',
    accessory: '配饰',
    necklace: '项链',
    watch: '腕表',
  }[slot] || '配饰';
}

function slotSkinLabel(slot) {
  return {
    table_skin: '桌布皮肤',
    card_back: '牌背皮肤',
    avatar_frame: '头像框',
  }[slot] || '皮肤';
}

function bindWardrobeUi() {
  document.getElementById('wardrobeTabs')?.addEventListener('click', (e) => {
    const btn = e.target instanceof Element ? e.target.closest('[data-wardrobe-tab]') : null;
    if (!btn) return;
    wardrobeTab = btn.getAttribute('data-wardrobe-tab') || 'clothes';
    renderWardrobe();
  });
  document.getElementById('wardrobeGrid')?.addEventListener('click', (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    const charBtn = t.closest('[data-wardrobe-char]');
    const costumeBtn = t.closest('[data-wardrobe-costume]');
    const styleBtn = t.closest('[data-wardrobe-style]');
    const itemBtn = t.closest('[data-wardrobe-item]');
    const outfitBtn = t.closest('[data-wardrobe-outfit]');
    const unequipBtn = t.closest('[data-wardrobe-unequip]');
    const clearGearBtn = t.closest('[data-wardrobe-clear-gear]');
    const skinBtn = t.closest('[data-wardrobe-skin]');
    const skinItemBtn = t.closest('[data-wardrobe-skin-item]');
    if (charBtn) applyWardrobeCharacter(charBtn.getAttribute('data-wardrobe-char'));
    else if (styleBtn) applyWardrobeClothingStyle(styleBtn.getAttribute('data-wardrobe-style'));
    else if (costumeBtn) applyWardrobeCostume(costumeBtn.getAttribute('data-wardrobe-costume'));
    else if (itemBtn) applyWardrobeItem(itemBtn.getAttribute('data-wardrobe-item'));
    else if (outfitBtn) applyWardrobeOutfit(outfitBtn.getAttribute('data-wardrobe-outfit'));
    else if (unequipBtn) unequipWardrobeSlot(unequipBtn.getAttribute('data-wardrobe-unequip'));
    else if (clearGearBtn) clearWardrobeGear();
    else if (skinItemBtn) applyWardrobeSkinItem(skinItemBtn.getAttribute('data-wardrobe-skin-item'));
    else if (skinBtn) applyWardrobeHallSkin(skinBtn.getAttribute('data-wardrobe-skin'));
  });
  document.getElementById('wardrobeSaveBtn')?.addEventListener('click', saveWardrobePreview);
  document.getElementById('wardrobeCancelBtn')?.addEventListener('click', () => {
    const snap = wardrobeSavedSnapshot || {
      avatarId: getProfile().avatarId,
      costumeId: getProfile().costumeId,
      lastOutfitId: getProfile()._lastOutfitId || 'default',
      equipment: cancelPreview(getSavedAvatar().equipment),
    };
    const profile = getProfile();
    profile.avatarId = snap.avatarId;
    profile.costumeId = snap.costumeId;
    profile._lastOutfitId = snap.lastOutfitId;
    wardrobePreviewAvatar = {
      ...getSavedAvatar(),
      baseAvatarId: snap.avatarId,
      costumeId: snap.costumeId,
      lastOutfitId: snap.lastOutfitId,
      equipment: snap.equipment,
    };
    applyProfileToRuntime();
    setWardrobeStatus('已取消预览更改');
    renderWardrobe();
  });
  document.getElementById('wardrobeResetBtn')?.addEventListener('click', () => {
    wardrobePreviewAvatar = {
      ...getSavedAvatar(),
      equipment: resetToDefault(),
      costumeId: 'default',
      lastOutfitId: 'default',
    };
    setWardrobeStatus('已恢复默认预览，保存后生效');
    renderWardrobe();
  });
}

function applyWardrobeItem(itemId) {
  if (!itemId || !wardrobePreviewAvatar) return;
  const result = equipItem(wardrobePreviewAvatar.equipment, itemId);
  if (!result.ok) return setWardrobeStatus('该物品暂不可装备');
  wardrobePreviewAvatar = { ...wardrobePreviewAvatar, equipment: result.equipment };
  livePreviewAppearance();
  setWardrobeStatus('配饰已叠到人物上，保存后同步牌桌');
  renderWardrobe();
}

function applyWardrobeSkinItem(itemId) {
  if (!itemId || !wardrobePreviewAvatar) return;
  const item = findAvatarItem(itemId);
  if (!item || !['table_skin', 'card_back', 'avatar_frame'].includes(item.category)) {
    setWardrobeStatus('该皮肤 ID 不存在，显示保持不变');
    renderWardrobeDetail(null);
    return;
  }
  const result = equipItem(wardrobePreviewAvatar.equipment, itemId);
  if (!result.ok) return setWardrobeStatus('该皮肤暂不可装备');
  wardrobePreviewAvatar = { ...wardrobePreviewAvatar, equipment: result.equipment };
  if (item.category === 'table_skin' && item.themeId) applyWardrobeHallSkin(item.themeId, { skipEquip: true });
  livePreviewAppearance();
  renderWardrobeCosmeticPreview(wardrobePreviewAvatar);
  renderWardrobeDetail(item);
  setWardrobeStatus(`${slotSkinLabel(item.category)}已预览，保存后同步牌桌`);
  renderWardrobe();
}

function applyWardrobeOutfit(outfitId) {
  const outfit = AVATAR_OUTFITS.find((item) => item.id === outfitId);
  if (!outfit || !wardrobePreviewAvatar) return;
  const result = applyOutfit(wardrobePreviewAvatar.equipment, outfit);
  if (!result.ok) return setWardrobeStatus('该套装暂不可用');
  wardrobePreviewAvatar = { ...wardrobePreviewAvatar, equipment: result.equipment };
  if (result.equipment.full_body) {
    applyWardrobeClothingStyle(result.equipment.full_body, { skipRender: true });
  }
  livePreviewAppearance();
  setWardrobeStatus('套装已应用到当前人物');
  renderWardrobe();
}

function applyWardrobeCharacter(charId) {
  if (!charId) return;
  if (!wardrobePreviewAvatar) openWardrobe();
  const equipment = { ...(wardrobePreviewAvatar.equipment || DEFAULT_EQUIPMENT), full_body: null };
  wardrobePreviewAvatar = {
    ...wardrobePreviewAvatar,
    baseAvatarId: charId,
    costumeId: 'default',
    lastOutfitId: 'default',
    equipment,
  };
  const profile = getProfile();
  profile.avatarId = resolveCharId(charId);
  profile.costumeId = 'default';
  profile._lastOutfitId = 'default';
  const wardrobe = getWardrobeState();
  wardrobe.savedAvatar = {
    ...wardrobe.savedAvatar,
    baseAvatarId: profile.avatarId,
    costumeId: 'default',
    lastOutfitId: 'default',
    equipment,
  };
  saveState();
  applyProfileToRuntime();
  renderWardrobe();
  renderProfileUi({ keepDraft: true });
  setWardrobeStatus(`已换上「${getCharOption(charId).label}」，牌桌已同步`);
}

function applyWardrobeCostume(costumeId) {
  if (!costumeId || !wardrobePreviewAvatar) return;
  const equipment = { ...wardrobePreviewAvatar.equipment };
  if (!isClothingStyleCostume(costumeId)) equipment.full_body = null;
  wardrobePreviewAvatar = {
    ...wardrobePreviewAvatar,
    costumeId,
    lastOutfitId: isOutfitCostume(costumeId) ? costumeId : wardrobePreviewAvatar.lastOutfitId,
    equipment,
  };
  livePreviewAppearance();
  setWardrobeStatus('衣服已换到当前人物');
  renderWardrobe();
}

function applyWardrobeClothingStyle(styleId, { skipRender = false } = {}) {
  if (!styleId || !wardrobePreviewAvatar) return;
  const ch = getCharOption(wardrobePreviewAvatar.baseAvatarId);
  const resolved = resolveClothingStyle(styleId, ch);
  if (!resolved.ok) return setWardrobeStatus('该衣服样式不可用');
  const equipped = equipItem(wardrobePreviewAvatar.equipment, styleId);
  wardrobePreviewAvatar = {
    ...wardrobePreviewAvatar,
    costumeId: resolved.costumeId,
    lastOutfitId: resolved.lastOutfitId || wardrobePreviewAvatar.lastOutfitId || 'default',
    equipment: equipped.ok ? equipped.equipment : wardrobePreviewAvatar.equipment,
  };
  const profile = getProfile();
  if (profile.linkSkinAndClothes && resolved.themeId) {
    applyingLinkedAppearance = true;
    try { applyTheme(resolved.themeId); } finally { applyingLinkedAppearance = false; }
  }
  livePreviewAppearance();
  if (!skipRender) {
    setWardrobeStatus(resolved.mode === 'outfit' ? '已换本人物专属衣服' : '已按样式染衣服，肤色不变');
    renderWardrobe();
  }
}

function applyWardrobeHallSkin(skinId, { skipEquip = false } = {}) {
  if (!skinId) return;
  const enabledSkin = listEnabledThemes().some((skin) => skin.id === skinId);
  if (!enabledSkin) {
    setWardrobeStatus('该皮肤 ID 不存在，显示保持不变');
    return;
  }
  applyingLinkedAppearance = true;
  try { applyTheme(skinId); } finally { applyingLinkedAppearance = false; }
  if (!skipEquip && wardrobePreviewAvatar) {
    const skinItem = listSkinItems(AVATAR_ITEMS, 'table_skin').find((item) => item.themeId === skinId);
    if (skinItem) {
      const equipped = equipItem(wardrobePreviewAvatar.equipment, skinItem.id);
      if (equipped.ok) wardrobePreviewAvatar = { ...wardrobePreviewAvatar, equipment: equipped.equipment };
    }
  }
  const profile = getProfile();
  if (profile.linkSkinAndClothes) {
    const clothingId = clothingIdForTheme(skinId);
    if (clothingId) applyWardrobeClothingStyle(clothingId, { skipRender: true });
  }
  livePreviewAppearance();
  setWardrobeStatus(profile.linkSkinAndClothes ? '大厅皮肤已换，衣服已跟随搭配' : '大厅皮肤已换');
  renderWardrobe();
}

function clearWardrobeGear() {
  if (!wardrobePreviewAvatar) return;
  let equipment = { ...wardrobePreviewAvatar.equipment };
  for (const slot of ACTIVE_EQUIPMENT_SLOTS) {
    equipment = unequipItem(equipment, slot).equipment;
  }
  wardrobePreviewAvatar = { ...wardrobePreviewAvatar, equipment };
  livePreviewAppearance();
  setWardrobeStatus('已卸下配饰');
  renderWardrobe();
}

function livePreviewAppearance() {
  if (!wardrobePreviewAvatar) return;
  const profile = getProfile();
  profile.avatarId = resolveCharId(wardrobePreviewAvatar.baseAvatarId || profile.avatarId);
  profile.costumeId = wardrobePreviewAvatar.costumeId || profile.costumeId;
  profile._lastOutfitId = wardrobePreviewAvatar.lastOutfitId || profile._lastOutfitId;
  applyProfileToRuntime();
}

function unequipWardrobeSlot(slot) {
  if (!slot || !wardrobePreviewAvatar) return;
  const result = unequipItem(wardrobePreviewAvatar.equipment, slot);
  if (!result.ok) return setWardrobeStatus('该槽位不能卸下');
  wardrobePreviewAvatar = { ...wardrobePreviewAvatar, equipment: result.equipment };
  setWardrobeStatus('预览已更新');
  renderWardrobe();
}

async function saveWardrobePreview() {
  if (!wardrobePreviewAvatar) return;
  const wardrobe = getWardrobeState();
  const result = commitAvatarEquipment(wardrobePreviewAvatar.equipment, { inventory: wardrobe.inventory });
  if (!result.ok) return setWardrobeStatus(`保存失败：${result.reason || '装备不合法'}`);
  const profile = getProfile();
  profile.avatarId = resolveCharId(wardrobePreviewAvatar.baseAvatarId || profile.avatarId);
  profile.costumeId = wardrobePreviewAvatar.costumeId || 'default';
  profile._lastOutfitId = wardrobePreviewAvatar.lastOutfitId || profile._lastOutfitId;
  wardrobe.savedAvatar = {
    ...wardrobePreviewAvatar,
    baseAvatarId: profile.avatarId,
    equipment: result.savedEquipment,
  };
  wardrobe.updatedAt = new Date().toISOString();
  saveState();
  wardrobeSavedSnapshot = {
    avatarId: profile.avatarId,
    costumeId: profile.costumeId,
    lastOutfitId: profile._lastOutfitId || 'default',
    equipment: result.savedEquipment,
  };
  applyProfileToRuntime();
  renderWardrobe();
  setWardrobeStatus('人物、衣服与皮肤已保存并同步到牌桌');
  syncSavedAvatarVisualOnly(wardrobe.savedAvatar);
}

async function syncSavedAvatarVisualOnly(savedAvatar) {
  try {
    const token = window.__teaParlorSessionToken;
    const gateway = String(window.TEA_PARLOR_API_GATEWAY_URL || '').replace(/\/+$/, '');
    if (token && gateway) {
      await fetch(`${gateway}/avatar/equipment`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ avatar: savedAvatar }),
      });
    }
  } catch (_) { /* local H5 can run without API gateway */ }
  try {
    const client = window.__teaParlorRealtimeClient;
    if (client?.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'avatar:update', avatar: savedAvatar }));
    }
  } catch (_) { /* no realtime table active */ }
}

function setWardrobeStatus(text) {
  const el = document.getElementById('wardrobeStatus');
  if (el) el.textContent = text;
}

function bindAppearanceSync() {
  document.addEventListener('tea-parlor-theme-change', (e) => {
    if (applyingLinkedAppearance) return;
    const profile = getProfile();
    if (profile.linkSkinAndClothes === false) return;
    const clothingId = clothingIdForTheme(e.detail?.theme);
    if (!clothingId) return;
    applyingLinkedAppearance = true;
    try {
      applyProfileClothingStyle(clothingId, { fromTheme: true });
      if (wardrobePreviewAvatar) {
        wardrobePreviewAvatar = {
          ...wardrobePreviewAvatar,
          costumeId: profile.costumeId,
          lastOutfitId: profile._lastOutfitId,
          equipment: getSavedAvatar().equipment,
        };
        renderWardrobe();
      }
    } finally {
      applyingLinkedAppearance = false;
    }
  });
  document.getElementById('linkSkinClothesToggle')?.addEventListener('change', (e) => {
    const profile = getProfile();
    profile.linkSkinAndClothes = e.target.checked !== false;
    saveState();
    setProfileStatus(profile.linkSkinAndClothes ? '大厅皮肤与衣服已联动' : '大厅皮肤与衣服已取消联动');
  });
}

function applyProfileClothingStyle(styleId, { fromTheme = false } = {}) {
  const profile = getProfile();
  const ch = getCharOption(profile.avatarId);
  const resolved = resolveClothingStyle(styleId, ch);
  if (!resolved.ok) return false;
  const wardrobe = getWardrobeState();
  const equipped = equipItem(wardrobe.savedAvatar.equipment, styleId);
  if (equipped.ok) {
    wardrobe.savedAvatar = {
      ...wardrobe.savedAvatar,
      baseAvatarId: profile.avatarId,
      equipment: equipped.equipment,
    };
  }
  profile.costumeId = resolved.costumeId;
  if (resolved.lastOutfitId) profile._lastOutfitId = resolved.lastOutfitId;
  if (!fromTheme && profile.linkSkinAndClothes !== false && resolved.themeId) {
    applyingLinkedAppearance = true;
    try { applyTheme(resolved.themeId); } finally { applyingLinkedAppearance = false; }
  }
  applyProfileToRuntime();
  return true;
}

function rarityLabel(rarity) {
  return {
    common: '普通',
    uncommon: '精良',
    rare: '稀有',
    epic: '史诗',
    legendary: '传说',
  }[rarity] || '物品';
}

function applyFigureSkin(img, isSelf) {
  if (!img || img.tagName !== 'IMG') return;
  img.classList.add('char-float', 'char-fullbody', 'char-figure-live', 'char-act-idle', 'char-nobg');
  // 禁止边框 / 背影底板：纯透明立绘
  img.style.background = 'transparent';
  img.style.backgroundImage = 'none';
  img.style.border = '0';
  img.style.borderRadius = '0';
  img.style.outline = 'none';
  img.style.boxShadow = 'none';
  img.style.objectFit = 'contain';
  img.style.objectPosition = 'center bottom';
  img.style.filter = 'none';
  if (isSelf) {
    img.dataset.costume = getProfile().costumeId || 'default';
    // 衣服染色（Canvas 保护肤色），不用整图 CSS 滤镜
    applyClothDyeToImg(img, true);
  } else {
    delete img.dataset.costume;
    delete img.dataset.dyed;
  }
}

function updateAllTableCharacters() {
  const costume = getCostume();
  for (let i = 0; i < 4; i++) {
    const src = getSeatCharacterSrc(i);
    const charId = i === 0 ? resolveCharId(getProfile().avatarId) : (SEAT_DEFAULT_CHARS[i] || CHAR_OPTIONS[0].id);
    const kind = getCharOption(charId).kind || 'male';
    document.querySelectorAll(`[data-char="${i}"] .char-figure, [data-char="${i}"] .char-avatar`).forEach((img) => {
      if (img.tagName === 'IMG') {
        img.src = src;
        img.alt = i === 0 ? NAMES[0] : (NAMES[i] || `茶友${i}`);
        img.dataset.kind = kind;
        applyFigureSkin(img, i === 0);
      }
    });
    document.querySelectorAll(`[data-texas-seat="${i}"] .char-figure, [data-texas-seat="${i}"] .char-avatar`).forEach((img) => {
      if (img.tagName === 'IMG') {
        img.src = src;
        img.dataset.kind = kind;
        applyFigureSkin(img, i === 0);
      }
    });
    document.querySelectorAll(`[data-mg-seat="${i}"] .char-figure`).forEach((img) => {
      if (img.tagName === 'IMG') {
        img.src = src;
        img.dataset.kind = kind;
        applyFigureSkin(img, i === 0);
      }
    });
  }
  const tag = document.querySelector('.self-char .char-name-tag, [data-char="0"] .char-name-tag');
  if (tag) tag.textContent = NAMES[0];
  // 人物旁不再展示服饰广告位
  void costume;
  // 若斗地主已定地主，刷新后仍保持地主/地主婆形象
  if (game && typeof game.landlord === 'number' && game.landlord >= 0) {
    try { applyDdzLandlordVisuals(); } catch (_) { /* ignore */ }
  }
  mountCharLogos();
}

function updateTableSelfAvatar() {
  updateAllTableCharacters();
}

function applyCostumeTheme(costumeId) {
  const p = getProfile();
  const id = costumeId || p.costumeId || 'default';
  const c = getCostume(id);
  const color = id === 'custom' ? (p.customSkinColor || c.color) : c.color;
  document.documentElement.style.setProperty('--costume-accent', color);
  document.body.dataset.costume = id;
}

function readTexasDealerIndex(source, depth = 0) {
  if (source == null || depth > 3) return null;
  if (typeof source === 'number' && Number.isFinite(source)) {
    const n = Math.trunc(source);
    return n >= 0 && n <= 2 ? n : null;
  }
  if (typeof source !== 'object') return null;
  const keys = ['dealer', 'dealerIndex', 'dealerSeat', 'dealerPos', 'button', 'buttonIndex', 'btn', 'btnSeat'];
  for (const k of keys) {
    if (source[k] == null || source[k] === '') continue;
    const nested = readTexasDealerIndex(source[k], depth + 1);
    if (nested != null) return nested;
  }
  for (const k of ['state', 'game', 'engine', 'table']) {
    if (source[k] && source[k] !== source) {
      const nested = readTexasDealerIndex(source[k], depth + 1);
      if (nested != null) return nested;
    }
  }
  return null;
}

/** Hide all dealer D badges; unhide only the dealer seat. Fallback seat 0. */
function syncTexasDealer(state) {
  if (_txDealerSyncing) return;
  const badges = document.querySelectorAll('.tx-dealer');
  if (!badges.length) return;
  let idx = readTexasDealerIndex(state);
  if (idx == null) idx = readTexasDealerIndex(texasUI);
  if (idx == null) idx = readTexasDealerIndex(window.__texasState);
  if (idx == null) idx = 0;
  const want = String(idx);
  _txDealerSyncing = true;
  try {
    badges.forEach((el) => {
      const on = el.getAttribute('data-tx-dealer') === want;
      if (on) {
        if (el.hidden) {
          el.hidden = false;
          el.removeAttribute('hidden');
        }
      } else if (!el.hidden) {
        el.hidden = true;
        el.setAttribute('hidden', '');
      }
    });
  } finally {
    _txDealerSyncing = false;
  }
}

function hookTexasDealerRender(ui) {
  if (!ui || ui._play9DealerHook) return;
  ui._play9DealerHook = true;
  ['render', 'update', 'sync'].forEach((name) => {
    if (typeof ui[name] !== 'function') return;
    const orig = ui[name].bind(ui);
    ui[name] = (...args) => {
      const r = orig(...args);
      syncTexasDealer(ui);
      return r;
    };
  });
}

function initTexas() {
  syncTexasDealer(null);
  const root = document.getElementById('texasTableView');
  if (root && !root._txDealerObs) {
    const obs = new MutationObserver(() => {
      clearTimeout(obs._t);
      obs._t = setTimeout(() => syncTexasDealer(texasUI), 32);
    });
    obs.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'class'] });
    root._txDealerObs = obs;
  }
}

function cashoutTexas(stack) {
  // 只兑回一次：以桌上带入标记为准，避免重复加币
  if (texasBuyIn <= 0 && activeGame !== 'texas') return;
  const back = typeof stack === 'number' ? stack : texasBuyIn;
  const currency = window.__texasCurrency || 'ingot';
  if (back > 0) {
    if (currency === 'crypto') adjustUsdt(back);
    else appState.ingots += back;
  }
  texasBuyIn = 0;
  activeGame = null;
  window.__texasCurrency = 'ingot';
  saveState();
  renderAccount();
}

function startTexas(tableKey = 'micro', options = {}) {
  if (!assertCanEnter(options.currency === 'crypto' ? 'real' : 'texas')) return;
  const t = TEXAS_TABLES[tableKey] || TEXAS_TABLES.micro;
  const currency = options.currency || t.currency || 'ingot';
  const bal = currency === 'crypto' ? getCrypto() : appState.ingots;
  const unitName = currencyLabel(currency);
  if (bal < t.minEntry) {
    if (nodes.claimStatus) {
      nodes.claimStatus.textContent = currency === 'crypto'
        ? `${t.label} 需要 ${formatCrypto(t.minEntry)} 赛季积分 带入，请先补给`
        : `${t.label} 需要 ${format(t.minEntry)} 金币带入`;
    }
    if (currency === 'crypto') setLobbyView('recharge');
    return;
  }
  // 离开斗地主 / 掼蛋 HUD
  clearAi();
  game = null;
  try { multiUI?.hide?.(); } catch (_) { /* ignore */ }
  forceCloseMultiView();
  nodes.tableView.hidden = true;
  nodes.tableView.setAttribute('hidden', '');

  activeGame = 'texas';
  window.__texasTableKey = tableKey;
  window.__texasCurrency = currency;
  // 若已在德州桌，先兑回
  if (texasBuyIn > 0) cashoutTexas(texasBuyIn);
  texasBuyIn = t.buyIn;
  if (currency === 'crypto') adjustUsdt(-t.buyIn);
  else appState.ingots -= t.buyIn;
  saveState();
  renderAccount();

  let lastStacks = [t.buyIn, t.buyIn, t.buyIn];

  texasUI = createTexasUI({
    getStake: () => ({ sb: t.sb, bb: t.bb, buyIn: t.buyIn, label: t.label }),
    onExit: () => {
      const stack = lastStacks[0];
      cashoutTexas(stack);
      texasUI?.hide?.();
      setLobbyView('rooms', currency === 'crypto' ? 'real' : 'texas');
      if (nodes.claimStatus) {
        const amt = currency === 'crypto' ? formatCrypto(Math.max(0, stack || 0)) : format(Math.max(0, stack || 0));
        nodes.claimStatus.textContent = `德州离桌 · 兑回 ${amt} ${unitName}`;
      }
    },
    onSettle: ({ stacks, winners, deltas }) => {
      if (stacks) lastStacks = stacks.slice();
      const endStack = lastStacks[0] || 0;
      const delta = Array.isArray(deltas) ? (deltas[0] || 0) : (endStack - t.buyIn);
      applyResultWithRevenue({
        currency,
        resultDelta: currency === 'crypto' ? delta : 0,
        baseScore: currency === 'crypto' ? 0 : (t.sb || t.stake || 1),
        game: 'texas',
        roomName: `德州·${t.label}`,
      });
      try {
        if (Array.isArray(deltas) && deltas.length) playSettleActions(deltas);
        else playCharAction(0, delta > 0 ? 'win' : delta < 0 ? 'lose' : 'idle');
      } catch (_) { /* ignore */ }
      appState.records.unshift({
        roomName: `德州·${t.label}`,
        result: (winners || []).includes(0) ? '胜' : '负',
        score: delta,
        at: new Date().toISOString(),
        game: 'texas',
        currency,
      });
      appState.records = appState.records.slice(0, 50);
      texasBuyIn = endStack;
      saveState();
      renderAccount();
    },
  });
  texasUI.start();
  hookTexasDealerRender(texasUI);
  syncTexasDealer(texasUI);
  try {
    resetAllCharActions();
    playCharAction(0, 'deal');
    playCharAction(1, 'deal');
    playCharAction(2, 'deal');
  } catch (_) { /* ignore */ }
}

function leaveMultiTable() {
  try {
    multiUI?.hide?.();
  } catch (e) {
    console.warn('[TeaParlor] multiUI.hide', e);
  }
  // 强制收起 multi 桌，防止遮罩挡死大厅
  forceCloseMultiView();
  if (multiBuyIn > 0) multiBuyIn = 0;
  activeGame = null;
  window.__multiCurrency = 'ingot';
}

/** 强制关闭多人桌 DOM/壳层状态（不依赖 UI 实例）
 *  注意：只动 multi，不碰 table-active / texas-active，避免误关斗地主/德州 */
function forceCloseMultiView() {
  const mg = document.getElementById('multiGameView');
  if (mg) {
    stripGuandanChrome(mg);
    mg.hidden = true;
    mg.setAttribute('hidden', '');
    mg.classList.remove('zjh-active', 'gd-active', 'gd-4p', 'gd-yard', 'gd-settling', 'mj-4p', 'mj-2p');
    delete mg.dataset.game;
    mg.style.display = 'none';
    mg.style.pointerEvents = 'none';
    mg.style.visibility = 'hidden';
    mg.style.zIndex = '-1';
  }
  stripGuandanChromeFromDocument(document);
  nodes.shell?.classList.remove('multi-active');
  // 仅在未开斗地主/德州时恢复大厅舞台
  if (!nodes.shell?.classList.contains('table-active') && !nodes.shell?.classList.contains('texas-active')) {
    const stage = document.querySelector('.lobby-stage');
    if (stage) {
      stage.style.display = '';
      stage.style.pointerEvents = 'auto';
    }
  }
}

function getBal(currency) {
  return currency === 'crypto' ? getCrypto() : appState.ingots;
}

function applyDelta(currency, delta) {
  if (currency === 'crypto') {
    adjustUsdt(delta);
  } else {
    appState.ingots = Math.max(0, appState.ingots + delta);
  }
}

function applyResultWithRevenue({
  currency = 'ingot',
  resultDelta = 0,
  baseScore = 0,
  game = 'doudizhu',
  roomName = '',
  refundBuyIn = 0,
  alreadyCollected = false,
} = {}) {
  const quote = quotePlatformFee({ currency, baseScore, winAmount: resultDelta });
  const feeNow = alreadyCollected ? 0 : Number(quote.fee || 0);
  const payout = Number(refundBuyIn || 0) + Number(resultDelta || 0) - feeNow;
  applyDelta(currency, payout);
  if (quote.charged) {
    const playerId = String(getProfile()?.playerId || '830126');
    reportOpsRevenue({
      playerId,
      currency,
      kind: quote.kind,
      fee: quote.fee,
      baseScore,
      winAmount: resultDelta,
      game,
      roomName,
      idempotencyKey: `lobby:${game}:${playerId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    }).catch(() => {});
  }
  return { payout, fee: quote.fee, kind: quote.kind };
}

function needEntryMsg(label, minEntry, currency) {
  return currency === 'crypto'
    ? `${label} 需要 ${formatCrypto(minEntry)} ${CRYPTO_SYMBOL}`
    : `${label} 需要 ${format(minEntry)} 金币`;
}


function buryDdzLayer() {
  const ids = ['tableView', 'bidControls', 'playControls', 'handArea', 'doubleControls', 'settleControls'];
  ids.forEach((id) => {
    const el = id === 'tableView'
      ? (nodes.tableView || document.getElementById('tableView'))
      : (nodes[id] || document.getElementById(id));
    if (!el) return;
    el.hidden = true;
    el.setAttribute('hidden', '');
    el.style.setProperty('display', 'none', 'important');
    el.style.setProperty('pointer-events', 'none', 'important');
    el.style.setProperty('visibility', 'hidden', 'important');
    el.style.setProperty('z-index', '-1', 'important');
  });
  document.querySelectorAll('#tableView .qq-bottom-bar').forEach((el) => {
    el.style.setProperty('display', 'none', 'important');
    el.style.setProperty('visibility', 'hidden', 'important');
    el.style.setProperty('pointer-events', 'none', 'important');
  });
  if (nodes.handArea) nodes.handArea.innerHTML = '';
}

function prepareMultiTable() {
  clearAi();
  game = null;
  try { texasUI?.hide?.(); } catch (_) { /* ignore */ }
  try { multiUI?.hide?.(); } catch (_) { /* ignore */ }
  buryDdzLayer();
  hideTableActionBars();
  nodes.shell?.classList.remove('table-active', 'texas-active', 'multi-active');
  // 先彻底收起 multi，再由新玩法 show() 打开
  forceCloseMultiView();
}

function startMahjong(modeKey = 'xuezhan', options = {}) {
  if (!assertCanEnter(options.currency === 'crypto' ? 'real' : 'mahjong')) return;
  const t = MAHJONG_TABLES[modeKey] || MAHJONG_TABLES.xuezhan;
  const currency = options.currency || t.currency || 'ingot';
  if (getBal(currency) < t.minEntry) {
    if (nodes.claimStatus) nodes.claimStatus.textContent = needEntryMsg(t.label, t.minEntry, currency);
    if (currency === 'crypto') setLobbyView('recharge');
    return;
  }
  prepareMultiTable();
  buryDdzLayer();
  hideTableActionBars();
  activeGame = 'mahjong';
  multiBuyIn = t.buyIn;
  window.__multiCurrency = currency;

  multiUI = createMahjongUI({
    getStake: () => ({ stake: t.stake, label: t.label, mode: t.mode }),
    onExit: () => {
      leaveMultiTable();
      setLobbyView('rooms', currency === 'crypto' ? 'real' : 'mahjong');
      if (nodes.claimStatus) nodes.claimStatus.textContent = '已离开麻将桌';
    },
    onSettle: ({ deltas, winner, roomLabel, mode }) => {
      const delta = Array.isArray(deltas) ? (deltas[0] || 0) : 0;
      applyResultWithRevenue({
        currency,
        resultDelta: delta,
        baseScore: t.stake || t.buyIn || 0,
        game: mode || 'mahjong',
        roomName: roomLabel || t.label,
      });
      appState.records.unshift({
        roomName: roomLabel || t.label,
        result: winner === 0 ? '胜' : winner < 0 ? '流局' : '负',
        score: delta,
        at: new Date().toISOString(),
        game: mode || 'mahjong',
        currency,
      });
      appState.records = appState.records.slice(0, 50);
      saveState();
      renderAccount();
    },
  });
  multiUI.start();
  buryDdzLayer();
}

function startZhajinhua(tableKey = 'novice', options = {}) {
  if (!assertCanEnter(options.currency === 'crypto' ? 'real' : 'zhajinhua')) return;
  const t = ZHAJINHUA_TABLES[tableKey] || ZHAJINHUA_TABLES.novice;
  const currency = options.currency || t.currency || 'ingot';
  if (getBal(currency) < t.minEntry) {
    if (nodes.claimStatus) nodes.claimStatus.textContent = needEntryMsg(t.label, t.minEntry, currency);
    if (currency === 'crypto') setLobbyView('recharge');
    return;
  }
  prepareMultiTable();
  buryDdzLayer();
  hideTableActionBars();
  activeGame = 'zhajinhua';
  multiBuyIn = t.minEntry;
  window.__multiCurrency = currency;

  multiUI = createZhajinhuaUI({
    getStake: () => ({ ante: t.ante, stake: t.stake, label: t.label }),
    onExit: () => {
      leaveMultiTable();
      setLobbyView('rooms', currency === 'crypto' ? 'real' : 'zhajinhua');
      if (nodes.claimStatus) nodes.claimStatus.textContent = '已离开炸金花桌';
    },
    onSettle: ({ deltas, winner, roomLabel }) => {
      const delta = Array.isArray(deltas) ? (deltas[0] || 0) : 0;
      applyResultWithRevenue({
        currency,
        resultDelta: delta,
        baseScore: t.stake || t.ante || 0,
        game: 'zhajinhua',
        roomName: roomLabel || t.label,
      });
      appState.records.unshift({
        roomName: roomLabel || t.label,
        result: winner === 0 ? '胜' : '负',
        score: delta,
        at: new Date().toISOString(),
        game: 'zhajinhua',
        currency,
      });
      appState.records = appState.records.slice(0, 50);
      saveState();
      renderAccount();
    },
  });
  multiUI.start();
  buryDdzLayer();
}

function startBlackjack(tableKey = 'novice', options = {}) {
  if (!assertCanEnter(options.currency === 'crypto' ? 'real' : 'blackjack')) return;
  const t = BLACKJACK_TABLES[tableKey] || BLACKJACK_TABLES.novice;
  const currency = options.currency || t.currency || 'ingot';
  if (getBal(currency) < t.minEntry) {
    if (nodes.claimStatus) nodes.claimStatus.textContent = needEntryMsg(t.label, t.minEntry, currency);
    if (currency === 'crypto') setLobbyView('recharge');
    return;
  }
  prepareMultiTable();
  buryDdzLayer();
  hideTableActionBars();
  activeGame = 'blackjack';
  multiBuyIn = t.minEntry;
  window.__multiCurrency = currency;

  multiUI = createBlackjackUI({
    getStake: () => ({
      minBet: t.minBet,
      maxBet: t.maxBet,
      chips: t.chips || t.minEntry,
      minEntry: t.minEntry,
      label: t.label,
      // 默认 4 人；桌内可再选 2–7
      playerCount: t.playerCount || 4,
    }),
    onExit: () => {
      leaveMultiTable();
      setLobbyView('rooms', currency === 'crypto' ? 'real' : 'blackjack');
      if (nodes.claimStatus) nodes.claimStatus.textContent = '已离开二十一点桌';
    },
    onSettle: ({ deltas, winner, roomLabel }) => {
      const delta = Array.isArray(deltas) ? (deltas[0] || 0) : 0;
      applyResultWithRevenue({
        currency,
        resultDelta: delta,
        baseScore: t.minBet || t.stake || t.minEntry || 0,
        game: 'blackjack',
        roomName: roomLabel || t.label,
      });
      try {
        if (Array.isArray(deltas) && deltas.length) playSettleActions(deltas);
        else playCharAction(0, delta > 0 ? 'win' : delta < 0 ? 'lose' : 'idle');
      } catch (_) { /* ignore */ }
      appState.records.unshift({
        roomName: roomLabel || t.label,
        result: winner === 0 ? '胜' : winner < 0 ? '平' : '负',
        score: delta,
        at: new Date().toISOString(),
        game: 'blackjack',
        currency,
      });
      appState.records = appState.records.slice(0, 50);
      saveState();
      renderAccount();
    },
  });
  multiUI.start();
  buryDdzLayer();
  try {
    resetAllCharActions();
    [0, 1, 2, 3, 4, 5, 6].forEach((s) => playCharAction(s, 'deal', { holdMs: 700 }));
  } catch (_) { /* ignore */ }
}

async function startGuanDan(tableKey = 'novice', options = {}) {
  if (!assertCanEnter(options.currency === 'crypto' ? 'real' : 'guandan')) return;
  const t = GUANDAN_TABLES[tableKey] || GUANDAN_TABLES.novice;
  const currency = options.currency || t.currency || 'ingot';
  if (getBal(currency) < t.minEntry) {
    if (nodes.claimStatus) nodes.claimStatus.textContent = needEntryMsg(t.label, t.minEntry, currency);
    if (currency === 'crypto') setLobbyView('recharge');
    return;
  }
  prepareMultiTable();
  buryDdzLayer();
  hideTableActionBars();
  activeGame = 'guandan';
  multiBuyIn = t.minEntry;
  window.__multiCurrency = currency;

  let createGuanDanUI;
  try {
    ({ createGuanDanUI } = await import('./games/guandan/ui.js'));
  } catch (e) {
    console.error('[TeaParlor] 掼蛋模块加载失败', e);
    if (nodes.claimStatus) {
      nodes.claimStatus.textContent = '掼蛋加载失败：请用 npm run dev 启动大厅服务后重试';
    }
    forceCloseMultiView();
    activeGame = null;
    return;
  }

  multiUI = createGuanDanUI({
    getStake: () => ({ stake: t.stake, label: t.label, currency }),
    onExit: () => {
      leaveMultiTable();
      setLobbyView('rooms', currency === 'crypto' ? 'real' : 'guandan');
      if (nodes.claimStatus) nodes.claimStatus.textContent = '已离开掼蛋桌';
    },
    onSettle: ({ deltas, winner, roomLabel }) => {
      const delta = Array.isArray(deltas) ? (deltas[0] || 0) : 0;
      applyResultWithRevenue({
        currency,
        resultDelta: delta,
        baseScore: t.stake || t.minEntry || 0,
        game: 'guandan',
        roomName: roomLabel || t.label,
      });
      appState.records.unshift({
        roomName: roomLabel || t.label,
        result: winner === 0 ? '胜' : '负',
        score: delta,
        at: new Date().toISOString(),
        game: 'guandan',
        currency,
      });
      appState.records = appState.records.slice(0, 50);
      saveState();
      renderAccount();
    },
  });
  try {
    multiUI.start();
    buryDdzLayer();
  } catch (e) {
    console.error('[TeaParlor] 掼蛋开局失败', e);
    if (nodes.claimStatus) nodes.claimStatus.textContent = `掼蛋开局失败：${e?.message || e}`;
    forceCloseMultiView();
    activeGame = null;
  }
}

function bindUi() {
  // 直接绑定牌桌操作（固定节点）
  nodes.claimButton?.addEventListener('click', (e) => {
    e.preventDefault();
    onClaim();
  });
  nodes.backBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    showLobby();
  });
  nodes.settleBackBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    hideDdzResultModal();
    showLobby();
  });
  nodes.againBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    hideDdzResultModal();
    startRoom(game?.roomId || 'novice');
  });
  nodes.ddzAgain?.addEventListener('click', (e) => {
    e.preventDefault();
    hideDdzResultModal();
    startRoom(game?.roomId || 'novice');
  });
  nodes.ddzLobby?.addEventListener('click', (e) => {
    e.preventDefault();
    hideDdzResultModal();
    showLobby();
  });
  nodes.ddzModal?.querySelectorAll('[data-ddz-result-dismiss]').forEach((n) => {
    n.addEventListener('click', (e) => {
      e.preventDefault();
      hideDdzResultModal();
    });
  });
  nodes.hintButton?.addEventListener('click', (e) => {
    e.preventDefault();
    onHint();
  });
  nodes.playButton?.addEventListener('click', (e) => {
    e.preventDefault();
    onPlay();
  });
  nodes.passButton?.addEventListener('click', (e) => {
    e.preventDefault();
    onPass(false);
  });
  nodes.trusteeButton?.addEventListener('click', (e) => {
    e.preventDefault();
    onToggleTrustee();
  });
  nodes.chatBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    if (nodes.tableStatus) nodes.tableStatus.textContent = '聊天：加油！这把我必赢（演示）';
  });
  const handleDdzBidClick = (e) => {
    const btn = e.target instanceof Element ? e.target.closest('[data-bid]') : null;
    if (!btn || btn.disabled || !nodes.tableView || nodes.tableView.hidden) return;
    e.preventDefault();
    e.stopPropagation();
    onBid(Number(btn.getAttribute('data-bid')));
  };
  const handleDdzDoubleClick = (e) => {
    const btn = e.target instanceof Element ? e.target.closest('[data-double]') : null;
    if (!btn || btn.disabled || !nodes.tableView || nodes.tableView.hidden) return;
    e.preventDefault();
    e.stopPropagation();
    onDouble(Number(btn.getAttribute('data-double')) || 1);
  };
  nodes.bidControls?.addEventListener('click', handleDdzBidClick, true);
  nodes.doubleControls?.addEventListener('click', handleDdzDoubleClick, true);
  nodes.tableView?.addEventListener('click', (e) => {
    if (e.target instanceof Element && e.target.closest('[data-bid]')) handleDdzBidClick(e);
    else if (e.target instanceof Element && e.target.closest('[data-double]')) handleDdzDoubleClick(e);
  }, true);

  // 链游测试区：玩法快捷锚点（滚到对应分区，而非 window 默认锚点）
  document.addEventListener('click', (e) => {
    const a = e.target instanceof Element ? e.target.closest('a.crypto-jump[href^="#"]') : null;
    if (!a) return;
    const id = (a.getAttribute('href') || '').slice(1);
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    scrollCryptoToSection(el);
  }, true);

  // 全局委托：大厅 / 侧栏 / 场次 / 叫分 全部可点（含动态节点）
  document.addEventListener('click', (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;

    // 叫分 / 加倍必须在「牌桌内跳过大厅导航」之前处理，否则捕获阶段直接 return 会吞掉交互
    const bidBtn = t.closest('[data-bid]');
    if (bidBtn && nodes.tableView && !nodes.tableView.hidden && !bidBtn.disabled) {
      e.preventDefault();
      e.stopPropagation();
      onBid(Number(bidBtn.getAttribute('data-bid')));
      return;
    }
    const doubleBtn = t.closest('[data-double]');
    if (doubleBtn && nodes.tableView && !nodes.tableView.hidden && !doubleBtn.disabled) {
      e.preventDefault();
      e.stopPropagation();
      onDouble(Number(doubleBtn.getAttribute('data-double')) || 1);
      return;
    }

    if (t.closest('#ddzSettleAdClose, [data-lobby-action="dismiss-settle-ad"]')) {
      e.preventDefault();
      e.stopPropagation();
      const ad = document.getElementById('ddzSettleAd');
      if (ad) {
        ad.hidden = true;
        ad.setAttribute('hidden', '');
      }
      return;
    }

    // 牌桌内其它点击不走大厅导航（出牌/弃牌/跟注由各自按钮监听处理）
    const tableRoot = t.closest('#tableView, #texasTableView, #multiGameView, #texasResultModal, #mgResultModal, #ddzResultModal');
    if (tableRoot && !tableRoot.hidden) return;

    // 链游页返回/补给：确保不被其它逻辑挡掉
    const cryptoBack = t.closest('.crypto-room-band [data-lobby-action="home"], .crypto-room-band .view-back-button');
    if (cryptoBack) {
      e.preventDefault();
      e.stopPropagation();
      leaveMultiTable?.();
      forceCloseMultiView?.();
      setLobbyView('home');
      if (nodes.claimStatus) nodes.claimStatus.textContent = '已返回大厅';
      return;
    }

    const lobbyAct = t.closest('[data-lobby-action]');
    if (lobbyAct) {
      const action = lobbyAct.getAttribute('data-lobby-action');
      if (!action) return;
      e.preventDefault();
      e.stopPropagation();
      if (action === 'home' || action === 'profile' || action === 'records' || action === 'recharge' || action === 'wardrobe' || action === 'chain' || action === 'open-doudizhu-rooms' || action === 'friend-room' || action === 'quick-doudizhu' || action === 'quick-doudizhu-classic' || action === 'local-doudizhu' || action === 'open-games' || action === 'rules') {
        restoreLobbyChrome();
      }
      const focus = lobbyAct.getAttribute('data-recharge-focus') || undefined;
      handleLobbyAction(action, { focus });
      return;
    }

    const sideGame = t.closest('[data-side-game]');
    if (sideGame) {
      e.preventDefault();
      const gameType = sideGame.getAttribute('data-side-game');
      if (!assertCanEnter(gameType)) return;
      if (gameType === 'candidate' || gameType === 'other' || gameType === 'chudadi') {
        // 其它游戏入口已合并到链游 / 更多游戏
        setLobbyView('rooms', 'real');
        if (nodes.claimStatus) {
          nodes.claimStatus.textContent = gameType === 'chudadi'
            ? '锄大D已下线，请从链游测试区或更多游戏开局'
            : `链游测试区 · 更多玩法已收录 · 赛季积分 演示账本`;
        }
        return;
      }
      if (gameType === 'real') {
        setLobbyView('rooms', 'real');
        return;
      }
      setLobbyView('rooms', gameType);
      return;
    }

    const gameTile = t.closest('[data-game]');
    if (gameTile) {
      e.preventDefault();
      const g = gameTile.getAttribute('data-game');
      if (g === 'openinggame-qp' || g === 'other' || g === 'candidate') {
        setLobbyView('rooms', 'real');
        if (nodes.claimStatus) nodes.claimStatus.textContent = `更多玩法已收入链游测试区 · 赛季积分 / 金币均可开局`;
        return;
      }
      if (g === 'real') {
        setLobbyView('rooms', 'real');
        if (nodes.claimStatus) nodes.claimStatus.textContent = `链游测试区已打通 · 使用 赛季积分 演示账本入座`;
        return;
      }
      if (gameTile.classList.contains('disabled') || gameTile.getAttribute('aria-disabled') === 'true') {
        if (nodes.claimStatus) nodes.claimStatus.textContent = '该玩法暂未开放';
        return;
      }
      if (g === 'doudizhu') setLobbyView('rooms', 'doudizhu');
      else if (g === 'texas') setLobbyView('rooms', 'texas');
      else if (g === 'zhajinhua') setLobbyView('rooms', 'zhajinhua');
      else if (g === 'mahjong') setLobbyView('rooms', 'mahjong');
      else if (g === 'guandan') setLobbyView('rooms', 'guandan');
      else if (g === 'blackjack') setLobbyView('rooms', 'blackjack');
      return;
    }

    const roomCard = t.closest('[data-game-room]');
    if (roomCard) {
      e.preventDefault();
      const g = roomCard.getAttribute('data-game-room');
      // 优先 data-currency；链游测试区内默认 crypto；房间表 currency 兜底
      let currency = roomCard.getAttribute('data-currency');
      if (!currency && roomCard.closest('[data-room-game="real"]')) currency = 'crypto';
      if (!currency) currency = 'ingot';
      if (g === 'texas') {
        const key = roomCard.getAttribute('data-texas') || 'micro';
        const t = TEXAS_TABLES[key];
        if (t?.currency) currency = t.currency;
        startTexas(key, { currency });
        return;
      }
      if (g === 'mahjong') {
        const key = roomCard.getAttribute('data-mj-mode') || 'xuezhan';
        const t = MAHJONG_TABLES[key];
        if (t?.currency) currency = t.currency;
        startMahjong(key, { currency });
        return;
      }
      if (g === 'zhajinhua') {
        const key = roomCard.getAttribute('data-zjh') || 'novice';
        const t = ZHAJINHUA_TABLES[key];
        if (t?.currency) currency = t.currency;
        startZhajinhua(key, { currency });
        return;
      }
      if (g === 'guandan') {
        const key = roomCard.getAttribute('data-gd') || 'novice';
        const t = GUANDAN_TABLES[key];
        if (t?.currency) currency = t.currency;
        startGuanDan(key, { currency });
        return;
      }
      if (g === 'blackjack') {
        const key = roomCard.getAttribute('data-bj') || 'novice';
        const t = BLACKJACK_TABLES[key];
        if (t?.currency) currency = t.currency;
        startBlackjack(key, { currency });
        return;
      }
      const roomId = roomCard.getAttribute('data-room') || 'novice';
      const roomMeta = ROOMS[roomId];
      if (roomMeta?.currency) currency = roomMeta.currency;
      const ddzMode = roomCard.getAttribute('data-ddz-mode') || ddzVariant || 'classic';
      startDdzMatched(roomId, { currency, variant: ddzMode });
    }
  }, true);

  bindDdzVariantTabs();
  renderDdzRooms(ddzVariant);
  setLobbyView('home');
}

/** 链游测试区：滚动容器固定为 .stage-content */
function getCryptoScroller() {
  const stageContent = document.querySelector('.lobby-shell.lobby-view-rooms .stage-content');
  const lobbyStage = document.querySelector('.lobby-shell.lobby-view-rooms .lobby-stage');
  const shell = document.querySelector('.lobby-shell.lobby-view-rooms');
  const candidates = [stageContent, lobbyStage, shell, document.scrollingElement, document.documentElement].filter(Boolean);
  for (const c of candidates) {
    if (!c || c === window) continue;
    const style = window.getComputedStyle(c);
    const oy = style.overflowY;
    if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && c.scrollHeight > c.clientHeight + 4) {
      return c;
    }
  }
  return stageContent || document.scrollingElement;
}

function scrollCryptoToSection(el) {
  if (!el) return;
  const scroller = getCryptoScroller();
  if (scroller && scroller !== document.documentElement && scroller !== document.body) {
    const pad = 56; // sticky 跳转条
    const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - pad;
    scroller.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  } else {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function handleLobbyAction(action, opts = {}) {
  if (action !== 'rules') hideRulesToast();
  if (action === 'home') setLobbyView('home');
  else if (action === 'open-games' || action === 'games') setLobbyView('games');
  else if (action === 'quick-doudizhu') {
    startDdzMatched('novice', { variant: 'classic' });
  }
  else if (action === 'quick-doudizhu-classic') {
    const ids = DDZ_TIER_IDS[ddzLane] || DDZ_TIER_IDS.gold;
    startDdzMatched(ids[1] || 'classic', { variant: 'classic', currency: ddzLane === 'season' ? 'crypto' : 'ingot' });
  }
  else if (action === 'local-doudizhu') {
    startDdzLocalPlay('novice', { variant: 'classic', currency: ddzLane === 'season' ? 'crypto' : 'ingot' });
  }
  else if (action === 'open-doudizhu-rooms') {
    setLobbyView('rooms', 'doudizhu');
  }
  else if (action === 'friend-room') {
    setLobbyView('rooms', 'doudizhu');
    openFriendRoom();
  }
  else if (action === 'dismiss-settle-ad') {
    const ad = document.getElementById('ddzSettleAd');
    if (ad) {
      ad.hidden = true;
      ad.setAttribute('hidden', '');
    }
  }
  else if (action === 'open-candidates' || action === 'open-other') setLobbyView('rooms', 'real');
  else if (action === 'open-real') setLobbyView('rooms', 'real');
  else if (action === 'open-zhajinhua') setLobbyView('rooms', 'zhajinhua');
  else if (action === 'open-guandan') setLobbyView('rooms', 'guandan');
  else if (action === 'toggle-pinus') togglePlayMode();
  else if (action === 'claim') onClaim();
  else if (action === 'records') {
    setLobbyView('records');
    renderRecordsPage();
  }
  else if (action === 'recharge') {
    setLobbyView('recharge');
    renderRechargePage({ focus: opts.focus || 'usdt' });
  }
  else if (action === 'recharge-usdt') {
    setLobbyView('recharge');
    renderRechargePage({ focus: 'usdt' });
  }
  else if (action === 'chain') {
    setLobbyView('chain');
    chainCenterController.renderChainCenter();
  }
  else if (action === 'profile' || action === 'wardrobe') {
    setLobbyView('profile');
    renderProfileUi();
    openWardrobe();
    if (action === 'wardrobe') {
      queueMicrotask(() => {
        document.getElementById('profileWardrobe')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }
  else if (action === 'rules') {
    setLobbyView('home');
    if (nodes.claimStatus) {
      nodes.claimStatus.textContent =
        '玩法说明：斗地主 / 德州 / 炸金花 / 麻将 / 掼蛋 · 金币与链游测试区规则一致 · 见弹层分栏';
    }
    showRulesToast('overview');
    document.querySelectorAll('.home-tab[data-lobby-action]').forEach((tab) => {
      tab.classList.toggle('is-active', tab.getAttribute('data-lobby-action') === 'rules');
    });
  }
  else if (action === 'more-games') {
    setLobbyView('games');
    if (nodes.claimStatus) {
      nodes.claimStatus.textContent = '更多游戏：斗地主 / 德州 / 炸金花 / 麻将 · 链游测试场见链游测试区';
    }
  }
  else if (action === 'support') {
    setLobbyView('home');
    if (nodes.claimStatus) nodes.claimStatus.textContent = '请使用侧栏「玩法说明」或「更多游戏」';
  }
}

/** 各玩法说明正文（与引擎/桌面逻辑对齐） */
const RULES_PANELS = {
  overview: () => (
    '<p><b>大厅入口</b>：侧栏可选斗地主 / 德州 / 炸金花 / 麻将 / 掼蛋 / 二十一点 / 链游测试区 / 更多游戏。</p>'
    + '<p><b>货币</b>：金币 = 内部娱乐积分；赛季积分 = 链游测试区演示账本（不可转为现金或外部资产）。</p>'
    + '<p><b>链游测试区</b>：使用 赛季积分 入座各玩法（含二十一点），规则与金币场一致，仅结算币种不同。</p>'
    + '<p><b>每日补给</b>：每日最多 4 次 × 4,000 影子金币（不可提现），需从 Telegram 打开领取，次数由服务端记账。</p>'
    + '<p><b>操作通用</b>：点选手牌或按钮出牌、下注；默认同桌人机，可切换联网对局。</p>'
    + '<p class="muted">金币与 赛季积分 演示账本均不可转为现金或外部资产。</p>'
  ),
  doudizhu: () => (
    '<p><b>人数 / 牌副</b>：3 人 · 1 副 54 张 · 每人 17 张 + 3 张底牌。</p>'
    + '<p><b>叫分</b>：JJ 经典 1 / 2 / 3 分或不叫；叫分最高者为地主，得底牌并先出。</p>'
    + '<p><b>出牌</b>：按住拖选多张 →「出牌」；压不住点「不出」；可用「提示」。</p>'
    + '<p><b>牌型</b>：单 / 对 / 三带 / 顺子 / 连对 / 飞机 / 四带二 / 炸弹 / 王炸；炸弹可压非炸，更大炸可压小炸。</p>'
    + '<p><b>胜负</b>：任一方先出完即该方胜；积分按叫分 × 炸弹倍率等结算（以房间显示为准）。</p>'
  ),
  texas: () => (
    '<p><b>人数 / 结构</b>：默认 3 人无限注（NL）· 每人 2 张底牌 + 5 张公共牌，7 选 5 比牌。</p>'
    + '<p><b>流程</b>：盲注 → 翻前 → 翻牌 → 转牌 → 河牌 → 摊牌；可弃 / 跟 / 加 / 全下。</p>'
    + '<p><b>牌型（强→弱）</b>：皇家同花顺 › 同花顺 › 四条 › 葫芦 › 同花 › 顺子 › 三条 › 两对 › 一对 › 高牌。</p>'
    + '<p><b>边池</b>：All-in 按投入分层主池/边池，各自独立比牌分池。</p>'
    + '<p><b>金币 / 链游</b>：金币场用影子筹码；链游微盲 0.5/1、常规 1/2 等，带入 赛季积分。</p>'
  ),
  zhajinhua: () => (
    '<p><b>人数</b>：3 人 · 每人 3 张暗牌 · 比牌型大小。</p>'
    + '<p><b>牌型（强→弱）</b>：豹子 › 顺金 › 金花 › 顺子 › 对子 › 散牌。</p>'
    + '<p><b>235 规则</b>：场上有豹子时，2·3·5 仅克豹子；无豹子时 235 为最小散牌。</p>'
    + '<p><b>操作</b>：闷牌 / 看牌（看后单注×2）/ 跟注加注 / 比牌（费用=当前单注×2）/ All-in。</p>'
    + '<p><b>边池</b>：筹码不足可 All-in，按投入拆主池与边池结算；仅剩 1 人存活则立即收池。</p>'
  ),
  mahjong: () => (
    '<p><b>牌副</b>：四川标准 108 张（万条筒，无字牌）。</p>'
    + '<p><b>二人 / 四人经典</b>：首胡结算；无换三张、无定缺；点选打出，可碰杠胡。</p>'
    + '<p><b>血战到底</b>：换三张 → 定缺 → 胡牌后该家退场，最多 3 家胡完局。</p>'
    + '<p><b>血流成河</b>：换三张 → 定缺 → 胡后留场可再胡；杠/胡可实时计分。</p>'
    + '<p><b>杠</b>：明杠 / 补杠 / 暗杠（刮风下雨），分值随底分；链游测试场与金币场规则相同。</p>'
  ),
  guandan: () => (
    '<p><b>人数 / 牌副</b>：4 人 2v2 · 两副共 108 张 · 按级牌升级。</p>'
    + '<p><b>级牌 / 逢人配</b>：当前级牌点数高于 A、仅次于大小王；红心级牌为逢人配，可代除王外任意点。</p>'
    + '<p><b>牌型</b>：单 / 对 / 三张 / 三带二 / 木板(≥3连对) / 钢板 / 顺子 / 同花顺 / 炸弹(4+) / 天王炸。</p>'
    + '<p><b>炸弹序</b>：天王炸 › 8+炸 › 7炸 › 6炸 › 同花顺 › 5炸 › 4炸 › 普通牌；同张数同花顺压普通炸。</p>'
    + '<p><b>进贡</b>：双下双进贡、单下单进贡；进贡方共 2 大王可抗贡；收贡方还 ≤10 的牌。</p>'
    + '<p><b>接风 / 升级</b>：出完后无人压则队友接风；双下升 3 级、1+3 升 2、1+4 升 1；打 A 须双下或 1+3 才过 A。</p>'
    + '<p><b>操作</b>：点选手牌 →「出牌」/「不出」/「提示」；金币场与链游测试区均可开局。</p>'
  ),
  blackjack: () => (
    '<p><b>人数</b>：2～7 名玩家 + 庄家 · 桌内可选人数 · 人人发牌。</p>'
    + '<p><b>点数</b>：2–10 按面值；J/Q/K=10；A=1 或 11（软点）。尽量接近 21 且不超过。</p>'
    + '<p><b>流程</b>：选人数 → 下注 → 全员各 2 张（庄家 1 明 1 暗）→ 依次行动 → 庄家亮牌补牌 → 比点。</p>'
    + '<p><b>操作</b>：要牌 / 停牌 / 加倍 / 分牌 / 保险；其余座位 AI 自动要停。仅结算你的筹码。</p>'
    + '<p><b>庄家</b>：软/硬 17 均停牌（S17）；未满 17 必须要牌。</p>'
    + '<p><b>赔率</b>：普通赢 1:1；黑杰克赔 3:2；平局退注；爆牌立即负；保险赔 2:1。</p>'
  ),
};

/** Short lobby toast (claim success/fail etc). Uses rules-toast styling. */
function showLobbyToast(message, { ms = 3200 } = {}) {
  const text = String(message || '').trim();
  if (!text) return;
  let tip = document.getElementById('lobbyToast');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'lobbyToast';
    tip.className = 'rules-toast lobby-toast';
    tip.setAttribute('role', 'status');
    tip.setAttribute('aria-live', 'polite');
    document.body.appendChild(tip);
  }
  tip.innerHTML = `<strong>提示</strong><p>${text.replace(/[<>&]/g, (c) => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))}</p>`;
  tip.hidden = false;
  tip.removeAttribute('hidden');
  tip.classList.add('is-open');
  tip.style.setProperty('display', 'flex', 'important');
  tip.style.setProperty('visibility', 'visible', 'important');
  tip.style.setProperty('opacity', '1', 'important');
  tip.style.setProperty('pointer-events', 'auto', 'important');
  clearTimeout(tip._hideTimer);
  tip._hideTimer = setTimeout(() => {
    tip.classList.remove('is-open');
    tip.hidden = true;
    tip.setAttribute('hidden', '');
    tip.style.removeProperty('display');
  }, ms);
}

/** 玩法说明弹层（分栏，与引擎规则一致） */
function showRulesToast(initialTab = 'overview') {
  let tip = document.getElementById('rulesToast');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'rulesToast';
    tip.className = 'rules-toast';
    document.body.appendChild(tip);
  }

  const tabs = [
    { id: 'overview', label: '总览' },
    { id: 'doudizhu', label: '斗地主' },
    { id: 'texas', label: '德州' },
    { id: 'zhajinhua', label: '炸金花' },
    { id: 'mahjong', label: '麻将' },
    { id: 'guandan', label: '掼蛋' },
    { id: 'blackjack', label: '二十一点' },
  ];

  const safeTab = RULES_PANELS[initialTab] ? initialTab : 'overview';
  tip.innerHTML =
    '<strong>玩法说明</strong>'
    + `<nav class="rules-tabs" role="tablist">${tabs.map((t) => (
      `<button type="button" class="rules-tab${t.id === safeTab ? ' is-active' : ''}" data-rules-tab="${t.id}" role="tab">${t.label}</button>`
    )).join('')}</nav>`
    + `<div class="rules-body" id="rulesToastBody">${RULES_PANELS[safeTab]()}</div>`
    + '<button type="button" class="rules-toast-close">知道了</button>';

  tip.hidden = false;
  tip.removeAttribute('hidden');
  tip.classList.add('is-open');
  tip.style.setProperty('display', 'flex', 'important');
  tip.style.setProperty('visibility', 'visible', 'important');
  tip.style.setProperty('pointer-events', 'auto', 'important');
  tip.style.setProperty('opacity', '1', 'important');

  const body = tip.querySelector('#rulesToastBody');
  tip.querySelectorAll('.rules-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-rules-tab');
      if (!RULES_PANELS[id] || !body) return;
      tip.querySelectorAll('.rules-tab').forEach((b) => b.classList.toggle('is-active', b === btn));
      body.innerHTML = RULES_PANELS[id]();
      body.scrollTop = 0;
    });
  });

  tip.querySelector('.rules-toast-close')?.addEventListener('click', () => {
    tip.classList.remove('is-open');
    tip.hidden = true;
  }, { once: true });
}

function hideRulesToast() {
  const tip = document.getElementById('rulesToast');
  if (!tip) return;
  tip.hidden = true;
  tip.setAttribute('hidden', '');
  tip.classList.remove('is-open');
  tip.style.setProperty('display', 'none', 'important');
  tip.style.setProperty('visibility', 'hidden', 'important');
  tip.style.setProperty('pointer-events', 'none', 'important');
  tip.style.setProperty('opacity', '0', 'important');
}

if (typeof document !== 'undefined' && !window.__teaRulesTabGuard) {
  window.__teaRulesTabGuard = true;
  document.addEventListener('pointerdown', (ev) => {
    const tab = ev.target && ev.target.closest && ev.target.closest('[data-lobby-action]');
    const action = tab && tab.getAttribute('data-lobby-action');
    if (action && action !== 'rules') hideRulesToast();
  }, true);
}

function setLobbyView(view = 'home', gameType = null) {
  hideRulesToast();
  // 其它游戏已下线，统一并入链游测试区
  if (view === 'rooms' && (gameType === 'other' || gameType === 'candidate')) {
    gameType = 'real';
  }
  if (view === 'wardrobe') view = 'profile';
  hideDdzMatch();
  closeFriendRoom();
  // 切大厅页必须收桌，否则残留 #tableView 会盖住首页图标，表现为「游戏打不开」
  restoreLobbyChrome();
  lobbyView = view;
  nodes.shell?.classList.toggle('lobby-view-home', view === 'home');
  nodes.shell?.classList.toggle('lobby-view-games', view === 'games');
  nodes.shell?.classList.toggle('lobby-view-rooms', view === 'rooms');
  nodes.shell?.classList.toggle('lobby-view-profile', view === 'profile');
  nodes.shell?.classList.toggle('lobby-view-wardrobe', view === 'wardrobe');
  nodes.shell?.classList.toggle('lobby-view-recharge', view === 'recharge');
  nodes.shell?.classList.toggle('lobby-view-records', view === 'records');
  nodes.shell?.classList.toggle('lobby-view-chain', view === 'chain');

  $$('[data-lobby-view]').forEach((section) => {
    const sectionView = section.getAttribute('data-lobby-view');
    const roomGame = section.getAttribute('data-room-game');
    const show = sectionView === view && (view !== 'rooms' || roomGame === gameType);
    section.hidden = !show;
    section.classList.toggle('view-hidden', !show);
    // 同步 style，避免 CSS !important 把 [hidden] 顶穿仍显示
    if (show) {
      section.style.removeProperty('display');
      section.style.removeProperty('visibility');
      section.style.removeProperty('pointer-events');
      section.style.removeProperty('height');
      section.removeAttribute('hidden');
    } else {
      section.setAttribute('hidden', '');
      section.style.setProperty('display', 'none', 'important');
      section.style.setProperty('visibility', 'hidden', 'important');
      section.style.setProperty('pointer-events', 'none', 'important');
    }
  });
  // 滚回顶部（链游页主滚动在 .stage-content）
  try {
    document.querySelector('.stage-content')?.scrollTo?.({ top: 0 });
    document.querySelector('.lobby-stage')?.scrollTo?.({ top: 0 });
    document.querySelector('.lobby-shell')?.scrollTo?.({ top: 0 });
    window.scrollTo?.({ top: 0 });
  } catch (_) { /* ignore */ }

  $$('.mode-item').forEach((item) => {
    const sideGame = item.getAttribute('data-side-game');
    const action = item.getAttribute('data-lobby-action');
    const roomActive = view === 'rooms' && sideGame === gameType;
    item.classList.toggle('active',
      (view === 'home' && action === 'home')
      || (view === 'games' && action === 'open-games')
      || roomActive
      || (view === 'records' && action === 'records')
      || (view === 'chain' && action === 'chain')
      || (view === 'profile' && action === 'profile')
      || (view === 'profile' && action === 'wardrobe')
      || (view === 'recharge' && action === 'recharge'));
  });

  if (nodes.claimStatus && view === 'games') nodes.claimStatus.textContent = '请选择游戏类型';
  if (nodes.claimStatus && view === 'rooms') {
    if (gameType === 'texas') nodes.claimStatus.textContent = '请选择德州牌桌（金币场）';
    else if (gameType === 'zhajinhua') nodes.claimStatus.textContent = '请选择炸金花场次（可玩）';
    else if (gameType === 'mahjong') nodes.claimStatus.textContent = '请选择麻将玩法：四人 / 二人 / 血战 / 血流';
    else if (gameType === 'guandan') nodes.claimStatus.textContent = '掼蛋 2v2 · 选场次开局（金币 / 链游）';
    else if (gameType === 'blackjack') nodes.claimStatus.textContent = '二十一点 · 标准规则 · 选场次开局（金币 / 链游）';
    else if (gameType === 'real') nodes.claimStatus.textContent = `链游测试区：赛季积分 可入座 · 下方更多游戏快捷 · 演示账本`;
    else if (gameType === 'doudizhu') {
      renderDdzRooms(ddzVariant);
      nodes.claimStatus.textContent = '斗地主 · 经典叫分 · 超时 AI 补位';
    }
    else nodes.claimStatus.textContent = '请选择斗地主场次（金币场）';
  }
  document.querySelectorAll('.home-tab[data-lobby-action]').forEach((tab) => {
    const action = tab.getAttribute('data-lobby-action');
    tab.classList.toggle('is-active',
      (view === 'home' && action === 'home')
      || (view === 'recharge' && action === 'recharge')
      || (view === 'records' && action === 'records')
      || (view === 'chain' && action === 'chain')
      || ((view === 'profile' || view === 'wardrobe') && action === 'profile'));
  });
  syncP0Tabbar();
  if (view === 'profile') {
    renderProfileUi();
    openWardrobe();
  }
  if (view === 'recharge') renderRechargePage();
  if (view === 'records') renderRecordsPage();
  if (view === 'chain') chainCenterController.renderChainCenter();
}

// ─── 个人中心 / 补给 / 战绩 ─────────────────────────
function bindProfileUi() {
  document.getElementById('profileSaveBtn')?.addEventListener('click', saveProfileFromForm);
  document.getElementById('profileResetBtn')?.addEventListener('click', () => {
    appState.profile = { ...DEFAULT_PROFILE };
    saveState();
    applyProfileToRuntime();
    renderProfileUi();
    setProfileStatus('已恢复默认资料');
  });
  // 自定义形象上传
  document.getElementById('customCharFile')?.addEventListener('change', (e) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    readImageAsDataUrl(file, { maxH: 520, maxW: 360 }).then((dataUrl) => {
      if (!dataUrl) {
        setProfileStatus('图片读取失败，请转换 PNG/JPG');
        return;
      }
      const p = getProfile();
      p.customAvatarSrc = dataUrl;
      p.customAvatarLabel = (file.name || '我的形象').replace(/\.[^.]+$/, '').slice(0, 10) || '我的形象';
      p.avatarId = 'custom';
      charPickerTab = '自定义';
      saveState();
      applyProfileToRuntime();
      renderProfileUi({ keepDraft: true });
      setProfileStatus('自定义形象已应用（记得点保存资料）');
    }).catch(() => setProfileStatus('图片过大或格式不支持'));
  });
  document.getElementById('clearCustomCharBtn')?.addEventListener('click', () => {
    const p = getProfile();
    p.customAvatarSrc = '';
    p.customAvatarLabel = '我的形象';
    if (p.avatarId === 'custom') p.avatarId = DEFAULT_PROFILE.avatarId;
    saveState();
    applyProfileToRuntime();
    renderProfileUi({ keepDraft: true });
    setProfileStatus('已清除自定义形象');
  });
  // 自定义皮肤调节
  const bindSkinSlider = (id, key, cast = Number) => {
    document.getElementById(id)?.addEventListener('input', (e) => {
      const p = getProfile();
      p[key] = cast(e.target.value);
      p.costumeId = 'custom';
      if (key === 'customSkinHue') {
        // 同步色块预览
        p.customSkinColor = hueToHex(Number(p.customSkinHue) || 270);
      }
      applyProfileToRuntime();
      renderProfileUi({ keepDraft: true });
    });
  };
  bindSkinSlider('customSkinHue', 'customSkinHue');
  bindSkinSlider('customSkinSat', 'customSkinSat');
  bindSkinSlider('customSkinBright', 'customSkinBright');
  document.getElementById('customSkinColor')?.addEventListener('input', (e) => {
    const p = getProfile();
    p.customSkinColor = e.target.value || '#c084fc';
    p.costumeId = 'custom';
    applyCostumeTheme('custom');
    applyProfileToRuntime();
    renderProfileUi({ keepDraft: true });
  });

  document.getElementById('copyAddressBtn')?.addEventListener('click', async () => {
    const addr = ensureUsdtAddress();
    try {
      await navigator.clipboard.writeText(addr);
      setRechargeCopyStatus('测试编号已复制');
    } catch (_) {
      const input = document.getElementById('rechargeAddressShow');
      if (input) {
        input.value = addr;
        input.select();
        document.execCommand('copy');
        setRechargeCopyStatus('测试编号已复制');
      } else setRechargeCopyStatus('复制失败，请手动选择地址');
    }
  });

  document.getElementById('usdtNetworkSelect')?.addEventListener('change', (e) => {
    const p = getProfile();
    p.usdtNetwork = e.target.value || '测试网A';
    ensureUsdtAddress();
    saveState();
    renderRechargePage({ focus: 'usdt', keepStatus: true });
    setRechargeStatus(`已切换 ${p.usdtNetwork} 测试编号 · 请使用对应网络（演示）`);
  });

  // 发放赛季积分到账本
  document.querySelectorAll('[data-usdt-deposit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const usdt = Number(btn.getAttribute('data-usdt-deposit')) || 0;
      depositUsdt(usdt);
    });
  });
  // 兼容旧 data-crypto-pack
  document.querySelectorAll('[data-crypto-pack]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const usdt = Number(btn.getAttribute('data-crypto-pack')) || 0;
      depositUsdt(usdt);
    });
  });
  document.getElementById('customRechargeBtn')?.addEventListener('click', () => {
    const raw = Number(document.getElementById('customUsdtRecharge')?.value) || 0;
    depositUsdt(raw);
  });
  document.getElementById('customUsdtRecharge')?.addEventListener('input', () => {
    updateCustomUsdtRechargeHint();
  });
  // 赛季积分 → 金币
  document.querySelectorAll('[data-usdt-buy-ingot]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const usdt = Number(btn.getAttribute('data-usdt-buy-ingot')) || 0;
      buyIngotWithUsdt(usdt);
    });
  });
  document.getElementById('customExchangeBtn')?.addEventListener('click', () => {
    const raw = Number(document.getElementById('customUsdtExchange')?.value) || 0;
    buyIngotWithUsdt(raw);
  });
  document.getElementById('customUsdtExchange')?.addEventListener('input', () => {
    updateCustomExchangeHint();
  });

  document.querySelectorAll('[data-record-filter]').forEach((tab) => {
    tab.addEventListener('click', () => {
      recordFilter = tab.getAttribute('data-record-filter') || 'all';
      document.querySelectorAll('[data-record-filter]').forEach((t) => {
        t.classList.toggle('active', t === tab);
      });
      renderRecordsPage();
    });
  });
}

function renderProfileUi(opts = {}) {
  const keepDraft = Boolean(opts.keepDraft);
  const p = getProfile();
  // 补齐新字段
  if (p.customSkinColor == null) p.customSkinColor = DEFAULT_PROFILE.customSkinColor;
  if (p.customSkinHue == null) p.customSkinHue = DEFAULT_PROFILE.customSkinHue;
  if (p.customSkinSat == null) p.customSkinSat = DEFAULT_PROFILE.customSkinSat;
  if (p.customSkinBright == null) p.customSkinBright = DEFAULT_PROFILE.customSkinBright;

  const nameInput = document.getElementById('profileNameInput');
  const payInput = document.getElementById('profilePayAddress');
  const bioInput = document.getElementById('profileBio');
  if (nameInput && !keepDraft) nameInput.value = p.name || '';
  if (payInput && !keepDraft) payInput.value = p.payAddress || '';
  if (bioInput && !keepDraft) bioInput.value = p.bio || '';

  const draftName = keepDraft && nameInput?.value?.trim()
    ? nameInput.value.trim()
    : (p.name || DEFAULT_PROFILE.name);

  const prevImg = document.getElementById('profilePreviewImg');
  if (prevImg) {
    prevImg.hidden = true;
    prevImg.setAttribute('hidden', '');
    prevImg.style.setProperty('display', 'none', 'important');
  }
  const prevName = document.getElementById('profilePreviewName');
  if (prevName) prevName.textContent = draftName;
  const prevId = document.getElementById('profilePreviewId');
  if (prevId) prevId.textContent = `ID ${p.playerId} · Lv.${p.level}`;
  const prevIngots = document.getElementById('profilePreviewIngots');
  if (prevIngots) prevIngots.textContent = format(appState.ingots);
  const costumeTag = document.getElementById('profileCostumeTag');
  if (costumeTag) {
    const c = getCostume(p.costumeId);
    costumeTag.textContent = c.label;
    costumeTag.style.background = p.costumeId === 'custom' ? (p.customSkinColor || c.color) : c.color;
  }

  // ── 形象选择（与衣服分离）──
  const avatarPicker = document.getElementById('avatarPicker');
  const tabs = document.getElementById('charPickerTabs');
  if (tabs) {
    const tabList = ['女性', '男性', '动物', '自定义'];
    // 若当前形象在某分类，高亮该 tab
    const cur = getCharOption(p.avatarId);
    if (!keepDraft && cur.group && tabList.includes(cur.group)) charPickerTab = cur.group;
    if (p.avatarId === 'custom') charPickerTab = '自定义';
    tabs.innerHTML = tabList.map((t) => (
      `<button type="button" class="char-tab ${charPickerTab === t ? 'active' : ''}" data-char-tab="${t}">${t}</button>`
    )).join('');
    tabs.querySelectorAll('[data-char-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        charPickerTab = btn.getAttribute('data-char-tab') || '女性';
        renderProfileUi({ keepDraft: true });
      });
    });
  }
  if (avatarPicker) {
    let list = [];
    if (charPickerTab === '自定义') {
      list = p.customAvatarSrc
        ? [{ id: 'custom', label: p.customAvatarLabel || '我的形象', style: '上传', base: p.customAvatarSrc, kind: 'custom', group: '自定义' }]
        : [];
      avatarPicker.innerHTML = list.length
        ? `<div class="char-pick-flat"><div class="char-pick-grid">${list.map((a) => charPickBtn(a, p.avatarId)).join('')}</div></div>`
        : '<p class="field-hint">尚未上传 · 请使用下方「上传形象」</p>';
    } else {
      // 平铺：不再按 性感/清纯/种属 分子栏
      list = CHAR_OPTIONS.filter((c) => c.group === charPickerTab && !opsDisabledCharacters.has(c.id));
      avatarPicker.innerHTML = list.length
        ? `<div class="char-pick-flat"><div class="char-pick-grid">${list.map((a) => charPickBtn(a, p.avatarId)).join('')}</div></div>`
        : '<p class="field-hint">暂无形象</p>';
    }
    avatarPicker.querySelectorAll('[data-avatar-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-avatar-id');
        const prof = getProfile();
        prof.avatarId = id;
        // 换人：重置为本人物默认衣服（避免沿用他人换装 id），配饰保留
        prof.costumeId = 'default';
        prof._lastOutfitId = 'default';
        const wardrobe = getWardrobeState();
        wardrobe.savedAvatar = { ...wardrobe.savedAvatar, baseAvatarId: id, equipment: { ...wardrobe.savedAvatar.equipment, full_body: null } };
        applyProfileToRuntime();
        renderProfileUi({ keepDraft: true });
      });
    });
  }

  const skinPicker = document.getElementById('lobbySkinPicker');
  if (skinPicker) {
    const currentSkin = document.documentElement.dataset.theme || 'classic-green';
    const skins = listEnabledThemes();
    skinPicker.innerHTML = skins.map((skin) => (
      `<button type="button" class="pick-item lobby-skin-swatch ${skin.id === currentSkin ? 'active' : ''}" data-lobby-skin="${skin.id}">
        <i class="theme-swatch theme-swatch-${skin.id}" aria-hidden="true"></i>
        <span>${skin.label}</span>
        <small>大厅皮肤</small>
      </button>`
    )).join('') || '<p class="field-hint">后台暂未开放大厅皮肤</p>';
    skinPicker.querySelectorAll('[data-lobby-skin]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const skinId = btn.getAttribute('data-lobby-skin');
        applyingLinkedAppearance = true;
        try { applyTheme(skinId); } finally { applyingLinkedAppearance = false; }
        if (getProfile().linkSkinAndClothes !== false) {
          const clothingId = clothingIdForTheme(skinId);
          if (clothingId) applyProfileClothingStyle(clothingId, { fromTheme: true });
        }
        renderProfileUi({ keepDraft: true });
      });
    });
  }
  const linkToggle = document.getElementById('linkSkinClothesToggle');
  if (linkToggle) linkToggle.checked = p.linkSkinAndClothes !== false;

  // ── 衣服：换装=同人不同衣服；染色=同人改色 ──
  const costumePicker = document.getElementById('costumePicker');
  const costumeHint = document.getElementById('costumePickerHint');
  const chNow = getCharOption(p.avatarId);
  if (costumeHint) {
    const listed = listCostumesForChar(p.avatarId);
    const nOutfits = listed.filter((c) => c.kindLabel === '换装' || c.kindLabel === '默认').length;
    const nStyles = listed.filter((c) => c.kindLabel === '样式').length;
    costumeHint.textContent = `当前「${chNow.label}」· ${nOutfits} 套换装 · ${nStyles} 款衣服样式 · 配饰叠在人物上 · 皮肤可互配`;
  }
  if (costumePicker) {
    const all = listCostumesForChar(p.avatarId);
    if (!all.some((c) => c.id === p.costumeId)) {
      p.costumeId = 'default';
      delete p._lastOutfitId;
    }
    const outfits = all.filter((c) => c.kindLabel === '默认' || c.kindLabel === '换装');
    const styles = all.filter((c) => c.kindLabel === '样式');
    const dyes = all.filter((c) => c.kindLabel === '染色' || c.kindLabel === '自定义');
    const dyeBaseThumb = getAvatarSrc(p.avatarId, p._lastOutfitId && isOutfitCostume(p._lastOutfitId) ? p._lastOutfitId : 'default');
    const renderSwatch = (c) => {
      const color = c.id === 'custom' ? (p.customSkinColor || c.color) : c.color;
      const isDye = c.kindLabel === '染色' || c.kindLabel === '自定义';
      const thumb = isDye ? dyeBaseThumb : (c.thumb || chNow.base);
      return (
        `<button type="button" class="pick-item costume-swatch costume-${isDye ? 'dye' : 'outfit'} ${p.costumeId === c.id ? 'active' : ''}" data-costume-id="${c.id}" title="${c.label} · ${isDye ? '只染衣服不改肤色' : c.kindLabel}">
          ${isDye
          ? `<span class="costume-dye-preview"><img class="costume-thumb" src="${thumb}" alt="" data-dye-preview="${c.id}" data-dye-base="${thumb}" data-dye-color="${color}" /><i style="background:${color}"></i></span>`
          : `<img class="costume-thumb" src="${thumb}" alt="${c.label}" width="48" height="72" loading="lazy" />`}
          <span>${c.label}</span>
          <small>${isDye ? '衣服色' : c.kindLabel}</small>
        </button>`
      );
    };
    costumePicker.innerHTML = (
      `<div class="costume-block"><p class="costume-block-title">换装（同一人物 · 不同衣服）</p><div class="costume-row">${outfits.map(renderSwatch).join('')}</div></div>`
      + (styles.length
        ? `<div class="costume-block costume-block-style"><p class="costume-block-title">衣服样式（可与大厅皮肤互配）</p><div class="costume-row">${styles.map(renderSwatch).join('')}</div></div>`
        : '')
      + (dyes.length
        ? `<div class="costume-block costume-block-dye"><p class="costume-block-title">染色（只改衣服颜色 · 不改肤色）</p><div class="costume-row">${dyes.map(renderSwatch).join('')}</div></div>`
        : '')
    );
    // 异步生成「只染衣服」缩略图预览
    costumePicker.querySelectorAll('img[data-dye-preview]').forEach((thumbImg) => {
      const base = thumbImg.getAttribute('data-dye-base');
      const color = thumbImg.getAttribute('data-dye-color');
      const dyeId = thumbImg.getAttribute('data-dye-preview');
      if (!base || !color) return;
      dyeClothesSrc(base, color, {
        maxEdge: 180,
        strength: 0.9,
        cacheKey: `thumb|${base}|${dyeId}|${color}`,
      }).then((dyed) => {
        if (thumbImg.getAttribute('data-dye-preview') === dyeId) thumbImg.src = dyed;
      }).catch(() => {});
    });
    costumePicker.querySelectorAll('[data-costume-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cid = btn.getAttribute('data-costume-id');
        const prof = getProfile();
        if (isClothingStyleCostume(cid)) {
          applyProfileClothingStyle(cid);
        } else {
          prof.costumeId = cid;
          if (cid && isOutfitCostume(cid)) prof._lastOutfitId = cid;
          const wardrobe = getWardrobeState();
          wardrobe.savedAvatar = {
            ...wardrobe.savedAvatar,
            equipment: { ...wardrobe.savedAvatar.equipment, full_body: null },
          };
          applyProfileToRuntime();
        }
        renderProfileUi({ keepDraft: true });
      });
    });
  }

  const gearPicker = document.getElementById('gearPicker');
  if (gearPicker) {
    const wardrobe = getWardrobeState();
    const equipment = wardrobe.savedAvatar.equipment || DEFAULT_EQUIPMENT;
    const chKind = getCharOption(p.avatarId).kind;
    const items = listOverlayItems().filter((item) => item.gender === 'unisex' || item.gender === chKind);
    gearPicker.innerHTML = `<button type="button" class="pick-item costume-swatch ${!ACTIVE_EQUIPMENT_SLOTS.some((slot) => equipment[slot]) ? 'active' : ''}" data-gear-clear="1"><span>卸下</span><small>配饰</small></button>`
      + items.map((item) => {
        const active = equipment[item.category] === item.id;
        return `<button type="button" class="pick-item costume-swatch ${active ? 'active' : ''}" data-gear-id="${item.id}">
          <img class="costume-thumb" src="${item.thumbnail}" alt="" width="48" height="72" loading="lazy" />
          <span>${item.name}</span>
          <small>${overlaySlotLabel(item.category)}</small>
        </button>`;
      }).join('');
    gearPicker.querySelectorAll('[data-gear-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const itemId = btn.getAttribute('data-gear-id');
        const w = getWardrobeState();
        const result = equipItem(w.savedAvatar.equipment, itemId);
        if (!result.ok) return;
        w.savedAvatar = { ...w.savedAvatar, equipment: result.equipment };
        applyProfileToRuntime();
        renderProfileUi({ keepDraft: true });
      });
    });
    gearPicker.querySelector('[data-gear-clear]')?.addEventListener('click', () => {
      const w = getWardrobeState();
      let equipmentNext = { ...w.savedAvatar.equipment };
      for (const slot of ACTIVE_EQUIPMENT_SLOTS) {
        equipmentNext = unequipItem(equipmentNext, slot).equipment;
      }
      w.savedAvatar = { ...w.savedAvatar, equipment: equipmentNext };
      applyProfileToRuntime();
      renderProfileUi({ keepDraft: true });
    });
  }

  // 同步自定义皮肤滑杆
  const hueEl = document.getElementById('customSkinHue');
  const satEl = document.getElementById('customSkinSat');
  const brightEl = document.getElementById('customSkinBright');
  const colorEl = document.getElementById('customSkinColor');
  if (hueEl && !keepDraft) hueEl.value = String(p.customSkinHue ?? 270);
  if (satEl && !keepDraft) satEl.value = String(p.customSkinSat ?? 1.15);
  if (brightEl && !keepDraft) brightEl.value = String(p.customSkinBright ?? 1.05);
  if (colorEl) colorEl.value = p.customSkinColor || '#c084fc';
  const hueVal = document.getElementById('customSkinHueVal');
  if (hueVal) hueVal.textContent = `${Math.round(Number(hueEl?.value ?? p.customSkinHue) || 270)}°`;
  const panel = document.getElementById('customSkinPanel');
  if (panel) panel.hidden = p.costumeId !== 'custom';
  const customHint = document.getElementById('customCharHint');
  if (customHint) {
    customHint.textContent = p.customAvatarSrc
      ? `已上传：${p.customAvatarLabel || '我的形象'}（本地保存）`
      : '支持 PNG/JPG，全身立绘最佳；本地压缩后保存';
  }
  mountCharLogos();
  if (document.getElementById('wardrobeGrid')) {
    if (!wardrobePreviewAvatar) openWardrobe();
    else renderWardrobe();
  }
}

function charPickBtn(a, activeId) {
  const style = a.style || (a.kind === 'animal' ? '动物' : a.kind === 'female' ? '女性' : a.kind === 'custom' ? '自定义' : '男性');
  return (
    `<button type="button" class="pick-item char-pick ${activeId === a.id ? 'active' : ''}" data-avatar-id="${a.id}" title="${a.label} · ${style}">
      <img class="char-pick-img char-fullbody" src="${a.base}" alt="${a.label}" width="72" height="120" loading="lazy" />
      <span>${a.label}</span>
      <small class="char-style-tag">${style}</small>
    </button>`
  );
}

function saveProfileFromForm() {
  const p = getProfile();
  const name = (document.getElementById('profileNameInput')?.value || '').trim().slice(0, 12);
  const pay = (document.getElementById('profilePayAddress')?.value || '').trim().slice(0, 128);
  const bio = (document.getElementById('profileBio')?.value || '').trim().slice(0, 40);
  if (!name) {
    setProfileStatus('昵称不能为空');
    return;
  }
  p.name = name;
  p.payAddress = pay || DEFAULT_PROFILE.payAddress;
  p.bio = bio;
  // 同步滑杆当前值
  const hue = Number(document.getElementById('customSkinHue')?.value);
  const sat = Number(document.getElementById('customSkinSat')?.value);
  const bright = Number(document.getElementById('customSkinBright')?.value);
  const color = document.getElementById('customSkinColor')?.value;
  if (Number.isFinite(hue)) p.customSkinHue = hue;
  if (Number.isFinite(sat)) p.customSkinSat = sat;
  if (Number.isFinite(bright)) p.customSkinBright = bright;
  if (color) p.customSkinColor = color;
  if (wardrobePreviewAvatar) {
    try { saveWardrobePreview(); } catch (_) { /* ignore */ }
  }
  saveState();
  applyProfileToRuntime();
  renderProfileUi();
  setProfileStatus('资料已保存 · 形象与衣橱已同步到牌桌');
}

/** 读取图片并压缩为 dataURL（控制 localStorage 体积） */
function readImageAsDataUrl(file, { maxW = 360, maxH = 520 } = {}) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) {
      reject(new Error('not_image'));
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      reject(new Error('too_large'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read_fail'));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        const scale = Math.min(1, maxW / width, maxH / height);
        width = Math.max(1, Math.round(width * scale));
        height = Math.max(1, Math.round(height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        try {
          resolve(canvas.toDataURL('image/png'));
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error('img_fail'));
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function hueToHex(h) {
  // 简易 HSL→hex（S=70% L=65%）
  const s = 0.7;
  const l = 0.65;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (n) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

function setProfileStatus(msg) {
  const el = document.getElementById('profileSaveStatus');
  if (el) el.textContent = msg;
}

function setRechargeCopyStatus(msg) {
  const el = document.getElementById('rechargeCopyStatus');
  if (el) el.textContent = msg;
}

function setRechargeStatus(msg) {
  const st = document.getElementById('rechargeStatus');
  if (st) st.textContent = msg;
}

/**
 * 模拟查看测试码/测试记账到账 → 发放进赛季积分账本（内部账本，不连接外部网络）
 */
function depositUsdt(amount) {
  const amt = Math.round((Number(amount) || 0) * 100) / 100;
  if (!(amt > 0)) {
    setRechargeStatus('请输入有效 赛季积分 数量');
    return false;
  }
  appState.usdt = Math.round((getUsdt() + amt) * 100) / 100;
  // 流水
  appState.records.unshift({
    roomName: '赛季积分账本·发放',
    result: '入',
    score: amt,
    at: new Date().toISOString(),
    game: 'wallet',
    currency: 'usdt',
  });
  appState.records = appState.records.slice(0, 50);
  saveState();
  renderAccount();
  renderRechargePage({ focus: 'usdt', keepStatus: true });
  const net = getProfile().usdtNetwork || '测试网A';
  setRechargeStatus(
    `模拟发放 +${formatCrypto(amt)} 赛季积分（${net}）· 账本余额 ${formatCrypto(getUsdt())} · 演示账本不可转为现金或外部资产`,
  );
  return true;
}

/** 兼容旧名：直接发放 */
function rechargeUsdt(amount) {
  return depositUsdt(amount);
}

function updateCustomUsdtRechargeHint() {
  const hint = document.getElementById('customRechargeHint');
  if (!hint) return;
  const raw = Number(document.getElementById('customUsdtRecharge')?.value) || 0;
  if (!(raw > 0)) {
    hint.textContent = '发放进赛季积分账本（演示 · 点「模拟发放」）· 可直接入座链游测试场';
    return;
  }
  const amt = Math.round(raw * 100) / 100;
  hint.textContent = `确认后账本 +${formatCrypto(amt)} 赛季积分（发放余额将变为 ${formatCrypto(getUsdt() + amt)}）`;
}

/** 赛季积分 → 金币（内部折算） */
function buyIngotWithUsdt(amount) {
  const amt = Math.round((Number(amount) || 0) * 100) / 100;
  if (!(amt > 0)) {
    setRechargeStatus('请输入有效 赛季积分 数量');
    return false;
  }
  if (getUsdt() + 1e-9 < amt) {
    setRechargeStatus(`赛季积分 不足（当前 ${formatCrypto(getUsdt())}）`);
    return false;
  }
  const gain = Math.floor(amt * INGOT_PER_INTERNAL_UNIT + 1e-9);
  adjustUsdt(-amt);
  appState.ingots += gain;
  saveState();
  renderAccount();
  setRechargeStatus(`已用 ${formatCrypto(amt)} 赛季积分 转换 ${format(gain)} 金币`);
  return true;
}

function updateCustomExchangeHint() {
  const hint = document.getElementById('customExchangeHint');
  if (!hint) return;
  const raw = Number(document.getElementById('customUsdtExchange')?.value) || 0;
  if (!(raw > 0)) {
    hint.textContent = `汇率：3 赛季积分 转换 ${format(INGOT_PER_PACK)} 金币（即 1 赛季积分 = ${format(INGOT_PER_INTERNAL_UNIT)} 金币）`;
    return;
  }
  const amt = Math.round(raw * 100) / 100;
  const gain = Math.floor(amt * INGOT_PER_INTERNAL_UNIT + 1e-9);
  const enough = getUsdt() + 1e-9 >= amt;
  hint.textContent = enough
    ? `可获得 ${format(gain)} 金币`
    : '赛季积分 不足';
}

function renderRechargePage(opts = {}) {
  const focus = opts.focus || 'usdt';
  const addr = ensureUsdtAddress();
  const net = getProfile().usdtNetwork || '测试网A';

  const addrInput = document.getElementById('rechargeAddressShow');
  if (addrInput) addrInput.value = addr;
  const netSelect = document.getElementById('usdtNetworkSelect');
  if (netSelect && netSelect.value !== net) netSelect.value = net;
  const netPill = document.getElementById('usdtNetworkPill');
  if (netPill) netPill.textContent = net;
  const memo = document.getElementById('usdtMemoTag');
  if (memo) memo.textContent = getUsdtMemo();

  setRechargeCopyStatus(
    `${net} · 专属测试编号 · 查看测试码或确认后点「模拟发放」发放`,
  );
  if (!opts.keepStatus) {
    setRechargeStatus(
      focus === 'usdt'
        ? `赛季积分账本 ${formatCrypto(getUsdt())} · 选面额发放后可入座链游测试场，或转换金币`
        : `内部账本：赛季积分 / 金币 · 演示不可转为现金或外部资产`,
    );
  }

  const usdtPrev = document.getElementById('rechargeUsdtPreview');
  if (usdtPrev) usdtPrev.textContent = formatCrypto(getUsdt());
  const ingotPrev = document.getElementById('rechargeIngotPreview');
  if (ingotPrev) ingotPrev.textContent = format(appState.ingots);
  const ingotSide = document.getElementById('rechargeIngotPreviewSide');
  if (ingotSide) ingotSide.textContent = format(appState.ingots);
  const cryptoPrev = document.getElementById('rechargeCryptoPreview');
  if (cryptoPrev) cryptoPrev.textContent = formatCrypto(getUsdt());

  // 二维码内容：网络 + 地址 + memo（演示）
  const qrPayload = JSON.stringify({
    asset: '赛季积分',
    network: net,
    address: addr,
    memo: getUsdtMemo(),
    demo: true,
    app: 'TeaParlor',
  });
  drawRechargeQr(qrPayload);

  const panels = {
    ingot: document.getElementById('ingotSupplyPanel'),
    usdt: document.getElementById('usdtRechargePanel'),
    trial: document.getElementById('usdtIngotPanel') || document.getElementById('trialGoldPanel'),
  };
  Object.values(panels).forEach((el) => el?.classList.remove('is-focus'));
  const focusKey = focus === 'ingot' ? 'ingot' : (focus === 'trial' || focus === 'usdt-ingot') ? 'trial' : 'usdt';
  panels[focusKey]?.classList.add('is-focus');
  try {
    panels[focusKey]?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  } catch (_) {}

  const goldPanel = document.getElementById('usdtIngotPanel') || document.getElementById('trialGoldPanel');
  if (goldPanel) goldPanel.hidden = false;
  updateCustomExchangeHint();
  updateCustomUsdtRechargeHint();
}

/** 测试码：优先在线 API，失败则本地绘制可扫风格矩阵 */
function drawRechargeQr(text) {
  const canvas = document.getElementById('rechargeQrCanvas');
  const img = document.getElementById('rechargeQrImg');
  if (!canvas) return;
  const data = String(text || 'TeaParlor');

  // 尝试在线二维码
  if (img) {
    const api = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=8&data='
      + encodeURIComponent(data);
    img.onload = () => {
      img.hidden = false;
      canvas.hidden = true;
    };
    img.onerror = () => {
      img.hidden = true;
      canvas.hidden = false;
      paintLocalQr(canvas, data);
    };
    img.src = api;
  }
  // 同步画本地底图，防止外网失败时空白
  paintLocalQr(canvas, data);
}

function paintLocalQr(canvas, text) {
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const n = 25;
  const cell = size / n;
  const seed = hashStr(text);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#1a1a2e';

  // 定位角
  drawFinder(ctx, 0, 0, cell);
  drawFinder(ctx, (n - 7) * cell, 0, cell);
  drawFinder(ctx, 0, (n - 7) * cell, cell);

  let s = seed;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (inFinder(x, y, n)) continue;
      s = (s * 1664525 + 1013904223) >>> 0;
      if (s & 1) ctx.fillRect(x * cell, y * cell, cell + 0.5, cell + 0.5);
    }
  }
  // 中心品牌点
  ctx.fillStyle = '#c9872d';
  ctx.fillRect(11 * cell, 11 * cell, 3 * cell, 3 * cell);
}

function inFinder(x, y, n) {
  const inBox = (bx, by) => x >= bx && x < bx + 7 && y >= by && y < by + 7;
  return inBox(0, 0) || inBox(n - 7, 0) || inBox(0, n - 7);
}

function drawFinder(ctx, ox, oy, cell) {
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(ox, oy, 7 * cell, 7 * cell);
  ctx.fillStyle = '#fff';
  ctx.fillRect(ox + cell, oy + cell, 5 * cell, 5 * cell);
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(ox + 2 * cell, oy + 2 * cell, 3 * cell, 3 * cell);
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function recordGameKey(rec) {
  if (rec.currency === 'crypto') return rec.game || 'other';
  if (rec.game === 'texas' || /德州/.test(rec.roomName || '')) return 'texas';
  if (rec.game === 'doudizhu' || /斗地主|新手|经典|好友|微注|标准桌|高注/.test(rec.roomName || '')) return 'doudizhu';
  return 'other';
}

function summarizeRecords(list) {
  const rows = list || [];
  const by = {
    all: { label: '全部', win: 0, lose: 0, score: 0, count: 0 },
    doudizhu: { label: '斗地主', win: 0, lose: 0, score: 0, count: 0 },
    texas: { label: '德州扑克', win: 0, lose: 0, score: 0, count: 0 },
    other: { label: '其他', win: 0, lose: 0, score: 0, count: 0 },
  };
  for (const r of rows) {
    const key = recordGameKey(r);
    const bucket = by[key] || by.other;
    const s = Number(r.score) || 0;
    bucket.count += 1;
    bucket.score += s;
    by.all.count += 1;
    by.all.score += s;
    if (r.result === '胜' || s > 0) {
      bucket.win += 1;
      by.all.win += 1;
    } else if (r.result === '负' || s < 0) {
      bucket.lose += 1;
      by.all.lose += 1;
    }
  }
  return by;
}

function renderRecordsPage() {
  const all = appState.records || [];
  const by = summarizeRecords(all);
  const summary = document.getElementById('recordsSummary');
  if (summary) {
    summary.innerHTML = ['all', 'doudizhu', 'texas', 'other'].map((k) => {
      const b = by[k];
      if (k !== 'all' && b.count === 0) {
        return `<div class="rec-stat"><span>${b.label}</span><strong>暂无</strong><small>0 局</small></div>`;
      }
      return `<div class="rec-stat ${k === recordFilter ? 'active' : ''}">
        <span>${b.label}</span>
        <strong>${b.win} 胜 ${b.lose} 负</strong>
        <small>${b.count} 局 · 分 ${b.score >= 0 ? '+' : ''}${b.score}</small>
      </div>`;
    }).join('');
  }

  const filtered = recordFilter === 'all'
    ? all
    : all.filter((r) => recordGameKey(r) === recordFilter);

  const list = document.getElementById('recordsList');
  if (!list) return;
  if (!filtered.length) {
    list.innerHTML = '<p class="records-empty">该分类暂无战绩，去玩一局吧</p>';
    return;
  }
  list.innerHTML = filtered.slice(0, 30).map((r) => {
    const s = Number(r.score) || 0;
    const cls = s > 0 ? 'pos' : (s < 0 ? 'neg' : 'flat');
    const g = recordGameKey(r);
    const gLabel = g === 'texas' ? '德州' : (g === 'doudizhu' ? '斗地主' : '其他');
    const curLabel = '金币';
    const when = r.at ? new Date(r.at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
    const scoreTxt = r.currency === 'crypto'
      ? `${s >= 0 ? '+' : ''}${formatCrypto(s)}`
      : `${s >= 0 ? '+' : ''}${s}`;
    return `<div class="rec-row">
      <div>
        <strong>${escapeHtml(r.roomName || '对局')}</strong>
        <small>${gLabel} · ${curLabel} · ${when}</small>
      </div>
      <div class="rec-result">
        <span class="${r.result === '胜' ? 'pos' : 'neg'}">${escapeHtml(r.result || (s >= 0 ? '胜' : '负'))}</span>
        <b class="${cls}">${scoreTxt}</b>
      </div>
    </div>`;
  }).join('');
}

/** 鼠标按住划过手牌选中区间（QQ/JJ 常见交互） */
function bindDragSelect() {
  const area = nodes.handArea;
  if (!area) return;

  area.addEventListener('mousedown', (e) => {
    if (!canSelectHand()) return;
    const btn = e.target.closest('.playing-card');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    dragActive = true;
    dragMoved = false;
    dragStartIndex = Number(btn.dataset.index);
    dragBaseSelected = new Set(selected);
    suppressNextHandClick = true;
    // 按下时先切换起点，划过后改为区间覆盖。
    toggleHandCard(btn);
  });

  area.addEventListener('mouseover', (e) => {
    if (!dragActive || !canSelectHand()) return;
    const btn = e.target.closest('.playing-card');
    if (!btn) return;
    const end = Number(btn.dataset.index);
    if (end === dragStartIndex && !dragMoved) return;
    dragMoved = true;
    applyDragRange(dragStartIndex, end);
  });

  area.addEventListener('touchstart', (e) => {
    if (!canSelectHand()) return;
    const t = e.touches[0];
    const el = document.elementFromPoint(t.clientX, t.clientY);
    const btn = el?.closest?.('.playing-card');
    if (!btn) return;
    dragActive = true;
    dragMoved = false;
    dragStartIndex = Number(btn.dataset.index);
    dragBaseSelected = new Set(selected);
    suppressNextHandClick = true;
    toggleHandCard(btn);
  }, { passive: true });

  area.addEventListener('touchmove', (e) => {
    if (!dragActive || !canSelectHand()) return;
    const t = e.touches[0];
    const el = document.elementFromPoint(t.clientX, t.clientY);
    const btn = el?.closest?.('.playing-card');
    if (!btn) return;
    dragMoved = true;
    applyDragRange(dragStartIndex, Number(btn.dataset.index));
  }, { passive: true });

  const endDrag = () => {
    if (!dragActive) return;
    dragActive = false;
    dragStartIndex = -1;
    dragBaseSelected = null;
    updateHintFromSelection();
    if (nodes.tableStatus) nodes.tableStatus.textContent = statusLine();
    // 短延迟后清 dragMoved，避免 mouseup 后的 click 再 toggle
    setTimeout(() => {
      dragMoved = false;
      suppressNextHandClick = false;
    }, 350);
  };
  window.addEventListener('mouseup', endDrag);
  window.addEventListener('touchend', endDrag);
  area.addEventListener('dragstart', (e) => e.preventDefault());
}

function canSelectHand() {
  return Boolean(game && game.phase === 'play' && game.currentPlayer === HUMAN);
}

function toggleHandCard(btn) {
  if (!btn || !canSelectHand()) return false;
  const id = btn.dataset.id;
  if (!id) return false;
  if (selected.has(id)) selected.delete(id);
  else selected.add(id);
  paintHandSelection();
  updateHintFromSelection();
  if (nodes.tableStatus) nodes.tableStatus.textContent = statusLine();
  return true;
}

/** 从起点划到终点：按起点原本状态决定区间选中或取消 */
function applyDragRange(from, to) {
  if (!game || from < 0 || to < 0) return;
  const hand = game.hands[HUMAN];
  const a = Math.min(from, to);
  const b = Math.max(from, to);
  const startWasOn = Boolean(dragBaseSelected?.has(hand[from]?.id));
  selected = new Set(dragBaseSelected || []);
  for (let i = a; i <= b; i++) {
    const card = hand[i];
    if (!card) continue;
    if (startWasOn) selected.delete(card.id);
    else selected.add(card.id);
  }
  paintHandSelection();
  updateHintFromSelection();
}

function paintHandSelection() {
  if (!nodes.handArea) return;
  nodes.handArea.querySelectorAll('.playing-card').forEach((btn) => {
    const id = btn.dataset.id;
    btn.classList.toggle('selected', selected.has(id));
  });
}

function updateHintFromSelection() {
  if (!selected.size) {
    hintText = '';
    return;
  }
  if (!game) return;
  const cards = game.hands[HUMAN].filter((c) => selected.has(String(c.id)) || selected.has(c.id));
  const parsed = parsePlayCards(cards);
  if (!parsed) {
    hintText = `已选 ${selected.size} 张 · 非合法牌型 · 可点「提示」`;
    return;
  }
  const prev = prevFor(HUMAN);
  if (prev && !canBeatPlay(prev, parsed)) {
    hintText = `已选：${typeLabel(parsed.type, parsed)} · 压不过上一手 · 可改选或「不出」`;
    return;
  }
  hintText = `已选：${typeLabel(parsed.type, parsed)} ${cards.map(cardText).join(' ')} · 点「出牌」`;
}

// ─── 账户 ───────────────────────────────────────────
function getLobbySessionToken() {
  return String(window.__teaParlorSessionToken || '').trim();
}

function applyServerShadowBalance(summary) {
  if (!summary || typeof summary !== 'object') return;
  const shadowCandidates = [
    summary?.balances?.shadowPoints?.available,
    summary?.balances?.shadowPoints?.total,
    summary?.shadowPoints?.available,
    summary?.account?.available,
    summary?.available,
    // Some payloads nest the wallet summary again
    summary?.summary?.balances?.shadowPoints?.available,
    summary?.summary?.account?.available,
  ];
  for (const raw of shadowCandidates) {
    const available = Number(raw);
    if (Number.isFinite(available)) {
      appState.ingots = Math.max(0, Math.round(available));
      break;
    }
  }
  const seasonCandidates = [
    summary?.balances?.seasonPoints?.available,
    summary?.seasonPoints?.available,
    summary?.summary?.balances?.seasonPoints?.available,
  ];
  for (const raw of seasonCandidates) {
    const season = Number(raw);
    if (Number.isFinite(season)) {
      appState.usdt = Math.max(0, Math.round(season * 100) / 100);
      break;
    }
  }
}

function applyDailySupplyStatus(status) {
  if (!status || typeof status !== 'object') return;
  const date = status.date || todayKey();
  const claimed = Number(status.claimed) || 0;
  appState.claims = { date, count: claimed };
  if (status.account && Number.isFinite(Number(status.account.available))) {
    appState.ingots = Math.max(0, Math.round(Number(status.account.available)));
  }
}

async function syncDailySupplyFromServer() {
  const token = getLobbySessionToken();
  const gateway = String(window.TEA_PARLOR_API_GATEWAY_URL || '').replace(/\/+$/, '');
  if (!token || !gateway) return null;
  try {
    const status = await fetchDailySupply(token);
    applyDailySupplyStatus(status);
    if (status?.summary) applyServerShadowBalance(status.summary);
    else if (status?.account) {
      const available = Number(status.account.available);
      if (Number.isFinite(available)) appState.ingots = Math.max(0, Math.round(available));
    }
    saveState();
    return status;
  } catch (err) {
    console.warn('[tea-parlor] daily supply sync failed', err?.message || err);
    return null;
  }
}

async function onClaim() {
  refreshClaims();
  const token = getLobbySessionToken();
  if (!token) {
    const msg = DAILY_SUPPLY_TG_PROMPT;
    if (nodes.claimStatus) nodes.claimStatus.textContent = msg;
    showLobbyToast(msg);
    renderAccount();
    return;
  }
  if (nodes.claimButton) nodes.claimButton.disabled = true;
  if (nodes.claimStatus) nodes.claimStatus.textContent = '领取中…';
  try {
    const result = await claimDailySupplyApi(token);
    applyDailySupplyStatus(result);
    // Prefer full wallet summary; also accept flat account / nested summary shapes.
    if (result?.summary) applyServerShadowBalance(result.summary);
    applyServerShadowBalance(result);
    if (result?.account && Number.isFinite(Number(result.account.available))) {
      appState.ingots = Math.max(0, Math.round(Number(result.account.available)));
    }
    saveState();
    const okMsg = formatDailySupplyClaimSuccess({
      amount: result.amount ?? DAILY_CLAIM_AMOUNT,
      remaining: result.remaining,
    });
    if (nodes.claimStatus) nodes.claimStatus.textContent = okMsg;
    showLobbyToast(okMsg);
  } catch (err) {
    const reason = err?.body?.reason || err?.message || '';
    const exhausted = formatDailySupplyExhaustedReason(reason) === '今日补给次数已用完';
    const msg = exhausted
      ? '今日补给次数已用完'
      : (reason.includes('session') || err?.status === 401
        ? DAILY_SUPPLY_TG_PROMPT
        : formatDailySupplyExhaustedReason(reason));
    if (nodes.claimStatus) nodes.claimStatus.textContent = msg;
    showLobbyToast(msg);
    if (err?.body) {
      applyDailySupplyStatus(err.body);
      if (err.body.summary) applyServerShadowBalance(err.body.summary);
      applyServerShadowBalance(err.body);
    }
  }
  renderAccount();
}

function renderAccount() {
  refreshClaims();
  if (nodes.ingotBalance) nodes.ingotBalance.textContent = format(appState.ingots);
  const homeIngot = document.getElementById('homeIngotBalance');
  if (homeIngot) homeIngot.textContent = format(appState.ingots);
  const p0Ingot = document.getElementById('p0IngotBalance');
  if (p0Ingot) p0Ingot.textContent = format(appState.ingots);
  const usdtVal = formatCrypto(getUsdt());
  const homeSeason = document.getElementById('homeSeasonBalance');
  if (homeSeason) homeSeason.textContent = usdtVal;
  const cryptoEl = document.getElementById('cryptoBalance');
  if (cryptoEl) cryptoEl.textContent = usdtVal;
  const usdtEl = document.getElementById('usdtBalance');
  if (usdtEl) usdtEl.textContent = usdtVal;
  const roomBal = document.getElementById('cryptoRoomBalance');
  if (roomBal) roomBal.textContent = usdtVal;
  const ri = document.getElementById('rechargeIngotPreview');
  if (ri) ri.textContent = format(appState.ingots);
  const ris = document.getElementById('rechargeIngotPreviewSide');
  if (ris) ris.textContent = format(appState.ingots);
  const rc = document.getElementById('rechargeCryptoPreview');
  if (rc) rc.textContent = usdtVal;
  const ru = document.getElementById('rechargeUsdtPreview');
  if (ru) ru.textContent = usdtVal;

  const left = Math.max(0, DAILY_CLAIM_LIMIT - (Number(appState.claims?.count) || 0));
  const hasSession = Boolean(getLobbySessionToken());
  if (nodes.claimButton) {
    nodes.claimButton.disabled = !hasSession || left <= 0;
    nodes.claimButton.textContent = claimButtonLabel({
      remaining: left,
      amount: DAILY_CLAIM_AMOUNT,
      hasSession,
    });
    if (nodes.claimStatus) {
      // Keep last claim success/error unless empty / generic default
      const current = String(nodes.claimStatus.textContent || '');
      const keep = /已领取|领取失败|领取中|请从 Telegram|今日补给次数已用完/.test(current);
      if (!keep) {
        nodes.claimStatus.textContent = formatDailySupplyStatus({
          remaining: left,
          limit: DAILY_CLAIM_LIMIT,
          amount: DAILY_CLAIM_AMOUNT,
          hasSession,
        });
      } else if (!hasSession) {
        nodes.claimStatus.textContent = DAILY_SUPPLY_TG_PROMPT;
      }
    }
  }
  const wins = appState.records.filter((r) => r.result === '胜' || Number(r.score) > 0).length;
  const losses = appState.records.filter((r) => r.result === '负' || Number(r.score) < 0).length;
  const homeSum = document.getElementById('homeRecordSummary');
  if (homeSum) homeSum.textContent = `${wins} 胜 ${losses} 负`;
  const first = document.querySelector('.status-item strong');
  if (first && !homeSum) first.textContent = `${wins} 胜 ${losses} 负`;
  const prevIngots = document.getElementById('profilePreviewIngots');
  if (prevIngots) prevIngots.textContent = format(appState.ingots);
  const prevCrypto = document.getElementById('profilePreviewCrypto');
  if (prevCrypto) prevCrypto.textContent = formatCrypto(getUsdt());
  applyProfileToRuntime();
}

function initTelegramMiniApp() {
  const tg = window.Telegram?.WebApp;
  if (!tg) return;
  try { tg.ready(); } catch (_) {}
  try { tg.expand(); } catch (_) {}
  const user = tg.initDataUnsafe?.user;
  if (user?.first_name) {
    const name = user.first_name;
    const el = document.getElementById('p0PlayerName');
    if (el) el.textContent = name;
    if (nodes.playerName) nodes.playerName.textContent = name;
    const home = document.getElementById('homePlayerName');
    if (home) home.textContent = name;
  }
  const start = String(tg.initDataUnsafe?.start_param || new URLSearchParams(location.search).get('tgWebAppStartParam') || '');
  const initData = typeof tg.initData === 'string' ? tg.initData : '';
  if (initData) {
    telegramLoginPromise = loginWithTelegramInitData(initData, { startParam: start }).then(async (body) => {
      if (body?.token) window.__teaParlorSessionToken = body.token;
      const uid = body?.user?.id != null ? String(body.user.id) : (user?.id != null ? String(user.id) : '');
      if (uid) window.__teaParlorSessionUserId = uid;
      try {
        if (body?.token) {
          const summary = await fetchWalletSummary(body.token);
          applyServerShadowBalance(summary);
          applyDailySupplyStatus(summary?.dailySupply);
          saveState();
          renderAccount();
        } else {
          await syncDailySupplyFromServer();
          renderAccount();
        }
      } catch (syncErr) {
        console.warn('[tea-parlor] wallet sync after login failed', syncErr?.message || syncErr);
        await syncDailySupplyFromServer();
        renderAccount();
      }
      return body;
    }).catch((err) => {
      console.warn('[tea-parlor] telegram login failed', err?.message || err);
      return null;
    });
  }
  if (start.startsWith('t_')) {
    queueMicrotask(() => {
      setLobbyView('rooms', 'doudizhu');
      openFriendRoom(start.slice(2));
    });
  } else if (start === 'play') {
    queueMicrotask(() => startDdzMatched('novice', { variant: 'classic' }));
  }
}

function mountP0Overlay(el) {
  const shell = nodes.shell || document.querySelector('.lobby-shell');
  if (el && shell && el.parentElement !== shell) shell.appendChild(el);
}

function startDdzMatched(roomId, options = {}) {
  const mask = document.getElementById('ddzMatchMask');
  const copy = document.getElementById('ddzMatchCopy');
  const title = mask?.querySelector('h2');
  const room = ROOMS[roomId] || ROOMS.novice;
  if (title) title.textContent = '匹配中';
  if (copy) copy.textContent = '匹配中，超时 AI 补位';
  ddzKeepOverlay = true;
  ddzMatchAborted = false;
  if (mask) {
    mountP0Overlay(mask);
    mask.hidden = false;
    mask.removeAttribute('hidden');
    mask.style.setProperty('display', 'grid', 'important');
  }
  clearTimeout(ddzMatchTimer);
  startRoom(roomId, {
    variant: options.variant || 'classic',
    currency: options.currency || room.currency || 'ingot',
    online: true,
    backend: 'colyseus',
    keepMatchOverlay: true,
  });
}

/** Non-TG QA / offline: honest local AI table — copy must not say 匹配. */
function startDdzLocalPlay(roomId = 'novice', options = {}) {
  hideDdzMatch();
  ddzKeepOverlay = false;
  ddzMatchAborted = false;
  const room = ROOMS[roomId] || ROOMS.novice;
  if (nodes.claimStatus) {
    nodes.claimStatus.textContent = `斗地主 · ${DDZ_LOCAL_PLAY_LABEL}`;
  }
  startRoom(roomId, {
    variant: options.variant || 'classic',
    currency: options.currency || room.currency || 'ingot',
    online: false,
  });
}

function hideDdzMatch() {
  clearTimeout(ddzMatchTimer);
  ddzKeepOverlay = false;
  const mask = document.getElementById('ddzMatchMask');
  if (mask) {
    mask.hidden = true;
    mask.setAttribute('hidden', '');
    mask.style.setProperty('display', 'none', 'important');
  }
}

function cancelDdzMatch() {
  ddzMatchAborted = true;
  hideDdzMatch();
  try { colyseusClient.leaveColyseus?.(); } catch (_) {}
  onlineBackend = null;
}

function friendInviteUrl(roomId) {
  const tg = window.Telegram?.WebApp;
  const bot = tg?.initDataUnsafe?.receiver?.username || 'teaparlorbot';
  return `https://t.me/${bot}/app?startapp=t_${roomId}`;
}

function openFriendRoom(id) {
  const panel = document.getElementById('ddzFriendPanel');
  const rid = document.getElementById('ddzFriendId');
  const preview = document.getElementById('ddzFriendPreview');
  const roomId = id || String(800000 + Math.floor(Math.random() * 90000));
  if (rid) rid.textContent = roomId;
  if (preview) {
    preview.hidden = true;
    const url = document.getElementById('ddzFriendUrl');
    if (url) url.textContent = friendInviteUrl(roomId).replace(/^https:\/\//, '');
  }
  if (panel) {
    mountP0Overlay(panel);
    panel.hidden = false;
    panel.removeAttribute('hidden');
    panel.style.setProperty('display', 'grid', 'important');
  }
}

function closeFriendRoom() {
  const panel = document.getElementById('ddzFriendPanel');
  if (panel) {
    panel.hidden = true;
    panel.setAttribute('hidden', '');
    panel.style.setProperty('display', 'none', 'important');
  }
}

function shareFriendRoom() {
  const rid = document.getElementById('ddzFriendId')?.textContent || '882194';
  const url = friendInviteUrl(rid);
  const preview = document.getElementById('ddzFriendPreview');
  const urlEl = document.getElementById('ddzFriendUrl');
  if (urlEl) urlEl.textContent = url.replace(/^https:\/\//, '');
  if (preview) preview.hidden = false;
  const tg = window.Telegram?.WebApp;
  const share = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent('来茶馆打一局经典斗地主')}`;
  if (tg?.openTelegramLink) tg.openTelegramLink(share);
  else window.open(share, '_blank');
}

function bindP0Lobby() {
  const tabbar = document.querySelector('.home-tabbar');
  if (tabbar && !tabbar.dataset.play9ToastGuard) {
    tabbar.dataset.play9ToastGuard = '1';
    tabbar.addEventListener('click', (ev) => {
      const tab = ev.target && ev.target.closest && ev.target.closest('[data-lobby-action]');
      const action = tab && tab.getAttribute('data-lobby-action');
      if (action && action !== 'rules') hideRulesToast();
    }, true);
  }
  document.querySelectorAll('[data-ddz-lane]').forEach((btn) => {
    btn.addEventListener('click', () => {
      ddzLane = btn.getAttribute('data-ddz-lane') || 'gold';
      document.querySelectorAll('[data-ddz-lane]').forEach((b) => b.classList.toggle('on', b === btn));
      renderDdzRooms(ddzVariant);
    });
  });
  document.getElementById('ddzQuickStart')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    startDdzMatched('novice', { variant: 'classic', currency: ddzLane === 'season' ? 'crypto' : 'ingot' });
  });
  document.getElementById('ddzLocalPlay')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    startDdzLocalPlay('novice', { variant: 'classic', currency: ddzLane === 'season' ? 'crypto' : 'ingot' });
  });
  document.getElementById('ddzMatchCancel')?.addEventListener('click', cancelDdzMatch);
  document.getElementById('ddzFriendClose')?.addEventListener('click', closeFriendRoom);
  document.getElementById('ddzFriendLink')?.addEventListener('click', shareFriendRoom);
  document.getElementById('ddzFriendShare')?.addEventListener('click', shareFriendRoom);
  document.getElementById('ddzFriendCopy')?.addEventListener('click', () => {
    const id = document.getElementById('ddzFriendId')?.textContent || '';
    navigator.clipboard?.writeText(id).catch(() => {});
  });
  document.getElementById('ddzSettleAdClose')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const ad = document.getElementById('ddzSettleAd');
    if (ad) ad.hidden = true;
  });
}

/** 渲染当前玩法 Tab 下的场次卡片 */
function renderDdzRooms(variantId = ddzVariant) {
  const v = DDZ_VARIANTS[variantId] || DDZ_VARIANTS.classic;
  ddzVariant = v.id;
  const grid = document.getElementById('ddzRoomGrid');
  const title = document.getElementById('ddzVariantTitle');
  const desc = document.getElementById('ddzVariantDesc');
  const onlinePill = document.getElementById('ddzOnlinePill');
  if (title) title.textContent = '选择场次';
  if (desc) desc.textContent = '经典三人 · 叫分';

  document.querySelectorAll('#ddzVariantTabs [data-ddz-variant]').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-ddz-variant') === v.id);
  });

  const ids = DDZ_TIER_IDS[ddzLane] || DDZ_TIER_IDS.gold;
  const rooms = ids.map((id) => ROOMS[id]).filter(Boolean);
  if (onlinePill) onlinePill.textContent = '超时 AI 补位';

  if (!grid) return;
  const unit = ddzLane === 'season' ? '赛季积分' : '影子积分';
  grid.innerHTML = rooms.map((room, idx) => {
    const label = DDZ_TIER_LABEL[idx] || room.name;
    const queue = DDZ_QUEUE[idx] || '匹配中';
    return (
      `<button class="room-card room-card-qq p0-room${idx === 1 ? ' primary-room' : ''}" type="button" data-game-room="doudizhu" data-room="${room.id}" data-ddz-mode="classic">`
      + `<strong class="room-name-center">${label}</strong>`
      + `<span class="room-meta">底分 ${room.stake} · 入场 ${format(room.minEntry)} ${unit}</span>`
      + `<span class="p0-queue">${queue}</span>`
      + `<span class="room-action">进入</span>`
      + `</button>`
    );
  }).join('');

  const hint = document.querySelector('.p0-dock-hint');
  if (hint) hint.textContent = '快速开始=联网匹配 · 人机畅玩不经匹配';
  const quick = document.getElementById('ddzQuickStart');
  if (quick) {
    quick.setAttribute('data-room', 'novice');
    quick.setAttribute('data-ddz-mode', 'classic');
  }
}

function bindDdzVariantTabs() {
  const tabs = document.getElementById('ddzVariantTabs');
  if (!tabs || tabs.dataset.bound) return;
  tabs.dataset.bound = '1';
  tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ddz-variant]');
    if (!btn) return;
    e.preventDefault();
    renderDdzRooms(btn.getAttribute('data-ddz-variant') || 'buxipai');
  });
}

/** 按玩法洗牌：经典多洗切牌；不洗牌先打乱再收墩，再按圈轮发 */
function dealDeckForVariant(variantId) {
  const raw = createDeck();
  if (variantId === 'buxipai') return unwashedShuffle(raw, cryptoRandom);
  if (variantId === 'huanle') return riffleShuffle(raw, cryptoRandom, 4);
  return riffleShuffle(raw, cryptoRandom);
}

/** 当前局解析/压制（自动适配癞子） */
function parsePlayCards(cards) {
  const wild = game?.variant === 'laizi' ? game.wildRank : null;
  return parseHandMode(cards, wild);
}

function canBeatPlay(prev, next) {
  const wild = game?.variant === 'laizi' ? game.wildRank : null;
  return canBeatMode(prev, next, wild);
}

function getPlayHint(hand, prev) {
  if (game?.variant === 'laizi' && game.wildRank != null) {
    return getHintLaizi(hand, prev, game.wildRank);
  }
  return getHint(hand, prev);
}

// ─── 开局 ───────────────────────────────────────────
let startRoomLock = false;

function startRoom(roomId, options = {}) {
  if (startRoomLock) return;
  if (activeGame === 'doudizhu' && game && game.phase !== 'settle'
    && nodes.tableView && !nodes.tableView.hidden) {
    return;
  }
  if (!assertCanEnter(options.currency === 'crypto' ? 'real' : 'doudizhu')) return;
  startRoomLock = true;
  setTimeout(() => { startRoomLock = false; }, 700);
  const room = ROOMS[roomId] || ROOMS.novice;
  const currency = options.currency || room.currency || 'ingot';
  const variant = options.variant || options.ddzMode || ddzVariant || 'classic';
  const bal = currency === 'crypto' ? getCrypto() : appState.ingots;

  if (bal < room.minEntry) {
    startRoomLock = false;
    if (nodes.claimStatus) {
      nodes.claimStatus.textContent = currency === 'crypto'
        ? `${room.name} 需要 ${formatCrypto(room.minEntry)} ${CRYPTO_SYMBOL}，请先补给`
        : `${room.name} 需要 ${format(room.minEntry)} 金币入场${appState.ingots <= 0 ? '，可领每日补给（影子金币·不可提现）' : ''}`;
    }
    if (currency === 'crypto') setLobbyView('recharge');
    else if (appState.ingots <= 0) renderAccount();
    return;
  }

  // 关闭德州桌
  if (activeGame === 'texas' && texasBuyIn > 0) cashoutTexas(texasBuyIn);
  texasUI?.hide?.();
  multiUI?.hide?.();
  forceCloseMultiView();
  activeGame = 'doudizhu';

  clearAi();
  hideDdzResultModal();

  const wantOnline = options.online ?? isOnlineMode(playMode);
  // 本地人机仍扣底分；Colyseus 联网以服务器 scores 为准，不预扣以免和服不一致
  if (!wantOnline) {
    if (currency === 'crypto') adjustUsdt(-room.stake);
    else appState.ingots -= room.stake;
    saveState();
    renderAccount();
  }

  if (wantOnline) {
    const backend = options.backend || (playMode === 'pinus' ? 'pinus' : 'colyseus');
    const keepOverlay = !!options.keepMatchOverlay || ddzKeepOverlay;
    startRoomOnline(room, currency, variant, backend, { keepMatchOverlay: keepOverlay }).catch((err) => {
      console.warn(`[${backend}] online match failed`, err);
      const msg = String(err?.message || err || '');
      const authFail = /auth/i.test(msg);
      // Quick-match overlay: never pretend local AI was a successful online match.
      if (keepOverlay || ddzKeepOverlay) {
        ddzKeepOverlay = true;
        const mask = document.getElementById('ddzMatchMask');
        const copy = document.getElementById('ddzMatchCopy');
        const title = mask?.querySelector('h2');
        if (mask) {
          mountP0Overlay(mask);
          mask.hidden = false;
          mask.removeAttribute('hidden');
          mask.style.setProperty('display', 'grid', 'important');
        }
        if (title) title.textContent = ddzMatchFailureTitle(msg);
        if (copy) {
          copy.textContent = ddzMatchFailureCopy(msg);
        }
        if (nodes.claimStatus) {
          nodes.claimStatus.textContent = authFail
            ? '登录校验失败，请从 Telegram 打开'
            : '斗地主联网匹配失败';
        }
        onlineBackend = null;
        return;
      }
      if (nodes.claimStatus) {
        nodes.claimStatus.textContent = '联网失败，已回退人机畅玩';
      }
      hideDdzMatch();
      onlineBackend = null;
      if (currency === 'crypto') adjustUsdt(-room.stake);
      else appState.ingots -= room.stake;
      saveState();
      renderAccount();
      startRoomLocal(room, currency, variant);
    });
    return;
  }
  onlineBackend = null;
  startRoomLocal(room, currency, variant);
}

function startRoomLocal(room, currency, variant = 'classic') {
  const v = DDZ_VARIANTS[variant] || DDZ_VARIANTS.classic;
  const deck = dealDeckForVariant(variant);
  const dealStart = Math.floor(cryptoRandom() * 3);
  const dealt = dealRoundRobin(deck, 3, 17, dealStart);
  // 天地癞子：随机 3–A 或 2 为癞子（不含王）
  let wildRank = null;
  if (variant === 'laizi') {
    wildRank = 3 + Math.floor(cryptoRandom() * 13); // 3..15(2)
  }
  const bidStarter = Math.floor(cryptoRandom() * 3);
  game = {
    roomId: room.id,
    roomName: `${v.label}·${room.name}`,
    stake: room.stake,
    unit: room.unit || 1,
    currency,
    variant,
    variantLabel: v.label,
    variantTip: v.tip || v.desc,
    bombExtra: v.bombExtra || 0,
    wildRank,
    online: false,
    phase: 'bid',
    hands: dealt.hands.map((h) => sortCards(h)),
    bottom: dealt.rest.slice(0, 3),
    bidScores: [null, null, null],
    currentBid: 0,
    bidStarter,
    bidTurn: bidStarter,
    bidCount: 0,
    landlord: -1,
    currentPlayer: 0,
    lastPlay: null,
    tableActs: [null, null, null],
    /** 本局已打出的牌（记牌器用） */
    playedCards: [],
    passCount: 0,
    multiplier: 1,
    callMultiplier: 1,
    bombCount: 0,
    chainBombEvents: 0,
    /** 加倍系数 [自己,上家,下家]；1=不加倍 2=加倍 4=超级 */
    doubleFactors: [1, 1, 1],
    doubleDecided: [false, false, false],
    enableDouble: !!v.enableDouble,
    allowSuperDouble: v.allowSuperDouble !== false && !!v.enableDouble,
    enableChainBomb: v.enableChainBomb !== false,
    winner: null,
    score: 0,
    settled: false,
    playCounts: [0, 0, 0],
  };
  selected = new Set();
  trustee = false;
  const wildHint = wildRank
    ? ` · 本局癞子【${RANK_LABEL[wildRank] || wildRank}】`
    : '';
  hintText = `${v.label}${wildHint} · ${v.tip || '请叫分'}`;

  showDdzTable();
  // 顶栏展示玩法
  if (nodes.roomName) nodes.roomName.textContent = game.roomName;
  renderGame();
  scheduleAi();
}

async function startRoomOnline(room, currency, variant = 'classic', backend = 'colyseus', extra = {}) {
  const v = DDZ_VARIANTS[variant] || DDZ_VARIANTS.classic;
  const profile = getProfile();
  pinusUid = pinusUid || `h5_${profile.playerId || '830126'}_${Date.now()}`;
  const name = profile.name || NAMES[0];
  const keepOverlay = extra.keepMatchOverlay || ddzKeepOverlay;

  onlineBackend = backend === 'pinus' ? 'pinus' : 'colyseus';
  hintText = keepOverlay ? '匹配中，超时 AI 补位' : `正在开局 · ${v.label}…`;
  if (!keepOverlay) showDdzTable();
  if (nodes.tableStatus) nodes.tableStatus.textContent = hintText;

  try { await telegramLoginPromise; } catch (_) {}
  if (ddzMatchAborted) throw new Error('match_cancelled');
  const sessionToken = window.__teaParlorSessionToken || '';
  if (window.__teaParlorSessionUserId) pinusUid = String(window.__teaParlorSessionUserId);
  // Matching is online-only: without a gateway session, fail honestly (no local fallback).
  // Production Colyseus keeps verifyRoomJoin secret-required — do not enable trust mode.
  if (keepOverlay && !sessionToken) {
    throw new Error('auth_failed');
  }

  let session;
  if (onlineBackend === 'colyseus') {
    if (!colyseusClient.isColyseusAvailable()) {
      throw new Error('未加载 colyseus.js');
    }
    session = await colyseusClient.startColyseusDdzSession({
      endpoint: (typeof window !== 'undefined' && window.TEA_PARLOR_COLYSEUS_URL) || 'ws://127.0.0.1:2567',
      uid: pinusUid,
      name,
      roomId: room.id,
      currency,
      token: sessionToken || undefined,
      fresh: !!keepOverlay,
    });
    if (ddzMatchAborted) {
      try { await colyseusClient.leaveColyseus?.(); } catch (_) {}
      throw new Error('match_cancelled');
    }
    colyseusClient.onRoomUpdate((st) => {
      if (!game?.online || onlineBackend !== 'colyseus') return;
      const meta = ROOMS[game.roomId] || room;
      applyPinusRoom(st, meta, currency);
      syncMatchOverlay(st);
      if (game.phase === 'match') return;
      if (game.phase === 'settle' && !game._settledWallet && game.score != null) {
        pinusSync(async () => ({ room: st }));
      } else {
        renderGame();
      }
    });
  } else {
    if (!pinusClient.isPinusAvailable()) {
      throw new Error('未加载 pinusclient.js');
    }
    session = await pinusClient.startPinusDdzSession({
      host: '127.0.0.1',
      port: 3010,
      uid: pinusUid,
      name,
      roomId: room.id,
      currency,
    });
  }

  applyPinusRoom(session.room, room, currency);
  if (game) {
    game.onlineBackend = onlineBackend;
    game.variant = variant;
    game.variantLabel = v.label;
  }
  selected = new Set();
  trustee = false;
  syncMatchOverlay(session.room);
  if (game?.phase === 'match') {
    hintText = session.room?.status || '匹配中，超时 AI 补位';
    return;
  }
  // Quick-match expected phase=match first. Non-match with <3 humans = stale/AI deal without waiting — abort.
  if (keepOverlay) {
    const humans = Number(session.room?.humanCount) || 0;
    if (humans < 3) {
      try { await colyseusClient.leaveColyseus?.(); } catch (_) {}
      onlineBackend = null;
      throw new Error('match_window_skipped');
    }
  }
  hintText = session.room?.status || `经典叫分 · 请叫分`;
  showDdzTable();
  renderGame();
}

function syncMatchOverlay(room) {
  const copy = document.getElementById('ddzMatchCopy');
  if (room?.phase === 'match') {
    ddzKeepOverlay = true;
    const mask = document.getElementById('ddzMatchMask');
    if (mask) {
      mountP0Overlay(mask);
      mask.hidden = false;
      mask.removeAttribute('hidden');
      mask.style.setProperty('display', 'grid', 'important');
    }
    const ends = Number(room.matchEndsAt) || 0;
    const leftMs = ends ? Math.max(0, ends - Date.now()) : 0;
    const leftSec = Math.max(0, Math.ceil(leftMs / 1000));
    if (copy) {
      copy.textContent = leftSec > 0
        ? `匹配中，超时 AI 补位（${leftSec}s）`
        : '匹配中，超时 AI 补位';
    }
    clearTimeout(ddzMatchTimer);
    // Tick overlay from server matchEndsAt; never hide while phase === match.
    if (leftMs > 0) {
      ddzMatchTimer = setTimeout(() => {
        if (game?.phase === 'match' && game.matchEndsAt === ends) {
          syncMatchOverlay({ phase: 'match', matchEndsAt: ends, status: room.status });
        }
      }, Math.min(500, leftMs));
    }
    return;
  }
  // Hide only after server leaves match (deal / AI fill started).
  if (ddzKeepOverlay || (document.getElementById('ddzMatchMask') && !document.getElementById('ddzMatchMask').hidden)) {
    hideDdzMatch();
    showDdzTable();
  }
}

function applyOnlineDdzScores(g) {
  const delta = Number(g.score) || 0;
  applyDelta(g.currency || 'ingot', delta);
  g.platformFee = 0;
  g.platformFeeKind = null;
  return { payout: delta, fee: 0, kind: null };
}

/** 将 Pinus room 快照映射为本地 game 结构供 renderGame 使用 */
function applyPinusRoom(room, roomMeta, currency) {
  if (!room) throw new Error('empty room');
  const hi = room.humanIndex ?? 0;
  const hands = [[], [], []];
  hands[hi] = (room.myHand || []).slice();
  const prevPlayed = Array.isArray(game?.playedCards) ? game.playedCards.slice() : [];
  game = {
    roomId: roomMeta?.id || room.roomKey || 'novice',
    roomName: roomMeta?.name || room.roomKey || '联网桌',
    stake: room.stake ?? roomMeta?.stake ?? 100,
    unit: roomMeta?.unit ?? 1,
    currency: room.currency || currency || 'ingot',
    online: true,
    onlineBackend: onlineBackend || room.backend || 'pinus',
    pinusRoomId: room.id,
    phase: room.phase === 'match' ? 'match' : (room.phase === 'bid' ? 'bid' : (room.phase === 'settle' ? 'settle' : 'play')),
    hands,
    bottom: room.bottom || [null, null, null].map(() => ({ rank: 0, suit: 0, id: 'x' })),
    bidScores: room.bidScores || [null, null, null],
    currentBid: room.currentBid || 0,
    bidTurn: room.bidTurn ?? 0,
    bidCount: 0,
    landlord: room.landlord ?? -1,
    currentPlayer: room.currentPlayer ?? 0,
    lastPlay: room.lastPlay
      ? {
          player: room.lastPlay.player,
          cards: room.lastPlay.cards || [],
          parsed: room.lastPlay.type
            ? { type: room.lastPlay.type, cards: room.lastPlay.cards || [] }
            : null,
        }
      : null,
    tableActs: [null, null, null],
    playedCards: Array.isArray(room.playedCards) ? room.playedCards.slice() : prevPlayed,
    passCount: 0,
    multiplier: room.multiplier || 1,
    bombCount: room.bombCount || 0,
    winner: room.winner,
    score: room.humanScore ?? (room.scores ? room.scores[hi] : 0),
    scores: room.scores || null,
    settled: room.phase === 'settle',
    playCounts: [0, 0, 0],
    handsCount: room.phase === 'match' ? [0, 0, 0] : (room.handsCount || [17, 17, 17]),
    names: room.names || NAMES,
    humanCount: room.humanCount,
    matchEndsAt: room.matchEndsAt,
    status: room.status || '',
  };
  // 底牌未揭晓时用占位
  if (!room.bottom) {
    game.bottom = [{ id: 'b0' }, { id: 'b1' }, { id: 'b2' }];
    game._bottomHidden = true;
  }
  if (room.status) hintText = room.status;
}

function showDdzTable() {
  // 强制收起多人桌层，避免其 fixed 全屏挡住斗地主按钮
  try { multiUI?.hide?.(); } catch (_) { /* ignore */ }
  forceCloseMultiView();
  try { texasUI?.hide?.(); } catch (_) { /* ignore */ }
  const tx = document.getElementById('texasTableView');
  if (tx) {
    tx.hidden = true;
    tx.setAttribute('hidden', '');
    tx.style.display = 'none';
    tx.style.pointerEvents = 'none';
  }
  nodes.shell?.classList.remove('multi-active', 'texas-active');
  nodes.tableView.hidden = false;
  nodes.tableView.removeAttribute('hidden');
  nodes.tableView.style.setProperty('display', 'flex', 'important');
  nodes.tableView.style.setProperty('pointer-events', 'auto', 'important');
  nodes.tableView.style.setProperty('visibility', 'visible', 'important');
  nodes.tableView.style.setProperty('z-index', '400', 'important');
  if (nodes.handArea) {
    nodes.handArea.hidden = false;
    nodes.handArea.removeAttribute('hidden');
    nodes.handArea.style.removeProperty('display');
    nodes.handArea.style.removeProperty('visibility');
    nodes.handArea.style.removeProperty('pointer-events');
    nodes.handArea.style.removeProperty('z-index');
  }
  document.querySelectorAll('#tableView .qq-bottom-bar').forEach((el) => {
    el.style.removeProperty('display');
    el.style.removeProperty('visibility');
    el.style.removeProperty('pointer-events');
  });
  nodes.shell?.classList.add('table-active');
  if (game?.phase !== 'match' && !ddzKeepOverlay) hideDdzMatch();
  closeFriendRoom();
  syncP0Tabbar();
  // 对局中彻底隐藏大厅舞台（含「选择区域」）
  const stage = document.querySelector('.lobby-stage');
  if (stage) {
    stage.style.display = 'none';
    stage.style.visibility = 'hidden';
    stage.style.pointerEvents = 'none';
  }
  const topbar = document.querySelector('.topbar');
  if (topbar) {
    topbar.style.display = 'none';
  }
  try { nodes.tableView.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (_) {}
}

async function pinusSync(actionFn) {
  if (!game?.online) return false;
  try {
    const data = await actionFn();
    if (data?.room) {
      const meta = ROOMS[game.roomId] || { id: game.roomId, name: game.roomName, stake: game.stake, unit: game.unit };
      applyPinusRoom(data.room, meta, game.currency);
      if (data.cards) {
        selected = new Set((data.cards || []).map((c) => c.id));
      }
      // 结算入账
      if (game.phase === 'settle' && !game._settledWallet && game.score != null) {
        game._settledWallet = true;
        const settled = applyOnlineDdzScores(game);
        game.platformFee = settled.fee;
        appState.records.unshift({
          roomName: game.roomName,
          result: (game.score || 0) >= 0 ? '胜' : '负',
          score: game.score,
          at: new Date().toISOString(),
          game: 'doudizhu',
          currency: game.currency,
          online: true,
        });
        appState.records = appState.records.slice(0, 50);
        saveState();
        renderAccount();
        ddzSettleShown = false;
        queueMicrotask(() => showDdzResultModal());
      }
      renderGame();
    }
    return true;
  } catch (e) {
    hintText = `联网操作失败：${e.message || e}`;
    renderGame();
    return true;
  }
}

function hideLobbyTopbar() {
  const topbar = document.querySelector('.topbar');
  if (topbar) topbar.style.setProperty('display', 'none', 'important');
}

function pinP0ActionBar(el) {
  if (!el) return;
  const home = document.querySelector('#tableView .qq-center-actions');
  if (home && el.parentElement !== home) home.appendChild(el);
  ['position', 'left', 'right', 'bottom', 'top', 'width', 'max-width', 'min-width', 'min-height', 'height', 'transform', 'inset', 'grid-template-columns', 'background'].forEach((k) => {
    el.style.removeProperty(k);
  });
  if (el.hidden) {
    el.style.setProperty('display', 'none', 'important');
    el.style.setProperty('visibility', 'hidden', 'important');
    el.style.setProperty('pointer-events', 'none', 'important');
    return;
  }
  el.style.setProperty('display', 'flex', 'important');
  el.style.setProperty('visibility', 'visible', 'important');
  el.style.setProperty('pointer-events', 'auto', 'important');
  el.style.setProperty('position', 'relative', 'important');
  el.style.setProperty('transform', 'none', 'important');
  el.style.setProperty('left', 'auto', 'important');
  el.style.setProperty('right', 'auto', 'important');
  el.style.setProperty('top', 'auto', 'important');
  el.style.setProperty('bottom', 'auto', 'important');
  el.style.setProperty('width', '100%', 'important');
  el.style.setProperty('min-width', '0', 'important');
  el.style.setProperty('max-width', '100%', 'important');
  el.style.setProperty('flex-wrap', 'wrap', 'important');
  el.style.setProperty('grid-template-columns', 'none', 'important');
  el.style.setProperty('box-sizing', 'border-box', 'important');
  el.style.setProperty('z-index', '6', 'important');
}

function hideTableActionBars() {
  ['playControls', 'bidControls', 'doubleControls', 'settleControls'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.hidden = true;
    el.setAttribute('hidden', '');
    pinP0ActionBar(el);
  });
  const shell = nodes.shell || document.querySelector('.lobby-shell');
  if (shell?.classList.contains('multi-active') || shell?.classList.contains('texas-active')) {
    buryDdzLayer();
  }
}

function syncP0Tabbar() {
  const bar = document.querySelector('.home-tabbar');
  if (!bar) return;
  const shell = nodes.shell || document.querySelector('.lobby-shell');
  const playing = shell?.classList.contains('table-active')
    || shell?.classList.contains('texas-active')
    || shell?.classList.contains('multi-active');
  const tx = document.getElementById('texasTableView');
  const ddz = nodes.tableView || document.getElementById('tableView');
  const mg = document.getElementById('multiGameView');
  const tableOpen = Boolean(
    (tx && !tx.hidden)
    || (ddz && !ddz.hidden)
    || (mg && !mg.hidden),
  );
  const pin = ['position', 'top', 'left', 'right', 'bottom', 'width', 'height', 'z-index'];
  [tx, ddz, mg].forEach((el) => {
    if (!el) return;
    const open = playing || tableOpen;
    if (open && !el.hidden && el.getAttribute('hidden') == null) {
      el.style.setProperty('position', 'fixed', 'important');
      el.style.setProperty('top', '0', 'important');
      el.style.setProperty('left', '0', 'important');
      el.style.setProperty('right', '0', 'important');
      el.style.setProperty('bottom', '0', 'important');
      el.style.setProperty('width', '100%', 'important');
      el.style.setProperty('height', '100%', 'important');
      el.style.setProperty('z-index', '400', 'important');
      if (el.id === 'tableView') {
        const slot = el.querySelector('.self-slot');
        if (slot) {
          slot.style.setProperty('position', 'absolute', 'important');
          slot.style.setProperty('left', '0', 'important');
          slot.style.setProperty('right', '0', 'important');
          slot.style.setProperty('bottom', '0', 'important');
          slot.style.setProperty('top', 'auto', 'important');
          slot.style.setProperty('width', '100%', 'important');
          slot.style.setProperty('z-index', '12', 'important');
        }
      }
    } else if (!open) {
      pin.forEach((k) => el.style.removeProperty(k));
    }
  });
  if (playing || tableOpen) {
    bar.style.setProperty('display', 'none', 'important');
    bar.style.setProperty('visibility', 'hidden', 'important');
    bar.style.setProperty('pointer-events', 'none', 'important');
    bar.style.setProperty('height', '0', 'important');
    bar.style.setProperty('opacity', '0', 'important');
    bar.style.setProperty('z-index', '0', 'important');
  } else {
    bar.style.setProperty('display', 'grid', 'important');
    bar.style.setProperty('visibility', 'visible', 'important');
    bar.style.setProperty('pointer-events', 'auto', 'important');
    bar.style.removeProperty('height');
    bar.style.removeProperty('opacity');
    bar.style.removeProperty('z-index');
  }
}

/** 关掉残留牌桌遮罩，恢复大厅可点。不切换当前页。 */
function restoreLobbyChrome() {
  hideLobbyTopbar();
  const shell = nodes.shell || document.querySelector('.lobby-shell');
  const playing = shell?.classList.contains('table-active')
    || shell?.classList.contains('texas-active')
    || shell?.classList.contains('multi-active');
  const tx = document.getElementById('texasTableView');
  const ddz = nodes.tableView || document.getElementById('tableView');
  const mg = document.getElementById('multiGameView');
  const tableOpen = Boolean(
    (tx && !tx.hidden && tx.getAttribute('hidden') == null)
    || (ddz && !ddz.hidden && ddz.getAttribute('hidden') == null)
    || (mg && !mg.hidden && mg.getAttribute('hidden') == null),
  );
  if (!playing && !tableOpen) {
    hideTableActionBars();
    const stage = document.querySelector('.lobby-stage');
    if (stage) {
      if (stage.style.pointerEvents === 'none') stage.style.removeProperty('pointer-events');
      if (stage.style.display === 'none') stage.style.removeProperty('display');
      if (stage.style.visibility === 'hidden') stage.style.removeProperty('visibility');
    }
    syncP0Tabbar();
    return;
  }

  clearAi();
  hideDdzResultModal();
  try { texasUI?.hide?.(); } catch (_) { /* ignore */ }
  try { leaveMultiTable(); } catch (_) { /* ignore */ }
  if (activeGame === 'texas' && texasBuyIn > 0) cashoutTexas(texasBuyIn);
  activeGame = null;
  texasBuyIn = 0;

  if (ddz) {
    ddz.hidden = true;
    ddz.setAttribute('hidden', '');
    ddz.style.setProperty('display', 'none', 'important');
    ddz.style.setProperty('pointer-events', 'none', 'important');
    ddz.style.removeProperty('z-index');
    ddz.style.removeProperty('visibility');
  }
  if (tx) {
    tx.hidden = true;
    tx.setAttribute('hidden', '');
    tx.style.setProperty('display', 'none', 'important');
    tx.style.setProperty('visibility', 'hidden', 'important');
    tx.style.setProperty('pointer-events', 'none', 'important');
    tx.style.removeProperty('z-index');
  }
  if (mg) {
    mg.hidden = true;
    mg.setAttribute('hidden', '');
    mg.style.setProperty('display', 'none', 'important');
    mg.style.setProperty('pointer-events', 'none', 'important');
    mg.style.removeProperty('z-index');
    mg.style.removeProperty('visibility');
  }
  shell?.classList.remove('table-active', 'texas-active', 'multi-active');
  const stage = document.querySelector('.lobby-stage');
  if (stage) {
    stage.style.removeProperty('display');
    stage.style.removeProperty('visibility');
    stage.style.removeProperty('pointer-events');
    stage.style.removeProperty('height');
  }
  const topbar = document.querySelector('.topbar');
  if (topbar) topbar.style.setProperty('display', 'none', 'important');
  syncP0Tabbar();
}

function showLobby() {
  hideDdzResultModal();
  try { colyseusClient.leaveColyseus?.(); } catch (_) {}
  try { pinusClient.disconnectPinus?.(); } catch (_) {}
  onlineBackend = null;
  game = null;
  selected = new Set();
  trustee = false;
  hintText = '';
  restoreLobbyChrome();
  renderAccount();
  setLobbyView('home');
}

// ─── 叫分（JJ：只能叫更高分或放弃；3 分直接当地主） ───
function onBid(score) {
  if (!game || game.phase !== 'bid' || game.bidTurn !== HUMAN) return;
  if (game.online) {
    pinusSync(() => getOnlineNet().ddzBid(Number(score) || 0));
    return;
  }
  applyBid(HUMAN, score);
  renderGame();
  scheduleAi();
}

function applyBid(player, score) {
  let s = Number(score) || 0;
  // JJ：后叫只能更高，否则视为不叫
  if (s > 0 && s <= game.currentBid) {
    hintText = '只能叫比当前更高的分，或不叫';
    if (player === HUMAN) {
      // 非法点击不消耗回合？JJ 客户端通常禁用低分按钮
      s = 0;
      return false;
    }
    s = 0;
  }
  game.bidScores[player] = s;
  game.bidCount += 1;
  game.tableActs[player] = { kind: 'bid', score: s };
  if (s > game.currentBid) {
    game.currentBid = s;
    game.landlord = player;
  }

  // 叫 3 分立即结束；或三人叫完 → 底牌 + 加倍或直接出牌
  if (s === 3 || game.bidCount >= 3) {
    if (game.landlord < 0) {
      // 全不叫：开始叫分的人当地主，底分 1（JJ 帮助中心口径）
      game.landlord = Number.isInteger(game.bidStarter) ? game.bidStarter : 0;
      game.currentBid = 1;
    }
    game.hands[game.landlord] = sortCards([
      ...game.hands[game.landlord],
      ...game.bottom,
    ]);
    game.lastPlay = null;
    game.passCount = 0;
    game.tableActs = [null, null, null];
    game.doubleFactors = [1, 1, 1];
    game.doubleDecided = [false, false, false];
    if (game.enableDouble) {
      game.phase = 'double';
      hintText = game.landlord === HUMAN
        ? '你是地主 · 等待农民加倍后可反加倍'
        : `${NAMES[game.landlord]} 是地主 · 请选择是否加倍`;
    } else {
      beginPlayPhase();
    }
    return true;
  }
  game.bidTurn = (player + 1) % 3;
  return true;
}

/** 进入出牌阶段（加倍结束或跳过加倍） */
function beginPlayPhase() {
  if (!game) return;
  game.phase = 'play';
  game.currentPlayer = game.landlord;
  game.lastPlay = null;
  game.passCount = 0;
  game.tableActs = [null, null, null];
  // 个人加倍并入展示倍率（地主线：公共倍 × 各农民加倍再汇总在结算）
  const doubleProduct = (game.doubleFactors || [1, 1, 1]).reduce((a, b) => a * b, 1);
  game.multiplier = Math.max(1, (game.callMultiplier || 1) * doubleProduct);
  hintText = game.landlord === HUMAN
    ? '你是地主，请先出任意合法牌型'
    : `${NAMES[game.landlord]} 先出`;
}

// ─── 加倍（欢乐/连炸/不洗牌） ─────────────────────────
function onDouble(factor) {
  if (!game || game.phase !== 'double') return;
  if (game.doubleDecided[HUMAN]) return;
  applyDouble(HUMAN, factor);
  renderGame();
  scheduleAi();
}

function applyDouble(player, factor) {
  if (!game || game.phase !== 'double') return false;
  if (game.doubleDecided[player]) return false;
  let f = Number(factor) || 1;
  const isLandlord = player === game.landlord;
  // 地主仅 1/2（反加倍）；农民 1/2/4（超级）
  if (isLandlord) {
    if (f !== 1 && f !== 2) f = 1;
  } else {
    if (f === 4 && !game.allowSuperDouble) f = 2;
    if (f !== 1 && f !== 2 && f !== 4) f = 1;
  }
  game.doubleFactors[player] = f;
  game.doubleDecided[player] = true;
  game.tableActs[player] = {
    kind: 'double',
    factor: f,
    label: f === 4 ? '超级加倍' : (f === 2 ? (isLandlord ? '反加倍' : '加倍') : '不加倍'),
  };

  if (game.doubleDecided.every(Boolean)) {
    beginPlayPhase();
  }
  return true;
}

function safeAiDouble(player) {
  // 简单策略：手牌强则加倍
  const hand = game.hands[player];
  const strength = hand.filter((c) => c.rank >= 14 || c.rank >= 16).length
    + hand.filter((c) => {
      const n = hand.filter((x) => x.rank === c.rank).length;
      return n >= 4;
    }).length / 4;
  if (player === game.landlord) return strength >= 3 ? 2 : 1;
  if (strength >= 4 && game.allowSuperDouble) return 4;
  if (strength >= 2) return 2;
  return 1;
}

// ─── 出牌（JJ 同型压制 + 炸弹/火箭） ─────────────────
function onPlay() {
  if (!game || game.phase !== 'play' || game.currentPlayer !== HUMAN) {
    hintText = '还没轮到你出牌';
    if (nodes.tableStatus) nodes.tableStatus.textContent = statusLine();
    return;
  }

  const prev = prevFor(HUMAN);
  let cards = game.hands[HUMAN].filter((c) => selected.has(String(c.id)) || selected.has(c.id));

  // 未选牌：自动用提示；若压不住则引导「不出」
  if (!cards.length) {
    if (game.online) {
      pinusSync(async () => {
        const net = getOnlineNet();
        const h = await net.ddzHint();
        if (h?.cards?.length) {
          selected = new Set(h.cards.map((c) => c.id));
          return net.ddzPlay([...selected]);
        }
        if (game.lastPlay && game.lastPlay.player !== HUMAN) {
          return net.ddzPass();
        }
        throw new Error('请选手牌后出牌');
      });
      return;
    }
    const hint = getPlayHint(game.hands[HUMAN], prev);
    if (hint?.cards?.length) {
      cards = hint.cards;
      selected = new Set(cards.map((c) => c.id));
      paintHandSelection();
    } else if (prev) {
      hintText = '没有能压的牌，已为你点「不出」';
      onPass(true);
      return;
    } else {
      hintText = '请先点选手牌（或拖选），再点「出牌」；也可点「提示」';
      renderGame();
      return;
    }
  }

  if (game.online) {
    const ids = cards.map((c) => c.id);
    pinusSync(() => getOnlineNet().ddzPlay(ids));
    return;
  }

  const parsed = parsePlayCards(cards);
  if (!parsed) {
    hintText = game?.variant === 'laizi'
      ? '牌型不合法（癞子可凑单/对/三/顺/连对/软炸）'
      : '牌型不合法：请选 单/对/三带/顺子/连对/飞机/四带二/炸弹/连炸/火箭';
    renderGame();
    return;
  }
  if (prev && !canBeatPlay(prev, parsed)) {
    // 选了压不住的牌：尝试提示合法压牌，否则引导不出
    const hint = getPlayHint(game.hands[HUMAN], prev);
    if (hint?.cards?.length) {
      selected = new Set(hint.cards.map((c) => c.id));
      hintText = `压不过上一手 · 已改选提示：${typeLabel(hint.type, hint)} ${hint.cards.map(cardText).join(' ')} · 再点「出牌」`;
      renderGame();
      return;
    }
    hintText = '压不过上一手，请点「不出」';
    renderGame();
    return;
  }

  applyPlay(HUMAN, cards, parsed);
  selected = new Set();
  hintText = '';
  renderGame();
  if (game.phase !== 'settle') scheduleAi();
}

function onPass(auto = false) {
  if (!game || game.phase !== 'play' || game.currentPlayer !== HUMAN) return;
  if (!game.lastPlay || game.lastPlay.player === HUMAN) {
    hintText = '自由出牌必须出牌，不能「不出」· 请点「提示」或选手牌后「出牌」';
    renderGame();
    return;
  }
  if (game.online) {
    pinusSync(() => getOnlineNet().ddzPass());
    return;
  }
  applyPass(HUMAN);
  selected = new Set();
  hintText = auto ? '系统：不出' : '你选择不出';
  renderGame();
  scheduleAi();
}

function onHint() {
  if (!game || game.phase !== 'play' || game.currentPlayer !== HUMAN) return;
  if (game.online) {
    pinusSync(async () => {
      const data = await getOnlineNet().ddzHint();
      if (data?.cards?.length) {
        selected = new Set(data.cards.map((c) => c.id));
        hintText = `提示：已选 ${data.cards.length} 张 · 再点「出牌」`;
      } else {
        selected = new Set();
        hintText = '没有能压的牌，请点「不出」';
      }
      // 返回最新房间态（若有）
      return data?.room ? data : { room: getOnlineNet().getLastRoom?.() || undefined, cards: data?.cards };
    });
    return;
  }
  const prev = prevFor(HUMAN);
  const hint = getPlayHint(game.hands[HUMAN], prev);
  if (!hint?.cards?.length) {
    selected = new Set();
    hintText = prev ? '没有能压的牌，请点「不出」' : '没有提示，请手动点选任意合法牌型';
    renderGame();
    // 高亮不出按钮
    nodes.passButton?.classList.add('pulse-hint');
    setTimeout(() => nodes.passButton?.classList.remove('pulse-hint'), 1200);
    return;
  }
  selected = new Set(hint.cards.map((c) => c.id));
  hintText = `提示：${typeLabel(hint.type, hint)} ${hint.cards.map(cardText).join(' ')} · 再点「出牌」`;
  renderGame();
  nodes.playButton?.classList.add('pulse-hint');
  setTimeout(() => nodes.playButton?.classList.remove('pulse-hint'), 1200);
}

/** 点选手牌（单击切换） */
function toggleCardSelect(cardId) {
  if (!canSelectHand() || !cardId) return;
  if (selected.has(cardId)) selected.delete(cardId);
  else selected.add(cardId);
  paintHandSelection();
  updateHintFromSelection();
  if (nodes.tableStatus) nodes.tableStatus.textContent = statusLine();
  // 选中后刷新出牌按钮可用态
  const myPlay = game.phase === 'play' && game.currentPlayer === HUMAN;
  if (nodes.playButton) nodes.playButton.disabled = !myPlay;
}

function onToggleTrustee() {
  trustee = !trustee;
  hintText = trustee ? '已托管（系统代打）' : '已取消托管';
  renderGame();
  if (trustee) scheduleAi();
}

function applyPlay(player, cards, parsed) {
  const ids = new Set(cards.map((c) => c.id));
  const isLead = !game.lastPlay;
  if (isLead) game.tableActs = [null, null, null];

  game.hands[player] = sortCards(game.hands[player].filter((c) => !ids.has(c.id)));
  game.lastPlay = { player, cards: cards.slice(), parsed };
  game.tableActs[player] = { kind: 'play', cards: cards.slice(), parsed };
  if (!Array.isArray(game.playedCards)) game.playedCards = [];
  game.playedCards.push(...cards.map((c) => ({ ...c })));
  game.passCount = 0;
  game.playCounts[player] += 1;

  // 炸弹 / 连炸 / 火箭 动态倍率
  if (parsed.type === HandType.CHAIN_BOMB || parsed.type === 'chain_bomb') {
    const n = parsed.length || 2;
    const factor = chainBombMultiplier(n); // 2^N
    game.multiplier *= factor;
    if (game.bombExtra) game.multiplier *= (1 + game.bombExtra);
    game.bombCount += n;
    game.chainBombEvents = (game.chainBombEvents || 0) + 1;
  } else if (parsed.type === HandType.BOMB || parsed.type === HandType.ROCKET) {
    game.multiplier *= 2;
    if (game.bombExtra) game.multiplier *= (1 + game.bombExtra);
    game.bombCount += 1;
  }

  if (game.hands[player].length === 0) {
    settle(player);
    return;
  }
  game.currentPlayer = (player + 1) % 3;
}

function applyPass(player) {
  game.passCount += 1;
  game.tableActs[player] = { kind: 'pass' };
  if (game.passCount >= 2) {
    const leader = game.lastPlay?.player;
    if (leader == null) {
      game.passCount = 0;
      game.currentPlayer = (player + 1) % 3;
      return;
    }
    game.lastPlay = null;
    game.passCount = 0;
    game.currentPlayer = leader;
    game.tableActs = [null, null, null];
    if (leader === HUMAN) hintText = '两家不要，你可自由出牌';
  } else {
    game.currentPlayer = (player + 1) % 3;
  }
}

function settle(winner) {
  if (game.settled) return;
  game.settled = true;
  game.phase = 'settle';
  game.winner = winner;

  const landlordWin = winner === game.landlord;
  // 春天 / 反春
  let spring = false;
  if (landlordWin) {
    spring = [0, 1, 2].filter((i) => i !== game.landlord).every((i) => game.playCounts[i] === 0);
  } else {
    spring = game.playCounts[game.landlord] <= 1;
  }
  if (spring) game.multiplier *= 2;

  // multiplier 累计 = callMult × doubleProduct × 炸弹/连炸/春天
  // 农民独立结算：line = stake×叫分×unit×(mult/doubleProduct)×f_i×f_地主
  const factors = game.doubleFactors || [1, 1, 1];
  const li = game.landlord;
  const playMult = Math.max(1, game.multiplier);
  const doubleProduct = Math.max(1, factors.reduce((a, b) => a * b, 1));
  const baseUnit = game.stake * (game.currentBid || 1) * (game.unit || 1)
    * (playMult / doubleProduct);
  const scores = [0, 0, 0];
  const farmers = [0, 1, 2].filter((i) => i !== li);
  for (const fi of farmers) {
    const line = baseUnit * (factors[fi] || 1) * (factors[li] || 1);
    if (landlordWin) {
      scores[li] += line;
      scores[fi] -= line;
    } else {
      scores[li] -= line;
      scores[fi] += line;
    }
  }
  const score = scores[HUMAN];
  game.score = score;
  game.scores = scores;
  game.spring = spring;
  game.baseScore = baseUnit;
  game.landlordWin = landlordWin;
  game.doubleProduct = doubleProduct;

  const currency = game.currency || 'ingot';
  const settled = applyResultWithRevenue({
    currency,
    resultDelta: score,
    baseScore: game.stake || 0,
    game: 'doudizhu',
    roomName: game.roomName,
    refundBuyIn: currency === 'crypto' ? (game.stake || 0) : 0,
    alreadyCollected: currency !== 'crypto',
  });
  game.platformFee = settled.fee;
  game.platformFeeKind = settled.kind;
  appState.records.unshift({
    roomName: game.roomName,
    result: score >= 0 ? '胜' : '负',
    score,
    at: new Date().toISOString(),
    game: 'doudizhu',
    currency,
  });
  appState.records = appState.records.slice(0, 50);
  saveState();
  renderAccount();
  const unit = currencyLabel(currency);
  const scoreTxt = currency === 'crypto'
    ? `${score >= 0 ? '+' : ''}${formatCrypto(score)} ${unit}`
    : `${score >= 0 ? '+' : ''}${score} ${unit}`;
  const feeNote = game.platformFee
    ? (currency === 'crypto' ? ` · 赢家手续费 ${formatCrypto(game.platformFee)}` : ` · 台费 ${game.platformFee}`)
    : '';
  hintText = `本局结束 ${scoreTxt}${spring ? '（春天）' : ''}${feeNote}`;
  trustee = false;
  ddzSettleShown = false;
  // 弹窗在 renderGame 后展示
  queueMicrotask(() => showDdzResultModal());
}

function showDdzResultModal() {
  if (!game || game.phase !== 'settle' || !nodes.ddzModal || ddzSettleShown) return;
  ddzSettleShown = true;

  const humanWin = game.score > 0;
  const humanDraw = game.score === 0;
  if (nodes.ddzBanner) {
    nodes.ddzBanner.classList.remove('is-win', 'is-lose', 'is-draw');
    nodes.ddzBanner.classList.add(humanWin ? 'is-win' : (humanDraw ? 'is-draw' : 'is-lose'));
  }
  if (nodes.ddzTitle) {
    nodes.ddzTitle.textContent = humanWin ? '你赢了' : (humanDraw ? '平局' : '再来一局');
  }
  const settleAd = document.getElementById('ddzSettleAd');
  if (settleAd) {
    settleAd.hidden = false;
    settleAd.removeAttribute('hidden');
  }

  const winnerName = NAMES[game.winner] || '—';
  const roleWin = game.landlordWin ? '地主胜' : '农民胜';
  const bits = [
    `${winnerName} 出完`,
    roleWin,
    `叫分 ${game.currentBid || 0}`,
    `${game.multiplier} 倍`,
  ];
  if (game.spring) bits.push(game.landlordWin ? '春天' : '反春');
  if (game.bombCount) bits.push(`炸弹段×${game.bombCount}`);
  if (game.chainBombEvents) bits.push(`连炸×${game.chainBombEvents}`);
  if (game.doubleProduct && game.doubleProduct > 1) bits.push(`加倍×${game.doubleProduct}`);
  if (nodes.ddzSub) nodes.ddzSub.textContent = bits.join(' · ');

  const scores = game.scores || [game.score, 0, 0];
  if (nodes.ddzBody) {
    nodes.ddzBody.innerHTML = [0, 1, 2].map((i) => {
      const isLd = game.landlord === i;
      const role = isLd ? getLandlordLabel(i) : '农民';
      const remain = game.hands[i]?.length ?? 0;
      const d = scores[i] || 0;
      const dCls = d > 0 ? 'pos' : (d < 0 ? 'neg' : 'flat');
      const dTxt = game.currency === 'crypto'
        ? `${d > 0 ? '+' : ''}${formatCrypto(d)}`
        : (d > 0 ? `+${d}` : String(d));
      const winRow = i === game.winner || (game.landlordWin ? isLd : !isLd);
      const playerCell = resultPlayerHtml({
        seat: i,
        name: NAMES[i],
        isMe: i === HUMAN,
        // 自己跟个人形象；地主位用地主/地主婆立绘；对手用角色立绘
        src: isLd ? getLandlordFigureSrc(i) : (i === HUMAN ? getAvatarSrc() : getSeatCharacterSrc(i)),
        badge: isLd ? getLandlordLabel(i) : '',
      });
      return `<tr class="${winRow ? 'is-winner' : ''} ${i === HUMAN ? 'is-me' : ''}">
        <td>${playerCell}</td>
        <td>${role}</td>
        <td>${remain} 张</td>
        <td class="${dCls}">${dTxt}</td>
      </tr>`;
    }).join('');
  }

  if (nodes.ddzYou) {
    const d = game.score || 0;
    const unit = currencyLabel(game.currency || 'ingot');
    const fmt = game.currency === 'crypto' ? formatCrypto(Math.abs(d)) : String(Math.abs(d));
    if (d > 0) nodes.ddzYou.innerHTML = `本局你 <strong class="pos">+${fmt}</strong> ${unit}`;
    else if (d < 0) nodes.ddzYou.innerHTML = `本局你 <strong class="neg">-${fmt}</strong> ${unit}`;
    else nodes.ddzYou.innerHTML = `本局你 <strong class="flat">0</strong> ${unit}（持平）`;
  }

  nodes.ddzModal.hidden = false;
  nodes.ddzModal.removeAttribute('hidden');
  nodes.ddzModal.classList.add('is-open');
}

function hideDdzResultModal() {
  ddzSettleShown = false;
  if (!nodes.ddzModal) return;
  nodes.ddzModal.hidden = true;
  nodes.ddzModal.setAttribute('hidden', '');
  nodes.ddzModal.classList.remove('is-open');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function prevFor(player) {
  if (!game?.lastPlay) return null;
  if (game.lastPlay.player === player) return null;
  return game.lastPlay.parsed;
}

// ─── AI（JJ 规则引擎） ───────────────────────────────
function scheduleAi() {
  clearAi();
  if (!game || game.phase === 'settle') return;
  // Pinus 联网局：AI 在服务端驱动，前端不再跑本地 AI
  if (game.online) return;
  if (game.phase === 'bid' && game.bidTurn === HUMAN) {
    if (trustee) aiTimer = setTimeout(() => onBid(safeAiBid(HUMAN)), 320);
    return;
  }
  if (game.phase === 'double' && !game.doubleDecided[HUMAN]) {
    if (trustee) aiTimer = setTimeout(() => onDouble(safeAiDouble(HUMAN)), 320);
    return;
  }
  if (game.phase === 'play' && game.currentPlayer === HUMAN) {
    if (trustee) aiTimer = setTimeout(autoHuman, 320);
    return;
  }
  aiTimer = setTimeout(runAi, 380);
}

function clearAi() {
  if (aiTimer) {
    clearTimeout(aiTimer);
    aiTimer = null;
  }
}

function safeAiBid(player) {
  const want = decideBid(game.hands[player], game.currentBid);
  if (want > 0 && want <= game.currentBid) return 0;
  return want;
}

function runAi() {
  if (!game || game.phase === 'settle') return;
  let guard = 0;
  while (guard++ < 16) {
    if (game.phase === 'settle') break;
    if (game.phase === 'bid') {
      if (game.bidTurn === HUMAN) break;
      applyBid(game.bidTurn, safeAiBid(game.bidTurn));
      continue;
    }
    if (game.phase === 'double') {
      let acted = false;
      for (let i = 0; i < 3; i++) {
        if (!game.doubleDecided[i] && i !== HUMAN) {
          applyDouble(i, safeAiDouble(i));
          acted = true;
        }
      }
      if (!acted) break;
      continue;
    }
    if (game.phase === 'play') {
      if (game.currentPlayer === HUMAN) break;
      aiPlaySeat(game.currentPlayer);
      break;
    }
    break;
  }
  renderGame();
  if (!game || game.phase === 'settle') return;
  if ((game.phase === 'bid' && game.bidTurn !== HUMAN)
    || (game.phase === 'double' && game.doubleDecided.some((d, i) => !d && i !== HUMAN))
    || (game.phase === 'play' && game.currentPlayer !== HUMAN)) {
    aiTimer = setTimeout(runAi, 300);
  } else if (trustee) {
    aiTimer = setTimeout(autoHuman, 300);
  }
}

function aiPlaySeat(seat) {
  const prev = prevFor(seat);
  // 新 AI：makeAIDecision（身份感知 + 手数优化）
  const role = game.landlord === seat ? 'landlord' : 'farmer';
  const dec = makeAIDecision(game.hands[seat], prev, role, {
    myIndex: seat,
    landlordIndex: game.landlord,
    lastPlayerIndex: game.lastPlay?.player,
    handCounts: game.hands.map((h) => h.length),
  });
  if (dec.action === 'pass' || !dec.cards?.length) {
    if (prev) applyPass(seat);
    else {
      if (game.variant === 'laizi') {
        const h = getPlayHint(game.hands[seat], null);
        if (h?.cards?.length) applyPlay(seat, h.cards, h);
        return;
      }
      const options = findBeatingHands(game.hands[seat], null);
      const normal = options.filter(
        (p) => p.type !== HandType.BOMB
          && p.type !== HandType.ROCKET
          && p.type !== HandType.CHAIN_BOMB
      );
      const pick = normal[0] || options[0];
      if (pick) applyPlay(seat, pick.cards, pick);
    }
    return;
  }
  let parsed = parsePlayCards(dec.cards) || dec.parsed;
  if (!parsed || (prev && !canBeatPlay(prev, parsed))) {
    const h = getPlayHint(game.hands[seat], prev);
    if (h?.cards?.length && (!prev || canBeatPlay(prev, h))) {
      applyPlay(seat, h.cards, h);
      return;
    }
    if (prev) applyPass(seat);
    return;
  }
  applyPlay(seat, dec.cards, parsed);
}

function autoHuman() {
  if (!game || game.phase === 'settle') return;
  if (game.phase === 'bid' && game.bidTurn === HUMAN) {
    onBid(safeAiBid(HUMAN));
    return;
  }
  if (game.phase === 'double' && !game.doubleDecided[HUMAN]) {
    onDouble(safeAiDouble(HUMAN));
    return;
  }
  if (game.phase === 'play' && game.currentPlayer === HUMAN) {
    const prev = prevFor(HUMAN);
    const hint = getPlayHint(game.hands[HUMAN], prev);
    if (!hint?.cards?.length) {
      if (prev) onPass(true);
      return;
    }
    selected = new Set(hint.cards.map((c) => c.id));
    onPlay();
  }
}

// ─── 渲染 ───────────────────────────────────────────
function renderGame() {
  if (!game) return;

  nodes.tableView?.classList.toggle('is-bidding', game.phase === 'bid');
  if (nodes.roomName) nodes.roomName.textContent = game.roomName;
  if (nodes.stakeLabel) nodes.stakeLabel.textContent = String(game.stake);
  if (nodes.tableStatus) nodes.tableStatus.textContent = statusLine();
  if (nodes.lastPlayText) nodes.lastPlayText.textContent = lastPlayLine();

  if (nodes.multBadge) {
    if (game.phase === 'play' || game.phase === 'settle' || game.phase === 'double') {
      nodes.multBadge.hidden = false;
      nodes.multBadge.removeAttribute('hidden');
      nodes.multBadge.textContent = `${game.multiplier}倍`;
    } else {
      nodes.multBadge.hidden = true;
      nodes.multBadge.setAttribute('hidden', '');
    }
  }
  if (nodes.footerMult) nodes.footerMult.textContent = String(game.multiplier || 1);

  const showBottom = game.phase === 'play' || game.phase === 'settle' || game.phase === 'double';
  if (nodes.bottomCards) {
    nodes.bottomCards.innerHTML = showBottom
      ? game.bottom.map((c) => cardFaceMiniHtml(c)).join('')
      : `<span class="mini-card face-down">${brandMiniBackBadgeHtml()}</span>`
        + `<span class="mini-card face-down">${brandMiniBackBadgeHtml()}</span>`
        + `<span class="mini-card face-down">${brandMiniBackBadgeHtml()}</span>`;
  }

  if (nodes.remain1) {
    nodes.remain1.textContent = String(
      game.handsCount?.[1] ?? game.hands[1]?.length ?? 0,
    );
  }
  if (nodes.remain2) {
    nodes.remain2.textContent = String(
      game.handsCount?.[2] ?? game.hands[2]?.length ?? 0,
    );
  }

  // 豆子展示（影子积分）
  if (nodes.selfBeanDisplay) nodes.selfBeanDisplay.textContent = format(appState.ingots);
  $$('[data-bean]').forEach((el) => {
    const idx = Number(el.getAttribute('data-bean'));
    // 对手用固定展示值 + 本局变化感
    const base = idx === 1 ? 54360 : 25230;
    el.textContent = format(base);
  });

  for (let p = 0; p < 3; p++) {
    const badge = nodes.roleBadges[p];
    if (!badge) continue;
    badge.classList.remove('is-landlord', 'is-landlord-female', 'is-landlord-male');
    if (game.landlord < 0) {
      // 未定地主：自己「我」，对手「待」
      badge.textContent = p === HUMAN ? '我' : '待';
      badge.title = p === HUMAN ? '我' : '待定身份';
    } else if (game.landlord === p) {
      const label = getLandlordLabel(p);
      const gender = getSeatCharKind(p);
      badge.textContent = label;
      badge.classList.add('is-landlord');
      badge.classList.add(gender === 'female' ? 'is-landlord-female' : 'is-landlord-male');
      badge.title = label;
    } else {
      badge.textContent = p === HUMAN ? '我' : '农民';
      badge.title = p === HUMAN ? '我（农民）' : '农民';
    }
  }
  // 地主立绘 / 座位高亮（男=经典地主，女=地主婆）
  applyDdzLandlordVisuals();

  $$('.character-panel').forEach((panel) => {
    const idx = Number(panel.getAttribute('data-char'));
    const isTurn =
      (game.phase === 'bid' && game.bidTurn === idx)
      || (game.phase === 'double' && !game.doubleDecided[idx])
      || (game.phase === 'play' && game.currentPlayer === idx);
    panel.classList.toggle('is-turn', isTurn);
  });

  renderSeat(nodes.opponentLeft, 1);
  renderSeat(nodes.opponentRight, 2);
  renderSeat(nodes.selfSeat, 0);
  renderPlayZones();
  renderHand();
  renderDeckMeter();

  const myBid = game.phase === 'bid' && game.bidTurn === HUMAN;
  const myDouble = game.phase === 'double' && !game.doubleDecided[HUMAN];
  const myPlay = game.phase === 'play' && game.currentPlayer === HUMAN;
  setHidden(nodes.bidControls, !myBid);
  setHidden(nodes.doubleControls, !myDouble);
  setHidden(nodes.playControls, !myPlay);
  setHidden(nodes.settleControls, game.phase !== 'settle');
  pinP0ActionBar(nodes.bidControls);
  pinP0ActionBar(nodes.doubleControls);
  pinP0ActionBar(nodes.playControls);
  const selfSlot = document.querySelector('#tableView .self-slot');
  const bottomBar = document.querySelector('#tableView .qq-bottom-bar');
  if (selfSlot) selfSlot.style.removeProperty('bottom');
  if (bottomBar) bottomBar.style.removeProperty('bottom');

  // 地主加倍阶段：只显示不加倍/反加倍（隐藏超级加倍）
  if (nodes.superDoubleBtn) {
    const showSuper = myDouble && game.landlord !== HUMAN && game.allowSuperDouble;
    setHidden(nodes.superDoubleBtn, !showSuper);
  }
  if (myDouble && nodes.doubleControls) {
    const isLd = game.landlord === HUMAN;
    nodes.doubleControls.querySelectorAll('[data-double]').forEach((btn) => {
      const f = Number(btn.getAttribute('data-double'));
      if (isLd && f === 4) btn.hidden = true;
      else if (isLd && f === 2) btn.textContent = '反加倍';
      else if (f === 2) btn.textContent = '加倍';
      else if (f === 1) btn.textContent = '不加倍';
      else if (f === 4) btn.textContent = '超级加倍';
    });
  }

  // 结算弹窗
  if (game.phase === 'settle') {
    showDdzResultModal();
  } else {
    hideDdzResultModal();
  }

  const canPass = Boolean(myPlay && game.lastPlay && game.lastPlay.player !== HUMAN);
  if (nodes.passButton) {
    nodes.passButton.disabled = !canPass;
    nodes.passButton.classList.toggle('is-recommended', canPass && !selected.size);
  }
  if (nodes.playButton) {
    nodes.playButton.disabled = !myPlay;
    nodes.playButton.classList.toggle('is-recommended', myPlay && selected.size > 0);
  }
  if (nodes.hintButton) nodes.hintButton.disabled = !myPlay;
  if (nodes.trusteeButton) nodes.trusteeButton.textContent = trustee ? '取消托管' : '托管';
  if (nodes.turnTimer) {
    const showClock = myPlay || myBid || myDouble;
    nodes.turnTimer.textContent = showClock ? '20' : '';
    nodes.turnTimer.classList.toggle('is-active', showClock);
    setHidden(nodes.turnTimer, !showClock);
  }
  // 确保当前可见操作区可点
  if (nodes.playControls && !nodes.playControls.hidden) {
    nodes.playControls.style.pointerEvents = 'auto';
    nodes.playControls.style.zIndex = '120';
  }
  if (nodes.bidControls && !nodes.bidControls.hidden) {
    nodes.bidControls.style.pointerEvents = 'auto';
    nodes.bidControls.style.zIndex = '120';
  }
  if (nodes.doubleControls && !nodes.doubleControls.hidden) {
    nodes.doubleControls.style.pointerEvents = 'auto';
    nodes.doubleControls.style.zIndex = '120';
  }

  $$('[data-bid]').forEach((btn) => {
    const s = Number(btn.dataset.bid);
    if (s === 0) btn.disabled = false;
    else btn.disabled = s <= (game.currentBid || 0);
  });

  nodes.tableView.hidden = false;
  nodes.tableView.removeAttribute('hidden');
}

/**
 * 记牌器（顶栏 qq-deck-meter）
 * 欢乐斗地主规则：显示各点数「还剩几张」= 全副牌张数 − 本局已打出张数
 * 大王/小王各 1 张，其余点数各 4 张
 */
function renderDeckMeter() {
  if (!nodes.deckMeter || !game) return;
  const full = (r) => (r === 16 || r === 17 ? 1 : 4);
  const played = Object.create(null);
  for (let r = 3; r <= 17; r++) played[r] = 0;

  const addCards = (list) => {
    for (const c of list || []) {
      if (c && played[c.rank] != null) played[c.rank] += 1;
    }
  };
  // 本局累计打出
  addCards(game.playedCards);
  // 兜底：若未写入 playedCards，用当前桌面可见出牌
  if (!game.playedCards?.length) {
    for (const act of Object.values(game.tableActs || {})) {
      if (act?.kind === 'play' && act.cards?.length) addCards(act.cards);
    }
  }

  nodes.deckMeter.querySelectorAll('.qq-meter-item').forEach((item) => {
    const r = Number(item.getAttribute('data-rank'));
    const max = full(r);
    const left = Math.max(0, max - (played[r] || 0));
    const i = item.querySelector('i');
    if (i) {
      i.textContent = String(left);
      i.classList.toggle('is-zero', left === 0);
      i.classList.toggle('is-hot', left >= (max === 1 ? 1 : 3));
      i.classList.toggle('is-mid', left > 0 && left < (max === 1 ? 1 : 3));
    }
    item.title = `${item.querySelector('b')?.textContent || r} · 剩余 ${left}/${max}`;
  });
  nodes.deckMeter.setAttribute('aria-label', '记牌器 · 各点数剩余张数');
}

function cardFaceMiniHtml(c) {
  if (!c) return '';
  const t = cardText(c);
  const wild = game?.variant === 'laizi' && isWildCard(c, game.wildRank);
  return `<span class="mini-card ${isRed(c) ? 'red-card' : ''}${wild ? ' is-wild' : ''}" title="${t}${wild ? ' · 癞子' : ''}">`
    + `<span class="pc-rank">${t.replace(/[♠♥♣♦]/g, '')}</span>`
    + `<span class="pc-suit">${t.match(/[♠♥♣♦]/)?.[0] || ''}</span>`
    + (wild ? '<i class="pc-wild-tag mini-wild">癞</i>' : '')
    + brandMiniBadgeHtml()
    + '</span>';
}

function setHidden(el, hidden) {
  if (!el) return;
  el.hidden = hidden;
  if (hidden) {
    el.setAttribute('hidden', '');
    el.style.setProperty('display', 'none', 'important');
    el.style.setProperty('pointer-events', 'none', 'important');
  } else {
    el.removeAttribute('hidden');
    el.style.removeProperty('display');
    el.style.removeProperty('pointer-events');
  }
}

function renderSeat(node, player) {
  if (!node || !game) return;
  const isLd = game.landlord === player;
  const role = isLd
    ? getLandlordLabel(player)
    : (game.landlord >= 0 ? '农民' : '待定');
  const isCurrent =
    (game.phase === 'bid' && game.bidTurn === player)
    || (game.phase === 'double' && !game.doubleDecided[player])
    || (game.phase === 'play' && game.currentPlayer === player);
  node.classList.toggle('current-turn', isCurrent);
  // 整卡高亮：信息卡本体（避免 player-seat 自己再画大椭圆描边）
  const meta = node.closest?.('.qq-player-meta, .qq-self-info');
  meta?.classList.toggle('is-turn-meta', isCurrent);
  meta?.classList.toggle('is-landlord-meta', isLd);
  node.closest?.('.character-panel')?.classList.toggle('is-turn', isCurrent);
  const bid = game.bidScores[player];
  let line3 = '';
  if (game.phase === 'bid') {
    line3 = bid === null ? (isCurrent ? '思考中…' : '未叫') : (bid === 0 ? '不叫' : `叫 ${bid} 分`);
  } else if (game.phase === 'double') {
    if (game.doubleDecided[player]) {
      const f = game.doubleFactors[player];
      line3 = f === 4 ? '超级加倍' : (f === 2 ? (player === game.landlord ? '反加倍' : '加倍') : '不加倍');
    } else {
      line3 = isCurrent ? '加倍中…' : '等待';
    }
  } else if (game.phase === 'settle') {
    line3 = game.winner === player ? '胜利' : '结束';
  } else {
    line3 = isCurrent ? '出牌中' : '观战';
  }
  // 手牌张数由 remain-chips 展示，此处只写身份 + 行动，避免与蓝色 17 重复
  const roleCls = isLd
    ? `seat-role-line is-landlord-role${getSeatCharKind(player) === 'female' ? ' is-female' : ' is-male'}`
    : 'seat-role-line';
  node.innerHTML =
    `<span class="${roleCls}">${role}</span>`
    + `<small class="seat-act-line">${line3}</small>`;
}

function renderPlayZones() {
  if (!game) return;
  for (let p = 0; p < 3; p++) {
    const zone = nodes.playZones[p];
    if (!zone) continue;
    const act = game.tableActs[p];
    zone.innerHTML = '';
    if (!act) continue;
    if (act.kind === 'pass') {
      const b = document.createElement('div');
      b.className = 'pass-bubble';
      b.textContent = '不出';
      zone.appendChild(b);
      continue;
    }
    if (act.kind === 'bid') {
      const b = document.createElement('div');
      b.className = 'bid-bubble';
      b.textContent = act.score === 0 ? '不叫' : `${act.score} 分`;
      zone.appendChild(b);
      continue;
    }
    if (act.kind === 'double') {
      const b = document.createElement('div');
      b.className = 'bid-bubble';
      b.textContent = act.label || '加倍';
      zone.appendChild(b);
      continue;
    }
    if (act.kind === 'play' && act.cards?.length) {
      sortCards(act.cards, false).forEach((card, i) => {
        const el = document.createElement('span');
        const wild = game?.variant === 'laizi' && isWildCard(card, game.wildRank);
        el.className = 'table-card' + (isRed(card) ? ' red-card' : '') + (wild ? ' is-wild' : '');
        el.innerHTML = cardFaceHtml(card, { wild });
        el.title = typeLabel(act.parsed?.type, act.parsed);
        el.style.zIndex = String(i + 1);
        zone.appendChild(el);
      });
    }
  }
}

function renderHand() {
  if (!nodes.handArea || !game) return;
  nodes.handArea.innerHTML = '';
  const canSelect = canSelectHand();
  // 展示：按斗地主规则大→小从左到右（大王、小王、2、A...3）
  const hand = sortCards(game.hands[HUMAN], false);
  // 同步 hands[HUMAN] 顺序为展示序，便于 index 划选
  game.hands[HUMAN] = hand;

  hand.forEach((card, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    const isWild = game?.variant === 'laizi' && isWildCard(card, game.wildRank);
    btn.className = 'playing-card'
      + (isRed(card) ? ' red-card' : '')
      + (selected.has(card.id) ? ' selected' : '')
      + (isWild ? ' is-wild' : '');
    btn.dataset.id = card.id;
    btn.dataset.index = String(index);
    btn.title = isWild ? `${cardText(card)} · 癞子` : cardText(card);
    btn.style.cursor = canSelect ? 'pointer' : 'default';
    // 角标式牌面：点数/花色贴左上，叠压时仍完整可见
    btn.innerHTML = cardFaceHtml(card, {
      wild: isWild,
      brandBadgeHtml: brandCardBadgeHtml(),
    });
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // 划选结束后的 click 忽略（避免与 mousedown 重复切换）
      if (dragActive || dragMoved) return;
      if (suppressNextHandClick) {
        suppressNextHandClick = false;
        return;
      }
      // 兜底：部分 H5/WebView 只派发 click，不稳定派发 mousedown。
      toggleHandCard(btn);
    });
    btn.addEventListener('pointerup', (e) => {
      // 触摸结束时若未划动，保证选中态
      if (!canSelect || dragMoved) return;
    });
    btn.tabIndex = canSelect ? 0 : -1;
    btn.setAttribute('aria-pressed', selected.has(card.id) ? 'true' : 'false');
    nodes.handArea.appendChild(btn);
  });
  try { fitAllHands(); } catch (_) {}
}

function statusLine() {
  if (!game) return '准备';
  const mode = game.variantLabel || '';
  if (game.phase === 'bid') {
    const who = game.bidTurn === HUMAN ? '你' : NAMES[game.bidTurn];
    return `${mode}叫分 · 轮到${who} · 当前${game.currentBid || 0}分`;
  }
  if (game.phase === 'double') {
    if (!game.doubleDecided[HUMAN]) {
      return game.landlord === HUMAN
        ? `${mode}加倍 · 你是地主，请选择反加倍`
        : `${mode}加倍 · 请选择是否加倍`;
    }
    return `${mode}加倍 · 等待其他玩家…`;
  }
  if (game.phase === 'play') {
    const who = game.currentPlayer === HUMAN ? '你' : NAMES[game.currentPlayer];
    const m = game.multiplier > 1 ? ` · ${game.multiplier}倍` : '';
    const wild = game.wildRank ? ` · 癞${RANK_LABEL[game.wildRank] || game.wildRank}` : '';
    return `${mode}出牌 · 轮到${who}${m}${wild}`;
  }
  if (game.phase === 'settle') {
    return `${mode}结算 · ${game.score >= 0 ? '+' : ''}${game.score}`;
  }
  return mode || '准备';
}

function lastPlayLine() {
  if (!game) return '';
  if (game.phase === 'settle') {
    return `${NAMES[game.winner]} 出完 · 你 ${game.score >= 0 ? '+' : ''}${game.score}${game.spring ? ' · 春天' : ''}`;
  }
  if (game.phase === 'bid') {
    if (game.bidTurn === HUMAN) return '请叫分：1 / 2 / 3 分或不叫';
    return `等待 ${NAMES[game.bidTurn]} 叫分…`;
  }
  if (game.phase === 'double') {
    if (!game.doubleDecided[HUMAN]) {
      return game.landlord === HUMAN
        ? '请选择：不加倍 / 反加倍'
        : (game.allowSuperDouble ? '请选择：不加倍 / 加倍 / 超级加倍' : '请选择：不加倍 / 加倍');
    }
    const pending = [0, 1, 2].filter((i) => !game.doubleDecided[i]).map((i) => NAMES[i]);
    return pending.length ? `等待 ${pending.join('、')} 加倍…` : '加倍完成';
  }
  if (!game.lastPlay) {
    return game.currentPlayer === HUMAN ? '自由出牌 · 选牌后点「出牌」' : `等待 ${NAMES[game.currentPlayer]}…`;
  }
  if (game.currentPlayer === HUMAN) {
    const t = typeLabel(game.lastPlay.parsed?.type, game.lastPlay.parsed);
    return `压 ${NAMES[game.lastPlay.player]}：${game.lastPlay.cards.map(cardText).join(' ')}${t ? `（${t}）` : ''}`;
  }
  return `等待 ${NAMES[game.currentPlayer]}…`;
}

function isRed(card) {
  return Boolean(card.isRed || card.red);
}

function format(n) {
  return Number(n).toLocaleString('zh-CN');
}

function todayKey(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

function createDefaultWardrobeState() {
  return {
    inventory: [...DEV_DEFAULT_INVENTORY],
    savedAvatar: initializeDefaultAvatar(),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeWardrobeState(saved = {}) {
  const fallback = createDefaultWardrobeState();
  const inventory = Array.isArray(saved.inventory) && saved.inventory.length
    ? Array.from(new Set([
      ...saved.inventory,
      ...DEV_DEFAULT_INVENTORY,
      ...Object.values(DEFAULT_EQUIPMENT).filter(Boolean),
    ]))
    : fallback.inventory;
  const savedAvatar = saved.savedAvatar?.equipment
    ? {
        baseAvatarId: saved.savedAvatar.baseAvatarId || fallback.savedAvatar.baseAvatarId,
        equipment: { ...DEFAULT_EQUIPMENT, ...saved.savedAvatar.equipment },
      }
    : fallback.savedAvatar;
  return {
    inventory,
    savedAvatar,
    updatedAt: saved.updatedAt || fallback.updatedAt,
  };
}

function getWardrobeState() {
  appState.avatarWardrobe = normalizeWardrobeState(appState.avatarWardrobe);
  return appState.avatarWardrobe;
}

function getSavedAvatar() {
  return getWardrobeState().savedAvatar;
}

function loadState() {
  const today = todayKey();
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
      || localStorage.getItem('tea-parlor-h5-jj-v3');
    if (raw) {
      const saved = JSON.parse(raw);
      // 旧版中间账本 crypto 并入 赛季积分
      const legacyTrial = Number(saved.crypto ?? 0);
      let usdt = Number(saved.usdt ?? 0);
      if (legacyTrial > 0) {
        usdt = Math.round((usdt + legacyTrial) * 100) / 100;
      }
      if (!(usdt > 0) && saved.usdt == null && saved.crypto == null) {
        usdt = 100;
      }
      return {
        ingots: Number(saved.ingots ?? 128600),
        usdt,
        claims: saved.claims?.date === today ? saved.claims : { date: today, count: 0 },
        records: Array.isArray(saved.records) ? saved.records.slice(0, 50) : [],
        profile: { ...DEFAULT_PROFILE, ...(saved.profile || {}) },
        avatarWardrobe: normalizeWardrobeState(saved.avatarWardrobe),
        chainCenter: normalizeChainCenterState(saved.chainCenter),
      };
    }
  } catch (_) {}
  return {
    ingots: 128600,
    usdt: 100,
    claims: { date: today, count: 0 },
    records: [],
    profile: { ...DEFAULT_PROFILE },
    avatarWardrobe: createDefaultWardrobeState(),
    chainCenter: normalizeChainCenterState(),
  };
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(appState)); } catch (_) {}
}

function refreshClaims() {
  const today = todayKey();
  if (appState.claims.date !== today) appState.claims = { date: today, count: 0 };
}

function initChipCurrencyPicker() {
  const el = document.getElementById('chipCurrencyPicker');
  if (!el) return;
  const key = 'tea-parlor-chip-currency';
  try {
    const saved = localStorage.getItem(key);
    if (saved) el.value = saved;
  } catch (_) {}
  window.TeaParlorChipCurrency = el.value || 'SHADOW_POINTS';
  el.addEventListener('change', () => {
    window.TeaParlorChipCurrency = el.value;
    try { localStorage.setItem(key, el.value); } catch (_) {}
  });
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initChipCurrencyPicker, { once: true });
} else {
  initChipCurrencyPicker();
}

function applyTelegramSafeArea() {
  const root = document.documentElement;
  const tg = window.Telegram && window.Telegram.WebApp;
  const vv = window.visualViewport;
  let h = window.innerHeight || 0;
  try {
    if (tg) {
      tg.ready();
      tg.expand();
      const inset = tg.safeAreaInset || tg.contentSafeAreaInset || {};
      if (inset.top != null) root.style.setProperty('--safe-top', inset.top + 'px');
      if (inset.bottom != null) root.style.setProperty('--safe-bottom', inset.bottom + 'px');
      if (tg.viewportStableHeight) h = tg.viewportStableHeight;
    } else if (vv && vv.height) {
      h = vv.height;
    }
  } catch (_) {}
  if (h > 0) root.style.setProperty('--tg-vh', Math.round(h) + 'px');
}
applyTelegramSafeArea();
try { window.Telegram?.WebApp?.onEvent?.('viewportChanged', applyTelegramSafeArea); } catch (_) {}
window.addEventListener('resize', applyTelegramSafeArea);
if (window.visualViewport) window.visualViewport.addEventListener('resize', applyTelegramSafeArea);
