#!/usr/bin/env python3
"""play9v4: lobby grid + chain hint + zero topbar/grid overlap @ 414"""
import json, time
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parent
URL = 'http://127.0.0.1:5196/index.html?v=play9v4'
VW, VH = 414, 896

def main():
    report = {'cache': 'play9v4', 'viewport': [VW, VH], 'url': URL, 'checks': {}, 'pass': {}}
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--no-sandbox'])
        ctx = b.new_context(viewport={'width': VW, 'height': VH}, device_scale_factor=2, is_mobile=True, has_touch=True)
        page = ctx.new_page()
        page.goto(URL, wait_until='domcontentloaded', timeout=30000)
        page.wait_for_timeout(1800)

        metrics = page.evaluate("""() => {
          const user = document.querySelector('.p0-home-user');
          const grid = document.querySelector('.home-icon-grid');
          const points = document.querySelector('.p0-points');
          const texas = document.querySelector('.home-icon-grid [data-side-game="texas"]');
          const chain = document.querySelector('.home-icon-btn.home-icon-chain');
          const hint = document.querySelector('.home-chain-hint');
          const cta = document.querySelector('.p0-cta-card');
          const tabbar = document.querySelector('.home-tabbar');
          const rect = (el) => {
            if (!el) return null;
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            return {
              x: +r.x.toFixed(1), y: +r.y.toFixed(1),
              w: +r.width.toFixed(1), h: +r.height.toFixed(1),
              top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1),
              left: +r.left.toFixed(1), right: +r.right.toFixed(1),
              display: cs.display, visibility: cs.visibility,
              position: cs.position, marginTop: cs.marginTop,
              gridColumn: cs.gridColumn,
            };
          };
          const overlap = (a, b) => {
            if (!a || !b || a.w < 2 || b.w < 2) return false;
            return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
          };
          const games = Array.from(document.querySelectorAll('.home-icon-grid .home-icon-btn strong'))
            .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
            .map(el => el.textContent.trim());
          const ur = rect(user), gr = rect(grid), pr = rect(points), tr = rect(texas), cr = rect(chain), hr = rect(hint);
          const gapUserGrid = (ur && gr) ? +(gr.top - ur.bottom).toFixed(1) : null;
          return {
            user: ur, grid: gr, points: pr, texas: tr, chain: cr, hint: hr,
            cta: rect(cta), tabbar: rect(tabbar),
            games,
            hintText: hint ? (hint.innerText || '').trim() : '',
            gapUserGrid,
            overlapUserGrid: overlap(ur, gr),
            overlapPointsTexas: overlap(pr, tr),
            overlapUserTexas: overlap(ur, tr),
          };
        }""")

        page.screenshot(path=str(OUT / 'lobby-home-414.png'), full_page=False)

        # highlight boxes shot for QA
        page.evaluate("""() => {
          const mark = (sel, color) => {
            const el = document.querySelector(sel);
            if (!el) return;
            el.style.outline = '2px solid ' + color;
          };
          mark('.p0-home-user', '#00e5ff');
          mark('.p0-points', '#ffeb3b');
          mark('.home-icon-grid', '#69f0ae');
          mark('.home-icon-btn.home-icon-chain', '#ff8a65');
        }""")
        page.screenshot(path=str(OUT / 'lobby-home-414-outline.png'), full_page=False)

        hint_ok = metrics['hintText'] == 'USDT 专用 · 与金币场分开'
        no_dup = '链游中心' not in metrics['hintText']
        chain_full = False
        if metrics.get('chain'):
            # full-width-ish: width close to grid or grid-column span
            cw = metrics['chain']['w']
            gw = metrics['grid']['w'] if metrics.get('grid') else 0
            chain_full = cw >= max(200, gw * 0.7) or '1 / -1' in (metrics['chain'].get('gridColumn') or '') or '1 / -1' in (metrics['chain'].get('gridColumn') or '').replace(' ','')

        tabs = page.evaluate("""() => {
          const bar = document.querySelector('.home-tabbar');
          if (!bar) return {n:0, display:'none'};
          const cs = getComputedStyle(bar);
          const tabs = Array.from(bar.querySelectorAll('.home-tab, button')).filter(el => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          });
          return {n: tabs.length, display: cs.display, labels: tabs.map(t => (t.innerText||'').trim().slice(0,12))};
        }""")

        cta_visible = page.evaluate("""() => {
          const card = document.querySelector('.p0-cta-card');
          if (!card) return false;
          const cs = getComputedStyle(card);
          const r = card.getBoundingClientRect();
          return cs.display !== 'none' && cs.visibility !== 'hidden' && r.height > 2 && r.width > 2;
        }""")

        report['checks'] = {
          'metrics': metrics,
          'tabs': tabs,
          'cta_visible': cta_visible,
          'hint_ok': hint_ok,
          'no_dup_title_in_hint': no_dup,
          'chain_full_width': chain_full,
        }
        report['pass'] = {
          'no_overlap_user_grid': not metrics.get('overlapUserGrid'),
          'no_overlap_points_texas': not metrics.get('overlapPointsTexas'),
          'no_overlap_user_texas': not metrics.get('overlapUserTexas'),
          'gap_user_grid_positive': (metrics.get('gapUserGrid') or 0) >= 8,
          'hint_subtitle_only': hint_ok and no_dup,
          'chain_full_width_row': chain_full,
          'six_plus_chain': len(metrics.get('games') or []) >= 7 and '链游中心' in (metrics.get('games') or []),
          'no_cta': not cta_visible,
          'five_tabs': tabs.get('n', 0) >= 5 and tabs.get('display') != 'none',
        }
        report['ok'] = all(report['pass'].values())
        (OUT / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps({'ok': report['ok'], 'pass': report['pass'], 'gap': metrics.get('gapUserGrid'), 'hint': metrics.get('hintText'), 'chain_w': (metrics.get('chain') or {}).get('w')}, ensure_ascii=False, indent=2))
        b.close()
        return 0 if report['ok'] else 1

if __name__ == '__main__':
    raise SystemExit(main())
