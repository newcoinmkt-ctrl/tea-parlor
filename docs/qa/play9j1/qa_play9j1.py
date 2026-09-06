#!/usr/bin/env python3
"""play9j1 mahjong readability QA @ 414"""
import json, time
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path('/workspace/play9g1-tables/docs/qa/play9j1')
OUT.mkdir(parents=True, exist_ok=True)
URL = 'http://127.0.0.1:5179/index.html?v=play9j1'
VW, VH = 414, 896
REPORT = {
  'cache': 'play9j1',
  'viewport': [VW, VH],
  'url': URL,
  'shots': {},
  'checks': {},
  'deviations': [],
}

def shot(page, name):
  path = OUT / name
  page.screenshot(path=str(path), full_page=False)
  REPORT['shots'][name] = path.stat().st_size
  print('saved', name, path.stat().st_size, flush=True)

def wait_mj_ready(page, min_tiles=13, timeout_ms=25000):
  page.wait_for_selector('#multiGameView:not([hidden])', timeout=timeout_ms)
  deadline = time.time() + timeout_ms / 1000
  n = 0
  while time.time() < deadline:
    page.evaluate("""() => {
      const root = document.querySelector('#multiGameView');
      if (root) root.classList.remove('mj-opening');
      document.querySelectorAll('.mj-open-layer,#mjOpenLayer,.mg-open-layer,.mj-open-panel').forEach(el => {
        el.hidden = true; el.style.display = 'none';
      });
    }""")
    n = page.evaluate("() => document.querySelectorAll('#mgHand .mg-hand-tile, #mgHand .mj-tile').length")
    if n >= min_tiles:
      page.wait_for_timeout(600)
      n2 = page.evaluate("() => document.querySelectorAll('#mgHand .mg-hand-tile, #mgHand .mj-tile').length")
      if n2 >= min_tiles:
        return n2
    page.wait_for_timeout(300)
  return n

def measure_mj(page, label):
  data = page.evaluate("""() => {
    const q = (s) => document.querySelector(s);
    const rect = (el) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return {top:+b.top.toFixed(1), bottom:+b.bottom.toFixed(1), left:+b.left.toFixed(1),
              right:+b.right.toFixed(1), w:+b.width.toFixed(1), h:+b.height.toFixed(1)};
    };
    const colorOf = (el) => el ? getComputedStyle(el).color : null;
    const bgOf = (el) => el ? getComputedStyle(el).backgroundImage || getComputedStyle(el).backgroundColor : null;
    const mg = q('#multiGameView');
    const pill = q('#mgSub') || q('.mg-hud-pill');
    const acts = q('#mgActions');
    const hand = q('#mgHand');
    const dock = q('.mg-hand-dock');
    const qi = q('.mj-btn-qi') || q('#mgActions button.mj-btn-qi') || [...(acts?.querySelectorAll('button')||[])].find(b => /弃/.test(b.textContent||''));
    const hu = q('.mj-btn-hu');
    const turnSeat = q('.mg-seat.is-turn');
    const turnMeta = turnSeat?.querySelector('.mg-meta') || q('.mg-meta.is-turn-meta');
    const acting = q('.mg-meta .is-acting, .mg-meta-turn.is-acting, .mg-meta-turn');
    const tiles = [...document.querySelectorAll('#mgHand .mg-hand-tile, #mgHand .mj-tile')];
    const ab = acts?.getBoundingClientRect();
    const hb = hand?.getBoundingClientRect();
    const gapActsHand = (ab && hb) ? +(hb.top - ab.bottom).toFixed(1) : null;
    return {
      mgClass: mg?.className || '',
      is2p: !!mg?.classList.contains('mj-2p'),
      is4p: !!mg?.classList.contains('mj-4p'),
      pill: { rect: rect(pill), color: colorOf(pill), bg: bgOf(pill), text: (pill?.textContent||'').trim().slice(0,40) },
      actions: rect(acts),
      hand: rect(hand),
      dock: rect(dock),
      gapActsHand,
      actionsAboveHand: !!(ab && hb && ab.bottom <= hb.top + 4),
      qi: { rect: rect(qi), text: (qi?.textContent||'').trim() },
      hu: { rect: rect(hu), color: colorOf(hu) },
      turnMeta: {
        present: !!turnMeta,
        border: turnMeta ? getComputedStyle(turnMeta).borderColor : null,
        bg: turnMeta ? getComputedStyle(turnMeta).backgroundColor : null,
        text: turnMeta ? (turnMeta.textContent||'').trim().slice(0,60) : null,
      },
      acting: {
        present: !!acting,
        className: acting?.className || null,
        color: colorOf(acting),
        text: acting ? (acting.textContent||'').trim() : null,
      },
      tileCount: tiles.length,
      dataMjActCount: document.querySelectorAll('[data-mj-act]').length,
    };
  }""")
  REPORT['checks'][label] = data
  print(label, json.dumps(data, ensure_ascii=False)[:500], flush=True)
  return data

def boot(page):
  page.goto(URL, wait_until='domcontentloaded', timeout=30000)
  page.evaluate('() => localStorage.clear()')
  page.reload(wait_until='domcontentloaded')
  page.wait_for_function('() => Boolean(window.__teaParlor && window.__teaParlor.startMahjong)', timeout=30000)
  # give balances if needed
  page.evaluate("""() => {
    try {
      const s = JSON.parse(localStorage.getItem('tea-parlor-state') || '{}');
      s.balances = Object.assign({ingot: 99999, gold: 99999, crypto: 99999}, s.balances||{});
      localStorage.setItem('tea-parlor-state', JSON.stringify(s));
    } catch(e) {}
    if (window.__teaParlor?.setBalances) window.__teaParlor.setBalances({ingot:99999,gold:99999,crypto:99999});
  }""")

def leave_to_lobby(page):
  page.evaluate("""() => {
    if (window.__teaParlor?.leaveMultiTable) return window.__teaParlor.leaveMultiTable();
    if (window.__teaParlor?.exitTable) return window.__teaParlor.exitTable();
    const btn = document.querySelector('[data-lobby-action=\"leave\"], #mgExit, .mg-exit, button[aria-label*=\"离开\"]');
    if (btn) btn.click();
  }""")
  page.wait_for_timeout(500)
  # force lobby if still in table
  page.evaluate("""() => {
    const shell = document.querySelector('.lobby-shell');
    if (shell) {
      shell.classList.remove('multi-active','table-active','texas-active');
    }
    const mg = document.querySelector('#multiGameView');
    if (mg) mg.hidden = true;
    const lobby = document.querySelector('#lobbyView, .lobby-home, .home-view');
  }""")

with sync_playwright() as p:
  browser = p.chromium.launch(headless=True, args=['--no-sandbox','--disable-dev-shm-usage'])
  ctx = browser.new_context(viewport={'width':VW,'height':VH}, device_scale_factor=2, is_mobile=True, has_touch=True)
  page = ctx.new_page()
  boot(page)

  # --- Lobby quick check ---
  lobby = page.evaluate("""() => {
    const gold = [...document.querySelectorAll('body *')].find(el => /金币/.test(el.textContent||'') && el.children.length < 3 && (el.textContent||'').length < 20);
    const grid = document.querySelector('.game-grid, .lobby-game-grid, .home-games, [data-lobby-grid]');
    const cards = document.querySelectorAll('.game-card, .lobby-game-card, .room-card, .game-entry');
    // play9i1 6-game grid
    const nav = document.querySelectorAll('.bottom-nav a, .bottom-nav button, .tab-nav button, .lobby-tabs button, .home-tabs button');
    const texts = [...document.querySelectorAll('.game-name, .game-card strong, .lobby-game-card, [data-game]')].map(e => (e.textContent||'').trim()).filter(Boolean).slice(0,12);
    const hasGold = /金币/.test(document.body.innerText||'');
    return {
      hasGold,
      cardCount: cards.length,
      navCount: nav.length,
      texts,
      bodySnippet: (document.body.innerText||'').replace(/\\s+/g,' ').slice(0,200),
    };
  }""")
  REPORT['checks']['lobby'] = lobby
  shot(page, 'lobby-414.png')
  print('lobby', lobby, flush=True)

  # --- Mahjong 2p ---
  page.evaluate("() => window.__teaParlor.startMahjong('er')")
  n = wait_mj_ready(page)
  print('mj2p tiles', n, flush=True)
  m2 = measure_mj(page, 'mj2p')
  shot(page, 'mj2p-414.png')

  # --- Mahjong 4p ---
  # leave and restart
  page.evaluate("""() => {
    try { document.querySelector('#mgExit')?.click(); } catch(e) {}
  }""")
  page.wait_for_timeout(400)
  boot(page)
  page.evaluate("() => window.__teaParlor.startMahjong('siren')")
  n4 = wait_mj_ready(page)
  print('mj4p tiles', n4, flush=True)
  m4 = measure_mj(page, 'mj4p')
  shot(page, 'mj4p-414.png')

  # Optional DDZ more menu
  boot(page)
  ddz = page.evaluate("""() => {
    if (window.__teaParlor?.startDouDizhu) { window.__teaParlor.startDouDizhu(); return 'startDouDizhu'; }
    if (window.__teaParlor?.startDoudizhu) { window.__teaParlor.startDoudizhu(); return 'startDoudizhu'; }
    if (window.__teaParlor?.startDDZ) { window.__teaParlor.startDDZ(); return 'startDDZ'; }
    return null;
  }""")
  page.wait_for_timeout(1200)
  more = page.evaluate("""() => {
    const toggle = document.querySelector('#hudMoreToggle, .qq-more-toggle, [data-hud-more], button.qq-more-toggle');
    if (!toggle) return { found: false, starters: Object.keys(window.__teaParlor||{}).filter(k=>/ddz|dizhu|Dou/i.test(k)) };
    toggle.click();
    const menu = document.querySelector('#hudMoreMenu, .qq-more-menu');
    const open = !!(menu && !menu.hidden && getComputedStyle(menu).display !== 'none');
    return { found: true, open, menuHidden: menu?.hidden, display: menu ? getComputedStyle(menu).display : null };
  }""")
  REPORT['checks']['ddz_more'] = {'start': ddz, 'more': more}
  shot(page, 'ddz-more-414.png')
  print('ddz', ddz, more, flush=True)

  # Pass/fail summary
  def rgb_near_dark_gold(color):
    # expect rgb(61, 46, 0) ≈ #3d2e00
    if not color: return False
    import re
    m = re.search(r'rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)', color)
    if not m: return False
    r,g,b = map(int, m.groups())
    return abs(r-61)<25 and abs(g-46)<25 and abs(b-0)<25

  summary = {}
  for key in ('mj2p','mj4p'):
    c = REPORT['checks'].get(key) or {}
    pill_ok = rgb_near_dark_gold((c.get('pill') or {}).get('color'))
    qi = ((c.get('qi') or {}).get('rect') or {})
    qi_ok = qi.get('w') is not None and 48 <= qi.get('w') <= 64 and 48 <= qi.get('h') <= 64
    acts_ok = c.get('actionsAboveHand') is True
    gap = c.get('gapActsHand')
    gap_ok = gap is not None and -2 <= gap <= 20  # ~8px preferred
    turn_ok = (c.get('turnMeta') or {}).get('present') or (c.get('acting') or {}).get('present')
    summary[key] = {
      'pill_dark_on_gold': pill_ok,
      'pill_color': (c.get('pill') or {}).get('color'),
      'qi_size_ok': qi_ok,
      'qi_wh': [qi.get('w'), qi.get('h')],
      'actions_above_hand': acts_ok,
      'gap_acts_hand': gap,
      'gap_ok': gap_ok,
      'turn_highlight': turn_ok,
      'data_mj_act': c.get('dataMjActCount'),
      'mode_class': {'2p': c.get('is2p'), '4p': c.get('is4p')},
    }
  REPORT['summary'] = summary
  REPORT['lobby_ok'] = bool((REPORT['checks'].get('lobby') or {}).get('hasGold'))
  (OUT / 'report.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=2), encoding='utf-8')
  print('SUMMARY', json.dumps(summary, ensure_ascii=False, indent=2), flush=True)
  browser.close()
print('DONE')
