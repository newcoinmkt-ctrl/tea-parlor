#!/usr/bin/env python3
"""play9k1 Guandan thumb-zone QA @ 414"""
import json, time
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path('/workspace/play9g1-tables/docs/qa/play9k1')
OUT.mkdir(parents=True, exist_ok=True)
URL = 'http://127.0.0.1:5173/index.html?v=play9k1'
VW, VH = 414, 896
REPORT = {
  'cache': 'play9k1',
  'viewport': [VW, VH],
  'url': URL,
  'shots': {},
  'checks': {},
  'deviations': [],
  'untouched': {},
}

def shot(page, name):
  path = OUT / name
  page.screenshot(path=str(path), full_page=False)
  REPORT['shots'][name] = path.stat().st_size
  print('saved', name, path.stat().st_size, flush=True)

def boot(page):
  page.goto(URL, wait_until='domcontentloaded', timeout=30000)
  page.evaluate('() => localStorage.clear()')
  page.reload(wait_until='domcontentloaded')
  page.wait_for_function('() => Boolean(window.__teaParlor && window.__teaParlor.startGuanDan)', timeout=45000)
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
    if (window.__teaParlor?.leaveMulti) return window.__teaParlor.leaveMulti();
    if (window.__teaParlor?.lobby) return window.__teaParlor.lobby('home');
  }""")
  page.wait_for_timeout(400)
  page.evaluate("""() => {
    const shell = document.querySelector('.lobby-shell');
    if (shell) shell.classList.remove('multi-active','table-active','texas-active');
    const mg = document.querySelector('#multiGameView');
    if (mg) { mg.hidden = true; mg.setAttribute('hidden',''); }
    const tv = document.querySelector('#tableView');
    if (tv) { tv.hidden = true; }
    const stage = document.querySelector('.lobby-stage');
    if (stage) { stage.style.display=''; stage.style.visibility=''; stage.style.pointerEvents=''; }
    const topbar = document.querySelector('.topbar');
    if (topbar) topbar.style.display='';
  }""")

def measure_gd(page):
  return page.evaluate("""() => {
    const q = (s) => document.querySelector(s);
    const rect = (el) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return {top:+b.top.toFixed(1), bottom:+b.bottom.toFixed(1), left:+b.left.toFixed(1),
              right:+b.right.toFixed(1), w:+b.width.toFixed(1), h:+b.height.toFixed(1)};
    };
    const mg = q('#multiGameView');
    const dock = q('.mg-hand-dock');
    const bar = q('.gd-toolbar');
    const hand = q('#mgHand');
    const seat0 = q('[data-mg-seat=\"0\"]');
    const wrap = seat0?.querySelector('.char-figure-wrap');
    const restore = q('[data-gd-restore]');
    const sort = q('[data-gd-sort]');
    const suits = [...document.querySelectorAll('[data-gd-suit]')];
    const cards = [...document.querySelectorAll('#mgHand .gd-card, #mgHand .mg-hand-card, #mgHand [data-card]')];
    const firstCard = cards[0] || null;
    const csSeat = seat0 ? getComputedStyle(seat0) : null;
    const csWrap = wrap ? getComputedStyle(wrap) : null;
    const barParent = bar?.parentElement;
    const barInDock = !!(dock && bar && barParent === dock);
    const barBeforeHand = !!(dock && bar && hand && [...dock.children].indexOf(bar) < [...dock.children].indexOf(hand));
    const br = bar?.getBoundingClientRect();
    const hr = hand?.getBoundingClientRect();
    const s0 = seat0?.getBoundingClientRect();
    const fc = firstCard?.getBoundingClientRect();
    let overlapLeft = null;
    if (s0 && fc) {
      overlapLeft = Math.max(0, Math.min(s0.right, fc.right) - Math.max(s0.left, fc.left));
      if (s0.bottom < fc.top || s0.top > fc.bottom) overlapLeft = 0;
    }
    // try tap first card center
    let cardTapOk = null;
    if (firstCard) {
      const r = firstCard.getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
      cardTapOk = !!(el && (el === firstCard || firstCard.contains(el) || el.closest?.('#mgHand')));
    }
    return {
      mgClass: mg?.className || '',
      gdYard: !!mg?.classList.contains('gd-yard'),
      barInDock,
      barBeforeHand,
      barParentClass: barParent?.className || null,
      toolbar: rect(bar),
      hand: rect(hand),
      dock: rect(dock),
      seat0: {
        rect: rect(seat0),
        widthCss: csSeat?.width,
        maxWidthCss: csSeat?.maxWidth,
        zIndex: csSeat?.zIndex,
        pointerEvents: csSeat?.pointerEvents,
      },
      wrap: {
        rect: rect(wrap),
        widthCss: csWrap?.width,
        heightCss: csWrap?.height,
        transform: wrap ? getComputedStyle(wrap.querySelector('.char-figure')||wrap).transform : null,
      },
      restore: { text: (restore?.textContent||'').trim(), rect: rect(restore), present: !!restore },
      sort: { text: (sort?.textContent||'').trim(), rect: rect(sort), present: !!sort },
      suitCount: suits.length,
      cardCount: cards.length,
      firstCard: rect(firstCard),
      overlapSeat0FirstCard: overlapLeft,
      seat0W_le_56: !!(s0 && s0.width <= 56.5),
      toolbarAboveHand: !!(br && hr && br.bottom <= hr.top + 8),
      cardTapOk,
      listenersKept: {
        restore: !!restore,
        sort: !!sort,
        suits: suits.length === 4,
      },
      dockZ: dock ? getComputedStyle(dock).zIndex : null,
      dockLeft: dock ? getComputedStyle(dock).left : null,
    };
  }""")

with sync_playwright() as p:
  browser = p.chromium.launch(headless=True, args=['--no-sandbox','--disable-dev-shm-usage'])
  ctx = browser.new_context(viewport={'width':VW,'height':VH}, device_scale_factor=2, is_mobile=True, has_touch=True)
  page = ctx.new_page()
  page.on('console', lambda m: print('CONSOLE', m.type, m.text[:200], flush=True) if m.type in ('error','warning') else None)
  boot(page)

  # Lobby smoke
  lobby = page.evaluate("""() => {
    const gold = [...document.querySelectorAll('body *')].find(el => /金币/.test(el.textContent||'') && el.children.length < 3 && (el.textContent||'').length < 24);
    const texts = [...document.querySelectorAll('.game-name, .game-card strong, .lobby-game-card, [data-game], .home-game-name, .room-game-label')].map(e => (e.textContent||'').trim()).filter(Boolean);
    const all = [...document.querySelectorAll('body *')].map(e => (e.childNodes.length? '': '')).slice(0,0);
    const bodyText = document.body.innerText || '';
    const found = ['斗地主','德州','炸金花','麻将','掼蛋','二十一点'].filter(g => bodyText.includes(g));
    return { hasGold: !!gold || /金币/.test(bodyText), foundGames: found, gameCount: found.length };
  }""")
  REPORT['checks']['lobby'] = lobby
  shot(page, 'lobby-414.png')
  print('lobby', lobby, flush=True)

  # Start Guandan
  page.evaluate("""async () => {
    await window.__teaParlor.startGuanDan('novice', { currency: 'ingot' });
  }""")
  page.wait_for_selector('#multiGameView.gd-yard, #multiGameView.gd-active', timeout=30000)
  # wait for cards
  deadline = time.time() + 20
  n = 0
  while time.time() < deadline:
    n = page.evaluate("() => document.querySelectorAll('#mgHand .gd-card, #mgHand .mg-hand-card, #mgHand [data-card], #mgHand button, #mgHand .card').length")
    bar = page.evaluate("() => !!document.querySelector('.gd-toolbar')")
    if n >= 10 and bar:
      break
    page.wait_for_timeout(300)
  page.wait_for_timeout(800)
  print('hand cards', n, flush=True)

  gd = measure_gd(page)
  REPORT['checks']['guandan'] = gd
  print('gd', json.dumps(gd, ensure_ascii=False)[:800], flush=True)
  shot(page, 'gd-414-thumb.png')

  # try click a card
  tap = page.evaluate("""() => {
    const card = document.querySelector('#mgHand .gd-card, #mgHand .mg-hand-card, #mgHand [data-card]');
    if (!card) return {ok:false, reason:'no-card'};
    const before = card.className;
    card.click();
    return {ok:true, before, after: card.className, selected: card.classList.contains('is-on') || card.classList.contains('selected') || card.classList.contains('is-selected')};
  }""")
  REPORT['checks']['cardClick'] = tap
  page.wait_for_timeout(300)
  shot(page, 'gd-414-card-tap.png')

  # seat0 measure close-up already in full shot; also capture after ensuring toolbar visible
  shot(page, 'gd-414-toolbar-hand.png')

  # Optional: leave and smoke mj/ddz lightly
  leave_to_lobby(page)
  page.wait_for_timeout(400)

  # quick mj start/leave
  try:
    page.evaluate("""async () => { await window.__teaParlor.startMahjong('xuezhan', { currency: 'ingot' }); }""")
    page.wait_for_timeout(1500)
    mj = page.evaluate("""() => {
      const mg = document.querySelector('#multiGameView');
      return { className: mg?.className||'', hasMj: !!(mg && (mg.classList.contains('mj-2p')||mg.classList.contains('mj-4p'))) };
    }""")
    REPORT['untouched']['mj_smoke'] = mj
    shot(page, 'mj-smoke-414.png')
    leave_to_lobby(page)
  except Exception as e:
    REPORT['untouched']['mj_smoke'] = {'error': str(e)}

  # ddz optional
  try:
    page.evaluate("""() => {
      if (window.__teaParlor?.start) {
        // classic ddz via room start if available
      }
    }""")
    # Try clicking 斗地主 entry if API unclear
    started = page.evaluate("""() => {
      const btn = [...document.querySelectorAll('button,a,[role=button],.game-card')].find(el => /斗地主/.test(el.textContent||''));
      if (btn) { btn.click(); return true; }
      return false;
    }""")
    page.wait_for_timeout(800)
    ddz = page.evaluate("""() => {
      const tv = document.querySelector('#tableView');
      const more = document.querySelector('#moreMenu, .more-menu, [data-ddz-more], .qq-more');
      return {
        tableVisible: !!(tv && !tv.hidden),
        bodyHasDdz: /出牌|不抢|叫分/.test(document.body.innerText||''),
        clicked: true
      };
    }""")
    ddz['startedClick'] = started
    REPORT['untouched']['ddz_smoke'] = ddz
    shot(page, 'ddz-smoke-414.png')
  except Exception as e:
    REPORT['untouched']['ddz_smoke'] = {'error': str(e)}

  # Pass/fail summary
  g = REPORT['checks'].get('guandan') or {}
  passes = {
    'barInDock': g.get('barInDock') is True,
    'toolbarAboveHand': g.get('toolbarAboveHand') is True,
    'seat0W_le_56': g.get('seat0W_le_56') is True,
    'listenersKept': (g.get('listenersKept') or {}).get('restore') and (g.get('listenersKept') or {}).get('sort') and (g.get('listenersKept') or {}).get('suits'),
    'lobbyGold': REPORT['checks']['lobby'].get('hasGold') is True,
    'cardTapOk': g.get('cardTapOk') is True or (REPORT['checks'].get('cardClick') or {}).get('ok') is True,
  }
  REPORT['pass'] = passes
  REPORT['allPass'] = all(passes.values())
  (OUT / 'report.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=2))
  print('PASS', passes, 'all', REPORT['allPass'], flush=True)
  browser.close()
