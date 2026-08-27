import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const baseUrl = process.env.WEB_LOBBY_URL || 'http://127.0.0.1:5179';
const out = fileURLToPath(new URL('../output/playwright/', import.meta.url));
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const failures = [];
page.on('pageerror', (err) => failures.push(`PAGEERROR ${err.message}`));

await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'domcontentloaded' });
await page.locator('.home-tab[data-lobby-action="profile"]').click();
await page.waitForTimeout(400);

const info = await page.evaluate(() => ({
  shell: document.querySelector('.lobby-shell')?.className,
  title: document.body.innerText.includes('个人中心'),
  wardrobe: !!document.getElementById('profileWardrobe'),
  tabs: [...document.querySelectorAll('#wardrobeTabs [data-wardrobe-tab]')].map((n) => n.textContent.trim()),
  grid: document.querySelectorAll('#wardrobeGrid .wardrobe-item').length,
  standalone: !!document.querySelector('[data-lobby-view="wardrobe"]'),
  openBtn: [...document.querySelectorAll('button')].some((b) => b.textContent.includes('打开衣橱')),
}));
console.log(info);
if (!info.title) failures.push('missing 个人中心');
if (!info.wardrobe) failures.push('missing profile wardrobe');
for (const tab of ['衣服', '人物', '桌布', '牌背', '头像框']) {
  if (!info.tabs.includes(tab)) failures.push(`missing wardrobe tab ${tab}: ${info.tabs}`);
}
if (info.grid < 1) failures.push('empty wardrobe grid');
if (info.standalone) failures.push('standalone wardrobe page still present');
if (info.openBtn) failures.push('打开衣橱 still present');

for (const tabId of ['skins', 'cardbacks', 'frames']) {
  const tab = page.locator(`#wardrobeTabs [data-wardrobe-tab="${tabId}"]`);
  if (!(await tab.count())) {
    failures.push(`missing tab id ${tabId}`);
    continue;
  }
  await tab.click();
  await page.waitForTimeout(180);
  const firstSkin = page.locator('#wardrobeGrid .wardrobe-item').first();
  if (!(await firstSkin.count())) {
    failures.push(`empty skin tab ${tabId}`);
    continue;
  }
  await firstSkin.click();
  await page.waitForTimeout(180);
}

const mobileAudit = await page.evaluate(() => {
  const panel = document.getElementById('wardrobeDetailPanel');
  const chips = [...document.querySelectorAll('.cosmetic-preview-chip')].map((n) => n.getBoundingClientRect());
  const viewportWidth = window.innerWidth;
  return {
    detailText: panel?.innerText || '',
    chipsOverflow: chips.some((box) => box.left < 0 || box.right > viewportWidth + 1),
    visibleItems: document.querySelectorAll('#wardrobeGrid .wardrobe-item').length,
  };
});
if (!/来源|常驻|限时/.test(mobileAudit.detailText)) failures.push(`missing skin detail text: ${mobileAudit.detailText}`);
if (mobileAudit.chipsOverflow) failures.push('mobile cosmetic chips overflow viewport');
if (mobileAudit.visibleItems < 1) failures.push('mobile skin grid empty after switching tabs');
await page.screenshot({ path: join(out, 'profile-wardrobe-mobile.png'), fullPage: true });

await page.setViewportSize({ width: 1280, height: 800 });
await page.waitForTimeout(250);
await page.screenshot({ path: join(out, 'profile-wardrobe-desktop.png'), fullPage: true });

await browser.close();
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('profile wardrobe checks passed');
