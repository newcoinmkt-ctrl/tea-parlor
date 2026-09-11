import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSrc = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('play9match3: match does not await full telegramLoginPromise (wallet sync)', () => {
  assert.match(appSrc, /waitForMatchSessionToken/);
  assert.match(appSrc, /do NOT await full telegramLoginPromise/);
  const idx = appSrc.indexOf('async function startRoomOnline');
  assert.ok(idx > 0);
  const slice = appSrc.slice(idx, idx + 1800);
  assert.match(slice, /await waitForMatchSessionToken/);
  assert.doesNotMatch(slice, /await telegramLoginPromise/);
});

test('play9match3: syncMatchOverlay keeps silent 匹配中… only', () => {
  const idx = appSrc.indexOf('function syncMatchOverlay');
  assert.ok(idx > 0);
  const slice = appSrc.slice(idx, idx + 1200);
  assert.match(slice, /copy\.textContent = '匹配中…'/);
  assert.match(slice, /titleEl\.textContent = '匹配中'/);
  // Overlay body assignments must not interpolate remaining seconds
  assert.doesNotMatch(slice, /copy\.textContent = [^;]*\\$\{/);
  assert.doesNotMatch(slice, /copy\.textContent = [^;]*秒/);
});

test('play9match3 cache stamp on app.js', () => {
  assert.match(html, /app\.js\?v=play9match3/);
});
