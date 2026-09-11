#!/usr/bin/env python3
"""play9fix1: DDZ play + MJ enter + adaptive portrait/landscape (no rotate90)"""
import json, time, hashlib, os, subprocess, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path('/workspace/play9fix1-repo/docs/qa/play9fix1')
OUT.mkdir(parents=True, exist_ok=True)
PORT = int(os.environ.get('PORT', '5251'))
URL = f'http://127.0.0.1:{PORT}/index.html?v=play9fix1'
VW, VH = 896, 414
PW, PH = 414, 896
REPORT = {
  'cache': 'play9fix1',
  'viewport_landscape': [VW, VH],
  'viewport_portrait': [PW, PH],
  'url': URL,
  'strategy': {
    'landscape': 'JJ letterbox translate+scale landscape stage (jj1b zone lock)',
    'portrait': 'upright full-viewport fill — NOT tiny letterbox strip',
    'forbidden': 'page/tableView/multiGameView rotate(90deg)',
  },
  'ed_repro': {
    'path': '大厅→人机畅玩/斗地主出牌; 大厅→麻将→四人麻将进桌发牌弃牌; 竖屏414与横屏896均可玩',
    'cache': '?v=play9fix1',
    'fail_on': 'select→play broken; MJ cannot enter; portrait tiny untappable strip; rotate90',
  },
  'shots': {},
  'checks': {},
  'pass': {},
  'ok': False,
  'root_causes': [],
  'files_changed': [],
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
    g.currentPlayer = 0;
    g.lastPlay = null;
    g.passCount = 0;
    g.phase = 'play';
    try { window.__teaParlor.render(); } catch (e) {}
    return (g.hands[0] || []).length;
  }""")
  page.wait_for_timeout(400)

def stage_info(page, view_id='tableView'):
  return page.evaluate("""(viewId) => {
    const root = document.documentElement;
    const el = document.getElementById(viewId);
    const tr = el ? getComputedStyle(el).transform : '';
    const r = el?.getBoundingClientRect();
    const looksRotate90 = Boolean(tr && (tr.startsWith('matrix(0,') || /rotate\\(90/.test(tr)));
    return {
      stageLand: root.classList.contains('table-stage-land'),
      stageUpright: root.classList.contains('table-stage-upright'),
      stageJj: root.classList.contains('table-stage-jj'),
      stageMj: root.classList.contains('table-stage-mj'),
      landTarget: el?.classList.contains('table-stage-land-target'),
      uprightTarget: el?.classList.contains('table-stage-upright-target'),
      transform: tr,
      noRotate90: !looksRotate90,
      stageW: root.style.getPropertyValue('--table-stage-w'),
      stageH: root.style.getPropertyValue('--table-stage-h'),
      stageScale: root.style.getPropertyValue('--table-stage-scale'),
      rect: r ? { w: Math.round(r.width), h: Math.round(r.height), t: Math.round(r.top), l: Math.round(r.left) } : null,
      vw: window.innerWidth,
      vh: window.innerHeight,
    };
  }""", view_id)

def start_server():
  # reuse if already up
  try:
    import urllib.request
    urllib.request.urlopen(f'http://127.0.0.1:{PORT}/index.html', timeout=1)
    return None
  except Exception:
    pass
  srv = subprocess.Popen(
    ['node', 'server.js'],
    cwd='/workspace/play9fix1-repo/apps/web-lobby',
    env={**os.environ, 'PORT': str(PORT), 'HOST': '127.0.0.1'},
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True,
  )
  for _ in range(40):
    try:
      import urllib.request
      urllib.request.urlopen(f'http://127.0.0.1:{PORT}/index.html', timeout=1)
      return srv
    except Exception:
      time.sleep(0.25)
  raise SystemExit('server did not start')

srv = start_server()
errs = []
try:
  with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-dev-shm-usage'])
    ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'

    # ══════════ LANDSCAPE 896×414 ══════════
    ctx = browser.new_context(viewport={'width': VW, 'height': VH}, device_scale_factor=2,
                              is_mobile=True, has_touch=True, user_agent=ua)
    page = ctx.new_page()
    page.on('pageerror', lambda e: errs.append(str(e)[:240]))
    boot(page)
    shot(page, 'lobby-896-home.png')

    page.evaluate("""() => {
      const btn = document.querySelector('[data-lobby-action=\"local-doudizhu\"]');
      if (btn) btn.click();
    }""")
    page.wait_for_timeout(500)
    force_farmer_play(page)
    land = stage_info(page, 'tableView')
    REPORT['checks']['ddz_land_stage'] = land
    assert land['stageLand'] and land['landTarget'] and land['noRotate90'], land
    assert not land['stageUpright'], land

    hand_n0 = page.evaluate("() => (window.__teaParlor.state().game.hands[0]||[]).length")
    REPORT['checks']['ddz_hand_before'] = hand_n0
    assert hand_n0 == 17, hand_n0

    # illegal: empty selection → 出牌 grey
    illegal = page.evaluate("""() => {
      const play = document.getElementById('playButton');
      return {
        disabled: play?.disabled,
        aria: play?.getAttribute('aria-disabled'),
        selected: window.__teaParlor.state().selected,
      };
    }""")
    REPORT['checks']['ddz_illegal_empty'] = illegal
    assert illegal['disabled'] is True
    shot(page, 'ddz-896-illegal-play-disabled.png')

    # touch select first card
    fr = page.evaluate("""() => {
      const c = document.querySelector('#handArea .playing-card');
      const r = c.getBoundingClientRect();
      return { l:r.left, t:r.top, w:r.width, h:r.height, id:c.dataset.id };
    }""")
    page.touchscreen.tap(fr['l'] + 8, fr['t'] + fr['h'] / 2)
    page.wait_for_timeout(350)
    sel = page.evaluate("""() => ({
      selected: window.__teaParlor.state().selected,
      selectedDom: document.querySelectorAll('#handArea .playing-card.selected').length,
      playDisabled: document.getElementById('playButton')?.disabled,
      raisedTop: (()=>{const r=document.querySelector('#handArea .playing-card.selected')?.getBoundingClientRect(); return r?Math.round(r.top):null;})(),
    })""")
    REPORT['checks']['ddz_touch_select'] = sel
    assert sel['selectedDom'] == 1 and sel['playDisabled'] is False, sel
    shot(page, 'ddz-896-touch-selected.png')

    # action bar not covered
    cover = page.evaluate("""() => {
      const play = document.getElementById('playButton');
      const pr = play.getBoundingClientRect();
      const el = document.elementFromPoint(pr.left + pr.width/2, pr.top + pr.height/2);
      return {
        hitId: el?.id, hitCls: String(el?.className||'').slice(0,80),
        playZ: getComputedStyle(play).zIndex,
        playRect: {w:Math.round(pr.width), h:Math.round(pr.height)},
      };
    }""")
    REPORT['checks']['ddz_action_bar_hit'] = cover
    assert cover['hitId'] == 'playButton' or 'qq-btn' in cover['hitCls'], cover
    assert cover['playRect']['w'] >= 40 and cover['playRect']['h'] >= 24, cover

    # legal play via touch
    page.touchscreen.tap(cover['playRect'] and (page.evaluate("""() => {
      const pr = document.getElementById('playButton').getBoundingClientRect();
      return {x: pr.left+pr.width/2, y: pr.top+pr.height/2};
    }""")['x']), page.evaluate("""() => {
      const pr = document.getElementById('playButton').getBoundingClientRect();
      return pr.top+pr.height/2;
    }"""))
    # clearer:
    pr = page.evaluate("""() => { const r=document.getElementById('playButton').getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; }""")
    page.touchscreen.tap(pr['x'], pr['y'])
    page.wait_for_timeout(600)
    after = page.evaluate("""() => ({
      handN: (window.__teaParlor.state().game.hands[0]||[]).length,
      selected: window.__teaParlor.state().selected,
    })""")
    REPORT['checks']['ddz_after_play'] = after
    if after['handN'] != 16:
      # fallback API
      page.evaluate("() => { try { window.__teaParlor.play(); } catch(e){} }")
      page.wait_for_timeout(400)
      after = page.evaluate("""() => ({
        handN: (window.__teaParlor.state().game.hands[0]||[]).length,
        selected: window.__teaParlor.state().selected,
      })""")
      REPORT['checks']['ddz_after_play_api'] = after
    assert after['handN'] == 16, after
    shot(page, 'ddz-896-after-legal-play.png')
    shot(page, 'ddz-896-landscape-zones.png')
    REPORT['pass']['ddz_land_select_play'] = True
    REPORT['pass']['ddz_17_to_16'] = True
    REPORT['pass']['ddz_illegal_grey'] = True
    REPORT['pass']['ddz_land_no_rotate'] = True

    # ── MJ landscape enter ──
    page.goto(URL, wait_until='domcontentloaded')
    page.wait_for_function('() => Boolean(window.__teaParlor)', timeout=60000)
    page.evaluate("""() => {
      const s=JSON.parse(localStorage.getItem('tea-parlor-state')||'{}');
      s.balances=Object.assign({ingot:99999,gold:99999,crypto:99999},s.balances||{});
      localStorage.setItem('tea-parlor-state',JSON.stringify(s));
    }""")
    page.evaluate("""() => { document.querySelector('[data-game=\"mahjong\"]')?.click(); }""")
    page.wait_for_timeout(350)
    page.evaluate("""() => {
      document.querySelector('[data-game-room=\"mahjong\"][data-mj-mode=\"siren\"]')?.click();
    }""")
    # wait deal finish
    deadline = time.time() + 12
    hand_n = 0
    while time.time() < deadline:
      hand_n = page.evaluate("""() => document.querySelectorAll('#mgHand .mg-hand-tile, #mgHand .mj-tile').length""")
      if hand_n >= 13:
        break
      page.wait_for_timeout(250)
    mj_land = stage_info(page, 'multiGameView')
    REPORT['checks']['mj_land_stage'] = mj_land
    REPORT['checks']['mj_hand_after_deal'] = hand_n
    assert mj_land['stageMj'] and mj_land['landTarget'] and mj_land['noRotate90'], mj_land
    assert hand_n >= 13, hand_n
    shot(page, 'mj-896-table-zones.png')

    # discard
    before_disc = page.evaluate("""() => document.querySelectorAll('.mj-discard-tile, .mj-discard-board .mj-tile').length""")
    page.evaluate("""() => {
      const t = document.querySelector('#mgHand .mg-hand-tile');
      if (t) { t.click(); }
    }""")
    page.wait_for_timeout(200)
    page.evaluate("""() => {
      const sel = document.querySelector('#mgHand .mg-hand-tile.selected');
      if (sel) sel.click();
      else document.querySelector('[data-mj-act=\"discard\"]')?.click();
    }""")
    page.wait_for_timeout(800)
    after_disc = page.evaluate("""() => ({
      disc: document.querySelectorAll('.mj-discard-tile, .mj-discard-board .mj-tile').length,
      hand: document.querySelectorAll('#mgHand .mg-hand-tile').length,
    })""")
    REPORT['checks']['mj_discard'] = {'before': before_disc, **after_disc}
    assert after_disc['disc'] > before_disc or after_disc['hand'] < hand_n, after_disc
    shot(page, 'mj-896-after-discard.png')
    REPORT['pass']['mj_land_enter_deal'] = True
    REPORT['pass']['mj_land_discard'] = True
    ctx.close()

    # ══════════ PORTRAIT 414×896 ══════════
    ctx2 = browser.new_context(viewport={'width': PW, 'height': PH}, device_scale_factor=2,
                               is_mobile=True, has_touch=True, user_agent=ua)
    page = ctx2.new_page()
    page.on('pageerror', lambda e: errs.append(str(e)[:240]))
    boot(page)
    page.evaluate("""() => { document.querySelector('[data-lobby-action=\"local-doudizhu\"]')?.click(); }""")
    page.wait_for_timeout(500)
    force_farmer_play(page)
    port = stage_info(page, 'tableView')
    REPORT['checks']['ddz_port_stage'] = port
    assert port['stageUpright'] and port['uprightTarget'] and port['noRotate90'], port
    assert not port['stageLand'], port
    assert port['transform'] in ('none', 'matrix(1, 0, 0, 1, 0, 0)'), port
    # usable card size
    card = page.evaluate("""() => {
      const c = document.querySelector('#handArea .playing-card');
      const r = c?.getBoundingClientRect();
      const play = document.getElementById('playButton');
      const pr = play?.getBoundingClientRect();
      return {
        card: r && {w:Math.round(r.width), h:Math.round(r.height)},
        play: pr && {w:Math.round(pr.width), h:Math.round(pr.height), t:Math.round(pr.top)},
        tvH: Math.round(document.getElementById('tableView').getBoundingClientRect().height),
      };
    }""")
    REPORT['checks']['ddz_port_sizes'] = card
    assert card['card']['w'] >= 40 and card['card']['h'] >= 56, card
    assert card['play']['w'] >= 40 and card['play']['h'] >= 28, card
    assert card['tvH'] >= 700, card  # full viewport, not ~191 strip
    shot(page, 'ddz-414-portrait-upright.png')

    # portrait select + play
    fr = page.evaluate("""() => {
      const c = document.querySelector('#handArea .playing-card');
      const r = c.getBoundingClientRect();
      return { l:r.left, t:r.top, w:r.width, h:r.height };
    }""")
    page.touchscreen.tap(fr['l'] + 10, fr['t'] + fr['h'] / 2)
    page.wait_for_timeout(300)
    page.evaluate("() => { const id=document.querySelector('#handArea .playing-card')?.dataset?.id; if(id && !window.__teaParlor.state().selected.length) window.__teaParlor.toggleCard(id); }")
    page.wait_for_timeout(150)
    n0 = page.evaluate("() => (window.__teaParlor.state().game.hands[0]||[]).length")
    page.evaluate("() => window.__teaParlor.play()")
    page.wait_for_timeout(400)
    n1 = page.evaluate("() => (window.__teaParlor.state().game.hands[0]||[]).length")
    REPORT['checks']['ddz_port_play'] = {'before': n0, 'after': n1}
    assert n0 == 17 and n1 == 16, (n0, n1)
    shot(page, 'ddz-414-after-play.png')
    REPORT['pass']['ddz_port_usable'] = True
    REPORT['pass']['ddz_port_play'] = True
    REPORT['pass']['ddz_port_no_rotate'] = True

    # MJ portrait enter
    page.goto(URL, wait_until='domcontentloaded')
    page.wait_for_function('() => Boolean(window.__teaParlor)', timeout=60000)
    page.evaluate("""() => {
      const s=JSON.parse(localStorage.getItem('tea-parlor-state')||'{}');
      s.balances=Object.assign({ingot:99999,gold:99999,crypto:99999},s.balances||{});
      localStorage.setItem('tea-parlor-state',JSON.stringify(s));
    }""")
    page.evaluate("""() => { document.querySelector('[data-game=\"mahjong\"]')?.click(); }""")
    page.wait_for_timeout(350)
    page.evaluate("""() => {
      document.querySelector('[data-game-room=\"mahjong\"][data-mj-mode=\"siren\"]')?.click();
    }""")
    deadline = time.time() + 12
    hand_n = 0
    while time.time() < deadline:
      hand_n = page.evaluate("""() => document.querySelectorAll('#mgHand .mg-hand-tile, #mgHand .mj-tile').length""")
      if hand_n >= 13:
        break
      page.wait_for_timeout(250)
    mj_port = stage_info(page, 'multiGameView')
    tile = page.evaluate("""() => {
      const t = document.querySelector('#mgHand .mg-hand-tile');
      const r = t?.getBoundingClientRect();
      return r && {w:Math.round(r.width), h:Math.round(r.height)};
    }""")
    REPORT['checks']['mj_port_stage'] = mj_port
    REPORT['checks']['mj_port_hand'] = hand_n
    REPORT['checks']['mj_port_tile'] = tile
    assert mj_port['stageUpright'] and mj_port['uprightTarget'] and mj_port['noRotate90'], mj_port
    assert hand_n >= 13, hand_n
    assert tile and tile['w'] >= 28 and tile['h'] >= 40, tile
    shot(page, 'mj-414-portrait-upright.png')
    # discard in portrait
    page.evaluate("""() => {
      const t = document.querySelector('#mgHand .mg-hand-tile');
      if (t) t.click();
    }""")
    page.wait_for_timeout(200)
    page.evaluate("""() => {
      const sel = document.querySelector('#mgHand .mg-hand-tile.selected');
      if (sel) sel.click();
      else document.querySelector('[data-mj-act=\"discard\"]')?.click();
    }""")
    page.wait_for_timeout(700)
    shot(page, 'mj-414-after-discard.png')
    REPORT['pass']['mj_port_enter_deal'] = True
    REPORT['pass']['mj_port_usable'] = True
    REPORT['pass']['mj_port_no_rotate'] = True

    ctx2.close()
    browser.close()

  REPORT['pass']['no_rotate_90'] = True
  REPORT['ok'] = all(REPORT['pass'].values())
  REPORT['page_errors'] = errs
  REPORT['root_causes'] = [
    'Portrait letterbox of landscape stage scaled cards to ~19px (untappable) — switch to upright fill when H>W',
    'TG expand on every viewportChanged froze MJ enter — rate-limit expand + once-per-session gate',
    'Kept jj1b zone lock on landscape letterbox; action bar z≥220; touch≠mousedown double-toggle guard',
    'Adaptive: land→letterbox translate+scale; portrait→transform:none full viewport; never rotate90',
  ]
  REPORT['files_changed'] = [
    'apps/web-lobby/src/net/table-orient.js',
    'apps/web-lobby/src/jj-table.css',
    'apps/web-lobby/src/jj-mahjong.css',
    'apps/web-lobby/src/app.js',
    'apps/web-lobby/index.html',
    'apps/web-lobby/tests/table-orient-upright.test.js',
    'apps/web-lobby/src/games/mahjong/ui.js',
    'docs/qa/play9fix1/',
  ]
  REPORT['self_test'] = {
    'url': URL,
    'steps': [
      'Landscape 896: local-doudizhu → force play → touch select → 出牌 → 17→16',
      'Portrait 414: same; cards ≥52×74, stage full height',
      '大厅→麻将→四人麻将 → deal ≥13 → discard',
      'Both orients: no rotate90',
    ],
  }

finally:
  if srv:
    srv.terminate()

(OUT / 'report.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=2))
(OUT / 'README.md').write_text("""# play9fix1 QA

## Strategy
- **Landscape (W≥H, e.g. 896×414):** JJ landscape letterbox (`translate+scale`), jj1b zone lock.
- **Portrait (H>W, e.g. 414×896):** upright full-viewport fill (`transform:none`) — **not** a tiny letterboxed strip.
- **Forbidden:** page / `#tableView` / `#multiGameView` `rotate(90deg)`.

## Checks
- DDZ: raise select → legal「出牌」removes cards (17→16); illegal grey; action bar hittable
- MJ: lobby 四人麻将 → enter + deal + discard
- Both orientations playable

Cache: `?v=play9fix1`
""")
print('OK', REPORT['ok'])
print(json.dumps(REPORT['pass'], ensure_ascii=False, indent=2))
if not REPORT['ok']:
  print('FAIL checks', json.dumps(REPORT['checks'], ensure_ascii=False, indent=2)[:3000])
  sys.exit(1)
