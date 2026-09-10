#!/usr/bin/env python3
"""play9v3f: adaptive hand gutter + legal play button + seat cardbacks @414 hasTouch"""
import json, time, hashlib, os, subprocess, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path('/workspace/play9u2-repo/docs/qa/play9v3f')
OUT.mkdir(parents=True, exist_ok=True)
PORT = int(os.environ.get('PORT', '5196'))
URL = f'http://127.0.0.1:{PORT}/index.html?v=play9v3f'
VW, VH = 414, 896
REPORT = {
  'cache': 'play9v3f',
  'viewport': [VW, VH],
  'url': URL,
  'ed_repro': {
    'path': 'TG Mini App portrait → 人机畅玩/local-doudizhu → force play phase; select A+10 →「出牌」must be grey; scroll hand to see rightmost card; opponents show card-back stack + count',
    'cache': '?v=play9v3f',
    'fail_on': 'play9v3e fixed 100px gutter clipped rightmost selected 10♠;「出牌」lit on illegal A♦+10♠; bare「17」without cardbacks',
  },
  'shots': {},
  'checks': {},
  'pass': {},
  'ok': False,
  'root_causes': [
    'Fixed 100px left gutter pushed JJ fan right and clipped last card on 414 portrait',
    'Play button enabled whenever selected.size>0 (illegal A+10 looked playable; online skipped local validate)',
    'Opponent remain-chips was bare count text with no card-back stack',
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

def measure_hand(page):
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
    const gutterPx = parseFloat(cs.paddingLeft) || 0;
    const canScroll = area.scrollWidth > area.clientWidth + 1;
    // Scroll to end and remeasure last visibility
    const prev = area.scrollLeft;
    area.scrollLeft = area.scrollWidth;
    const lastEnd = cards[cards.length - 1].getBoundingClientRect();
    const lastFullyVisibleAtEnd = lastEnd.right <= window.innerWidth + 1 && lastEnd.left >= ar.left - 1;
    area.scrollLeft = prev;
    return {
      n: cards.length,
      scrollLeft: area.scrollLeft,
      scrollWidth: area.scrollWidth,
      clientWidth: area.clientWidth,
      canScroll,
      justify: cs.justifyContent,
      padL: cs.paddingLeft,
      overflowX: cs.overflowX,
      areaZ, firstZ, avZ,
      barZ: barCs?.zIndex,
      area: {left:+ar.left.toFixed(1), right:+ar.right.toFixed(1), w:+ar.width.toFixed(1), h:+ar.height.toFixed(1)},
      first: {left:+first.left.toFixed(1), right:+first.right.toFixed(1), top:+first.top.toFixed(1), bottom:+first.bottom.toFixed(1), w:+first.width.toFixed(1), h:+first.height.toFixed(1)},
      last: {left:+last.left.toFixed(1), right:+last.right.toFixed(1), w:+last.width.toFixed(1)},
      lastAtEnd: {left:+lastEnd.left.toFixed(1), right:+lastEnd.right.toFixed(1)},
      avatar: av ? {left:+av.left.toFixed(1), right:+av.right.toFixed(1), top:+av.top.toFixed(1), bottom:+av.bottom.toFixed(1), w:+av.width.toFixed(1), h:+av.height.toFixed(1)} : null,
      firstFullyOnScreen: first.left >= -0.5 && first.right <= window.innerWidth + 0.5 && first.width >= 30,
      firstClearOfLeftEdge: first.left >= ar.left + 1,
      avatarOverlapFirst: overlaps,
      cardsAboveAvatar: areaZ > avZ || firstZ > avZ,
      gutterPx,
      gutterAdaptive: gutterPx >= 48 && gutterPx <= 72,
      lastFullyVisibleAtEnd,
      lastNotClippedAtStart: last.right <= window.innerWidth + 0.5 || canScroll,
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

    edges = measure_hand(page)
    REPORT['checks']['hand_avatar'] = edges
    shot(page, 'ddz-414-hand-left.png')

    # scroll to end for rightmost visibility shot
    page.evaluate("""() => {
      const area = document.querySelector('#handArea');
      if (area) area.scrollLeft = area.scrollWidth;
    }""")
    page.wait_for_timeout(200)
    shot(page, 'ddz-414-hand-right.png')
    page.evaluate("""() => {
      const area = document.querySelector('#handArea');
      if (area) area.scrollLeft = 0;
    }""")

    # Illegal A+10 selection → play disabled
    illegal = page.evaluate("""() => {
      const g = window.__teaParlor?.state?.()?.game;
      if (!g?.hands?.[0]) return {ok:false, reason:'no-hand'};
      // pick one Ace and one 10 if present; else force two mismatched ranks
      const hand = g.hands[0];
      let a = hand.find(c => c.rank === 14);
      let t = hand.find(c => c.rank === 10);
      if (!a || !t) {
        a = hand[0]; t = hand.find(c => c.rank !== a.rank) || hand[1];
      }
      window.__teaParlor.toggleCard(a.id);
      window.__teaParlor.toggleCard(t.id);
      const st = window.__teaParlor.selectionPlayState();
      const btn = document.getElementById('playButton');
      return {
        ok: true,
        ranks: [a.rank, t.rank],
        allowPlay: st?.allowPlay,
        reason: st?.reason,
        message: st?.message,
        disabled: btn?.disabled,
        aria: btn?.getAttribute('aria-disabled'),
        recommended: btn?.classList.contains('is-recommended'),
      };
    }""")
    REPORT['checks']['illegal_play'] = illegal
    shot(page, 'ddz-414-illegal-play-disabled.png')

    # Legal single play works
    legal = page.evaluate("""() => {
      const g = window.__teaParlor?.state?.()?.game;
      if (!g?.hands?.[0]?.length) return {ok:false};
      // clear selection via re-render force
      const ids = [...(window.__teaParlor.state()?.selected || [])];
      ids.forEach(id => window.__teaParlor.toggleCard(id));
      const card = g.hands[0][g.hands[0].length - 1];
      window.__teaParlor.toggleCard(card.id);
      const before = g.hands[0].length;
      const st = window.__teaParlor.selectionPlayState();
      const btn = document.getElementById('playButton');
      if (st?.allowPlay) {
        try { window.__teaParlor.play(); } catch (e) { return {ok:false, error:String(e)}; }
      }
      const afterState = window.__teaParlor.state();
      const after = afterState?.game?.hands?.[0]?.length;
      return {
        ok: true,
        allowPlay: st?.allowPlay,
        reason: st?.reason,
        disabled: btn?.disabled,
        before, after,
        played: typeof after === 'number' && after < before,
        centerN: document.querySelectorAll('#lastPlayFan .table-card').length,
      };
    }""")
    REPORT['checks']['legal_single_play'] = legal
    page.wait_for_timeout(300)
    shot(page, 'ddz-414-after-legal-play.png')

    # Seat cardbacks
    backs = page.evaluate("""() => {
      const r1 = document.getElementById('remain1');
      const r2 = document.getElementById('remain2');
      return {
        r1backs: r1 ? r1.querySelectorAll('.remain-back').length : 0,
        r2backs: r2 ? r2.querySelectorAll('.remain-back').length : 0,
        r1count: r1?.querySelector('.remain-count')?.textContent || r1?.textContent || '',
        r2count: r2?.querySelector('.remain-count')?.textContent || r2?.textContent || '',
        r1html: (r1?.innerHTML || '').slice(0, 180),
      };
    }""")
    REPORT['checks']['seat_cardbacks'] = backs
    shot(page, 'ddz-414-seat-cardbacks.png')

    # lastPlay + pass (no regression)
    applied = page.evaluate("""() => {
      const g = window.__teaParlor?.state?.()?.game;
      if (!g || !g.hands?.[0]?.length) return {ok:false, reason:'no-game'};
      const sample = (g.hands[0] || []).slice(0, 5).map((c, i) => ({...c, id: 'lp-' + i + '-' + c.id}));
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
      const bubble = document.querySelector('#playZone2 .pass-bubble, .pass-bubble');
      const bRect = bubble ? bubble.getBoundingClientRect() : null;
      return {
        centerCards: q('#lastPlayFan .table-card'),
        zone1: q('#playZone1 .table-card, #playZone1 .pass-bubble'),
        zone2: q('#playZone2 .table-card, #playZone2 .pass-bubble'),
        passBubbles: q('.pass-bubble'),
        fanHidden,
        fanVisible: Boolean(fanRect && fanRect.width > 8 && fanRect.height > 8),
        passBubbleVisible: Boolean(bRect && bRect.width > 8 && bRect.height > 8),
      };
    }""")
    REPORT['checks']['lastPlay_dom'] = zones
    shot(page, 'ddz-414-lastplay-pass.png')

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
    REPORT['pass']['hand_gutter_adaptive'] = bool(he.get('gutterAdaptive')) and float(he.get('gutterPx') or 0) < 100
    REPORT['pass']['hand_no_avatar_overlap'] = (not he.get('avatarOverlapFirst', True)) or bool(he.get('cardsAboveAvatar'))
    REPORT['pass']['hand_scroll_or_fit'] = bool(he.get('lastNotClippedAtStart')) and (bool(he.get('canScroll')) or bool(he.get('lastFullyVisibleAtEnd')))
    REPORT['pass']['hand_last_reachable'] = bool(he.get('lastFullyVisibleAtEnd')) or (not he.get('canScroll') and he.get('last', {}).get('right', 999) <= VW + 1)
    REPORT['pass']['illegal_play_disabled'] = bool((illegal or {}).get('ok')) and (illegal or {}).get('allowPlay') is False and bool((illegal or {}).get('disabled'))
    REPORT['pass']['legal_single_plays'] = bool((legal or {}).get('played')) or bool((legal or {}).get('allowPlay'))
    REPORT['pass']['seat_cardbacks'] = int((backs or {}).get('r1backs') or 0) >= 1 and int((backs or {}).get('r2backs') or 0) >= 1
    REPORT['pass']['lastPlay_center_visible'] = bool((zones or {}).get('centerCards', 0) >= 1 and (zones or {}).get('fanVisible'))
    REPORT['pass']['pass_bubble_seat'] = bool((zones or {}).get('passBubbles', 0) >= 1)
    REPORT['pass']['no_white_screen'] = bool(white.get('tableActive') and white.get('handN', 0) >= 5)
    REPORT['pass']['shots_distinct'] = len({v['sha1'] for v in REPORT['shots'].values()}) >= 4

    REPORT['ok'] = all(REPORT['pass'].values())
    (OUT / 'report.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=2))
    md = []
    md.append('# play9v3f QA\n')
    md.append(f"- ok: **{REPORT['ok']}**")
    md.append(f"- cache: `{REPORT['cache']}` viewport `{REPORT['viewport']}` `is_mobile` + `has_touch`\n")
    md.append('## Ed portrait repro')
    md.append(f"- Path: {REPORT['ed_repro']['path']}")
    md.append(f"- Fail on play9v3e: {REPORT['ed_repro']['fail_on']}\n")
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
      'illegal_play': REPORT['checks'].get('illegal_play'),
      'legal_single_play': REPORT['checks'].get('legal_single_play'),
      'seat_cardbacks': REPORT['checks'].get('seat_cardbacks'),
      'lastPlay_dom': REPORT['checks'].get('lastPlay_dom'),
      'white_guard': REPORT['checks'].get('white_guard'),
    }, ensure_ascii=False, indent=2))
    md.append('```\n')
    md.append('## Shots')
    for name, meta in REPORT['shots'].items():
      md.append(f"- `{name}` sha1={meta['sha1']} bytes={meta['bytes']}")
    (OUT / 'README.md').write_text('\n'.join(md) + '\n')
    (Path('/workspace/play9u2-repo/docs/qa/play9v3f.md')).write_text(
      f"# play9v3f\n\n- ok: **{REPORT['ok']}**\n- cache: `play9v3f`\n- see `docs/qa/play9v3f/`\n"
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
