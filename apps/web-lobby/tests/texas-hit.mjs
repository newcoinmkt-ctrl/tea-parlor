import { chromium } from 'playwright';

const baseUrl = process.env.WEB_LOBBY_URL || 'http://127.0.0.1:5179';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('console', (msg) => console.log('PAGE', msg.type(), msg.text()));
page.on('pageerror', (err) => console.log('PAGEERROR', err.message));

await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'domcontentloaded' });
await page.locator('.home-icon-btn[data-side-game="texas"]').click();
await page.locator('[data-texas="micro"]').waitFor({ state: 'visible', timeout: 8000 });
await page.locator('[data-texas="micro"]').click();
await page.waitForSelector('#texasTableView:not([hidden])', { timeout: 8000 });
await page.waitForTimeout(800);

const info = await page.evaluate(() => {
  const view = document.getElementById('texasTableView');
  const actions = document.getElementById('texasActions');
  const back = document.getElementById('texasBackBtn');
  const table = view?.querySelector('.texas-table');
  const modal = document.getElementById('texasResultModal');
  const tabbar = document.querySelector('.home-tabbar');
  const stage = document.querySelector('.lobby-stage');
  const chain = (el) => {
    const out = [];
    let n = el;
    while (n && n !== document.documentElement) {
      const cs = getComputedStyle(n);
      out.push({
        tag: n.id ? `#${n.id}` : `.${(n.className || '').toString().split(' ')[0]}`,
        pe: cs.pointerEvents,
        z: cs.zIndex,
        pos: cs.position,
        display: cs.display,
        vis: cs.visibility,
      });
      n = n.parentElement;
    }
    return out;
  };
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, t: r.top, b: r.bottom };
  };
  const hit = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const x = r.x + r.width / 2;
    const y = r.y + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return {
      x, y,
      want: el.id || el.className,
      got: top ? `${top.tagName}#${top.id}.${(top.className || '').toString().slice(0, 80)}` : null,
      same: top === el || el.contains(top),
    };
  };
  const buttons = [...(actions?.querySelectorAll('button') || [])].filter((b) => {
    const cs = getComputedStyle(b);
    return cs.display !== 'none' && b.offsetParent !== null;
  });
  return {
    viewHidden: view?.hidden,
    viewPE: view ? getComputedStyle(view).pointerEvents : null,
    viewZ: view ? getComputedStyle(view).zIndex : null,
    actionsPE: actions ? getComputedStyle(actions).pointerEvents : null,
    actionsZ: actions ? getComputedStyle(actions).zIndex : null,
    actionsPos: actions ? getComputedStyle(actions).position : null,
    tablePE: table ? getComputedStyle(table).pointerEvents : null,
    tableBox: box(table),
    actionsBox: box(actions),
    backBox: box(back),
    modal: {
      hidden: modal?.hidden,
      display: modal ? getComputedStyle(modal).display : null,
      pe: modal ? getComputedStyle(modal).pointerEvents : null,
      cls: modal?.className,
      box: box(modal),
    },
    tabbar: {
      display: tabbar ? getComputedStyle(tabbar).display : null,
      pe: tabbar ? getComputedStyle(tabbar).pointerEvents : null,
      box: box(tabbar),
    },
    stage: {
      display: stage ? getComputedStyle(stage).display : null,
      pe: stage ? getComputedStyle(stage).pointerEvents : null,
      vis: stage ? getComputedStyle(stage).visibility : null,
    },
    backChain: chain(back),
    actionsChain: chain(actions),
    btnHits: buttons.map((b) => ({ text: b.textContent.trim(), hit: hit(b), pe: getComputedStyle(b).pointerEvents, disabled: b.disabled })),
    backHit: hit(back),
    status: document.getElementById('texasStatus')?.textContent,
    html: actions?.innerHTML?.slice(0, 400),
  };
});
console.log(JSON.stringify(info, null, 2));

const fold = page.locator('#texasActions button.tx-btn-fold');
const call = page.locator('#texasActions button.tx-btn-call');
const check = page.locator('#texasActions button.tx-btn-check');
if (await fold.isVisible()) {
  await fold.click({ force: false, timeout: 3000 }).then(() => console.log('fold click ok')).catch((e) => console.log('fold click fail', e.message));
}
await page.waitForTimeout(400);
console.log('status after fold', await page.locator('#texasStatus').textContent());
await browser.close();
