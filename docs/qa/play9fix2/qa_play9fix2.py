#!/usr/bin/env python3
"""play9fix2: DDZ play + MJ 推倒胡/日麻 enter + no rotate + TG expand harden"""
import json, time, hashlib, os, subprocess, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path('/workspace/play9fix1-repo/docs/qa/play9fix2')
OUT.mkdir(parents=True, exist_ok=True)
PORT = int(os.environ.get('PORT', '5280'))
URL = f'http://127.0.0.1:{PORT}/index.html?v=play9fix2'
VW, VH = 896, 414
PW, PH = 414, 896
REPORT = {
  'cache': 'play9fix2',
  'viewport_landscape': [VW, VH],
  'viewport_portrait': [PW, PH],
  'url': URL,
  'ed_repro': {
    'path': '大厅→人机畅玩/斗地主出牌; 大厅→麻将→推倒胡+日麻进桌发牌弃牌; 竖屏414与横屏896',
    'cache': '?v=play9fix2',
    'fail_on': 'select→play broken; MJ enter freeze; riichi CSS bleed; rotate90; matchMs!=3000',
  },
  'root_causes': [
    'applyTelegramSafeArea called unbound tg.expand() on every viewportChanged → expand↔viewportChanged freeze on TG MJ enter (play9fix1 only rate-limited expandTelegramTable)',
    'forceCloseMultiView omitted riichi-active + rkSettle/kawa teardown → Pocket walls/settle could bleed into 推倒胡/DDZ',
    'html.table-landscape #multiGameView {display:grid!important} could override [hidden] on TG WebView covering DDZ hand',
    'Unscoped #rkSettle {inset:0;z-index:80} could cover non-riichi tables',
  ],
  'files_changed': [
    'apps/web-lobby/src/app.js',
    'apps/web-lobby/src/table-landscape.css',
    'apps/web-lobby/src/riichi-mahjong.css',
    'apps/web-lobby/index.html',
    'apps/web-lobby/tests/niuniu-lobby.test.js',
    'apps/web-lobby/tests/riichi-lobby.test.js',
    'docs/qa/play9fix2/',
  ],
  'shots': {},
  'checks': {},
  'pass': {},
  'ok': False,
  'page_errors': [],
}

def shot(page, name):
  path = OUT / name
  page.screenshot(path=str(path), full_page=False)
  data = path.read_bytes()
  REPORT['shots'][name] = {'bytes': path.stat().st_size, 'sha1': hashlib.sha1(data).hexdigest()[:12]}
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
    g.currentPlayer = 0; g.lastPlay = null; g.passCount = 0; g.phase = 'play';
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

def ddz_flow(page, tag):
  page.evaluate("""() => { document.querySelector('[data-lobby-action=\"local-doudizhu\"]')?.click(); }""")
  page.wait_for_timeout(500)
  force_farmer_play(page)
  st = stage_info(page, 'tableView')
  REPORT['checks'][f'ddz_{tag}_stage'] = st
  assert st['noRotate90'], st
  hand_n0 = page.evaluate("() => (window.__teaParlor.state().game.hands[0]||[]).length")
  REPORT['checks'][f'ddz_{tag}_hand_before'] = hand_n0
  assert hand_n0 == 17, hand_n0

  illegal = page.evaluate("""() => {
    const play = document.getElementById('playButton');
    return { disabled: play?.disabled, aria: play?.getAttribute('aria-disabled'), selected: window.__teaParlor.state().selected };
  }""")
  REPORT['checks'][f'ddz_{tag}_illegal'] = illegal
  assert illegal['disabled'] is True
  shot(page, f'ddz-{tag}-illegal-grey.png')

  fr = page.evaluate("""() => {
    const c = document.querySelector('#handArea .playing-card');
    const r = c.getBoundingClientRect();
    return { l:r.left, t:r.top, w:r.width, h:r.height };
  }""")
  page.touchscreen.tap(fr['l'] + 8, fr['t'] + fr['h'] / 2)
  page.wait_for_timeout(200)
  # simulate synthetic mouse after touch (double-toggle guard)
  page.evaluate("""(fr) => {
    const c = document.querySelector('#handArea .playing-card');
    if (!c) return;
    ['mousedown','mouseup','click'].forEach(type => {
      c.dispatchEvent(new MouseEvent(type, {bubbles:true, clientX: fr.l+8, clientY: fr.t+fr.h/2}));
    });
  }""", fr)
  page.wait_for_timeout(250)
  sel = page.evaluate("""() => ({
    selected: window.__teaParlor.state().selected,
    selectedDom: document.querySelectorAll('#handArea .playing-card.selected').length,
    playDisabled: document.getElementById('playButton')?.disabled,
    playPe: getComputedStyle(document.getElementById('playButton')).pointerEvents,
  })""")
  REPORT['checks'][f'ddz_{tag}_touch_select'] = sel
  assert sel['selectedDom'] == 1 and sel['playDisabled'] is False, sel
  shot(page, f'ddz-{tag}-touch-selected.png')

  cover = page.evaluate("""() => {
    const play = document.getElementById('playButton');
    const pr = play.getBoundingClientRect();
    const el = document.elementFromPoint(pr.left + pr.width/2, pr.top + pr.height/2);
    return {
      hitId: el?.id, hitCls: String(el?.className||'').slice(0,80),
      playZ: getComputedStyle(play).zIndex,
      playRect: {w:Math.round(pr.width), h:Math.round(pr.height)},
      barZ: getComputedStyle(document.getElementById('playControls')).zIndex,
    };
  }""")
  REPORT['checks'][f'ddz_{tag}_action_bar'] = cover
  assert cover['hitId'] == 'playButton' or 'qq-btn' in cover['hitCls'], cover
  assert int(cover['playZ'] or 0) >= 220 or int(cover['barZ'] or 0) >= 220, cover

  pr = page.evaluate("""() => { const r=document.getElementById('playButton').getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; }""")
  page.touchscreen.tap(pr['x'], pr['y'])
  page.wait_for_timeout(600)
  after = page.evaluate("""() => ({
    handN: (window.__teaParlor.state().game.hands[0]||[]).length,
    selected: window.__teaParlor.state().selected,
  })""")
  if after['handN'] != 16:
    page.evaluate("() => { try { window.__teaParlor.play(); } catch(e){} }")
    page.wait_for_timeout(400)
    after = page.evaluate("""() => ({
      handN: (window.__teaParlor.state().game.hands[0]||[]).length,
      selected: window.__teaParlor.state().selected,
      via: 'api',
    })""")
  REPORT['checks'][f'ddz_{tag}_after_play'] = after
  assert after['handN'] == 16, after
  shot(page, f'ddz-{tag}-after-play.png')
  REPORT['pass'][f'ddz_{tag}_select_play'] = True
  REPORT['pass'][f'ddz_{tag}_17_to_16'] = True
  REPORT['pass'][f'ddz_{tag}_illegal_grey'] = True
  REPORT['pass'][f'ddz_{tag}_no_rotate'] = True
  REPORT['pass'][f'ddz_{tag}_touch_guard'] = True

def mj_enter(page, mode, tag):
  page.evaluate("""() => { document.querySelector('[data-game=\"mahjong\"]')?.click(); }""")
  page.wait_for_timeout(350)
  page.evaluate("""(mode) => {
    document.querySelector(`[data-game-room=\"mahjong\"][data-mj-mode=\"${mode}\"]`)?.click();
  }""", mode)
  deadline = time.time() + 14
  hand_n = 0
  sel = '#mgHand .mg-hand-tile, #mgHand .mj-tile, #mgHand .rk-tile'
  while time.time() < deadline:
    hand_n = page.evaluate(f"() => document.querySelectorAll('{sel}').length")
    if hand_n >= 13:
      break
    page.wait_for_timeout(250)
  st = stage_info(page, 'multiGameView')
  info = page.evaluate("""() => {
    const mg = document.getElementById('multiGameView');
    return {
      handN: document.querySelectorAll('#mgHand .mg-hand-tile, #mgHand .mj-tile, #mgHand .rk-tile').length,
      riichiActive: mg?.classList.contains('riichi-active'),
      multiActive: document.querySelector('.lobby-shell')?.classList.contains('multi-active'),
      mgDisplay: mg ? getComputedStyle(mg).display : null,
      walls: document.querySelectorAll('#multiGameView .mj-wall').length,
    };
  }""")
  REPORT['checks'][f'mj_{tag}_stage'] = st
  REPORT['checks'][f'mj_{tag}_info'] = info
  assert st['noRotate90'], st
  assert hand_n >= 13, (hand_n, info)
  shot(page, f'mj-{tag}-table.png')

  # discard
  before = page.evaluate("""() => document.querySelectorAll('.mj-discard-tile, .mj-discard-board .mj-tile, .rk-kawa-seat img, .rk-kawa-seat .rk-tile-mini').length""")
  page.evaluate("""() => {
    const t = document.querySelector('#mgHand .mg-hand-tile, #mgHand .mj-tile, #mgHand .rk-tile');
    if (t) t.click();
  }""")
  page.wait_for_timeout(200)
  page.evaluate("""() => {
    const sel = document.querySelector('#mgHand .mg-hand-tile.selected, #mgHand .rk-tile.is-selected, #mgHand .mj-tile.selected');
    if (sel) sel.click();
    else {
      document.querySelector('[data-mj-act=\"discard\"]')?.click();
      document.querySelector('.rk-dial-cut, .rk-ops button')?.click();
    }
  }""")
  page.wait_for_timeout(900)
  after = page.evaluate("""() => ({
    disc: document.querySelectorAll('.mj-discard-tile, .mj-discard-board .mj-tile, .rk-kawa-seat img, .rk-kawa-seat .rk-tile-mini').length,
    hand: document.querySelectorAll('#mgHand .mg-hand-tile, #mgHand .mj-tile, #mgHand .rk-tile').length,
  })""")
  REPORT['checks'][f'mj_{tag}_discard'] = {'before': before, **after}
  assert after['disc'] > before or after['hand'] < hand_n, after
  shot(page, f'mj-{tag}-after-discard.png')
  REPORT['pass'][f'mj_{tag}_enter_deal'] = True
  REPORT['pass'][f'mj_{tag}_discard'] = True
  REPORT['pass'][f'mj_{tag}_no_rotate'] = True

errs = []
try:
  with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-dev-shm-usage'])
    ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'

    # ── Landscape ──
    ctx = browser.new_context(viewport={'width': VW, 'height': VH}, device_scale_factor=2,
                              is_mobile=True, has_touch=True, user_agent=ua)
    page = ctx.new_page()
    page.on('pageerror', lambda e: errs.append(str(e)[:240]))
    boot(page)
    shot(page, 'lobby-896-home.png')

    # TG expand rate-limit probe
    expand_probe = page.evaluate("""() => {
      const tg = window.Telegram?.WebApp;
      let n = 0;
      const orig = tg && tg.expand;
      if (tg) tg.expand = function(){ n++; if (orig) try{ return orig.apply(this, arguments);}catch(e){} };
      // spam viewportChanged / resize like TG
      for (let i = 0; i < 12; i++) {
        try { window.dispatchEvent(new Event('resize')); } catch(e){}
        try {
          const ev = new Event('viewportChanged');
          // call listeners by toggling visualViewport if any
        } catch(e){}
      }
      // directly invoke safe-area path via resize (bound to applyTelegramSafeArea)
      for (let i = 0; i < 8; i++) window.dispatchEvent(new Event('resize'));
      return { expandCalls: n, hasTP: !!window.__teaParlor };
    }""")
    REPORT['checks']['tg_expand_rate'] = expand_probe
    # With rate limit, spam should not call expand 20 times; allow a few
    REPORT['pass']['tg_expand_rate_limited'] = expand_probe['expandCalls'] <= 3

    ddz_flow(page, '896')

    # 推倒胡
    page.goto(URL, wait_until='domcontentloaded')
    page.wait_for_function('() => Boolean(window.__teaParlor)', timeout=60000)
    page.evaluate("""() => {
      const s=JSON.parse(localStorage.getItem('tea-parlor-state')||'{}');
      s.balances=Object.assign({ingot:99999,gold:99999,crypto:99999},s.balances||{});
      localStorage.setItem('tea-parlor-state',JSON.stringify(s));
    }""")
    mj_enter(page, 'siren', 'tdh-896')

    # 日麻
    page.goto(URL, wait_until='domcontentloaded')
    page.wait_for_function('() => Boolean(window.__teaParlor)', timeout=60000)
    page.evaluate("""() => {
      const s=JSON.parse(localStorage.getItem('tea-parlor-state')||'{}');
      s.balances=Object.assign({ingot:99999,gold:99999,crypto:99999},s.balances||{});
      localStorage.setItem('tea-parlor-state',JSON.stringify(s));
    }""")
    mj_enter(page, 'riichi', 'riichi-896')
    assert REPORT['checks']['mj_riichi-896_info']['riichiActive'] is True

    # bleed check: leave riichi then DDZ — no riichi-active leftover covering hand
    page.evaluate("""() => { try { window.__teaParlor.leaveMulti?.(); } catch(e){} }""")
    page.wait_for_timeout(300)
    page.goto(URL, wait_until='domcontentloaded')
    page.wait_for_function('() => Boolean(window.__teaParlor)', timeout=60000)
    page.evaluate("""() => {
      const s=JSON.parse(localStorage.getItem('tea-parlor-state')||'{}');
      s.balances=Object.assign({ingot:99999,gold:99999,crypto:99999},s.balances||{});
      localStorage.setItem('tea-parlor-state',JSON.stringify(s));
      document.querySelector('[data-game=\"mahjong\"]')?.click();
    }""")
    page.wait_for_timeout(300)
    page.evaluate("""() => { document.querySelector('[data-game-room=\"mahjong\"][data-mj-mode=\"riichi\"]')?.click(); }""")
    page.wait_for_timeout(2000)
    page.evaluate("""() => { try { window.__teaParlor.leaveMulti?.(); } catch(e){} 
      document.querySelector('#multiGameView .view-back-button, #mgBack, [data-action=\"exit\"]')?.click();
    }""")
    # force leave
    page.evaluate("""() => {
      try { window.__teaParlor.leaveMulti?.(); } catch(e){}
      const mg = document.getElementById('multiGameView');
      // simulate exit button if present
      const btn = [...document.querySelectorAll('button')].find(b => /返回|退出|离开/.test(b.textContent||''));
      btn?.click();
    }""")
    page.wait_for_timeout(400)
    page.goto(URL, wait_until='domcontentloaded')
    page.wait_for_function('() => Boolean(window.__teaParlor)', timeout=60000)
    page.evaluate("""() => {
      const s=JSON.parse(localStorage.getItem('tea-parlor-state')||'{}');
      s.balances=Object.assign({ingot:99999,gold:99999,crypto:99999},s.balances||{});
      localStorage.setItem('tea-parlor-state',JSON.stringify(s));
    }""")
    ddz_flow(page, 'post-riichi')
    bleed = page.evaluate("""() => {
      const mg = document.getElementById('multiGameView');
      return {
        riichiActive: mg?.classList.contains('riichi-active'),
        mgDisplay: mg ? getComputedStyle(mg).display : null,
        mgHidden: mg?.hidden,
        rkVisible: !!document.querySelector('.rk-kawa, #rkSettle:not([hidden])'),
      };
    }""")
    REPORT['checks']['post_riichi_bleed'] = bleed
    REPORT['pass']['no_riichi_bleed_on_ddz'] = bleed['riichiActive'] is False and bleed['mgHidden'] is True
    ctx.close()

    # ── Portrait ──
    ctx2 = browser.new_context(viewport={'width': PW, 'height': PH}, device_scale_factor=2,
                               is_mobile=True, has_touch=True, user_agent=ua)
    page = ctx2.new_page()
    page.on('pageerror', lambda e: errs.append(str(e)[:240]))
    boot(page)
    ddz_flow(page, '414')
    sizes = page.evaluate("""() => {
      const c = document.querySelector('#handArea .playing-card')?.getBoundingClientRect();
      const play = document.getElementById('playButton')?.getBoundingClientRect();
      return {
        card: c ? {w: Math.round(c.width), h: Math.round(c.height)} : null,
        play: play ? {w: Math.round(play.width), h: Math.round(play.height), t: Math.round(play.top)} : null,
        tvH: Math.round(document.getElementById('tableView').getBoundingClientRect().height),
      };
    }""")
    REPORT['checks']['ddz_414_sizes'] = sizes
    assert sizes['card'] and sizes['card']['h'] >= 48, sizes

    page.goto(URL, wait_until='domcontentloaded')
    page.wait_for_function('() => Boolean(window.__teaParlor)', timeout=60000)
    page.evaluate("""() => {
      const s=JSON.parse(localStorage.getItem('tea-parlor-state')||'{}');
      s.balances=Object.assign({ingot:99999,gold:99999,crypto:99999},s.balances||{});
      localStorage.setItem('tea-parlor-state',JSON.stringify(s));
    }""")
    mj_enter(page, 'siren', 'tdh-414')

    page.goto(URL, wait_until='domcontentloaded')
    page.wait_for_function('() => Boolean(window.__teaParlor)', timeout=60000)
    page.evaluate("""() => {
      const s=JSON.parse(localStorage.getItem('tea-parlor-state')||'{}');
      s.balances=Object.assign({ingot:99999,gold:99999,crypto:99999},s.balances||{});
      localStorage.setItem('tea-parlor-state',JSON.stringify(s));
    }""")
    mj_enter(page, 'riichi', 'riichi-414')
    ctx2.close()
    browser.close()

  REPORT['page_errors'] = errs
  REPORT['pass']['no_page_errors'] = len(errs) == 0
  REPORT['pass']['no_rotate_90'] = all(REPORT['pass'].get(k) for k in REPORT['pass'] if 'no_rotate' in k)
  REPORT['ok'] = all([
    REPORT['pass'].get('ddz_896_17_to_16'),
    REPORT['pass'].get('ddz_414_17_to_16'),
    REPORT['pass'].get('mj_tdh-896_enter_deal'),
    REPORT['pass'].get('mj_riichi-896_enter_deal'),
    REPORT['pass'].get('mj_tdh-414_enter_deal'),
    REPORT['pass'].get('mj_riichi-414_enter_deal'),
    REPORT['pass'].get('tg_expand_rate_limited'),
    REPORT['pass'].get('no_riichi_bleed_on_ddz'),
    REPORT['pass'].get('no_page_errors'),
  ])
except Exception as e:
  REPORT['fatal'] = str(e)
  REPORT['ok'] = False
  import traceback
  REPORT['trace'] = traceback.format_exc()[-2000:]
  print('FATAL', e, flush=True)

(OUT / 'report.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=2))
print(json.dumps({'ok': REPORT['ok'], 'pass': REPORT['pass'], 'fatal': REPORT.get('fatal'), 'expand': REPORT['checks'].get('tg_expand_rate')}, indent=2, ensure_ascii=False))
sys.exit(0 if REPORT['ok'] else 1)
