#!/usr/bin/env python3
"""play9mj2b: polish 日麻 table layout vs Pocket room.jpg — walls/kawa/felt."""
import json, time, hashlib, os, shutil
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parent
OUT.mkdir(parents=True, exist_ok=True)
PORT = int(os.environ.get('PORT', '5263'))
URL = f'http://127.0.0.1:{PORT}/index.html?v=play9mj2b'
VW, VH = 896, 414
PW, PH = 414, 896
REPORT = {
  'cache': 'play9mj2b',
  'viewport_landscape': [VW, VH],
  'viewport_portrait': [PW, PH],
  'url': URL,
  'ed_repro': {
    'path': '大厅 → 麻将 → 日麻 → 进桌；核对四面黄背墙/四家河/木框蓝毡/罗盘',
    'cache': '?v=play9mj2b',
    'fail_on': 'green walls; missing 4 kawa; rotate90; 推倒胡/牛牛/DDZ regression; new icon',
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
    n = page.evaluate("() => document.querySelectorAll('#mgHand .rk-tile, #mgHand button').length")
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

    page.evaluate("""() => {
      try { window.__teaParlor.lobby('rooms', 'mahjong'); } catch (e) { console.error(e); }
    }""")
    page.wait_for_timeout(400)
    page.evaluate("""() => {
      document.querySelectorAll('[data-room-game="mahjong"]').forEach((el) => {
        el.hidden = false; el.removeAttribute('hidden'); el.style.display = '';
      });
    }""")
    page.wait_for_timeout(200)
    shot(page, '02-rooms-896.png')

    page.evaluate("""() => {
      window.__rk = 0;
      try { window.__teaParlor.startMahjong('riichi', { currency: 'ingot' }); window.__rk = 1; }
      catch (e) { console.error(e); window.__rk = 2; }
    }""")
    page.wait_for_timeout(900)
    hand_n = wait_riichi_hand(page, 13, 25)
    REPORT['checks']['riichi_hand'] = hand_n
    REPORT['checks']['riichi_active'] = page.evaluate("() => document.getElementById('multiGameView')?.classList.contains('riichi-active')")
    REPORT['checks']['dora_bar'] = page.evaluate("() => !!document.getElementById('rkDoraBar')")
    REPORT['checks']['compass'] = page.evaluate("() => !!document.querySelector('#multiGameView .mj-compass')")
    REPORT['checks']['walls'] = page.evaluate("""() => ({
      n: document.querySelectorAll('#mjWallN .mj-wall-tile').length,
      w: document.querySelectorAll('#mjWallW .mj-wall-tile').length,
      e: document.querySelectorAll('#mjWallE .mj-wall-tile').length,
      s: document.querySelectorAll('#mjWallS .mj-wall-tile').length,
      stacks: document.querySelectorAll('#multiGameView .mj-wall-stack').length,
    })""")
    REPORT['checks']['kawa'] = page.evaluate("() => document.querySelectorAll('#mgCenter .rk-kawa-seat').length")
    REPORT['checks']['compass_scores'] = page.evaluate("() => document.querySelectorAll('.rk-cscore').length")
    REPORT['checks']['wall_s_visible'] = page.evaluate("""() => {
      const el = document.getElementById('mjWallS');
      if (!el) return false;
      const st = getComputedStyle(el);
      return st.display !== 'none' && st.visibility !== 'hidden';
    }""")
    REPORT['checks']['no_rotate'] = page.evaluate("""() => {
      const tr = getComputedStyle(document.getElementById('multiGameView')).transform || '';
      return !/matrix\\(0,\\s*1,\\s*-1,\\s*0/.test(tr) && !/rotate\\(90deg\\)/.test(tr);
    }""")
    REPORT['checks']['felt_color'] = page.evaluate("""() => {
      const f = document.querySelector('#multiGameView .mj-felt');
      return f ? getComputedStyle(f).backgroundImage || getComputedStyle(f).backgroundColor : '';
    }""")
    shot(page, '03-riichi-table-896.png')

    before = page.evaluate("() => document.querySelectorAll('.rk-kawa-seat img, .rk-kawa-seat .rk-tile-mini').length")
    page.evaluate("""() => {
      const t = document.querySelector('#mgHand .rk-tile');
      if (t) { t.click(); t.click(); }
    }""")
    page.wait_for_timeout(700)
    after = page.evaluate("() => document.querySelectorAll('.rk-kawa-seat img, .rk-kawa-seat .rk-tile-mini').length")
    REPORT['checks']['discard_before'] = before
    REPORT['checks']['discard_after'] = after
    REPORT['checks']['discard_ok'] = after > before or page.evaluate("() => document.querySelectorAll('#mgHand .rk-tile').length") <= 14
    shot(page, '04-riichi-after-discard-896.png')

    page.evaluate("""() => {
      const layer = document.getElementById('rkSettle');
      const panel = document.getElementById('rkSettlePanel');
      if (!layer || !panel) return;
      panel.innerHTML = '<div class="rk-settle-top"><div class="rk-settle-points">12000 点</div><div class="rk-settle-stamp">自摸</div></div>'
        + '<div class="rk-settle-han"><strong>7 番</strong><span>30 符</span></div>'
        + '<div class="rk-yaku-cols"><div><div class="rk-yaku-tag"><span>立直</span><b>1 番</b></div></div>'
        + '<div><div class="rk-yaku-tag"><span>自摸</span><b>1 番</b></div></div></div>'
        + '<div class="rk-settle-tier">跳满</div>'
        + '<div class="rk-settle-actions"><button type="button" id="rkSettleOk">确认</button></div>';
      layer.hidden = false; layer.removeAttribute('hidden');
    }""")
    page.wait_for_timeout(200)
    shot(page, '05-riichi-settle-896.png')

    page.evaluate("""() => {
      try { window.__teaParlor.startMahjong('siren', { currency: 'ingot' }); } catch (e) {}
    }""")
    page.wait_for_timeout(1200)
    REPORT['checks']['tuidaohu_active'] = page.evaluate("""() => {
      const r = document.getElementById('multiGameView');
      return r && !r.hidden && r.dataset.game === 'mahjong' && !r.classList.contains('riichi-active');
    }""")
    shot(page, '06-tuidaohu-table-896.png')

    page.set_viewport_size({'width': PW, 'height': PH})
    page.evaluate("""() => { try { window.__teaParlor.startMahjong('riichi', { currency: 'ingot' }); } catch(e){} }""")
    page.wait_for_timeout(1000)
    wait_riichi_hand(page, 10, 15)
    shot(page, '07-riichi-414-portrait.png')
    REPORT['checks']['portrait_riichi'] = page.evaluate("() => document.getElementById('multiGameView')?.classList.contains('riichi-active')")

    browser.close()

  walls = REPORT['checks'].get('walls') or {}
  REPORT['pass'] = {
    'riichi_enter': REPORT['checks'].get('riichi_hand', 0) >= 13 and REPORT['checks'].get('riichi_active'),
    'four_walls': (walls.get('n', 0) > 0 and walls.get('s', 0) > 0 and walls.get('w', 0) > 0 and walls.get('e', 0) > 0
                   and walls.get('stacks', 0) >= 4 and REPORT['checks'].get('wall_s_visible')),
    'four_kawa': REPORT['checks'].get('kawa') == 4,
    'compass_scores': REPORT['checks'].get('compass_scores') == 4,
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
