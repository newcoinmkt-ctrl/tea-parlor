#!/usr/bin/env python3
"""play9nn1b QA: niuniu full flow tappable @414+896; DDZ/MJ smoke; no rotate90."""
import hashlib, json, time
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path('/workspace/tea-nn1/docs/qa/play9nn1b')
OUT.mkdir(parents=True, exist_ok=True)
URL = 'http://127.0.0.1:5252/index.html?v=play9nn1b'
errs = []
REPORT = {
  'cache': 'play9nn1b',
  'branch': 'play9nn1b',
  'url': URL,
  'root_cause': (
    'After play9nn1 merge, mobile nn table inherited html.table-landscape '
    '.multi-active .mg-table {display:grid} + table-active shell class, so the '
    '6-seat absolute layout collided with MJ/DDZ chrome; AI instant-liang during '
    'cuopai made the table look finished while 搓/开 still showed; 搓牌 was a no-op '
    '(5th card already face-up); dock lacked safe-area / pointer hardening for TG.'
  ),
  'fix': [
    'Override nn .mg-table to display:block (kill landscape grid bleed)',
    'Hide .mg-footer under nn-active; felt pointer-events:none',
    'nn show() uses multi-active only (no table-active)',
    '搓牌 keeps 5th hole until kan/liang; AI waits for human 搓/开 before opening',
    'pointerup+click debounce on #nnActions; dock safe-area; cache ?v=play9nn1b',
  ],
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
  page.add_init_script("try{localStorage.clear()}catch(e){}")
  page.goto(URL, wait_until='domcontentloaded', timeout=30000)
  page.wait_for_function('() => Boolean(window.__teaParlor)', timeout=30000)
  page.evaluate("""() => {
    const s=JSON.parse(localStorage.getItem('tea-parlor-state')||'{}');
    s.balances=Object.assign({ingot:99999,gold:99999,crypto:99999},s.balances||{});
    s.ingots=99999; localStorage.setItem('tea-parlor-state',JSON.stringify(s));
  }""")

def touch(page, sel):
  loc = page.locator(sel).first
  box = loc.bounding_box()
  assert box, sel
  x = box['x'] + box['width']/2
  y = box['y'] + box['height']/2
  hit = page.evaluate("""([x,y]) => {
    const el=document.elementFromPoint(x,y);
    return {tag:el?.tagName, id:el?.id, cls:String(el?.className||'').slice(0,60)};
  }""", [x,y])
  page.touchscreen.tap(x, y)
  return {'sel': sel, 'box': {k: round(box[k],1) for k in box}, 'hit': hit}

def stage(page):
  return page.evaluate("""() => {
    const root=document.documentElement;
    const mg=document.getElementById('multiGameView');
    const tr=mg?getComputedStyle(mg).transform:'';
    const looksRotate90=Boolean(tr && (tr.startsWith('matrix(0,') || /rotate\\(90/.test(tr)));
    return {
      land: root.classList.contains('table-stage-land'),
      upright: root.classList.contains('table-stage-upright'),
      nn: root.classList.contains('table-stage-nn'),
      transform: tr,
      noRotate90: !looksRotate90,
      grid: getComputedStyle(document.querySelector('#multiGameView .mg-table')).display,
      shell: document.querySelector('.lobby-shell')?.className,
      footerDisp: getComputedStyle(document.querySelector('#multiGameView .mg-footer')).display,
      actsPE: getComputedStyle(document.getElementById('nnActions')).pointerEvents,
    };
  }""")

def nn_flow(page, tag):
  page.evaluate("""() => (document.querySelector('[data-side-game=niuniu]')||document.querySelector('[data-game=niuniu]')).click()""")
  page.wait_for_timeout(350)
  shot(page, f'{tag}-02-rooms.png')
  page.evaluate("""() => document.querySelector('[data-game-room=niuniu][data-nn=novice]').click()""")
  page.wait_for_timeout(400)
  # match may flash
  shot(page, f'{tag}-03-match.png')
  page.wait_for_function("""() => {
    const m=document.getElementById('nnMatch');
    return m && m.hidden && document.querySelector('#nnActions [data-nn-act=qiang]');
  }""", timeout=8000)
  st = stage(page)
  REPORT['checks'][f'{tag}-stage'] = st
  assert st['noRotate90']
  assert st['grid'] == 'block', st
  assert 'table-active' not in (st['shell'] or '')
  assert st['footerDisp'] == 'none'
  assert st['actsPE'] == 'auto'
  shot(page, f'{tag}-04-qiang.png')
  # bar geometry
  bars = page.evaluate("""() => [...document.querySelectorAll('#nnActions .nn-bei')].map((b,i)=>{
    const r=b.getBoundingClientRect();
    return {i,label:b.getAttribute('aria-label'),x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height),r:Math.round(r.right)};
  })""")
  REPORT['checks'][f'{tag}-qiang-bar'] = bars
  ys = {b['y'] for b in bars}
  assert len(bars) == 5
  assert len(ys) == 1, bars
  for i in range(1,5):
    assert bars[i]['x'] >= bars[i-1]['r'] - 1, bars

  t1 = touch(page, 'button.nn-bei[data-nn-act=qiang][data-v="0"]')
  assert t1['hit']['tag'] == 'BUTTON', t1
  page.wait_for_function("""() => document.querySelector('#nnActions [data-nn-act=xia], #nnActions [data-nn-act=liang], #nnActions [data-nn-act=kan]')""", timeout=8000)
  shot(page, f'{tag}-05-after-qiang.png')
  if page.locator('#nnActions [data-nn-act=xia]').count():
    t2 = touch(page, 'button.nn-bei[data-nn-act=xia][data-v="2"]')
    assert t2['hit']['tag'] == 'BUTTON', t2
    page.wait_for_timeout(800)
  page.wait_for_function("""() => document.querySelector('#nnActions [data-nn-act=liang]')""", timeout=10000)
  shot(page, f'{tag}-06-cuo.png')
  # 5th still hole?
  hole = page.evaluate("""() => {
    const cards=[...document.querySelectorAll('#nnHand .nn-card')];
    return {n:cards.length, backs:cards.filter(c=>c.classList.contains('back')||c.classList.contains('mg-card-back')).length};
  }""")
  REPORT['checks'][f'{tag}-hole'] = hole
  touch(page, 'button[data-nn-act=kan]')
  page.wait_for_timeout(350)
  shot(page, f'{tag}-06b-after-kan.png')
  hole2 = page.evaluate("""() => {
    const cards=[...document.querySelectorAll('#nnHand .nn-card')];
    return {n:cards.length, backs:cards.filter(c=>c.classList.contains('back')||c.classList.contains('mg-card-back')).length};
  }""")
  REPORT['checks'][f'{tag}-after-kan'] = hole2
  assert hole2['backs'] == 0
  touch(page, 'button[data-nn-act=liang]')
  page.wait_for_function("""() => {
    const m=document.getElementById('mgResultModal');
    return m && !m.hidden;
  }""", timeout=12000)
  shot(page, f'{tag}-07-settle.png')
  settle = page.evaluate("""() => ({
    text: document.getElementById('mgResultModal')?.innerText?.slice(0,180),
    stamps: document.querySelectorAll('img.nn-stamp').length,
    matchHidden: document.getElementById('nnMatch')?.hidden,
  })""")
  REPORT['checks'][f'{tag}-settle'] = settle
  assert settle['matchHidden'] is True
  REPORT['pass'][tag] = True

with sync_playwright() as p:
  browser = p.chromium.launch(headless=True, args=['--no-sandbox','--disable-dev-shm-usage'])
  ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
  # home
  ctx = browser.new_context(viewport={'width':414,'height':896}, device_scale_factor=2, is_mobile=True, has_touch=True, user_agent=ua)
  page = ctx.new_page(); page.on('pageerror', lambda e: errs.append(str(e)))
  boot(page); shot(page, '01-home.png'); ctx.close()

  for tag, vw, vh in [('414',414,896),('896',896,414)]:
    ctx = browser.new_context(viewport={'width':vw,'height':vh}, device_scale_factor=2, is_mobile=True, has_touch=True, user_agent=ua)
    page = ctx.new_page(); page.on('pageerror', lambda e: errs.append(f'{tag}:{e}'))
    boot(page)
    nn_flow(page, tag)
    ctx.close()

  # DDZ smoke select→play-ish
  ctx = browser.new_context(viewport={'width':414,'height':896}, device_scale_factor=2, is_mobile=True, has_touch=True, user_agent=ua)
  page = ctx.new_page(); page.on('pageerror', lambda e: errs.append('ddz:'+str(e)))
  boot(page)
  page.evaluate("""() => document.querySelector('[data-lobby-action=local-doudizhu]')?.click()""")
  page.wait_for_timeout(2500)
  shot(page, 'ddz-smoke-414.png')
  ddz = page.evaluate("""() => ({
    hand: document.querySelectorAll('#handArea .playing-card, .hand-area .playing-card').length,
    tvHidden: document.getElementById('tableView')?.hidden,
  })""")
  REPORT['checks']['ddz'] = ddz
  REPORT['pass']['ddz'] = ddz['hand'] >= 16 or ddz['tvHidden'] is False
  ctx.close()

  # MJ enter
  ctx = browser.new_context(viewport={'width':414,'height':896}, device_scale_factor=2, is_mobile=True, has_touch=True, user_agent=ua)
  page = ctx.new_page(); page.on('pageerror', lambda e: errs.append('mj:'+str(e)))
  boot(page)
  page.evaluate("""() => (document.querySelector('[data-side-game=mahjong]')||document.querySelector('[data-game=mahjong]'))?.click()""")
  page.wait_for_timeout(300)
  page.evaluate("""() => document.querySelector('[data-game-room=mahjong]')?.click()""")
  page.wait_for_timeout(2000)
  shot(page, 'mj-smoke-414.png')
  mj = page.evaluate("""() => ({
    open: !document.getElementById('multiGameView')?.hidden,
    cls: document.getElementById('multiGameView')?.className || '',
  })""")
  REPORT['checks']['mj'] = mj
  REPORT['pass']['mj'] = mj['open'] and ('mj-4p' in mj['cls'] or 'mj-2p' in mj['cls'] or 'mahjong' in mj['cls'])
  ctx.close()

  REPORT['errs'] = errs
  REPORT['ok'] = all(REPORT['pass'].get(k) for k in ('414','896','ddz','mj')) and not errs
  (OUT/'report.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=2))
  print('OK', REPORT['ok'], 'pass', REPORT['pass'], 'errs', errs)
  browser.close()
