import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const baseUrl = process.env.WEB_LOBBY_URL || 'http://127.0.0.1:5173';
const outputDir = fileURLToPath(new URL('../output/playwright/', import.meta.url));
mkdirSync(outputDir, { recursive: true });

const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 960 },
];
const forbiddenMoneyCopy = /真金|USDT|充值|提现|预存|兑换|模拟到账|链上|转账|收款|试玩金|真实资金|真钱|USDT 可|结算余额/;

const browser = await chromium.launch();
const results = [];

async function captureState(page, viewport, state) {
  const screenshot = join(outputDir, `${viewport.name}-${state}.png`);
  await page.screenshot({ path: screenshot, fullPage: true });
  const audit = await page.evaluate(() => {
    const doc = document.documentElement;
    const overflowX = doc.scrollWidth - doc.clientWidth;
    const labels = [...document.querySelectorAll('button, .status-item, .wallet-strip, .profile, .player-seat, .claim-band')]
      .filter((node) => !node.closest('.hand-area'))
      .filter((node) => node.offsetParent !== null);
    const viewportWidth = window.innerWidth;
    const badBoxes = labels
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          selector: node.className || node.tagName,
          left: rect.left,
          right: rect.right,
          width: rect.width,
        };
      })
      .filter((box) => box.left < -1 || box.right > viewportWidth + 1 || box.width <= 0);
    return {
      overflowX,
      badBoxes,
      bodyText: document.body.innerText,
    };
  });
  results.push({ viewport, state, screenshot, audit });
}

async function openGameCenter(page) {
  const more = page.locator('[data-lobby-action="open-games"]:visible').first();
  if (await more.count()) {
    await more.click();
    return;
  }
  await page.getByRole('button', { name: /更多玩法|牌类合集|更多游戏/ }).first().click();
}

async function returnHomeAndOpenGameCenter(page) {
  await page.locator('[data-lobby-action="home"]:visible').filter({ hasText: /返回大厅|返回主房间|大厅/ }).first().click();
  await openGameCenter(page);
}

async function advanceToPlayableDdzTurn(page) {
  await page.waitForFunction(() => !document.querySelector('#tableView')?.hidden, null, { timeout: 8000 });

  for (let i = 0; i < 16; i += 1) {
    const acted = await page.evaluate(() => {
      const visible = (node) => {
        if (!node || node.hidden) return false;
        const cs = getComputedStyle(node);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        const r = node.getBoundingClientRect();
        return r.width > 1 && r.height > 1;
      };
      const bidControls = document.querySelector('#bidControls');
      if (visible(bidControls)) {
        const bid = [...bidControls.querySelectorAll('[data-bid]')]
          .filter((button) => !button.disabled)
          .map((button) => ({ button, score: Number(button.getAttribute('data-bid') || 0) }))
          .sort((a, b) => b.score - a.score)[0];
        bid?.button.click();
        return 'bid';
      }
      const doubleControls = document.querySelector('#doubleControls');
      if (visible(doubleControls)) {
        const button = [...doubleControls.querySelectorAll('[data-double]')]
          .find((item) => !item.disabled && item.offsetParent !== null);
        button?.click();
        return 'double';
      }
      const playControls = document.querySelector('#playControls');
      if (visible(playControls)) return 'play';
      return '';
    });
    if (acted === 'play') return;
    await page.waitForTimeout(500);
  }

  throw new Error('斗地主未进入可出牌状态');
}

try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });
    await captureState(page, viewport, 'home');
    await openGameCenter(page);
    await captureState(page, viewport, 'games');
    await page.locator('[data-game="zhajinhua"]').click();
    await captureState(page, viewport, 'zhajinhua');
    await returnHomeAndOpenGameCenter(page);
    await page.locator('[data-game="real"]').click();
    await captureState(page, viewport, 'real');
    await returnHomeAndOpenGameCenter(page);
    await page.locator('[data-game="doudizhu"]').click();
    await captureState(page, viewport, 'rooms');
    await page.locator('section[data-room-game="doudizhu"]:not([hidden]) [data-game-room="doudizhu"][data-room="novice"]').first().click();
    await advanceToPlayableDdzTurn(page);
    await page.locator('#handArea .playing-card').last().click({ force: true });
    await page.waitForFunction(() => document.querySelectorAll('#handArea .playing-card.selected').length > 0, null, { timeout: 3000 });
    await page.getByRole('button', { name: '提示' }).click();
    await captureState(page, viewport, 'table');
    await page.close();
  }
} finally {
  await browser.close();
}

const failures = results.flatMap((result) => {
  const items = [];
  if (result.audit.overflowX > 1) items.push(`${result.viewport.name}-${result.state}: horizontal overflow ${result.audit.overflowX}px`);
  if (result.audit.badBoxes.length) items.push(`${result.viewport.name}-${result.state}: elements outside viewport ${JSON.stringify(result.audit.badBoxes.slice(0, 5))}`);
  if (forbiddenMoneyCopy.test(result.audit.bodyText)) items.push(`${result.viewport.name}-${result.state}: forbidden money copy visible`);
  if (result.audit.bodyText.includes('510K')) items.push(`${result.viewport.name}-${result.state}: removed game name still visible`);
  if (result.state === 'home' && !result.audit.bodyText.includes('茶馆主房间')) items.push(`${result.viewport.name}: home missing`);
  if (result.state === 'games' && !result.audit.bodyText.includes('游戏类型')) items.push(`${result.viewport.name}: games missing`);
  if (result.state === 'zhajinhua' && (!result.audit.bodyText.includes('炸金花') || !result.audit.bodyText.includes('选择场次'))) {
    items.push(`${result.viewport.name}: zhajinhua rooms missing`);
  }
  if (result.state === 'real' && (!result.audit.bodyText.includes('链游') || !result.audit.bodyText.includes('演示账本') || !result.audit.bodyText.includes('不可转为现金或外部资产'))) {
    items.push(`${result.viewport.name}: chain test rooms missing`);
  }
  if (result.state === 'rooms' && !result.audit.bodyText.includes('选择场次')) items.push(`${result.viewport.name}: rooms missing`);
  if (result.state === 'table' && (!result.audit.bodyText.includes('底分') || !result.audit.bodyText.includes('提示') || !result.audit.bodyText.includes('出牌'))) {
    items.push(`${result.viewport.name}: table content missing`);
  }
  return items;
});

for (const result of results) {
  console.log(`${result.viewport.name}-${result.state} screenshot: ${result.screenshot}`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
