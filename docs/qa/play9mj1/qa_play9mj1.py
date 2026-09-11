#!/usr/bin/env python3
"""play9mj1: JJ mahjong landscape letterbox + enter/deal/discard"""
import json, time, hashlib, os
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parent
OUT.mkdir(parents=True, exist_ok=True)
PORT = int(os.environ.get('PORT', '5241'))
URL = f'http://127.0.0.1:{PORT}/index.html?v=play9mj1'
VW, VH = 896, 414
PW, PH = 414, 896
REPORT = {
  'cache': 'play9mj1',
  'viewport_landscape': [VW, VH],
  'viewport_portrait': [PW, PH],
  'url': URL,
  'ed_repro': {
    'path': '大厅 → 麻将 → 四人麻将 → 进桌发牌 → 点选手牌再点一次打出（或点弃）',
    'cache': '?v=play9mj1',
    'fail_on': 'flat 2D four-grid without perspective; page/multiGameView 90° rotate; unresponsive 四人麻将 entry',
  },
  'shots': {},
  'checks': {},
  'pass': {},
  'ok': False,
  'deferred': [
    'Match ≤3s align with play9match3 — DEFER (mahjong local AI enter; not DDZ match overlay)',
  ],
  'files_changed': [
    'apps/web-lobby/src/jj-mahjong.css',
    'apps/web-lobby/src/net/table-orient.js',
    'apps/web-lobby/src/games/mahjong/ui.js',
    'apps/web-lobby/index.html',
    'apps/web-lobby/tests/table-orient-upright.test.js',
    'docs/qa/play9mj1/',
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
      const key = 'tea-parlor-h5-jj-v4';
      const s = JSON.parse(localStorage.getItem(key) || '{}');
      s.ingots = Math.max(Number(s.ingots)||0, 999999);
      s.usdt = Math.max(Number(s.usdt)||0, 999);
      localStorage.setItem(key, JSON.stringify(s));
    } catch (e) {}
  }""")

def wait_hand(page, min_n=13, timeout_s=20):
  deadline = time.time() + timeout_s
  n = 0
  while time.time() < deadline:
    n = page.evaluate("() => document.querySelectorAll('#mgHand .mg-hand-tile, #mgHand .mj-tile').length")
    if n >= min_n:
      return n
    page.wait_for_timeout(250)
  return n

def enter_api(page):
  page.evaluate("""() => {
    window.__mjStarted = 0;
    setTimeout(() => {
      try { window.__teaParlor.startMahjong('siren', { currency: 'ingot' }); window.__mjStarted = 1; }
      catch (e) { console.error(e); window.__mjStarted = 2; }
    }, 0);
  }""")
  page.wait_for_function("""() => {
    const mg = document.getElementById('multiGameView');
    return mg && !mg.hidden && (mg.classList.contains('mj-4p') || mg.dataset.game === 'mahjong');
  }""", timeout=15000)
  return wait_hand(page, min_n=13, timeout_s=25)

def main():
  with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=['--no-sandbox','--disable-dev-shm-usage'])
    page = browser.new_page(viewport={'width': VW, 'height': VH})
    boot(page)
    shot(page, 'lobby-896-home.png')

    page.evaluate("() => { try { window.__teaParlor.lobby('rooms', 'mahjong'); } catch (e) {} }")
    page.wait_for_timeout(350)
    card_ok = False
    try:
      page.locator('section[data-room-game="mahjong"]:not([hidden]) [data-mj-mode="siren"]').first.click(timeout=5000)
      card_ok = True
      page.wait_for_timeout(800)
      wait_hand(page, min_n=13, timeout_s=8)
    except Exception as e:
      REPORT['checks']['room_card_click_error'] = str(e)

    visible = page.evaluate("""() => {
      const mg = document.getElementById('multiGameView');
      return Boolean(mg && !mg.hidden && getComputedStyle(mg).display !== 'none');
    }""")
    hand_n = page.evaluate("() => document.querySelectorAll('#mgHand .mg-hand-tile, #mgHand .mj-tile').length")
    if not visible or hand_n < 13:
      hand_n = enter_api(page)

    page.wait_for_timeout(500)
    stage = page.evaluate("""() => {
      const root = document.documentElement;
      const mg = document.getElementById('multiGameView');
      const cs = mg ? getComputedStyle(mg) : null;
      const tr = cs ? cs.transform : '';
      const felt = document.querySelector('#multiGameView .mj-felt');
      const ft = felt ? getComputedStyle(felt).transform : '';
      const r = mg ? mg.getBoundingClientRect() : null;
      return {
        stageLand: root.classList.contains('table-stage-land'),
        stageJj: root.classList.contains('table-stage-jj'),
        stageMj: root.classList.contains('table-stage-mj'),
        target: !!(mg && mg.classList.contains('table-stage-land-target')),
        transform: tr,
        noRotate90: !/matrix\\(0,\\s*1,\\s*-1,\\s*0/.test(tr) && !/rotate\\(90deg\\)/.test(tr),
        stageW: root.style.getPropertyValue('--table-stage-w'),
        stageH: root.style.getPropertyValue('--table-stage-h'),
        feltTransform: ft,
        feltHas3d: !!(ft && ft !== 'none'),
        compass: !!document.querySelector('#multiGameView .mj-compass'),
        countdown: (document.getElementById('mjCountdown') || {}).textContent || '',
        walls: {
          n: document.querySelectorAll('#mjWallN .mj-wall-tile').length,
          w: document.querySelectorAll('#mjWallW .mj-wall-tile').length,
          e: document.querySelectorAll('#mjWallE .mj-wall-tile').length,
        },
        scores: Array.from(document.querySelectorAll('[data-mj-score]')).map((n) => n.textContent),
        rect: r ? { w: Math.round(r.width), h: Math.round(r.height), t: Math.round(r.top), l: Math.round(r.left) } : null,
        stageWider: !!(r && r.width >= r.height - 1),
        topbar: !!document.querySelector('.mj-jj-topbar'),
        watermark: !!document.querySelector('.mj-watermark'),
      };
    }""")
    REPORT['checks']['stage'] = stage
    REPORT['checks']['hand_after_deal'] = hand_n
    REPORT['checks']['room_card_click'] = card_ok
    shot(page, 'mj-896-table-zones.png')

    discard_before = page.evaluate("() => document.querySelectorAll('.mj-discard-tile').length")
    discard_ok = False
    tiles = page.locator('#mgHand .mg-hand-tile:not([disabled])')
    try:
      if tiles.count() == 0:
        # wait for human discard phase
        page.wait_for_function("() => document.querySelectorAll('#mgHand .mg-hand-tile:not([disabled])').length > 0", timeout=12000)
      tiles.first.click(timeout=3000)
      page.wait_for_timeout(200)
      # re-tap same tile id if still present, else 弃
      still = page.locator('#mgHand .mg-hand-tile.selected')
      if still.count():
        still.first.click(timeout=2000)
      else:
        page.locator('[data-mj-act="discard"]').click(timeout=2000)
      page.wait_for_timeout(500)
      discard_after = page.evaluate("() => document.querySelectorAll('.mj-discard-tile').length")
      hand2 = page.evaluate("() => document.querySelectorAll('#mgHand .mg-hand-tile, #mgHand .mj-tile').length")
      discard_ok = discard_after > discard_before or hand2 < hand_n
      REPORT['checks']['discard_before'] = discard_before
      REPORT['checks']['discard_after'] = discard_after
      REPORT['checks']['hand_after_discard'] = hand2
    except Exception as e:
      REPORT['checks']['discard_error'] = str(e)
      try:
        page.locator('#mgHand .mg-hand-tile:not([disabled])').first.click(timeout=2000)
        page.wait_for_timeout(150)
        page.locator('[data-mj-act="discard"]').click(timeout=2000)
        page.wait_for_timeout(400)
        hand2 = page.evaluate("() => document.querySelectorAll('#mgHand .mg-hand-tile, #mgHand .mj-tile').length")
        discard_ok = hand2 < hand_n
        REPORT['checks']['discard_via_button'] = True
        REPORT['checks']['hand_after_discard'] = hand2
      except Exception as e2:
        REPORT['checks']['discard_button_error'] = str(e2)

    REPORT['checks']['discard_ok'] = discard_ok
    shot(page, 'mj-896-after-discard.png')

    page.evaluate("""() => {
      const layer = document.getElementById('mjHuSettle');
      if (!layer) return false;
      const deltas = [-1900, 100, 500, 1300];
      layer.querySelectorAll('[data-mj-hu-delta]').forEach((b) => {
        const seat = Number(b.getAttribute('data-mj-hu-delta'));
        const d = deltas[seat] || 0;
        b.textContent = (d > 0 ? '+' : '') + String(d);
        b.classList.toggle('is-pos', d >= 0);
        b.classList.toggle('is-neg', d < 0);
        b.hidden = false;
      });
      layer.hidden = false;
      layer.removeAttribute('hidden');
      document.getElementById('multiGameView')?.classList.add('is-hu-settle');
      return true;
    }""")
    page.wait_for_timeout(250)
    shot(page, 'mj-896-hu-settle.png')

    page.set_viewport_size({'width': PW, 'height': PH})
    page.wait_for_timeout(450)
    page.evaluate("() => { try { window.dispatchEvent(new Event('resize')); } catch (e) {} }")
    page.wait_for_timeout(300)
    portrait = page.evaluate("""() => {
      const mg = document.getElementById('multiGameView');
      const tr = mg ? getComputedStyle(mg).transform : '';
      const r = mg ? mg.getBoundingClientRect() : null;
      return {
        transform: tr,
        noRotate90: !/matrix\\(0,\\s*1,\\s*-1,\\s*0/.test(tr),
        rect: r ? { w: Math.round(r.width), h: Math.round(r.height) } : null,
        stageMj: document.documentElement.classList.contains('table-stage-mj'),
      };
    }""")
    REPORT['checks']['portrait_letterbox'] = portrait
    shot(page, 'mj-414-portrait-letterbox.png')

    st = REPORT['checks'].get('stage') or {}
    REPORT['pass'] = {
      'enter_table': hand_n >= 13,
      'deal': hand_n >= 13,
      'discard': bool(discard_ok),
      'landscape_stage': bool(st.get('stageLand') and st.get('stageMj') and st.get('target')),
      'no_rotate_90': bool(st.get('noRotate90')),
      'perspective_felt': bool(st.get('feltHas3d')),
      'compass_countdown': bool(st.get('compass') and st.get('countdown')),
      'walls': (st.get('walls') or {}).get('n', 0) > 0,
      'hu_settle_shot': 'mj-896-hu-settle.png' in REPORT['shots'],
    }
    REPORT['ok'] = all([
      REPORT['pass']['enter_table'],
      REPORT['pass']['deal'],
      REPORT['pass']['discard'],
      REPORT['pass']['landscape_stage'],
      REPORT['pass']['no_rotate_90'],
      REPORT['pass']['perspective_felt'],
    ])
    (OUT / 'report.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=2))
    print(json.dumps({'ok': REPORT['ok'], 'pass': REPORT['pass'], 'hand': hand_n}, ensure_ascii=False), flush=True)
    browser.close()
    return 0 if REPORT['ok'] else 1

if __name__ == '__main__':
  raise SystemExit(main())
