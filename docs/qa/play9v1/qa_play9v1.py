#!/usr/bin/env python3
"""play9v1: full-face grid hands for DDZ / MJ / GD @ 414"""
import json, time, hashlib
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path('/workspace/play9u2-repo/docs/qa/play9v1')
OUT.mkdir(parents=True, exist_ok=True)
URL = 'http://127.0.0.1:5193/index.html?v=play9v1'
VW, VH = 414, 896
# Landscape-ish for table games if forced; also measure portrait 414
REPORT = {
  'cache': 'play9v1',
  'viewport': [VW, VH],
  'url': URL,
  'shots': {},
  'checks': {},
  'pass': {},
  'ok': False,
}

MIN_DDZ_W, MIN_DDZ_H = 40, 56
MIN_MJ_W, MIN_MJ_H = 32, 44
MIN_GD_W, MIN_GD_H = 40, 56

def shot(page, name):
  path = OUT / name
  page.screenshot(path=str(path), full_page=False)
  data = path.read_bytes()
  REPORT['shots'][name] = {
    'bytes': path.stat().st_size,
    'sha1': hashlib.sha1(data).hexdigest()[:12],
  }
  print('saved', name, path.stat().st_size, flush=True)

def boot(page):
  page.goto(URL, wait_until='domcontentloaded', timeout=30000)
  page.evaluate('() => localStorage.clear()')
  page.reload(wait_until='domcontentloaded')
  page.wait_for_function('() => Boolean(window.__teaParlor)', timeout=45000)
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
    try { if (window.__teaParlor?.leaveMulti) window.__teaParlor.leaveMulti(); } catch(e) {}
    try { if (window.__teaParlor?.lobby) window.__teaParlor.lobby('home'); } catch(e) {}
    const shell = document.querySelector('.lobby-shell');
    if (shell) shell.classList.remove('multi-active','table-active','texas-active');
    const mg = document.querySelector('#multiGameView');
    if (mg) { mg.hidden = true; mg.setAttribute('hidden',''); }
    const tv = document.querySelector('#tableView');
    if (tv) { tv.hidden = true; tv.setAttribute('hidden',''); }
    document.querySelectorAll('#settleOverlay,.settle-mask,#ddzMatchMask').forEach(el => {
      el.hidden = true; el.setAttribute('hidden','');
      el.style.display = 'none';
    });
  }""")
  page.wait_for_timeout(400)

def measure_cards(page, selector, label):
  return page.evaluate("""({selector, label, minW, minH}) => {
    const cards = [...document.querySelectorAll(selector)];
    const rects = cards.map(el => {
      const b = el.getBoundingClientRect();
      return {w:+b.width.toFixed(1), h:+b.height.toFixed(1), left:+b.left.toFixed(1),
              top:+b.top.toFixed(1), right:+b.right.toFixed(1), bottom:+b.bottom.toFixed(1)};
    });
    const overlaps = [];
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        const ix = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const iy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        const area = ix * iy;
        if (area > 1) {
          // full-face grid should have near-zero face overlap
          overlaps.push({i, j, area: +area.toFixed(1), ix:+ix.toFixed(1), iy:+iy.toFixed(1)});
        }
      }
    }
    const widths = rects.map(r => r.w);
    const heights = rects.map(r => r.h);
    const minWidth = widths.length ? Math.min(...widths) : 0;
    const minHeight = heights.length ? Math.min(...heights) : 0;
    const area = cards[0]?.closest('#handArea, #mgHand, .hand-area, .mg-hand') || document.querySelector('#mgHand:not([hidden]), #handArea');
    const isGrid = !!(area && area.classList.contains('hand-grid'));
    const display = area ? getComputedStyle(area).display : null;
    const areaId = area?.id || area?.className || null;
    return {
      label,
      n: cards.length,
      minW: minWidth,
      maxW: widths.length ? Math.max(...widths) : 0,
      minH: minHeight,
      maxH: heights.length ? Math.max(...heights) : 0,
      sizeOk: cards.length > 0 && minWidth + 0.5 >= minW && minHeight + 0.5 >= minH,
      overlapCount: overlaps.length,
      maxOverlapArea: overlaps.length ? Math.max(...overlaps.map(o => o.area)) : 0,
      // allow tiny subpixel; heavy fan would overlap hundreds of px
      facesFull: overlaps.length === 0 || Math.max(...overlaps.map(o => o.area)) < 40,
      isGrid,
      display,
      areaId,
      sample: rects.slice(0, 3),
    };
  }""", {'selector': selector, 'label': label, 'minW': MIN_DDZ_W if 'ddz' in label else (MIN_MJ_W if 'mj' in label else MIN_GD_W),
         'minH': MIN_DDZ_H if 'ddz' in label else (MIN_MJ_H if 'mj' in label else MIN_GD_H)})

def wait_n(page, js_count, min_n, timeout_s=25):
  deadline = time.time() + timeout_s
  n = 0
  while time.time() < deadline:
    n = page.evaluate(js_count)
    if n >= min_n:
      page.wait_for_timeout(500)
      return page.evaluate(js_count)
    page.wait_for_timeout(250)
  return n

with sync_playwright() as p:
  browser = p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-dev-shm-usage'])
  ctx = browser.new_context(viewport={'width': VW, 'height': VH}, device_scale_factor=2, is_mobile=True, has_touch=True)
  page = ctx.new_page()
  page.on('console', lambda m: print('CONSOLE', m.type, m.text[:180], flush=True) if m.type in ('error', 'warning') else None)
  boot(page)

  # --- Lobby regression ---
  lobby = page.evaluate("""() => {
    const body = document.body.innerText || '';
    const games = Array.from(document.querySelectorAll('.home-icon-grid .home-icon-btn strong'))
      .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
      .map(el => el.textContent.trim());
    const cta_visible = (() => {
      const card = document.querySelector('.p0-cta-card');
      if (!card) return false;
      const cs = getComputedStyle(card);
      const r = card.getBoundingClientRect();
      return cs.display !== 'none' && cs.visibility !== 'hidden' && r.height > 2 && r.width > 2;
    })();
    const chain = document.querySelector('.home-icon-btn.home-icon-chain');
    return {
      games,
      gameCount: games.length,
      hasChain: games.includes('链游中心') || !!(chain && getComputedStyle(chain).display !== 'none'),
      cta_visible,
      hasGold: /金币/.test(body),
    };
  }""")
  REPORT['checks']['lobby'] = lobby
  shot(page, 'lobby-414-home.png')

  # --- DDZ local ---
  ddz_start = page.evaluate("""() => {
    const keys = Object.keys(window.__teaParlor || {});
    try {
      // Prefer click local-doudizhu if present, else start(novice)
      const btn = document.querySelector('[data-lobby-action=\"local-doudizhu\"]');
      if (btn) { btn.click(); return {via:'click-local', keys}; }
      if (typeof window.__teaParlor.start === 'function') {
        window.__teaParlor.start('novice');
        return {via:'start(novice)', keys};
      }
      return {via:null, keys};
    } catch (e) { return {via:'error', error: String(e), keys}; }
  }""")
  REPORT['checks']['ddz_start'] = ddz_start
  page.wait_for_timeout(800)
  # Skip match overlay / force local if needed
  page.evaluate("""() => {
    const mask = document.getElementById('ddzMatchMask');
    if (mask) { mask.hidden = true; mask.setAttribute('hidden',''); mask.style.display='none'; }
  }""")
  n_ddz = wait_n(page, "() => document.querySelectorAll('#handArea .playing-card').length", 10, 30)
  print('ddz cards', n_ddz, flush=True)
  # If still few, try start again after ensuring balances / leave
  if n_ddz < 10:
    page.evaluate("""() => { try { window.__teaParlor.start('novice'); } catch(e) {} }""")
    n_ddz = wait_n(page, "() => document.querySelectorAll('#handArea .playing-card').length", 10, 20)
  page.wait_for_timeout(600)
  # Trigger layout
  page.evaluate("""() => {
    try {
      const ev = new Event('resize');
      window.dispatchEvent(ev);
    } catch(e) {}
  }""")
  page.wait_for_timeout(400)

  ddz = measure_cards(page, '#handArea .playing-card', 'ddz')
  # Override thresholds in measure via recompute
  ddz['sizeOk'] = ddz['n'] > 0 and ddz['minW'] + 0.5 >= MIN_DDZ_W and ddz['minH'] + 0.5 >= MIN_DDZ_H
  REPORT['checks']['ddz'] = ddz
  shot(page, 'ddz-414-hand.png')

  # Select / after-play-ish
  sel = page.evaluate("""() => {
    const cards = [...document.querySelectorAll('#handArea .playing-card')];
    if (!cards.length) return {ok:false};
    cards[0].click();
    if (cards.length > 1) cards[1].click();
    const selected = document.querySelectorAll('#handArea .playing-card.selected').length;
    return {ok:true, selected, n: cards.length};
  }""")
  REPORT['checks']['ddz_selected'] = sel
  page.wait_for_timeout(300)
  # Try play button
  page.evaluate("""() => {
    const play = document.querySelector('#playControls [data-act=\"play\"], #btnPlay, .qq-btn-play, button.qq-btn-play');
    if (play && !play.disabled) play.click();
  }""")
  page.wait_for_timeout(800)
  ddz2 = measure_cards(page, '#handArea .playing-card', 'ddz_after')
  ddz2['sizeOk'] = ddz2['n'] > 0 and ddz2['minW'] + 0.5 >= MIN_DDZ_W and ddz2['minH'] + 0.5 >= MIN_DDZ_H
  REPORT['checks']['ddz_after'] = ddz2
  shot(page, 'ddz-414-after-play.png')

  leave_to_lobby(page)
  boot(page)

  # --- Mahjong ---
  page.evaluate("""async () => {
    if (window.__teaParlor?.startMahjong) await window.__teaParlor.startMahjong('xuezhan', { currency: 'ingot' });
  }""")
  page.wait_for_timeout(1000)
  page.evaluate("""() => {
    const root = document.querySelector('#multiGameView');
    if (root) root.classList.remove('mj-opening');
    document.querySelectorAll('.mj-open-layer,#mjOpenLayer,.mg-open-layer').forEach(el => {
      el.hidden = true; el.style.display = 'none';
    });
  }""")
  n_mj = wait_n(page, "() => document.querySelectorAll('#mgHand .mg-hand-tile, #mgHand .mj-tile').length", 13, 30)
  print('mj tiles', n_mj, flush=True)
  page.wait_for_timeout(500)
  mj = measure_cards(page, '#mgHand .mg-hand-tile, #mgHand .mj-tile', 'mj')
  mj['sizeOk'] = mj['n'] > 0 and mj['minW'] + 0.5 >= MIN_MJ_W and mj['minH'] + 0.5 >= MIN_MJ_H
  REPORT['checks']['mj'] = mj
  shot(page, 'mj-414-hand.png')

  leave_to_lobby(page)
  boot(page)

  # --- Guandan ---
  page.evaluate("""async () => {
    if (window.__teaParlor?.startGuanDan) await window.__teaParlor.startGuanDan('novice', { currency: 'ingot' });
  }""")
  page.wait_for_selector('#multiGameView.gd-yard, #multiGameView.gd-active', timeout=30000)
  n_gd = wait_n(page, "() => document.querySelectorAll('#mgHand .gd-card').length", 10, 30)
  print('gd cards', n_gd, flush=True)
  page.wait_for_timeout(600)
  gd = measure_cards(page, '#mgHand .gd-card', 'gd')
  gd['sizeOk'] = gd['n'] > 0 and gd['minW'] + 0.5 >= MIN_GD_W and gd['minH'] + 0.5 >= MIN_GD_H
  gd_extra = page.evaluate("""() => {
    const bar = document.querySelector('.gd-toolbar');
    const hand = document.querySelector('#mgHand');
    const br = bar?.getBoundingClientRect();
    const hr = hand?.getBoundingClientRect();
    return {
      toolbarAboveHand: !!(br && hr && br.bottom <= hr.top + 10),
      isGrid: !!hand?.classList.contains('hand-grid'),
    };
  }""")
  gd.update(gd_extra)
  REPORT['checks']['gd'] = gd
  shot(page, 'gd-414-hand.png')

  # Distinctness of screenshots
  hashes = [v['sha1'] for v in REPORT['shots'].values()]
  REPORT['checks']['shot_distinct'] = len(hashes) == len(set(hashes))

  REPORT['pass'] = {
    'lobby_no_cta': lobby.get('cta_visible') is False,
    'lobby_grid': lobby.get('gameCount', 0) >= 6,
    'lobby_has_chain': bool(lobby.get('hasChain')),
    'ddz_grid': bool(ddz.get('isGrid')),
    'ddz_size': bool(ddz.get('sizeOk')),
    'ddz_faces': bool(ddz.get('facesFull')),
    'ddz_count': ddz.get('n', 0) >= 10,
    'ddz_after_size': bool(ddz2.get('sizeOk')) if ddz2.get('n', 0) else True,
    'mj_grid': bool(mj.get('isGrid')),
    'mj_size': bool(mj.get('sizeOk')),
    'mj_faces': bool(mj.get('facesFull')),
    'mj_count': mj.get('n', 0) >= 13,
    'gd_grid': bool(gd.get('isGrid')),
    'gd_size': bool(gd.get('sizeOk')),
    'gd_faces': bool(gd.get('facesFull')),
    'gd_count': gd.get('n', 0) >= 10,
    'gd_toolbar_above': bool(gd.get('toolbarAboveHand')),
    'shots_distinct': REPORT['checks']['shot_distinct'],
  }
  REPORT['ok'] = all(REPORT['pass'].values())
  (OUT / 'report.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=2))
  print(json.dumps(REPORT['pass'], ensure_ascii=False, indent=2), flush=True)
  print('ok=', REPORT['ok'], flush=True)
  browser.close()
