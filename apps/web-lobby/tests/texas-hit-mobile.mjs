import { chromium } from 'playwright';

const baseUrl = process.env.WEB_LOBBY_URL || 'http://127.0.0.1:5179';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'domcontentloaded' });
await page.locator('.home-icon-btn[data-side-game="texas"]').click();
await page.locator('[data-texas="micro"]').waitFor({ state: 'visible' });
await page.locator('[data-texas="micro"]').click();
await page.waitForSelector('#texasTableView:not([hidden])');
await page.waitForTimeout(800);

const info = await page.evaluate(() => {
  const hit = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const x = r.x + Math.min(r.width / 2, 40);
    const y = r.y + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return {
      box: { x: r.x, y: r.y, w: r.width, h: r.height, b: r.bottom },
      got: top ? `${top.tagName}#${top.id}.${String(top.className).slice(0, 60)}` : null,
      same: !!(top && (top === el || el.contains(top))),
    };
  };
  const actions = document.getElementById('texasActions');
  const table = document.querySelector('#texasTableView .texas-table');
  const seat0 = document.querySelector('#texasTableView .tx-seat-0');
  const buttons = [...(actions?.querySelectorAll('button') || [])].filter((b) => b.offsetParent);
  return {
    vh: window.innerHeight,
    table: table?.getBoundingClientRect().toJSON(),
    seat0: seat0?.getBoundingClientRect().toJSON(),
    actions: actions?.getBoundingClientRect().toJSON(),
    overlapSeatActions: (() => {
      if (!seat0 || !actions) return false;
      const a = seat0.getBoundingClientRect();
      const b = actions.getBoundingClientRect();
      return a.bottom > b.top && a.top < b.bottom;
    })(),
    btns: buttons.map((b) => ({ text: b.textContent.trim(), ...hit(b) })),
    back: hit(document.getElementById('texasBackBtn')),
  };
});
console.log(JSON.stringify(info, null, 2));

await page.locator('#texasBackBtn').click();
await page.waitForTimeout(400);
const afterBack = await page.evaluate(() => ({
  texasHidden: document.getElementById('texasTableView')?.hidden,
  shell: document.querySelector('.lobby-shell')?.className,
  homeVisible: !!document.querySelector('.home-icon-grid')?.offsetParent,
}));
console.log('after back', afterBack);
await browser.close();
