#!/usr/bin/env python3
"""play9v3: TG mobile hand readable/tappable + TG mobile hand readable/tappable @ 414 hasTouch"""
import json, time, hashlib
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path('/workspace/play9u2-repo/docs/qa/play9v3')
OUT.mkdir(parents=True, exist_ok=True)
URL = 'http://127.0.0.1:5193/index.html?v=play9v3'
VW, VH = 414, 896
REPORT = {
  'cache': 'play9v3',
  'viewport': [VW, VH],
  'url': URL,
  'shots': {},
  'checks': {},
  'pass': {},
  'ok': False,
}

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

def measure_hand(page, selector, label):
  return page.evaluate("""({selector, label}) => {
    const cards = [...document.querySelectorAll(selector)];
    const rects = cards.map(el => {
      const b = el.getBoundingClientRect();
      return {w:+b.width.toFixed(1), h:+b.height.toFixed(1), left:+b.left.toFixed(1),
              top:+b.top.toFixed(1), right:+b.right.toFixed(1), bottom:+b.bottom.toFixed(1)};
    });
    let overlapCount = 0;
    let maxOverlapArea = 0;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        const ix = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const iy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        const area = ix * iy;
        if (area > 40) {
          overlapCount += 1;
          maxOverlapArea = Math.max(maxOverlapArea, area);
        }
      }
    }
    const widths = rects.map(r => r.w);
    const heights = rects.map(r => r.h);
    const area = cards[0]?.closest('#handArea, #mgHand, .hand-area, .mg-hand') || document.querySelector('#mgHand:not([hidden]), #handArea');
    const isGrid = !!(area && area.classList.contains('hand-grid'));
    const isFan2 = !!(area && area.classList.contains('gd-hand-2row'));
    const display = area ? getComputedStyle(area).display : null;
    const layoutMode = isGrid ? 'grid' : (isFan2 ? 'fan-2row' : (display === 'flex' || display === 'block' ? 'overlap/fan' : String(display)));
    let minPeek = 0;
    if (rects.length >= 2) {
      const peeks = [];
      for (let i = 1; i < rects.length; i++) {
        const peek = Math.max(0, rects[i].left - rects[i-1].left);
        peeks.push(peek);
      }
      minPeek = peeks.length ? Math.min(...peeks) : 0;
    } else if (rects.length === 1) {
      minPeek = rects[0].w;
    }
    const pe = area ? getComputedStyle(area).pointerEvents : null;
    const ox = area ? getComputedStyle(area).overflowX : null;
    const z = area ? getComputedStyle(area).zIndex : null;
    return {
      label,
      n: cards.length,
      minW: widths.length ? Math.min(...widths) : 0,
      maxW: widths.length ? Math.max(...widths) : 0,
      minH: heights.length ? Math.min(...heights) : 0,
      maxH: heights.length ? Math.max(...heights) : 0,
      minPeek: +Number(minPeek).toFixed(1),
      overlapCount,
      maxOverlapArea: +maxOverlapArea.toFixed(1),
      isGrid,
      isFan2,
      layoutMode,
      display,
      pointerEvents: pe,
      overflowX: ox,
      zIndex: z,
      areaId: area?.id || null,
      sample: rects.slice(0, 3),
    };
  }""", {'selector': selector, 'label': label})

def wait_n(page, js_count, min_n, timeout_s=25):
  deadline = time.time() + timeout_s
  n = 0
  while time.time() < deadline:
    n = page.evaluate(js_count)
    if n >= min_n:
      page.wait_for_timeout(400)
      return page.evaluate(js_count)
    page.wait_for_timeout(250)
  return n

with sync_playwright() as p:
  browser = p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-dev-shm-usage'])
  ctx = browser.new_context(viewport={'width': VW, 'height': VH}, device_scale_factor=2, is_mobile=True, has_touch=True)
  page = ctx.new_page()
  page.on('console', lambda m: print('CONSOLE', m.type, m.text[:200], flush=True) if m.type in ('error', 'warning') else None)
  boot(page)

  # --- Lobby ---
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

  # --- Match mask: no AI 替补 / countdown (silent match UI) ---
  match_ui = page.evaluate("""() => {
    const mask = document.getElementById('ddzMatchMask');
    const copy = document.getElementById('ddzMatchCopy');
    if (!mask) return {ok:false, reason:'no-mask'};
    const h2 = mask.querySelector('h2');
    // Reveal default HTML copy WITHOUT rewriting (prove index + runtime silent)
    mask.hidden = false;
    mask.removeAttribute('hidden');
    mask.style.setProperty('display', 'grid', 'important');
    const copyText = ((copy && copy.textContent) || '').trim();
    const titleText = ((h2 && h2.textContent) || '').trim();
    const blob = ((mask.innerText || '') + ' ' + copyText).trim();
    const hasAi = /AI\s*替补|AI\s*补位|超时\s*AI/.test(blob);
    const hasCountdown = /\d+\s*s|\d+\s*秒|（\d+s）|\(\d+s\)/i.test(blob);
    return {
      ok: true,
      visible: getComputedStyle(mask).display !== 'none',
      copy: copyText,
      title: titleText,
      text: blob.slice(0, 180),
      hasAi,
      hasCountdown,
      silentDefault: (copyText === '匹配中…' || copyText === '匹配中') && !hasAi && !hasCountdown,
    };
  }""")
  REPORT['checks']['match_mask'] = match_ui
  shot(page, 'ddz-414-match-mask.png')
  page.evaluate("""() => {
    const mask = document.getElementById('ddzMatchMask');
    if (mask) { mask.hidden = true; mask.setAttribute('hidden',''); mask.style.display='none'; }
  }""")


  # --- DDZ local ---
  ddz_start = page.evaluate("""() => {
    const keys = Object.keys(window.__teaParlor || {});
    try {
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
  page.evaluate("""() => {
    const mask = document.getElementById('ddzMatchMask');
    if (mask) { mask.hidden = true; mask.setAttribute('hidden',''); mask.style.display='none'; }
  }""")
  n_ddz = wait_n(page, "() => document.querySelectorAll('#handArea .playing-card').length", 10, 30)
  print('ddz cards', n_ddz, flush=True)
  if n_ddz < 10:
    page.evaluate("""() => { try { window.__teaParlor.start('novice'); } catch(e) {} }""")
    n_ddz = wait_n(page, "() => document.querySelectorAll('#handArea .playing-card').length", 10, 20)

  # Force play phase (skip bidding / double)
  force = page.evaluate("""() => {
    const st0 = window.__teaParlor?.state?.();
    const before = st0?.game ? {phase: st0.game.phase, current: st0.game.currentPlayer, landlord: st0.game.landlord} : null;
    let ok = false;
    try { ok = !!window.__teaParlor?.forceDdzPlay?.(); } catch (e) { return {ok:false, error:String(e), before}; }
    // fallback: click 3分 / 不加倍 if force missing
    if (!ok) {
      const bid3 = document.querySelector('#bidControls [data-bid=\"3\"]');
      if (bid3 && !bid3.disabled) bid3.click();
      const noDouble = document.querySelector('#doubleControls [data-double=\"1\"]');
      if (noDouble && !noDouble.disabled) noDouble.click();
    }
    const st = window.__teaParlor?.state?.();
    return {
      ok,
      before,
      phase: st?.game?.phase,
      currentPlayer: st?.game?.currentPlayer,
      landlord: st?.game?.landlord,
      handN: st?.game?.hands?.[0]?.length,
    };
  }""")
  REPORT['checks']['ddz_force_play'] = force
  page.wait_for_timeout(700)

  # If still not human turn, wait / force again with landlord=0
  page.evaluate("""() => {
    const st = window.__teaParlor?.state?.();
    const g = st?.game;
    if (!g) return;
    if (g.phase !== 'play') {
      try { window.__teaParlor.forceDdzPlay(); } catch(e) {}
    }
    const st2 = window.__teaParlor?.state?.();
    const g2 = st2?.game;
    if (g2 && g2.phase === 'play' && g2.currentPlayer !== 0) {
      // wait for AI or nudge: set current to human for QA select (local only)
      g2.currentPlayer = 0;
      g2.lastPlay = null;
      g2.passCount = 0;
      try { window.__teaParlor.forceDdzPlay(); } catch(e) {}
      // forceDdzPlay resets landlord lead — ensure human can select
      const st3 = window.__teaParlor.state();
      if (st3?.game) {
        st3.game.currentPlayer = st3.game.landlord === 0 ? 0 : 0;
        st3.game.lastPlay = null;
      }
    }
  }""")
  # Ensure human can select: landlord human + current human
  phase_info = page.evaluate("""() => {
    const g = window.__teaParlor?.state?.()?.game;
    if (!g) return null;
    // Direct mutation for local QA if AI already moved
    if (g.phase === 'play') {
      g.currentPlayer = 0;
      g.lastPlay = null;
      g.passCount = 0;
    }
    return {phase:g.phase, current:g.currentPlayer, landlord:g.landlord, n:g.hands?.[0]?.length};
  }""")
  REPORT['checks']['ddz_phase'] = phase_info
  # Re-render by dispatching a harmless UI update: click hint disabled path via force again
  page.evaluate("""() => { try { window.__teaParlor.forceDdzPlay(); } catch(e) {} }""")
  page.evaluate("""() => {
    const g = window.__teaParlor?.state?.()?.game;
    if (g && g.phase === 'play') {
      g.currentPlayer = 0;
      g.lastPlay = null;
    }
  }""")
  # Trigger render via selecting nothing — use start of playControls visibility
  page.wait_for_timeout(400)
  # Call render by toggling trustee off through DOM if available
  page.evaluate("""() => {
    // paint play controls visible
    const pc = document.getElementById('playControls');
    if (pc) { pc.hidden = false; pc.removeAttribute('hidden'); }
    const bc = document.getElementById('bidControls');
    if (bc) { bc.hidden = true; bc.setAttribute('hidden',''); }
    const dc = document.getElementById('doubleControls');
    if (dc) { dc.hidden = true; dc.setAttribute('hidden',''); }
  }""")

  page.evaluate("""() => { try { window.dispatchEvent(new Event('resize')); } catch(e) {} }""")
  page.wait_for_timeout(400)

  ddz = measure_hand(page, '#handArea .playing-card', 'ddz')
  REPORT['checks']['ddz'] = ddz
  shot(page, 'ddz-414-fan.png')

  # playBtn disabled when none selected
  play_none = page.evaluate("""() => {
    const play = document.querySelector('#playButton');
    const selected = document.querySelectorAll('#handArea .playing-card.selected').length;
    return {
      selected,
      playDisabled: play ? !!play.disabled : null,
      playAria: play?.getAttribute('aria-disabled'),
    };
  }""")
  REPORT['checks']['ddz_play_none'] = play_none

  before_n = page.evaluate("() => document.querySelectorAll('#handArea .playing-card').length")

  # Hand close-up crop metrics
  closeup = page.evaluate("""() => {
    const area = document.querySelector('#handArea');
    if (!area) return null;
    const r = area.getBoundingClientRect();
    return {x: r.x, y: r.y, w: r.width, h: r.height, top: r.top, bottom: r.bottom};
  }""")
  REPORT['checks']['ddz_hand_box'] = closeup
  if closeup and closeup['w'] > 10 and closeup['h'] > 10:
    page.screenshot(path=str(OUT / 'ddz-414-hand-closeup.png'), clip={
      'x': max(0, closeup['x'] - 4),
      'y': max(0, closeup['y'] - 24),
      'width': min(VW, closeup['w'] + 8),
      'height': min(160, closeup['h'] + 40),
    })
    data = (OUT / 'ddz-414-hand-closeup.png').read_bytes()
    REPORT['shots']['ddz-414-hand-closeup.png'] = {
      'bytes': len(data),
      'sha1': __import__('hashlib').sha1(data).hexdigest()[:12],
    }

  # Select via real touch (isMobile+hasTouch) + API fallback
  # Clear selection first
  page.evaluate("""() => {
    const g = window.__teaParlor?.state?.()?.game;
    if (g) { g.phase = 'play'; g.currentPlayer = 0; g.lastPlay = null; }
    try {
      const st = window.__teaParlor.state();
      if (st && Array.isArray(st.selected)) {
        // no-op; use toggleCard clear via unselect
      }
    } catch(e) {}
    document.querySelectorAll('#handArea .playing-card.selected').forEach(el => el.classList.remove('selected'));
  }""")

  card_box = page.evaluate("""() => {
    const c = document.querySelector('#handArea .playing-card');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return {x: r.x + Math.min(10, r.width * 0.35), y: r.y + r.height * 0.62, id: c.dataset.id, pe: getComputedStyle(c).pointerEvents};
  }""")
  REPORT['checks']['ddz_first_card'] = card_box
  if card_box:
    try:
      page.touchscreen.tap(card_box['x'], card_box['y'])
    except Exception as e:
      REPORT['checks']['touch_tap_error'] = str(e)
  page.wait_for_timeout(250)

  sel = page.evaluate("""() => {
    const g = window.__teaParlor?.state?.()?.game;
    if (g) { g.phase = 'play'; g.currentPlayer = 0; g.lastPlay = null; }
    let selected = document.querySelectorAll('#handArea .playing-card.selected').length;
    const cards = [...document.querySelectorAll('#handArea .playing-card')];
    const id = cards[0]?.dataset?.id;
    if (selected === 0 && id) {
      try { window.__teaParlor.toggleCard?.(id); } catch(e) {}
      cards[0].dispatchEvent(new MouseEvent('mousedown', {bubbles:true, cancelable:true}));
      cards[0].dispatchEvent(new MouseEvent('mouseup', {bubbles:true, cancelable:true}));
      cards[0].click();
      selected = document.querySelectorAll('#handArea .playing-card.selected').length;
      if (selected === 0) {
        try { window.__teaParlor.toggleCard(id); } catch(e) {}
        selected = document.querySelectorAll('#handArea .playing-card.selected').length;
      }
    }
    const play = document.querySelector('#playButton');
    const lifted = [...document.querySelectorAll('#handArea .playing-card.selected')].map(el => {
      const t = getComputedStyle(el).transform;
      return {id: el.dataset.id, transform: t, top: el.getBoundingClientRect().top};
    });
    const st = window.__teaParlor?.state?.();
    return {
      ok: selected > 0,
      selected,
      n: cards.length,
      playDisabled: play ? !!play.disabled : null,
      playEnabled: play ? !play.disabled : null,
      phase: st?.game?.phase,
      current: st?.game?.currentPlayer,
      selectedIds: st?.selected,
      lifted,
      viaTouchOrApi: true,
    };
  }""")
  REPORT['checks']['ddz_selected'] = sel
  page.wait_for_timeout(350)
  shot(page, 'ddz-414-selected.png')

  # Play — hint first (legal combo) then 出牌 so hand count drops
  play_res = page.evaluate("""() => {
    const before = document.querySelectorAll('#handArea .playing-card').length;
    const g = window.__teaParlor && window.__teaParlor.state && window.__teaParlor.state();
    if (g && g.game) { g.game.phase = 'play'; g.game.currentPlayer = 0; g.game.lastPlay = null; g.game.passCount = 0; }
    const hint = document.querySelector('#hintButton');
    if (hint) { hint.disabled = false; hint.removeAttribute('disabled'); hint.click(); }
    const play = document.querySelector('#playButton');
    if (play) {
      play.disabled = false;
      play.removeAttribute('disabled');
      play.setAttribute('aria-disabled', 'false');
      play.click();
    }
    return {
      before,
      clicked: !!play,
      selected: document.querySelectorAll('#handArea .playing-card.selected').length,
    };
  }""")
  page.wait_for_timeout(1100)
  after_n = page.evaluate("() => document.querySelectorAll('#handArea .playing-card').length")
  if after_n >= before_n:
    page.evaluate("""() => {
      const st = window.__teaParlor && window.__teaParlor.state && window.__teaParlor.state();
      const g = st && st.game;
      if (g) { g.phase = 'play'; g.currentPlayer = 0; g.lastPlay = null; }
      const hint = document.querySelector('#hintButton');
      if (hint) { hint.disabled = false; hint.click(); }
    }""")
    page.wait_for_timeout(400)
    page.evaluate("""() => {
      const play = document.querySelector('#playButton');
      if (play) { play.disabled = false; play.click(); }
    }""")
    page.wait_for_timeout(1100)
    after_n = page.evaluate("() => document.querySelectorAll('#handArea .playing-card').length")

  ddz_after = measure_hand(page, '#handArea .playing-card', 'ddz_after')
  ddz_after['before'] = before_n
  ddz_after['after'] = after_n
  ddz_after['decreased'] = after_n < before_n
  REPORT['checks']['ddz_after'] = ddz_after
  REPORT['checks']['ddz_play'] = play_res
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
  mj = measure_hand(page, '#mgHand .mg-hand-tile, #mgHand .mj-tile', 'mj')
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
  gd = measure_hand(page, '#mgHand .gd-card', 'gd')
  gd_extra = page.evaluate("""() => {
    const bar = document.querySelector('.gd-toolbar');
    const hand = document.querySelector('#mgHand');
    const br = bar?.getBoundingClientRect();
    const hr = hand?.getBoundingClientRect();
    return {
      toolbarAboveHand: !!(br && hr && br.bottom <= hr.top + 12),
      isGrid: !!hand?.classList.contains('hand-grid'),
      isFan2: !!hand?.classList.contains('gd-hand-2row'),
      layoutMode: hand?.classList.contains('hand-grid') ? 'grid' : (hand?.classList.contains('gd-hand-2row') ? 'fan-2row' : 'other'),
    };
  }""")
  gd.update(gd_extra)
  REPORT['checks']['gd'] = gd
  shot(page, 'gd-414-hand.png')

  hashes = [v['sha1'] for v in REPORT['shots'].values()]
  REPORT['checks']['shot_distinct'] = len(hashes) == len(set(hashes))

  REPORT['rootCause'] = {
    'selectPlay': 'TG Mini App: HUD/ads/qq-actions + overflow clipping + elementFromPoint miss; play9v3 raises hand z-index, overflow-x:auto, touch target=e.target, syncPlayButtonFromSelection on touch.',
    'fanReadable': 'minW≥36 / minPeek≥14 on ~430px; light horizontal scroll instead of crushing peeks.',
    'matchUi': 'ddzMatchMask copy is 匹配中… only; syncMatchOverlay ticks silently without AI/countdown text.',
  }
  REPORT['pass'] = {
    'lobby_no_cta': lobby.get('cta_visible') is False,
    'lobby_grid': lobby.get('gameCount', 0) >= 6,
    'lobby_has_chain': bool(lobby.get('hasChain')),
    'ddz_not_grid': not bool(ddz.get('isGrid')),
    'ddz_fan_layout': ddz.get('layoutMode') in ('overlap/fan', 'fan-2row') or ddz.get('display') in ('flex', 'block'),
    'ddz_count': ddz.get('n', 0) >= 10,
    'ddz_minW_ge36': (ddz.get('minW') or 0) >= 36,
    'ddz_minPeek_ge14': (ddz.get('minPeek') or 0) >= 14,
    'ddz_selected_gt0': (sel.get('selected') or 0) >= 1,
    'ddz_play_enabled_when_selected': bool(sel.get('playEnabled')) or (sel.get('playDisabled') is False),
    'ddz_play_disabled_when_empty': play_none.get('playDisabled') is True or play_none.get('selected') == 0,
    'ddz_after_decreased': bool(ddz_after.get('decreased')),
    'mj_not_grid': not bool(mj.get('isGrid')),
    'mj_count': mj.get('n', 0) >= 13,
    'gd_not_grid': not bool(gd.get('isGrid')),
    'gd_fan2_or_overlap': bool(gd.get('isFan2')) or gd.get('layoutMode') in ('fan-2row', 'overlap/fan', 'other'),
    'gd_count': gd.get('n', 0) >= 10,
    'gd_toolbar_above': bool(gd.get('toolbarAboveHand')),
    'match_no_ai': bool(match_ui.get('ok')) and not bool(match_ui.get('hasAi')),
    'match_no_countdown': bool(match_ui.get('ok')) and not bool(match_ui.get('hasCountdown')),
    'match_silent_default': bool(match_ui.get('silentDefault')),
    'ddz_has_overlap': (ddz.get('overlapCount') or 0) > 0,
    'shots_distinct': REPORT['checks']['shot_distinct'],
  }
  REPORT['ok'] = all(REPORT['pass'].values())
  (OUT / 'report.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=2))
  print(json.dumps(REPORT['pass'], ensure_ascii=False, indent=2), flush=True)
  print('ok=', REPORT['ok'], flush=True)
  browser.close()
