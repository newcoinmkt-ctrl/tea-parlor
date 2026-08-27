import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const baseUrl = process.env.WEB_LOBBY_URL || 'http://127.0.0.1:5179';
const out = fileURLToPath(new URL('../output/playwright/', import.meta.url));
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const failures = [];

async function boot(page) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
}

async function goHome(page) {
  await page.evaluate(() => {
    window.__teaParlor?.lobby?.('home');
  });
  await page.waitForTimeout(300);
  const home = await page.evaluate(() => ({
    view: document.querySelector('.lobby-shell')?.className,
    ddzHidden: document.getElementById('tableView')?.hidden,
    txHidden: document.getElementById('texasTableView')?.hidden,
    mgHidden: document.getElementById('multiGameView')?.hidden,
    icon: !!document.querySelector('.home-icon-btn[data-side-game="texas"]')?.getBoundingClientRect().height,
  }));
  if (!home.view.includes('lobby-view-home')) failures.push(`goHome view=${home.view}`);
  if (!home.ddzHidden) failures.push('ddz table still open after goHome');
  if (!home.txHidden) failures.push('texas table still open after goHome');
  if (!home.mgHidden) failures.push('multi table still open after goHome');
  if (!home.icon) failures.push('home texas icon has no size after goHome');
}

const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', (e) => failures.push(`PAGEERROR ${e.message}`));
await boot(page);

// 1) 首页点斗地主合集 → 选场
await page.locator('.home-icon-btn[data-side-game="doudizhu"]').click();
await page.waitForTimeout(300);
const rooms = await page.evaluate(() => ({
  view: document.querySelector('.lobby-shell')?.className,
  tab: getComputedStyle(document.querySelector('.home-tabbar')).display,
  enter: !!document.querySelector('section[data-room-game="doudizhu"]:not([hidden]) [data-game-room]'),
}));
console.log('rooms', rooms);
if (!rooms.view.includes('lobby-view-rooms')) failures.push('ddz rooms not opened');
if (rooms.tab !== 'none') failures.push(`tabbar still visible on rooms: ${rooms.tab}`);

// 2) 点快速开始进桌
await page.locator('section[data-room-game="doudizhu"]:not([hidden]) [data-game-room]').first().click();
await page.waitForTimeout(700);
const table = await page.evaluate(() => ({
  hidden: document.getElementById('tableView')?.hidden,
  display: getComputedStyle(document.getElementById('tableView')).display,
  pe: getComputedStyle(document.getElementById('tableView')).pointerEvents,
  z: getComputedStyle(document.getElementById('tableView')).zIndex,
  tab: getComputedStyle(document.querySelector('.home-tabbar')).display,
  bid: [...document.querySelectorAll('[data-bid]')].filter((b) => b.offsetParent).map((b) => b.textContent.trim()),
  status: document.getElementById('tableStatus')?.textContent,
}));
console.log('table', table);
if (table.hidden || table.display === 'none') failures.push('ddz table not shown');
if (table.tab !== 'none') failures.push(`tabbar covering table: ${table.tab}`);
if (Number(table.z) < 300) failures.push(`table z-index too low: ${table.z}`);

// 3) 点「不叫」——必须真正改状态，且仍留在牌桌
const beforeBid = table.status;
const pass = page.locator('#bidControls [data-bid="0"]');
if (await pass.count()) {
  await pass.click({ timeout: 3000 });
  await page.waitForTimeout(400);
  const afterBid = await page.evaluate(() => ({
    hidden: document.getElementById('tableView')?.hidden,
    view: document.querySelector('.lobby-shell')?.className,
    status: document.getElementById('tableStatus')?.textContent,
    phase: window.__teaParlor?.state?.()?.game?.phase,
    currentBid: window.__teaParlor?.state?.()?.game?.currentBid,
    bidTurn: window.__teaParlor?.state?.()?.game?.bidTurn,
  }));
  console.log('after bid', afterBid, 'before', beforeBid);
  if (afterBid.hidden) failures.push('clicking 不叫 closed the table');
  if (!afterBid.view.includes('table-active')) failures.push('table-active lost after bid');
  if (afterBid.status === beforeBid) failures.push(`bid click did not apply: ${afterBid.status}`);
  if (afterBid.bidTurn === 0 && afterBid.phase === 'bid') {
    failures.push(`still human bid turn after 不叫: ${afterBid.status}`);
  }
} else {
  failures.push('no bid button');
}
await page.screenshot({ path: join(out, 'ddz-interact.png') });

// 4) 德州：回大厅后再开，点弃牌不得把桌关掉
await goHome(page);
await page.locator('.home-icon-btn[data-side-game="texas"]').click({ timeout: 5000 });
await page.waitForTimeout(300);
await page.locator('section[data-room-game="texas"]:not([hidden]) [data-game-room]').first().click();
await page.waitForTimeout(800);
const tx = await page.evaluate(() => ({
  hidden: document.getElementById('texasTableView')?.hidden,
  display: getComputedStyle(document.getElementById('texasTableView')).display,
  tab: getComputedStyle(document.querySelector('.home-tabbar')).display,
  fold: !!document.querySelector('#texasActions button.tx-btn-fold'),
  actions: document.getElementById('texasActions')?.innerText,
}));
console.log('texas', tx);
if (tx.hidden || tx.display === 'none') failures.push('texas table not shown');
if (tx.tab !== 'none') failures.push('tabbar covering texas');
if (tx.fold) {
  await page.locator('#texasActions button.tx-btn-fold').click({ timeout: 3000 });
  await page.waitForTimeout(400);
  const still = await page.evaluate(() => ({
    open: !document.getElementById('texasTableView')?.hidden,
    view: document.querySelector('.lobby-shell')?.className,
  }));
  if (!still.open) failures.push('fold closed texas unexpectedly without settle UI');
  if (!still.view.includes('texas-active')) failures.push('texas-active lost after fold');
} else if (!/等待对手/.test(tx.actions || '')) {
  failures.push(`no fold button: ${tx.actions}`);
}
await page.screenshot({ path: join(out, 'texas-interact.png') });

// 5) 麻将也能从首页打开
await goHome(page);
await page.locator('.home-icon-btn[data-side-game="mahjong"]').click({ timeout: 5000 });
await page.waitForTimeout(300);
await page.locator('section[data-room-game="mahjong"]:not([hidden]) [data-game-room]').first().click();
await page.waitForTimeout(800);
const mj = await page.evaluate(() => ({
  hidden: document.getElementById('multiGameView')?.hidden,
  display: getComputedStyle(document.getElementById('multiGameView')).display,
  tab: getComputedStyle(document.querySelector('.home-tabbar')).display,
  view: document.querySelector('.lobby-shell')?.className,
}));
console.log('mahjong', mj);
if (mj.hidden || mj.display === 'none') failures.push('mahjong table not shown');
if (mj.tab !== 'none') failures.push('tabbar covering mahjong');
if (!mj.view.includes('multi-active')) failures.push('multi-active missing on mahjong');
await page.screenshot({ path: join(out, 'mj-interact.png') });

await browser.close();
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('open+interact checks passed');
