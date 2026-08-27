import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { createDoudizhuRealtimeServer } from '../src/server.js';

const outputDir = join(import.meta.dirname, '..', 'output', 'playwright');
await mkdir(outputDir, { recursive: true });

const server = createDoudizhuRealtimeServer({
  actionTimeoutMs: 0,
  shortRound: true,
  bidStarter: 0,
});
const address = await server.listen(0);
const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
  });
  const pages = await Promise.all([
    context.newPage(),
    context.newPage(),
    context.newPage(),
  ]);
  const [p1, p2, p3] = pages;
  await Promise.all([
    p1.goto(`${address.url}/test-client.html?roomId=pw-room&userId=p1&name=甲`),
    p2.goto(`${address.url}/test-client.html?roomId=pw-room&userId=p2&name=乙`),
    p3.goto(`${address.url}/test-client.html?roomId=pw-room&userId=p3&name=丙`),
  ]);

  await Promise.all(pages.map((page) => waitForState(page, (state) => state.phase === 'bid' && state.players.length === 3)));
  await sendAction(p1, { type: 'bid', score: 0 });
  await waitForState(p2, (state) => state.currentSeat === 1);
  await sendAction(p2, { type: 'bid', score: 0 });
  await waitForState(p3, (state) => state.currentSeat === 2);
  await sendAction(p3, { type: 'bid', score: 0 });
  await waitForState(p1, (state) => state.phase === 'play' && state.currentSeat === 0);

  await sendAction(p1, { type: 'play_first' });
  await waitForState(p2, (state) => state.currentSeat === 1);
  await sendAction(p2, { type: 'pass' });
  await waitForState(p3, (state) => state.currentSeat === 2);
  await sendAction(p3, { type: 'pass' });
  await waitForState(p1, (state) => state.currentSeat === 0 && state.phase === 'play');
  await sendAction(p1, { type: 'play_first' });

  const settled = await waitForState(p1, (state) => state.phase === 'settle' && state.settlementIntent);
  assert.deepEqual(settled.settlementIntent.scores, [4, -2, -2]);
  assert.equal(settled.wallet.available, 1004);

  await p2.getByRole('button', { name: '断开' }).click();
  await waitForState(p1, (state) => state.players[1]?.connected === false);
  await p2.getByRole('button', { name: '重连' }).click();
  const reconnected = await waitForState(p2, (state) => state.viewerSeat === 1 && state.players[1]?.connected);
  assert.equal(reconnected.phase, 'settle');

  await p1.screenshot({ path: join(outputDir, 'three-client-mobile.png'), fullPage: true });

  const desktopContext = await browser.newContext({ viewport: { width: 1280, height: 760 } });
  const desktop = await desktopContext.newPage();
  await desktop.goto(`${address.url}/test-client.html?roomId=pw-room&userId=p1&name=甲`);
  await waitForState(desktop, (state) => state.phase === 'settle');
  await desktop.screenshot({ path: join(outputDir, 'three-client-desktop.png'), fullPage: true });
  await desktopContext.close();

  console.log('Playwright three-client Doudizhu flow passed');
  console.log(`Screenshots: ${join(outputDir, 'three-client-mobile.png')} ${join(outputDir, 'three-client-desktop.png')}`);
} finally {
  await browser.close();
  await server.close();
}

async function waitForState(page, predicate, timeoutMs = 2500) {
  return page.waitForFunction((source) => {
    const predicate = Function('state', `return (${source})(state)`);
    return window.__lastState && predicate(window.__lastState) ? window.__lastState : false;
  }, predicate.toString(), { timeout: timeoutMs }).then((handle) => handle.jsonValue());
}

async function sendAction(page, action) {
  await page.evaluate((payload) => window.__sendAction(payload), action);
}
