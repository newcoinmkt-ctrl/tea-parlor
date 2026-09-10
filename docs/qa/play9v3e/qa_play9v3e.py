#!/usr/bin/env python3
"""play9v3e: hand clear of avatar + seat pass bubble @ 414 hasTouch"""
import json, time, hashlib, os, subprocess, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path('/workspace/play9u2-repo/docs/qa/play9v3e')
OUT.mkdir(parents=True, exist_ok=True)
PORT = int(os.environ.get('PORT', '5195'))
URL = f'http://127.0.0.1:{PORT}/index.html?v=play9v3e'
VW, VH = 414, 896
REPORT = {
  'cache': 'play9v3e',
  'viewport': [VW, VH],
  'url': URL,
  'shots': {},
  'checks': {},
  'pass': {},
  'ok': False,
  'root_causes': [
    '72px hand gutter still left first card under self avatar (金佬) overflow',
    'self avatar z-index / paint order could sit above fan cards',
    'pure pass lastPlay (empty cards) did not seed seat「不出」bubble; only local Pass button showed',
  ],
}

def shot(page, name, **kwargs):
  path = OUT / name
  page.screenshot(path=str(path), full_page=False, **kwargs)
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
      page.wait_for_timeout(350)
      return page.evaluate(js_count)
    page.wait_for_timeout(200)
  return n

def measure_hand_and_avatar(page):
  return page.evaluate("""() => {
    const cards = [...document.querySelectorAll('#handArea .playing-card')];
    const area = document.querySelector('#handArea');
    const avatar = document.querySelector('#tableView .qq-bottom-bar .char-figure, #tableView .qq-self-char .char-figure, #tableView .char-figure-self .char-figure');
    const bar = document.querySelector('#tableView .qq-bottom-bar');
    if (!area || !cards.length) return null;
    const ar = area.getBoundingClientRect();
    const cs = getComputedStyle(area);
    const first = cards[0].getBoundingClientRect();
    const last = cards[cards.length - 1].getBoundingClientRect();
    const av = avatar ? avatar.getBoundingClientRect() : null;
    const barCs = bar ? getComputedStyle(bar) : null;
    const avCs = avatar ? getComputedStyle(avatar) : null;
    const overlaps = Boolean(av && !(first.right <= av.left + 0.5 || first.left >= av.right - 0.5 || first.bottom <= av.top + 0.5 || first.top >= av.bottom - 0.5));
    const firstZ = parseInt(getComputedStyle(cards[0]).zIndex, 10) || 0;
    const avZ = avCs ? (parseInt(avCs.zIndex, 10) || parseInt(barCs?.zIndex || '0', 10) || 0) : 0;
    const areaZ = parseInt(cs.zIndex, 10) || 0;
    return {
      n: cards.length,
      scrollLeft: area.scrollLeft,
      justify: cs.justifyContent,
      padL: cs.paddingLeft,
      areaZ,
      firstZ,
      avZ,
      barZ: barCs?.zIndex,
      area: {left:+ar.left.toFixed(1), right:+ar.right.toFixed(1), w:+ar.width.toFixed(1), h:+ar.height.toFixed(1)},
      first: {left:+first.left.toFixed(1), right:+first.right.toFixed(1), top:+first.top.toFixed(1), bottom:+first.bottom.toFixed(1), w:+first.width.toFixed(1), h:+first.height.toFixed(1)},
      last: {left:+last.left.toFixed(1), right:+last.right.toFixed(1), w:+last.width.toFixed(1)},
      avatar: av ? {left:+av.left.toFixed(1), right:+av.right.toFixed(1), top:+av.top.toFixed(1), bottom:+av.bottom.toFixed(1), w:+av.width.toFixed(1), h:+av.height.toFixed(1)} : null,
      firstFullyOnScreen: first.left >= -0.5 && first.right <= window.innerWidth + 0.5 && first.width >= 30,
      firstClearOfLeftEdge: first.left >= ar.left + 1,
      avatarOverlapFirst: overlaps,
      cardsAboveAvatar: areaZ > avZ || firstZ > avZ,
      gutterPx: parseFloat(cs.paddingLeft) || 0,
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
    ctx = browser.new_context(
      viewport={'width': VW, 'height': VH},
      device_scale_factor=2,
      is_mobile=True,
      has_touch=True,
      user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    )
    page = ctx.new_page()
    page.on('console', lambda m: print('CONSOLE', m.type, m.text[:220], flush=True) if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: print('PAGEERR', str(e)[:300], flush=True))
    boot(page)

    shot(page, 'lobby-414-home.png')

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
    REPORT['checks']['ddz_hand_n'] = n

    page.evaluate("""() => { try { window.__teaParlor.forceDdzPlay(); } catch(e) {} }""")
    page.wait_for_timeout(500)
    page.evaluate("""() => {
      const g = window.__teaParlor?.state?.()?.game;
      if (g) { g.phase = 'play'; g.currentPlayer = 0; g.lastPlay = null; g.passCount = 0; }
      try { window.__teaParlor.render(); } catch(e) {}
      try { window.dispatchEvent(new Event('resize')); } catch(e) {}
    }""")
    page.wait_for_timeout(400)

    edges = measure_hand_and_avatar(page)
    REPORT['checks']['hand_avatar'] = edges
    shot(page, 'ddz-414-fan-fullwidth.png')

    # close-up including avatar + leftmost card
    box = page.evaluate("""() => {
      const area = document.querySelector('#handArea');
      const bar = document.querySelector('#tableView .qq-bottom-bar');
      if (!area) return null;
      const r = area.getBoundingClientRect();
      const b = bar ? bar.getBoundingClientRect() : r;
      const left = Math.max(0, Math.min(r.x, b.x) - 4);
      const top = Math.max(0, Math.min(r.y, b.y) - 8);
      const right = Math.min(414, Math.max(r.right, b.right) + 4);
      const bottom = Math.min(896, Math.max(r.bottom, b.bottom) + 8);
      return {x: left, y: top, w: Math.max(40, right - left), h: Math.max(40, bottom - top)};
    }""")
    if box and box.get('w', 0) > 10:
      page.screenshot(path=str(OUT / 'ddz-414-hand-avatar-closeup.png'), clip={
        'x': float(box['x']), 'y': float(box['y']), 'width': float(box['w']), 'height': float(box['h']),
      })
      data = (OUT / 'ddz-414-hand-avatar-closeup.png').read_bytes()
      REPORT['shots']['ddz-414-hand-avatar-closeup.png'] = {
        'bytes': len(data), 'sha1': hashlib.sha1(data).hexdigest()[:12],
      }

    # lastPlay with cards + passCount → seat pass bubble
    applied = page.evaluate("""() => {
      const g = window.__teaParlor?.state?.()?.game;
      if (!g || !g.hands?.[0]?.length) return {ok:false, reason:'no-game'};
      const sample = (g.hands[0] || []).slice(0, 8).map((c, i) => ({...c, id: 'lp-' + i + '-' + c.id}));
      return window.__teaParlor.qaApplyLastPlay({
        player: 1,
        currentPlayer: 0,
        passCount: 1,
        type: 'straight',
        cards: sample,
      });
    }""")
    REPORT['checks']['lastPlay_apply'] = applied
    page.wait_for_timeout(350)

    zones = page.evaluate("""() => {
      const q = (sel) => document.querySelectorAll(sel).length;
      const fan = document.getElementById('lastPlayFan');
      const fanHidden = !fan || fan.hidden || fan.hasAttribute('hidden');
      const fanRect = fan && !fanHidden ? fan.getBoundingClientRect() : null;
      const z2 = document.getElementById('playZone2');
      const bubble = document.querySelector('#playZone2 .pass-bubble, .pass-bubble');
      const bRect = bubble ? bubble.getBoundingClientRect() : null;
      return {
        centerCards: q('#lastPlayFan .table-card'),
        zone0: q('#playZone0 .table-card, #playZone0 .pass-bubble'),
        zone1: q('#playZone1 .table-card, #playZone1 .pass-bubble'),
        zone2: q('#playZone2 .table-card, #playZone2 .pass-bubble'),
        passBubbles: q('.pass-bubble'),
        passBubbleText: bubble?.textContent || '',
        fanHidden,
        fanVisible: Boolean(fanRect && fanRect.width > 8 && fanRect.height > 8 && fanRect.bottom > 0 && fanRect.top < window.innerHeight),
        passBubbleVisible: Boolean(bRect && bRect.width > 8 && bRect.height > 8),
      };
    }""")
    REPORT['checks']['lastPlay_dom'] = zones
    shot(page, 'ddz-414-lastplay-pass.png')

    # Pure pass injection (empty cards + pass signal), keep prior play faces
    pure = page.evaluate("""() => {
      const g = window.__teaParlor?.state?.()?.game;
      if (!g) return {ok:false};
      // Seed a prior play on seat 1, then pure pass on seat 2
      const sample = (g.hands[0] || []).slice(0, 2).map((c, i) => ({...c, id: 'pp-' + i}));
      window.__teaParlor.qaApplyLastPlay({ player: 1, currentPlayer: 2, passCount: 0, type: 'pair', cards: sample });
      return window.__teaParlor.qaApplyLastPlay({
        player: 2,
        currentPlayer: 0,
        passCount: 1,
        type: 'pass',
        pass: true,
        cards: [],
      });
    }""")
    REPORT['checks']['pure_pass_apply'] = pure
    page.wait_for_timeout(300)
    pure_dom = page.evaluate("""() => ({
      passBubbles: document.querySelectorAll('.pass-bubble').length,
      zone2Pass: document.querySelectorAll('#playZone2 .pass-bubble').length,
      zone1Play: document.querySelectorAll('#playZone1 .table-card').length,
      centerCards: document.querySelectorAll('#lastPlayFan .table-card').length,
    })""")
    REPORT['checks']['pure_pass_dom'] = pure_dom
    shot(page, 'ddz-414-pure-pass-bubble.png')

    white = page.evaluate("""() => {
      const tv = document.getElementById('tableView');
      const shell = document.querySelector('.lobby-shell');
      const cs = tv ? getComputedStyle(tv) : null;
      return {
        tableActive: shell?.classList.contains('table-active'),
        tvDisplay: cs?.display,
        handN: document.querySelectorAll('#handArea .playing-card').length,
      };
    }""")
    REPORT['checks']['white_guard'] = white

    he = edges or {}
    REPORT['pass']['hand_first_on_screen'] = bool(he.get('firstFullyOnScreen')) and he.get('scrollLeft', 1) == 0
    REPORT['pass']['hand_gutter_ge_100'] = float(he.get('gutterPx') or 0) >= 100
    REPORT['pass']['hand_no_avatar_overlap'] = (not he.get('avatarOverlapFirst', True)) or bool(he.get('cardsAboveAvatar'))
    REPORT['pass']['hand_first_clear_of_avatar'] = (not he.get('avatarOverlapFirst', True)) and bool(he.get('cardsAboveAvatar'))
    REPORT['pass']['lastPlay_center_visible'] = bool((zones or {}).get('centerCards', 0) >= 1 and (zones or {}).get('fanVisible'))
    REPORT['pass']['pass_bubble_seat'] = bool((zones or {}).get('passBubbles', 0) >= 1 and (zones or {}).get('zone2', 0) >= 1)
    REPORT['pass']['pure_pass_bubble'] = bool((pure_dom or {}).get('zone2Pass', 0) >= 1)
    REPORT['pass']['no_white_screen'] = bool(white.get('tableActive') and white.get('handN', 0) >= 8)
    REPORT['pass']['shots_distinct'] = len({v['sha1'] for v in REPORT['shots'].values()}) >= 3

    REPORT['ok'] = all(REPORT['pass'].values())
    (OUT / 'report.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=2))
    md = []
    md.append('# play9v3e QA\n')
    md.append(f"- ok: **{REPORT['ok']}**")
    md.append(f"- cache: `{REPORT['cache']}` viewport `{REPORT['viewport']}` `is_mobile` + `has_touch`\n")
    md.append('## Pass')
    for k, v in REPORT['pass'].items():
      md.append(f"- {k}: {'PASS' if v else 'FAIL'}")
    md.append('\n## Root causes fixed')
    for r in REPORT['root_causes']:
      md.append(f"- {r}")
    md.append('\n## Checks')
    md.append('```json')
    md.append(json.dumps({
      'hand_avatar': REPORT['checks'].get('hand_avatar'),
      'lastPlay_dom': REPORT['checks'].get('lastPlay_dom'),
      'pure_pass_dom': REPORT['checks'].get('pure_pass_dom'),
      'lastPlay_apply': REPORT['checks'].get('lastPlay_apply'),
      'pure_pass_apply': REPORT['checks'].get('pure_pass_apply'),
      'white_guard': REPORT['checks'].get('white_guard'),
    }, ensure_ascii=False, indent=2))
    md.append('```\n')
    md.append('## Shots')
    for name, meta in REPORT['shots'].items():
      md.append(f"- `{name}` sha1={meta['sha1']} bytes={meta['bytes']}")
    (OUT / 'README.md').write_text('\n'.join(md) + '\n')
    (Path('/workspace/play9u2-repo/docs/qa/play9v3e.md')).write_text(
      f"# play9v3e\n\n- ok: **{REPORT['ok']}**\n- cache: `play9v3e`\n- see `docs/qa/play9v3e/`\n"
    )
    print('REPORT ok=', REPORT['ok'], REPORT['pass'], flush=True)
    browser.close()
finally:
  srv.terminate()
  try:
    srv.wait(timeout=3)
  except Exception:
    srv.kill()

sys.exit(0 if REPORT['ok'] else 1)
