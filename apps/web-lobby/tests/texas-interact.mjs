import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const baseUrl = process.env.WEB_LOBBY_URL || 'http://127.0.0.1:5179';
const out = fileURLToPath(new URL('../output/playwright/', import.meta.url));
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const failures = [];

const dump = (label) => page.evaluate((label) => {
  const tx = document.getElementById('texasTableView');
  const modal = document.getElementById('texasResultModal');
  const stage = document.querySelector('.lobby-stage');
  const room = document.querySelector('[data-texas="micro"]');
  const tcs = tx ? getComputedStyle(tx) : null;
  const mcs = modal ? getComputedStyle(modal) : null;
  return {
    label,
    status: document.getElementById('texasStatus')?.textContent,
    shell: document.querySelector('.lobby-shell')?.className,
    tx: tx && {
      hidden: tx.hidden,
      display: tcs.display,
      pe: tcs.pointerEvents,
      vis: tcs.visibility,
      z: tcs.zIndex,
    },
    modal: modal && {
      hidden: modal.hidden,
      open: modal.classList.contains('is-open'),
      display: mcs.display,
      pe: mcs.pointerEvents,
    },
    stage: stage && { display: getComputedStyle(stage).display, pe: getComputedStyle(stage).pointerEvents },
    room: room && { display: getComputedStyle(room).display, vis: room.offsetParent !== null },
  };
}, label);

await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'domcontentloaded' });
await page.locator('.home-icon-btn[data-side-game="texas"]').click();
await page.locator('[data-texas="micro"]').waitFor({ state: 'visible', timeout: 8000 });
await page.locator('[data-texas="micro"]').click();
await page.waitForSelector('#texasTableView:not([hidden])', { timeout: 8000 });
await page.waitForTimeout(700);
console.log('start', await dump('start'));

const fold = page.locator('#texasActions button.tx-btn-fold');
if (!(await fold.isVisible())) failures.push('fold not visible at start');
else await fold.click();
await page.waitForTimeout(900);
console.log('after fold', await dump('after-fold'));
await page.screenshot({ path: join(out, 'tx-after-fold.png') });

const modalVisible = await page.locator('#texasResultModal:not([hidden])').isVisible().catch(() => false);
if (modalVisible) {
  const again = page.locator('#txResultAgain');
  if (await again.isVisible()) {
    await again.click();
    await page.waitForTimeout(600);
    console.log('after again', await dump('after-again'));
    const stillOpen = await page.evaluate(() => !document.getElementById('texasResultModal')?.hidden);
    if (stillOpen) failures.push('继续游戏 did not close modal');
  } else {
    failures.push('modal open but 继续游戏 not visible');
  }
}

if (await page.locator('#texasResultModal:not([hidden])').isVisible().catch(() => false)) {
  await page.locator('#txResultLobby').click();
} else {
  await page.locator('#texasBackBtn').click();
}
await page.waitForTimeout(500);
const left = await dump('after-back');
console.log('after back', left);
await page.screenshot({ path: join(out, 'tx-after-back.png') });
if (left.tx?.display !== 'none') failures.push(`texas still displayed: ${left.tx?.display}`);
if (left.tx?.pe !== 'none') failures.push(`texas still captures pointer: ${left.tx?.pe}`);
if ((left.shell || '').includes('texas-active')) failures.push('texas-active leftover');

const room = page.locator('[data-texas="micro"]');
await room.waitFor({ state: 'visible', timeout: 8000 }).catch(() => failures.push('room card not visible after leaving'));
if (await room.isVisible().catch(() => false)) {
  await room.click();
  await page.waitForTimeout(600);
  const re = await dump('reenter');
  console.log('reenter', re);
  if (re.tx?.hidden) failures.push('could not re-enter texas');
}

await browser.close();
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('texas interact checks passed');
