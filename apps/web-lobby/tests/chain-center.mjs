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
await page.locator('.home-tab[data-lobby-action="chain"]').click();
await page.waitForTimeout(350);

const before = await page.evaluate(() => {
  const section = document.querySelector('[data-lobby-view="chain"]');
  const text = section?.innerText || '';
  const rects = [...document.querySelectorAll('.chain-asset-card, .chain-nft-card, .chain-bind-btn')]
    .map((node) => node.getBoundingClientRect());
  return {
    visible: Boolean(section && !section.hidden),
    text,
    assetCount: document.querySelectorAll('.chain-asset-card').length,
    collectibleCount: document.querySelectorAll('.chain-nft-card').length,
    overflow: rects.some((box) => box.left < -1 || box.right > window.innerWidth + 1),
  };
});

if (!before.visible) failures.push('chain center is not visible');
for (const needle of ['链游中心', '影子积分', '赛季积分', '皮肤碎片', '链游纪念资产', '测试网', '规划中', '合规后开放', 'NFT 皮肤占位']) {
  if (!before.text.includes(needle)) failures.push(`missing ${needle}`);
}
if (/充值|提现|真钱场|USDT 入座|USDT 可|收款|转账/.test(before.text)) failures.push('forbidden money copy in chain center');
if (before.assetCount < 4) failures.push(`asset cards ${before.assetCount}`);
if (before.collectibleCount < 3) failures.push(`collectible cards ${before.collectibleCount}`);
if (before.overflow) failures.push('mobile chain center overflows viewport');

await page.locator('#chainBindButton').click();
await page.waitForTimeout(250);
const after = await page.evaluate(() => document.getElementById('chainWalletTitle')?.textContent || '');
if (!after.includes('模拟签名已开启')) failures.push(`bind status did not update: ${after}`);
await page.screenshot({ path: join(out, 'chain-center-mobile.png'), fullPage: true });

await page.setViewportSize({ width: 1280, height: 800 });
await page.waitForTimeout(250);
await page.screenshot({ path: join(out, 'chain-center-desktop.png'), fullPage: true });

await browser.close();
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('chain center checks passed');
