import { SKIN_RESOURCE_MAP, applySkinResourceVariables } from './skin-resources.js';

const THEME_STORAGE_KEY = 'tea-parlor-theme';
const DEFAULT_THEME = 'classic-green';

export const THEMES = [
  { id: 'classic-green', label: '翠绿牌桌', short: '绿', category: 'normal', rarity: 'common', source: '基础衣橱', limited: false, coBranded: false },
  { id: 'dark-gold', label: '暗金夜场', short: '金', category: 'season', rarity: 'rare', source: 'S1 赛季', limited: true, coBranded: false },
  { id: 'chinese-red', label: '绛红茶楼', short: '红', category: 'co_brand', rarity: 'epic', source: '广告联名', limited: true, coBranded: true, adLogoId: 'tea-parlor-partner' },
  { id: 'cyber-neon', label: '霓虹电玩', short: '霓', category: 'chain_memorial', rarity: 'epic', source: '链游测试纪念', limited: true, coBranded: false },
  { id: 'ink-blue', label: '墨蓝书斋', short: '蓝', category: 'event', rarity: 'uncommon', source: '活动掉落', limited: true, coBranded: false },
  { id: 'sunset-amber', label: '暮色琥珀', short: '暮', category: 'event', rarity: 'uncommon', source: '活动掉落', limited: true, coBranded: false },
  { id: 'luxury-emerald', label: '翡翠豪华桌', short: '翠', category: 'co_brand', rarity: 'epic', source: '广告联名', limited: true, coBranded: true, adLogoId: 'tea' },
  { id: 'adpack', label: '广告牌面', short: '广', category: 'co_brand', rarity: 'epic', source: '广告联名', limited: true, coBranded: true, adLogoId: 'btc' },
];

let enabledThemeIds = THEMES.map((theme) => theme.id);

export function setEnabledThemes(ids) {
  const allowed = new Set((ids || []).filter(Boolean));
  enabledThemeIds = THEMES.filter((theme) => !allowed.size || allowed.has(theme.id)).map((theme) => theme.id);
  if (!enabledThemeIds.length) enabledThemeIds = [DEFAULT_THEME];
  const current = document.documentElement.dataset.theme || DEFAULT_THEME;
  if (!enabledThemeIds.includes(current)) applyTheme(enabledThemeIds[0]);
  installThemeSwitcher(document.documentElement.dataset.theme || DEFAULT_THEME);
  return enabledThemeIds.slice();
}

export function listEnabledThemes() {
  return THEMES.filter((theme) => enabledThemeIds.includes(theme.id));
}

export function getThemeMeta(themeId) {
  return THEMES.find((theme) => theme.id === themeId) || null;
}

export function initThemeSystem() {
  const root = document.documentElement;
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  const initial = normalizeTheme(saved);
  applyTheme(initial);
  // 模块脚本可能早于部分节点；确保 switcher 装上
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => installThemeSwitcher(initial), { once: true });
  } else {
    installThemeSwitcher(initial);
  }

  window.TeaParlorThemeSystem = {
    themes: THEMES,
    skins: SKIN_RESOURCE_MAP,
    getTheme: () => root.dataset.theme || DEFAULT_THEME,
    setTheme: applyTheme,
  };
}

export function applyTheme(themeId) {
  const nextTheme = normalizeTheme(themeId);
  const root = document.documentElement;
  root.dataset.theme = nextTheme;
  root.dataset.skin = nextTheme;
  if (document.body) {
    document.body.dataset.theme = nextTheme;
    document.body.dataset.skin = nextTheme;
  }
  applySkinResourceVariables(root, nextTheme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  } catch (_) { /* ignore */ }

  // 同步自定义菜单高亮
  const host = document.querySelector('[data-theme-switcher]');
  if (host) {
    host.querySelectorAll('[data-theme-id]').forEach((btn) => {
      const on = btn.getAttribute('data-theme-id') === nextTheme;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    const label = host.querySelector('[data-theme-current]');
    const meta = THEMES.find((t) => t.id === nextTheme);
    if (label && meta) label.textContent = meta.label;
  }

  document.dispatchEvent(new CustomEvent('tea-parlor-theme-change', {
    detail: { theme: nextTheme, skin: nextTheme },
  }));
  return nextTheme;
}

function installThemeSwitcher(activeTheme) {
  const host = document.querySelector('[data-theme-switcher]');
  if (!host) return;

  host.classList.add('theme-switcher', 'theme-switcher-live');
  host.innerHTML = `
    <button type="button" class="theme-switcher-toggle" data-theme-toggle aria-haspopup="listbox" aria-expanded="false" title="切换皮肤">
      <span class="theme-switcher-ico" aria-hidden="true">🎨</span>
      <span class="theme-switcher-cur" data-theme-current>${(THEMES.find((t) => t.id === activeTheme) || THEMES[0]).label}</span>
      <span class="theme-switcher-caret" aria-hidden="true">▾</span>
    </button>
    <div class="theme-switcher-menu" data-theme-menu hidden role="listbox" aria-label="游戏皮肤">
      ${listEnabledThemes().map((theme) => `
        <button type="button" class="theme-switcher-opt${theme.id === activeTheme ? ' is-active' : ''}"
          role="option"
          data-theme-id="${theme.id}"
          aria-checked="${theme.id === activeTheme ? 'true' : 'false'}">
          <i class="theme-swatch theme-swatch-${theme.id}" aria-hidden="true"></i>
          <span>${theme.label}</span>
          <em class="theme-check" aria-hidden="true">✓</em>
        </button>
      `).join('')}
    </div>
  `;

  const toggle = host.querySelector('[data-theme-toggle]');
  const menu = host.querySelector('[data-theme-menu]');

  const closeMenu = () => {
    if (!menu) return;
    menu.hidden = true;
    menu.setAttribute('hidden', '');
    host.classList.remove('is-open');
    toggle?.setAttribute('aria-expanded', 'false');
  };

  const openMenu = () => {
    if (!menu) return;
    menu.hidden = false;
    menu.removeAttribute('hidden');
    host.classList.add('is-open');
    toggle?.setAttribute('aria-expanded', 'true');
  };

  toggle?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (menu?.hidden) openMenu();
    else closeMenu();
  });

  host.querySelectorAll('[data-theme-id]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = btn.getAttribute('data-theme-id');
      applyTheme(id);
      closeMenu();
    });
  });

  // 点外部关闭（冒泡阶段）
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (host.contains(t)) return;
    closeMenu();
  });

  applyTheme(activeTheme);
}

function normalizeTheme(themeId) {
  if (enabledThemeIds.includes(themeId)) return themeId;
  if (THEMES.some((theme) => theme.id === themeId) && enabledThemeIds.includes(themeId)) return themeId;
  return enabledThemeIds[0] || DEFAULT_THEME;
}
