import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('local doudizhu table exposes table and character costume ad slots', () => {
  const html = readFileSync(new URL('../public/test-client.html', import.meta.url), 'utf8');

  assert.match(html, /data-ad-slot="doudizhu-table-center"/);
  assert.match(html, /data-ad-slot="doudizhu-table-rail-left"/);
  assert.match(html, /data-ad-slot="doudizhu-table-rail-right"/);
  assert.match(html, /doudizhu-costume-seat-0/);
  assert.match(html, /doudizhu-costume-seat-1/);
  assert.match(html, /doudizhu-costume-seat-2/);
  assert.match(html, /\/ad-slots/);
  assert.match(html, /adsUrl/);
  assert.doesNotMatch(html, /充值|提现|USDT|TON|QQ|JJ/);
});
