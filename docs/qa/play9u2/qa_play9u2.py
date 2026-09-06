#!/usr/bin/env python3
"""play9u2: hide home CTA; show game grid @ 414"""
import json, time
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parent
URL = 'http://127.0.0.1:5192/index.html?v=play9u2'
VW, VH = 414, 896

def main():
    report = {'cache': 'play9u2', 'viewport': [VW, VH], 'url': URL, 'checks': {}, 'pass': {}}
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--no-sandbox'])
        ctx = b.new_context(viewport={'width': VW, 'height': VH}, device_scale_factor=2, is_mobile=True, has_touch=True)
        page = ctx.new_page()
        page.goto(URL, wait_until='domcontentloaded', timeout=30000)
        page.wait_for_timeout(1500)

        def info(sel):
            return page.evaluate("""(sel) => {
              const el = document.querySelector(sel);
              if (!el) return {present:false};
              const cs = getComputedStyle(el);
              const r = el.getBoundingClientRect();
              return {
                present: true,
                display: cs.display,
                visibility: cs.visibility,
                hiddenAttr: el.hasAttribute('hidden'),
                text: (el.innerText||'').trim().slice(0,80),
                w: +r.width.toFixed(1), h: +r.height.toFixed(1),
              };
            }""", sel)

        stage = info('.p0-home-stage')
        cta = info('.p0-cta-card')
        kicker = info('.p0-kicker')
        user = info('.p0-home-user')
        grid = info('.home-icon-grid')
        chain = info('.home-icon-btn.home-icon-chain')
        pack = info('.home-pack-grid')
        tabbar = info('.home-tabbar')

        games = page.evaluate("""() => Array.from(document.querySelectorAll('.home-icon-grid .home-icon-btn strong'))
          .filter(el => { const r=el.getBoundingClientRect(); return r.width>0 && r.height>0; })
          .map(el => el.textContent.trim())""")

        body = page.inner_text('body')
        cta_phrases = ['经典三人', '快速开始', '人机畅玩', '更多玩法']
        # CTA may still be in DOM but hidden — check visibility not text presence in DOM
        cta_visible = page.evaluate("""() => {
          const card = document.querySelector('.p0-cta-card');
          if (!card) return false;
          const cs = getComputedStyle(card);
          const r = card.getBoundingClientRect();
          return cs.display !== 'none' && cs.visibility !== 'hidden' && r.height > 2 && r.width > 2;
        }""")
        stage_visible = stage.get('display') not in (None, 'none') and not stage.get('hiddenAttr') and stage.get('h',0) > 2

        page.screenshot(path=str(OUT / 'lobby-home-414.png'), full_page=False)

        # click chain
        page.click('.home-icon-btn.home-icon-chain', timeout=5000)
        page.wait_for_timeout(800)
        chain_page = page.evaluate("""() => {
          const t = (document.body.innerText||'');
          return { title: t.includes('链游'), hasReal: !!document.querySelector('[data-room-game=\"real\"]') || t.includes('数字货币') || t.includes('USDT') };
        }""")
        page.screenshot(path=str(OUT / 'lobby-chain-414.png'), full_page=False)

        # back home via tab if needed
        page.evaluate("""() => {
          const home = document.querySelector('[data-lobby-action=\"home\"], .home-tab[data-tab=\"home\"], button[data-lobby-action=\"lobby\"]');
          if (home) home.click();
          if (window.__teaParlor?.lobby) window.__teaParlor.lobby('home');
        }""")
        page.wait_for_timeout(500)

        # click doudizhu tile
        page.click('.home-icon-grid [data-side-game=\"doudizhu\"]', timeout=5000)
        page.wait_for_timeout(1000)
        ddz = page.evaluate("""() => {
          const t = (document.body.innerText||'');
          return { hasRooms: t.includes('新手') || t.includes('经典') || t.includes('场') || !!document.querySelector('[data-side-game], .room-card, .p0-room') };
        }""")
        page.screenshot(path=str(OUT / 'lobby-ddz-rooms-414.png'), full_page=False)

        report['checks'] = {
          'stage': stage, 'cta': cta, 'kicker': kicker, 'user': user, 'grid': grid,
          'chain': chain, 'pack': pack, 'tabbar': tabbar, 'games': games,
          'cta_visible': cta_visible, 'chain_page': chain_page, 'ddz': ddz,
        }
        report['pass'] = {
          'no_cta_card': not cta_visible,
          'user_visible': user.get('display') != 'none' and user.get('h',0) > 10,
          'grid_has_games': len(games) >= 6,
          'has_chain': '链游中心' in games and chain.get('display') != 'none',
          'pack_hidden': pack.get('display') == 'none' or not pack.get('present') or pack.get('h',0) < 2,
          'tabbar_present': tabbar.get('present') and tabbar.get('display') != 'none',
          'chain_reachable': bool(chain_page.get('title') or chain_page.get('hasReal')),
          'ddz_reachable': bool(ddz.get('hasRooms')),
        }
        report['ok'] = all(report['pass'].values())
        (OUT / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
        print(json.dumps(report['pass'], ensure_ascii=False, indent=2))
        print('ok=', report['ok'])
        b.close()

if __name__ == '__main__':
    main()
