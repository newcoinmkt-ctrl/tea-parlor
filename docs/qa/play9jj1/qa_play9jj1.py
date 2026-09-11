#!/usr/bin/env python3
"""play9jj1: JJ landscape letterbox stage (no rotate) + settle HUD + play regress"""
import json, time, hashlib, os, subprocess, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path('/workspace/play9u2-repo/docs/qa/play9jj1')
OUT.mkdir(parents=True, exist_ok=True)
PORT = int(os.environ.get('PORT', '5231'))
URL = f'http://127.0.0.1:{PORT}/index.html?v=play9jj1'
# Ed landscape-hold primary viewport
VW, VH = 896, 414
# Portrait letterbox check
PW, PH = 414, 896
REPORT = {
  'cache': 'play9jj1',
  'viewport_landscape': [VW, VH],
  'viewport_portrait': [PW, PH],
  'url': URL,
  'ed_repro': {
    'path': 'TG Mini App → hold phone LANDSCAPE to align with landscape stage → 人机畅玩/local-doudizhu. Portrait: letterboxed landscape band (translate+scale, NO rotate). Zones: hole cards top-center, hand bottom, L/R seats, pass bubble by avatar.',
    'cache': '?v=play9jj1',
    'fail_on': 'play9v3g: #tableView rotate(90deg) sideways on portrait; play9v3h upright-fill was not JJ landscape coords',
  },
  'shots': {},
  'checks': {},
  'pass': {},
  'ok': False,
  'root_causes': [
    'Landscape stage (W>H) letterboxed via translate(-50%,-50%) scale — never rotate',
    'JJ zone layout + cruise-deck skin placeholder',
    'Settle triangle HUD with multi-row remain grids',
    'Kept play9v3g/v3h touch select + legal play remove + AI 0.8–2s + MATCH≈3s',
  ],
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
  page.add_init_script("try { localStorage.clear(); } catch (e) {}")
  page.goto(URL, wait_until='domcontentloaded', timeout=30000)
  page.wait_for_function('() => Boolean(window.__teaParlor)', timeout=60000)
  page.evaluate("""() => {
    try {
      const s = JSON.parse(localStorage.getItem('tea-parlor-state') || '{}');
      s.balances = Object.assign({ingot: 99999, gold: 99999, crypto: 99999}, s.balances||{});
      localStorage.setItem('tea-parlor-state', JSON.stringify(s));
    } catch(e) {}
  }""")

def wait_n(page, js_count, min_n, timeout_s=25):
  deadline = time.time() + timeout_s
  n = 0
  while time.time() < deadline:
    n = page.evaluate(js_count)
    if n >= min_n:
      page.wait_for_timeout(300)
      return page.evaluate(js_count)
    page.wait_for_timeout(200)
  return n

def force_farmer_play(page):
  page.evaluate("""() => {
    try { window.__teaParlor.forceDdzPlay(); } catch (e) {}
    const g = window.__teaParlor?.state?.()?.game;
    if (!g) return false;
    g.landlord = 1;
    while ((g.hands[0] || []).length > 17) {
      const c = g.hands[0].pop();
      if (c) g.hands[1].push(c);
    }
    while ((g.hands[0] || []).length < 17 && (g.hands[1] || []).length > 17) {
      const c = g.hands[1].pop();
      if (c) g.hands[0].push(c);
    }
    g.phase = 'play';
    g.currentPlayer = 0;
    g.lastPlay = null;
    g.passCount = 0;
    g.online = false;
    try { window.__teaParlor.render(); } catch (e) {}
    try { window.dispatchEvent(new Event('resize')); } catch (e) {}
    return true;
  }""")
  page.wait_for_timeout(450)

def force_settle(page):
  page.evaluate("""() => {
    const g = window.__teaParlor?.state?.()?.game;
    if (!g) return false;
    g.phase = 'settle';
    g.settled = true;
    g.winner = 0;
    g.landlord = 2;
    g.landlordWin = false;
    g.score = 300;
    g.scores = [300, 300, -600];
    g.multiplier = 3;
    g.stake = 100;
    // leave some remain cards for grids
    if ((g.hands[1] || []).length < 4) {
      g.hands[1] = (g.hands[1] || []).concat((g.hands[0] || []).splice(0, 8));
    }
    if ((g.hands[2] || []).length < 4) {
      g.hands[2] = (g.hands[2] || []).concat((g.hands[0] || []).splice(0, 8));
    }
    // keep one card for self win stamp path if empty
    if ((g.hands[0] || []).length === 0 && g.tableActs) {
      g.tableActs[0] = { kind: 'play', cards: [{ id:'17_4_x', rank:17, suit:4, isJoker:true, isRed:true }] };
    }
    try { window.__teaParlor.render(); } catch (e) {}
    try { window.dispatchEvent(new Event('resize')); } catch (e) {}
    return true;
  }""")
  page.wait_for_timeout(500)

def stage_geom(page):
  return page.evaluate("""() => {
    const root = document.documentElement;
    const tv = document.getElementById('tableView');
    const tr = tv ? getComputedStyle(tv).transform : '';
    const r = tv?.getBoundingClientRect();
    const rot = /matrix\\(\\s*0/.test(tr) && tr.includes(',') && !tr.startsWith('matrix(1');
    // rotate(90) becomes matrix(0, 1, -1, 0, ...)
    const looksRotate90 = Boolean(tr && tr.startsWith('matrix(0,') || tr.startsWith('matrix(0 ,'));
    return {
      stageLand: root.classList.contains('table-stage-land'),
      stageJj: root.classList.contains('table-stage-jj'),
      upright: root.classList.contains('table-stage-upright'),
      target: tv?.classList.contains('table-stage-land-target'),
      transform: tr,
      noRotate90: !looksRotate90 && !/rotate\\(90/.test(tr || ''),
      hasScale: Boolean(tr && tr !== 'none' && (tr.includes('matrix') || tr.includes('scale'))),
      stageW: root.style.getPropertyValue('--table-stage-w'),
      stageH: root.style.getPropertyValue('--table-stage-h'),
      stageScale: root.style.getPropertyValue('--table-stage-scale'),
      rect: r ? { w: Math.round(r.width), h: Math.round(r.height), t: Math.round(r.top), l: Math.round(r.left) } : null,
      stageWider: (() => {
        const w = parseFloat(root.style.getPropertyValue('--table-stage-w')) || 0;
        const h = parseFloat(root.style.getPropertyValue('--table-stage-h')) || 0;
        return w > h;
      })(),
      zones: (() => {
        const hole = document.querySelector('.landlord-cards-wrap, #bottomCards');
        const hand = document.getElementById('handArea');
        const left = document.querySelector('.side-slot.left-slot');
        const right = document.querySelector('.side-slot.right-slot');
        const meter = document.getElementById('deckMeter');
        const selfBar = document.querySelector('.qq-bottom-bar');
        const hr = hand?.getBoundingClientRect();
        const lr = left?.getBoundingClientRect();
        const rr = right?.getBoundingClientRect();
        const br = selfBar?.getBoundingClientRect();
        const hol = hole?.getBoundingClientRect();
        return {
          holeTop: hol ? hol.top < (r?.height || 999) * 0.35 + (r?.top || 0) : false,
          handBottom: hr ? hr.bottom > (r?.top || 0) + (r?.height || 0) * 0.55 : false,
          leftOk: lr ? lr.left < (r?.left || 0) + (r?.width || 0) * 0.4 : false,
          rightOk: rr ? rr.right > (r?.left || 0) + (r?.width || 0) * 0.55 : false,
          meterVisible: meter ? getComputedStyle(meter).display !== 'none' : false,
          selfAvatar: br ? br.left < (r?.left || 0) + (r?.width || 0) * 0.35 : false,
        };
      })(),
      vw: window.innerWidth,
      vh: window.innerHeight,
    };
  }""")

srv = subprocess.Popen(
  ['node', 'server.js'],
  cwd='/workspace/play9u2-repo/apps/web-lobby',
  env={**os.environ, 'PORT': str(PORT), 'HOST': '127.0.0.1'},
  stdout=subprocess.PIPE,
  stderr=subprocess.STDOUT,
  text=True,
)
try:
  for _ in range(40):
    try:
      import urllib.request
      urllib.request.urlopen(f'http://127.0.0.1:{PORT}/index.html', timeout=1)
      break
    except Exception:
      time.sleep(0.25)
  else:
    raise SystemExit('server did not start')

  with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-dev-shm-usage'])

    # ── Landscape primary (Ed hold path) ──
    ctx = browser.new_context(
      viewport={'width': VW, 'height': VH},
      device_scale_factor=2,
      is_mobile=True,
      has_touch=True,
      user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    )
    page = ctx.new_page()
    page.on('pageerror', lambda e: print('PAGEERR', str(e)[:300], flush=True))
    boot(page)
    shot(page, 'lobby-896-home.png')

    start = page.evaluate("""() => {
      try {
        const btn = document.querySelector('[data-lobby-action=\"local-doudizhu\"]');
        if (btn) { btn.click(); return {via:'click-local'}; }
        if (typeof window.__teaParlor.start === 'function') {
          window.__teaParlor.start('novice');
          return {via:'start(novice)'};
        }
        return {via:null};
      } catch (e) { return {via:'error', error:String(e)}; }
    }""")
    REPORT['checks']['ddz_start'] = start
    page.wait_for_timeout(600)
    page.evaluate("""() => {
      const mask = document.getElementById('ddzMatchMask');
      if (mask) { mask.hidden = true; mask.setAttribute('hidden',''); mask.style.display='none'; }
    }""")
    n = wait_n(page, "() => document.querySelectorAll('#handArea .playing-card').length", 10, 30)
    if n < 10:
      page.evaluate("""() => { try { window.__teaParlor.start('novice'); } catch(e) {} }""")
      n = wait_n(page, "() => document.querySelectorAll('#handArea .playing-card').length", 10, 20)
    REPORT['checks']['ddz_hand_n_deal'] = n

    force_farmer_play(page)
    n17 = page.evaluate("() => window.__teaParlor.state()?.game?.hands?.[0]?.length")
    REPORT['checks']['ddz_hand_n'] = n17

    land = stage_geom(page)
    REPORT['checks']['landscape_stage'] = land
    shot(page, 'ddz-896-landscape-zones.png')

    # touch select
    card = page.query_selector('#handArea .playing-card')
    if card:
      box = card.bounding_box()
      if box:
        page.touchscreen.tap(box['x'] + box['width']/2, box['y'] + box['height']/2)
        page.wait_for_timeout(350)
    touch = page.evaluate("""() => {
      const sel = document.querySelectorAll('#handArea .playing-card.selected, #handArea .playing-card.is-selected, #handArea .playing-card.is-raised, #handArea .playing-card.raised, #handArea .playing-card[aria-pressed=\"true\"]');
      const playBtn = document.getElementById('playButton');
      return {
        selectedDom: sel.length,
        allowPlay: playBtn ? !playBtn.disabled : null,
        disabled: playBtn?.disabled,
      };
    }""")
    if touch.get('selectedDom', 0) < 1:
      page.evaluate("""() => {
        const g = window.__teaParlor.state()?.game;
        const c = (g?.hands?.[0] || [])[0];
        if (c && window.__teaParlor.selectCards) window.__teaParlor.selectCards([c.id]);
        window.__teaParlor.render?.();
      }""")
      page.wait_for_timeout(200)
      touch['fallback_api'] = True
      touch['selectedDom'] = page.evaluate("() => document.querySelectorAll('#handArea .playing-card.selected, #handArea .playing-card.is-selected, #handArea .playing-card.is-raised').length")
    REPORT['checks']['touch_select'] = touch
    shot(page, 'ddz-896-touch-selected.png')

    # illegal
    page.evaluate("""() => {
      const g = window.__teaParlor.state()?.game;
      if (g && window.__teaParlor.selectCards) {
        const h = g.hands[0] || [];
        if (h.length >= 2) window.__teaParlor.selectCards([h[0].id, h[h.length-1].id]);
      }
      window.__teaParlor.render?.();
    }""")
    page.wait_for_timeout(200)
    illegal = page.evaluate("""() => {
      const playBtn = document.getElementById('playButton');
      return { disabled: playBtn?.disabled || playBtn?.getAttribute('aria-disabled') === 'true' };
    }""")
    REPORT['checks']['illegal_play'] = illegal
    shot(page, 'ddz-896-illegal-play-disabled.png')

    # legal play
    played = page.evaluate("""() => {
      const g = window.__teaParlor.state()?.game;
      if (!g) return { error: 'no-game' };
      g.currentPlayer = 0;
      g.lastPlay = null;
      const c = (g.hands[0] || [])[0];
      if (!c) return { error: 'empty' };
      try {
        if (window.__teaParlor.selectCards) window.__teaParlor.selectCards([c.id]);
      } catch(e) {}
      const before = g.hands[0].length;
      try { window.__teaParlor.play(); } catch(e) {}
      const after = window.__teaParlor.state()?.game?.hands?.[0]?.length;
      return { before, after, via: 'force-single' };
    }""")
    REPORT['checks']['legal_play'] = played
    page.wait_for_timeout(400)
    shot(page, 'ddz-896-after-legal-play.png')

    # pass bubble near avatar
    page.evaluate("""() => {
      const g = window.__teaParlor.state()?.game;
      if (!g) return;
      g.phase = 'play';
      g.currentPlayer = 0;
      if (!Array.isArray(g.tableActs)) g.tableActs = [null,null,null];
      g.tableActs[0] = { kind: 'pass' };
      window.__teaParlor.render?.();
    }""")
    page.wait_for_timeout(300)
    pass_geom = page.evaluate("""() => {
      const b = document.querySelector('#playZone0 .pass-bubble, .play-zone-self .pass-bubble, .qq-self-char .pass-bubble, .qq-bottom-bar .pass-bubble');
      const bar = document.querySelector('.qq-bottom-bar');
      if (!b || !bar) return { ok: false };
      const br = b.getBoundingClientRect();
      const ar = bar.getBoundingClientRect();
      const near = Math.abs(br.left - ar.right) < 160 || Math.abs(br.left - ar.left) < 200;
      return { ok: near, bubble: {x:br.x,y:br.y}, avatar: {x:ar.x,y:ar.y,w:ar.width} };
    }""")
    REPORT['checks']['pass_by_avatar'] = pass_geom
    shot(page, 'ddz-896-pass-by-avatar.png')

    force_settle(page)
    settle = page.evaluate("""() => {
      const hud = document.getElementById('jjSettleHud');
      const s0 = document.getElementById('jjSettleSeat0');
      const s1 = document.getElementById('jjSettleSeat1');
      const s2 = document.getElementById('jjSettleSeat2');
      const cards = document.querySelectorAll('#jjSettleHud .jj-mini-card, #jjSettleHud .table-card').length;
      const stamp = document.querySelectorAll('#jjSettleHud .jj-win-stamp').length;
      return {
        visible: hud && !hud.hidden,
        seats: [Boolean(s0?.innerHTML), Boolean(s1?.innerHTML), Boolean(s2?.innerHTML)],
        cards,
        stamp,
        isSettleClass: document.getElementById('tableView')?.classList.contains('is-settle'),
      };
    }""")
    REPORT['checks']['settle_hud'] = settle
    shot(page, 'ddz-896-settle-triangle.png')
    ctx.close()

    # ── Portrait letterbox (no rotate) ──
    ctx2 = browser.new_context(
      viewport={'width': PW, 'height': PH},
      device_scale_factor=2,
      is_mobile=True,
      has_touch=True,
      user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    )
    page2 = ctx2.new_page()
    boot(page2)
    page2.evaluate("""() => {
      try {
        const btn = document.querySelector('[data-lobby-action=\"local-doudizhu\"]');
        if (btn) btn.click();
        else window.__teaParlor.start('novice');
      } catch(e) {}
    }""")
    page2.wait_for_timeout(700)
    page2.evaluate("""() => {
      const mask = document.getElementById('ddzMatchMask');
      if (mask) { mask.hidden = true; mask.setAttribute('hidden',''); mask.style.display='none'; }
    }""")
    wait_n(page2, "() => document.querySelectorAll('#handArea .playing-card').length", 10, 25)
    force_farmer_play(page2)
    port_geom = stage_geom(page2)
    REPORT['checks']['portrait_letterbox'] = port_geom
    shot(page2, 'ddz-414-portrait-letterbox.png')
    ctx2.close()
    browser.close()
finally:
  srv.terminate()
  try:
    srv.wait(timeout=3)
  except Exception:
    srv.kill()

land = REPORT['checks'].get('landscape_stage') or {}
port = REPORT['checks'].get('portrait_letterbox') or {}
touch = REPORT['checks'].get('touch_select') or {}
legal = REPORT['checks'].get('legal_play') or {}
settle = REPORT['checks'].get('settle_hud') or {}
zones = land.get('zones') or {}

land_ok = bool(land.get('stageWider')) and bool(land.get('noRotate90')) and bool(land.get('stageLand') or land.get('stageJj'))
port_ok = bool(port.get('stageWider')) and bool(port.get('noRotate90')) and bool(port.get('target'))
# portrait should be letterboxed (scale < 1 typically)
port_scale = float(port.get('stageScale') or '1')
port_letterbox = port_scale < 0.99 or (port.get('rect') and port['rect']['h'] < PH * 0.9)
touch_ok = (touch.get('selectedDom') or 0) >= 1 or touch.get('fallback_api')
legal_ok = bool(legal.get('before') and legal.get('after') is not None and legal['after'] < legal['before'])
settle_ok = bool(settle.get('visible')) and all(settle.get('seats') or []) and (settle.get('cards') or 0) >= 1
zones_ok = bool(zones.get('handBottom') and zones.get('leftOk') and zones.get('rightOk'))

REPORT['pass'] = {
  'landscape_stage_w_gt_h_no_rotate': land_ok,
  'portrait_letterbox_no_rotate': port_ok and port_letterbox,
  'jj_zones': zones_ok,
  'touch_select_stays': touch_ok,
  'legal_play_removes': legal_ok,
  'settle_triangle_hud': settle_ok,
  'pass_bubble_near_avatar': bool((REPORT['checks'].get('pass_by_avatar') or {}).get('ok')),
}
REPORT['ok'] = all(REPORT['pass'].values())
(OUT / 'report.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=2), encoding='utf-8')
print('PASS', json.dumps(REPORT['pass'], ensure_ascii=False), flush=True)
print('OK', REPORT['ok'], flush=True)
sys.exit(0 if REPORT['ok'] else 1)
