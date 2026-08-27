import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const baseUrl = process.env.WEB_LOBBY_URL || 'http://127.0.0.1:5179';
const outputDir = fileURLToPath(new URL('../output/playwright/', import.meta.url));
mkdirSync(outputDir, { recursive: true });

const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 },
];

async function openTexas(page) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.home-icon-btn[data-side-game="texas"]').click();
  const room = page.locator('[data-texas="micro"]');
  await room.waitFor({ state: 'visible', timeout: 8000 });
  await room.click();
  await page.waitForSelector('#texasTableView:not([hidden])', { timeout: 8000 });
  await page.waitForTimeout(700);
  for (let i = 0; i < 3; i += 1) {
    const callBtn = page.locator('#texasActions button.tx-btn-call');
    const checkBtn = page.locator('#texasActions button.tx-btn-check');
    if (await callBtn.isVisible().catch(() => false)) await callBtn.click();
    else if (await checkBtn.isVisible().catch(() => false)) await checkBtn.click();
    else break;
    await page.waitForTimeout(650);
  }
}

async function audit(page) {
  return page.evaluate(() => {
    const view = document.getElementById('texasTableView');
    const table = view?.querySelector('.texas-table');
    const felt = view?.querySelector('.tx-felt');
    const board = document.getElementById('texasBoard');
    const pot = document.getElementById('texasPotChip');
    const seat0 = view?.querySelector('.tx-seat-0');
    const seat1 = view?.querySelector('.tx-seat-1');
    const seat2 = view?.querySelector('.tx-seat-2');
    const hole0 = document.getElementById('texasHole0');
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
        cx: Math.round(r.x + r.width / 2),
        cy: Math.round(r.y + r.height / 2),
      };
    };
    const cs = getComputedStyle(table || document.body);
    const text = document.body.innerText;
    return {
      hidden: view?.hidden ?? true,
      wood: cs.backgroundImage,
      felt: box(felt),
      table: box(table),
      board: box(board),
      pot: box(pot),
      seat0: box(seat0),
      seat1: box(seat1),
      seat2: box(seat2),
      hole0: box(hole0),
      holeHtml: hole0?.innerHTML?.slice(0, 240) || '',
      btc: text.includes('₿') || (view?.innerText || '').includes('₿'),
      buttons: [...(view?.querySelectorAll('button') || [])].map((b) => b.textContent.trim()).filter(Boolean),
    };
  });
}

const browser = await chromium.launch();
const results = [];
try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    await openTexas(page);
    const info = await audit(page);
    const shot = join(outputDir, `${viewport.name}-tx.png`);
    await page.screenshot({ path: shot, fullPage: false });
    results.push({ viewport: viewport.name, shot, info });
    await page.close();
  }
} finally {
  await browser.close();
}

writeFileSync(join(outputDir, 'texas-oval-audit.json'), JSON.stringify(results, null, 2));
for (const r of results) {
  console.log(`=== ${r.viewport} ===`);
  console.log(JSON.stringify(r.info, null, 2));
  console.log('shot', r.shot);
}

const failures = [];
for (const r of results) {
  const { info, viewport } = r;
  if (info.hidden) failures.push(`${viewport}: table still hidden`);
  const mid = (info.table?.x || 0) + (info.table?.w || 0) / 2;
  if (info.seat0 && Math.abs(info.seat0.cx - mid) > 80) {
    failures.push(`${viewport}: hero not centered (cx=${info.seat0.cx} mid=${mid})`);
  }
  if (info.hole0 && info.felt) {
    const feltBottom = info.felt.y + info.felt.h;
    if (info.hole0.y > feltBottom + 8) failures.push(`${viewport}: hole cards below felt`);
  }
  if (info.btc) failures.push(`${viewport}: BTC watermark visible`);
  if (info.seat1 && info.seat2 && info.seat1.cx >= info.seat2.cx) {
    failures.push(`${viewport}: opponents not left/right`);
  }
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('texas oval visual checks passed');
