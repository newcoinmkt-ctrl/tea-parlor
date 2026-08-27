import { chromium } from 'playwright';

const baseUrl = process.env.WEB_LOBBY_URL || 'http://127.0.0.1:5179';
const browser = await chromium.launch();
const failures = [];

async function openHome(page) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
}

async function assertView(page, label, shellClass, text) {
  const got = await page.evaluate(() => ({
    shell: document.querySelector('.lobby-shell')?.className,
    text: document.body.innerText,
    stagePe: getComputedStyle(document.querySelector('.lobby-stage')).pointerEvents,
    stageDisplay: getComputedStyle(document.querySelector('.lobby-stage')).display,
  }));
  if (!got.shell.includes(shellClass)) failures.push(`${label}: expected ${shellClass}, got ${got.shell}`);
  if (text && !got.text.includes(text)) failures.push(`${label}: missing text "${text}"`);
  if (got.stageDisplay === 'none') failures.push(`${label}: lobby-stage hidden`);
  if (got.stagePe === 'none') failures.push(`${label}: lobby-stage pointer-events none`);
  console.log('OK', label, got.shell);
}

for (const vp of [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 },
]) {
  const page = await browser.newPage({ viewport: vp });
  page.on('pageerror', (err) => failures.push(`${vp.name} PAGEERROR ${err.message}`));
  await openHome(page);

  await page.locator('.home-tab[data-lobby-action="profile"]').click();
  await page.waitForTimeout(200);
  await assertView(page, `${vp.name} profile`, 'lobby-view-profile', '个人中心');

  await page.locator('.home-tab[data-lobby-action="home"]').click();
  await page.waitForTimeout(200);
  await page.locator('.home-icon-btn[data-side-game="doudizhu"]').click();
  await page.waitForTimeout(200);
  await assertView(page, `${vp.name} rooms`, 'lobby-view-rooms', '斗地主');

  await page.locator('.home-tab[data-lobby-action="recharge"]').click();
  await page.waitForTimeout(200);
  await assertView(page, `${vp.name} recharge`, 'lobby-view-recharge', '补给');

  await page.locator('.home-tab[data-lobby-action="home"]').click();
  await page.waitForTimeout(200);
  await assertView(page, `${vp.name} home`, 'lobby-view-home', '茶馆主房间');

  await page.locator('.home-icon-btn[data-side-game="doudizhu"]').click();
  await page.waitForTimeout(200);
  await assertView(page, `${vp.name} ddz-rooms`, 'lobby-view-rooms', '斗地主');

  await page.locator('.room-band:not([hidden]) .view-back-button').click();
  await page.waitForTimeout(200);
  await assertView(page, `${vp.name} back-home`, 'lobby-view-home', '茶馆主房间');

  await page.locator('[data-lobby-action="open-games"]:visible').first().click();
  await page.waitForTimeout(200);
  await assertView(page, `${vp.name} games`, 'lobby-view-games', '选择玩法');

  await page.locator('.home-tab[data-lobby-action="home"]').click();
  await page.waitForTimeout(200);

  // leftover table classes must not block lobby
  await page.evaluate(() => {
    document.querySelector('.lobby-shell')?.classList.add('table-active', 'texas-active');
    const stage = document.querySelector('.lobby-stage');
    if (stage) {
      stage.style.display = 'none';
      stage.style.pointerEvents = 'none';
    }
  });
  await page.locator('.home-tab[data-lobby-action="profile"]').click();
  await page.waitForTimeout(250);
  await assertView(page, `${vp.name} leftover-profile`, 'lobby-view-profile', '个人中心');

  await page.close();
}

await browser.close();
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('lobby nav checks passed');
