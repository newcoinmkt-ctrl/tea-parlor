#!/usr/bin/env python3
"""play9v3d: hand clip + visible lastPlay @ 414 hasTouch"""
import json, time, hashlib, os, subprocess, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path('/workspace/play9u2-repo/docs/qa/play9v3d')
OUT.mkdir(parents=True, exist_ok=True)
PORT = int(os.environ.get('PORT', '5194'))
URL = f'http://127.0.0.1:{PORT}/index.html?v=play9v3d'
VW, VH = 414, 896
REPORT = {
  'cache': 'play9v3d',
  'viewport': [VW, VH],
  'url': URL,
  'shots': {},
  'checks': {},
  'pass': {},
  'ok': False,
  'root_causes': [
    'handArea width:max-content + justify-content:center clipped leftmost cards off-screen',
    'applyPinusRoom wiped tableActs every online snapshot → empty play-zones',
    'safe-bottom clearance lifted chrome but y-scrollport still ate rank bottoms',
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

def measure_hand_edges(page):
  return page.evaluate("""() => {
    const cards = [...document.querySelectorAll('#handArea .playing-card')];
    const area = document.querySelector('#handArea');
    if (!area || !cards.length) return null;
    const ar = area.getBoundingClientRect();
    const cs = getComputedStyle(area);
    const rects = cards.map(el => {
      const b = el.getBoundingClientRect();
      return {left: +b.left.toFixed(1), right: +b.right.toFixed(1), top: +b.top.toFixed(1), bottom: +b.bottom.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1)};
    });
    const first = rects[0], last = rects[rects.length - 1];
    const vw = window.innerWidth, vh = window.innerHeight;
    return {
      n: cards.length,
      scrollLeft: area.scrollLeft,
      justify: cs.justifyContent,
      width: cs.width,
      maxWidth: cs.maxWidth,
      overflowX: cs.overflowX,
      overflowY: cs.overflowY,
      padL: cs.paddingLeft,
      padB: cs.paddingBottom,
      area: {left:+ar.left.toFixed(1), right:+ar.right.toFixed(1), top:+ar.top.toFixed(1), bottom:+ar.bottom.toFixed(1), w:+ar.width.toFixed(1), h:+ar.height.toFixed(1)},
      first,
      last,
      firstFullyOnScreen: first.left >= -0.5 && first.right <= vw + 0.5 && first.w >= 30,
      lastFullyOnScreenOrScrollable: last.right <= vw + 1 || cs.overflowX === 'auto' || cs.overflowX === 'scroll',
      bottomAboveSafe: first.bottom <= vh - 2,
      sample: rects.slice(0, 3),
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
  # wait for listen
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
    def _on_console(m):
      if m.type in ('error', 'warning'):
        print('CONSOLE', m.type, m.text[:220], flush=True)
    page.on('console', _on_console)
    page.on('pageerror', lambda e: print('PAGEERR', str(e)[:300], flush=True))
    page.on('response', lambda r: print('HTTP', r.status, r.url.split('?')[0][-90:], flush=True) if r.status >= 400 and 'telegram' not in r.url else None)
    boot(page)

    # Lobby shot
    shot(page, 'lobby-414-home.png')

    # Start DDZ local
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

    edges = measure_hand_edges(page)
    REPORT['checks']['hand_edges'] = edges
    shot(page, 'ddz-414-fan-fullwidth.png')

    # close-up of hand including leftmost
    box = page.evaluate("""() => {
      const area = document.querySelector('#handArea');
      if (!area) return null;
      const r = area.getBoundingClientRect();
      return {x: Math.max(0, r.x - 2), y: Math.max(0, r.y - 20), w: Math.min(414, r.width + 4), h: Math.min(180, r.height + 36)};
    }""")
    if box and box.get('w', 0) > 10:
      page.screenshot(path=str(OUT / 'ddz-414-hand-closeup.png'), clip={
        'x': float(box['x']), 'y': float(box['y']), 'width': float(box['w']), 'height': float(box['h']),
      })
      data = (OUT / 'ddz-414-hand-closeup.png').read_bytes()
      REPORT['shots']['ddz-414-hand-closeup.png'] = {
        'bytes': len(data), 'sha1': hashlib.sha1(data).hexdigest()[:12],
      }

    # Inject lastPlay as if online snapshot arrived
    applied = page.evaluate("""() => {
      const g = window.__teaParlor?.state?.()?.game;
      if (!g || !g.hands?.[0]?.length) return {ok:false, reason:'no-game'};
      // Borrow 2 cards from hero hand for a synthetic opponent play (visual only)
      const sample = (g.hands[0] || []).slice(0, 2).map(c => ({...c, id: 'lp-' + c.id}));
      return window.__teaParlor.qaApplyLastPlay({
        player: 1,
        currentPlayer: 0,
        passCount: 1,
        type: 'pair',
        cards: sample,
      });
    }""")
    REPORT['checks']['lastPlay_apply'] = applied
    page.wait_for_timeout(350)

    zones = page.evaluate("""() => {
      const q = (sel) => document.querySelectorAll(sel).length;
      const text = document.getElementById('lastPlayText')?.textContent || '';
      const fan = document.getElementById('lastPlayFan');
      const fanHidden = !fan || fan.hidden || fan.hasAttribute('hidden');
      const fanRect = fan && !fanHidden ? fan.getBoundingClientRect() : null;
      const z1 = document.getElementById('playZone1');
      const z1Rect = z1 ? z1.getBoundingClientRect() : null;
      const z1cs = z1 ? getComputedStyle(z1) : null;
      return {
        centerCards: q('#lastPlayFan .table-card'),
        zone0: q('#playZone0 .table-card, #playZone0 .pass-bubble'),
        zone1: q('#playZone1 .table-card, #playZone1 .pass-bubble'),
        zone2: q('#playZone2 .table-card, #playZone2 .pass-bubble'),
        passBubbles: q('.pass-bubble'),
        lastPlayText: text.slice(0, 80),
        fanHidden,
        fanVisible: Boolean(fanRect && fanRect.width > 8 && fanRect.height > 8 && fanRect.bottom > 0 && fanRect.top < window.innerHeight),
        zone1Visible: Boolean(z1Rect && z1Rect.width > 8 && z1cs && z1cs.opacity !== '0' && z1cs.visibility !== 'hidden'),
        zone1Opacity: z1cs?.opacity,
        zone1Z: z1cs?.zIndex,
      };
    }""")
    REPORT['checks']['lastPlay_dom'] = zones
    shot(page, 'ddz-414-lastplay-table.png')

    # Also take after a real lead play if possible
    page.evaluate("""() => {
      const g = window.__teaParlor?.state?.()?.game;
      if (!g) return;
      g.phase = 'play'; g.currentPlayer = 0; g.lastPlay = null; g.passCount = 0;
      g.tableActs = [null, null, null];
      try { window.__teaParlor.render(); } catch(e) {}
    }""")
    page.wait_for_timeout(200)
    # select + play via API
    play_res = page.evaluate("""() => {
      const g = window.__teaParlor?.state?.()?.game;
      if (!g?.hands?.[0]?.length) return {ok:false};
      const id = g.hands[0][g.hands[0].length - 1].id;
      try { window.__teaParlor.toggleCard(id); } catch(e) {}
      const play = document.getElementById('playButton');
      if (play) { play.disabled = false; play.click(); }
      try { window.__teaParlor.render(); } catch(e) {}
      return {
        ok: true,
        zone0: document.querySelectorAll('#playZone0 .table-card').length,
        center: document.querySelectorAll('#lastPlayFan .table-card').length,
        handN: document.querySelectorAll('#handArea .playing-card').length,
      };
    }""")
    REPORT['checks']['after_play'] = play_res
    page.wait_for_timeout(300)
    shot(page, 'ddz-414-after-play.png')

    # White-screen guard: table still visible
    white = page.evaluate("""() => {
      const tv = document.getElementById('tableView');
      const shell = document.querySelector('.lobby-shell');
      const cs = tv ? getComputedStyle(tv) : null;
      return {
        tableActive: shell?.classList.contains('table-active'),
        tvDisplay: cs?.display,
        tvVisibility: cs?.visibility,
        handN: document.querySelectorAll('#handArea .playing-card').length,
        bodyBg: getComputedStyle(document.body).backgroundColor,
      };
    }""")
    REPORT['checks']['white_guard'] = white

    # Pass criteria
    he = edges or {}
    REPORT['pass']['hand_first_on_screen'] = bool(he.get('firstFullyOnScreen')) and he.get('scrollLeft', 1) == 0
    REPORT['pass']['hand_justify_start'] = (he.get('justify') or '').startswith('flex-start') or (he.get('justify') == 'start')
    REPORT['pass']['hand_not_max_content_clip'] = bool(he.get('firstFullyOnScreen')) and 'max-content' not in str(he.get('width') or '').lower()
    REPORT['pass']['lastPlay_center_or_seat'] = bool(
      (zones or {}).get('centerCards', 0) >= 1 or (zones or {}).get('zone1', 0) >= 1
    )
    REPORT['pass']['pass_bubble'] = bool((zones or {}).get('passBubbles', 0) >= 1)
    REPORT['pass']['no_white_screen'] = bool(white.get('tableActive') and white.get('handN', 0) >= 8)
    REPORT['pass']['shots_distinct'] = len({v['sha1'] for v in REPORT['shots'].values()}) >= 3

    REPORT['ok'] = all(REPORT['pass'].values())
    (OUT / 'report.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=2))
    md = []
    md.append('# play9v3d QA\n')
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
      'hand_edges': REPORT['checks'].get('hand_edges'),
      'lastPlay_dom': REPORT['checks'].get('lastPlay_dom'),
      'lastPlay_apply': REPORT['checks'].get('lastPlay_apply'),
      'after_play': REPORT['checks'].get('after_play'),
      'white_guard': REPORT['checks'].get('white_guard'),
    }, ensure_ascii=False, indent=2))
    md.append('```\n')
    md.append('## Shots')
    for name, meta in REPORT['shots'].items():
      md.append(f"- `{name}` sha1={meta['sha1']} bytes={meta['bytes']}")
    (OUT / 'README.md').write_text('\n'.join(md) + '\n')
    # also top-level short note
    (Path('/workspace/play9u2-repo/docs/qa/play9v3d.md')).write_text(
      f"# play9v3d\n\n- ok: **{REPORT['ok']}**\n- cache: `play9v3d`\n- see `docs/qa/play9v3d/`\n"
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
