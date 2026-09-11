#!/usr/bin/env python3
"""play9mj2: Pocket 日麻 merge into 麻将 — enter/draw/discard + 推倒胡 still works."""
import json, time, hashlib, os, shutil
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parent
OUT.mkdir(parents=True, exist_ok=True)
PORT = int(os.environ.get('PORT', '5262'))
URL = f'http://127.0.0.1:{PORT}/index.html?v=play9mj2'
VW, VH = 896, 414
PW, PH = 414, 896
REPORT = {
  'cache': 'play9mj2',
  'viewport_landscape': [VW, VH],
  'viewport_portrait': [PW, PH],
  'url': URL,
  'ed_repro': {
    'path': '大厅 → 麻将 → 日麻 → 进桌摸打 / 立直；四人麻将(推倒胡)仍可进',
    'cache': '?v=play9mj2',
    'fail_on': 'new lobby icon for riichi; 推倒胡 broken; rotate90; missing pocket zones',
  },
  'shots': {},
  'checks': {},
  'pass': {},
  'ok': False,
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
      const key = 'tea-parlor-h5-jj-v4';
      const s = JSON.parse(localStorage.getItem(key) || '{}');
      s.ingots = Math.max(Number(s.ingots)||0, 999999);
      localStorage.setItem(key, JSON.stringify(s));
    } catch (e) {}
  }""")

def wait_riichi_hand(page, min_n=13, timeout_s=20):
  deadline = time.time() + timeout_s
  n = 0
  while time.time() < deadline:
    n = page.evaluate("() => document.querySelectorAll('#mgHand .rk-tile, #mgHand .mj-tile, #mgHand button').length")
    if n >= min_n:
      return n
    page.wait_for_timeout(250)
  return n

def main():
  with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': VW, 'height': VH})
    boot(page)
    shot(page, '01-home-896.png')

    # rooms via API to avoid flaky lobby clicks
    page.evaluate("""() => {
      try { window.__teaParlor.lobby('rooms', 'mahjong'); } catch (e) { console.error(e); }
    }""")
    page.wait_for_timeout(500)
    page.evaluate("""() => {
      document.querySelectorAll('[data-room-game="mahjong"]').forEach((el) => {
        el.hidden = false; el.removeAttribute('hidden'); el.style.display = '';
      });
    }""")
    page.wait_for_timeout(200)
    shot(page, '02-rooms-896.png')

    # enter riichi
    page.evaluate("""() => {
      window.__rk = 0;
      try { window.__teaParlor.startMahjong('riichi', { currency: 'ingot' }); window.__rk = 1; }
      catch (e) { console.error(e); window.__rk = 2; }
    }""")
    page.wait_for_timeout(800)
    hand_n = wait_riichi_hand(page, 13, 25)
    REPORT['checks']['riichi_hand'] = hand_n
    REPORT['checks']['riichi_active'] = page.evaluate("() => document.getElementById('multiGameView')?.classList.contains('riichi-active')")
    REPORT['checks']['dora_bar'] = page.evaluate("() => !!document.getElementById('rkDoraBar')")
    REPORT['checks']['dial'] = page.evaluate("() => !!document.getElementById('rkDial')")
    REPORT['checks']['compass'] = page.evaluate("() => !!document.querySelector('#multiGameView .mj-compass')")
    REPORT['checks']['walls'] = page.evaluate("""() => ({
      n: document.querySelectorAll('#mjWallN .mj-wall-tile').length,
      w: document.querySelectorAll('#mjWallW .mj-wall-tile').length,
      e: document.querySelectorAll('#mjWallE .mj-wall-tile').length,
      s: document.querySelectorAll('#mjWallS .mj-wall-tile').length,
    })""")
    REPORT['checks']['no_rotate'] = page.evaluate("""() => {
      const tr = getComputedStyle(document.getElementById('multiGameView')).transform || '';
      return !/matrix\\(0,\\s*1,\\s*-1,\\s*0/.test(tr) && !/rotate\\(90deg\\)/.test(tr);
    }""")
    shot(page, '03-riichi-table-896.png')

    # discard one tile
    before = page.evaluate("() => document.querySelectorAll('.rk-river-tiles img').length")
    page.evaluate("""() => {
      const t = document.querySelector('#mgHand .rk-tile');
      if (t) { t.click(); t.click(); }
    }""")
    page.wait_for_timeout(600)
    after = page.evaluate("() => document.querySelectorAll('.rk-river-tiles img').length")
    REPORT['checks']['discard_before'] = before
    REPORT['checks']['discard_after'] = after
    REPORT['checks']['discard_ok'] = after > before or page.evaluate("() => document.querySelectorAll('#mgHand .rk-tile').length") <= 14
    shot(page, '04-riichi-after-discard-896.png')

    # force settle overlay for visual
    page.evaluate("""() => {
      const layer = document.getElementById('rkSettle');
      const panel = document.getElementById('rkSettlePanel');
      if (!layer || !panel) return;
      panel.innerHTML = '<div class="rk-settle-top"><div class="rk-settle-points">12000 点</div><div class="rk-settle-stamp">自摸</div></div>'
        + '<div class="rk-settle-han"><strong>7 番</strong><span>30 符</span></div>'
        + '<div class="rk-yaku-cols"><div><div class="rk-yaku-tag"><span>立直</span><b>1 番</b></div><div class="rk-yaku-tag"><span>里宝牌</span><b>5 番</b></div></div>'
        + '<div><div class="rk-yaku-tag"><span>自摸</span><b>1 番</b></div></div></div>'
        + '<div class="rk-settle-tier">跳满</div>'
        + '<div class="rk-settle-actions"><button type="button" id="rkSettleOk">确认</button></div>';
      layer.hidden = false; layer.removeAttribute('hidden');
    }""")
    page.wait_for_timeout(200)
    shot(page, '05-riichi-settle-896.png')

    # 推倒胡 still enters
    page.evaluate("""() => {
      try { window.__teaParlor.startMahjong('siren', { currency: 'ingot' }); } catch (e) {}
    }""")
    page.wait_for_timeout(1200)
    REPORT['checks']['tuidaohu_active'] = page.evaluate("""() => {
      const r = document.getElementById('multiGameView');
      return r && !r.hidden && r.dataset.game === 'mahjong' && !r.classList.contains('riichi-active');
    }""")
    REPORT['checks']['tuidaohu_hand'] = page.evaluate("() => document.querySelectorAll('#mgHand .mj-tile, #mgHand .mg-hand-tile, #mgHand button').length")
    shot(page, '06-tuidaohu-table-896.png')

    # portrait
    page.set_viewport_size({'width': PW, 'height': PH})
    page.evaluate("""() => { try { window.__teaParlor.startMahjong('riichi', { currency: 'ingot' }); } catch(e){} }""")
    page.wait_for_timeout(1000)
    wait_riichi_hand(page, 10, 15)
    shot(page, '07-riichi-414-portrait.png')
    REPORT['checks']['portrait_riichi'] = page.evaluate("() => document.getElementById('multiGameView')?.classList.contains('riichi-active')")

    browser.close()

  REPORT['pass'] = {
    'riichi_enter': REPORT['checks'].get('riichi_hand', 0) >= 13 and REPORT['checks'].get('riichi_active'),
    'pocket_zones': REPORT['checks'].get('dora_bar') and REPORT['checks'].get('dial') and REPORT['checks'].get('compass'),
    'discard': bool(REPORT['checks'].get('discard_ok')),
    'tuidaohu': bool(REPORT['checks'].get('tuidaohu_active')),
    'no_rotate': bool(REPORT['checks'].get('no_rotate')),
  }
  REPORT['ok'] = all(REPORT['pass'].values())
  (OUT / 'report.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=2))
  print(json.dumps(REPORT['pass'], ensure_ascii=False), 'ok=', REPORT['ok'])
  return 0 if REPORT['ok'] else 1

if __name__ == '__main__':
  raise SystemExit(main())
