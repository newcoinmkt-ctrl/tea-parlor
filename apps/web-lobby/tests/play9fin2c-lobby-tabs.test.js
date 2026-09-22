/**
 * play9fin2c — lobby five-tab portrait polish + full regression guards
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const styles = readFileSync(join(root, 'src/styles.css'), 'utf8');
const lia = readFileSync(join(root, 'src/lobby-ia.css'), 'utf8');
const app = readFileSync(join(root, 'src/app.js'), 'utf8');
const orient = readFileSync(join(root, 'src/net/table-orient.js'), 'utf8');
const jj = readFileSync(join(root, 'src/jj-table.css'), 'utf8');

test('cache play9fin7c', () => {
  assert.match(html, /app\.js\?v=play9fin7c/);
  assert.match(html, /lobby-ia\.css\?v=play9fin7c/);
  assert.match(app, /\?v=play9fin7c/);
});

test('five bottom tabs present and labeled', () => {
  const actions = ['home', 'records', 'recharge', 'rules', 'profile'];
  for (const a of actions) {
    assert.match(html, new RegExp(`class="home-tab[^"]*"[^>]*data-lobby-action="${a}"|data-lobby-action="${a}"[^>]*class="home-tab`));
  }
  assert.match(html, /<strong>大厅<\/strong>/);
  assert.match(html, /<strong>战绩<\/strong>/);
  assert.match(html, /<strong>补给<\/strong>/);
  assert.match(html, /<strong>说明<\/strong>/);
  assert.match(html, /<strong>我<\/strong>/);
  // exactly one home-tabbar
  assert.equal((html.match(/class="home-tabbar"/g) || []).length, 1);
  assert.equal((html.match(/class="home-tab[\s"]/g) || []).length, 5);
});

test('tabbar CSS uses 5 columns — never 4 for home-tabbar', () => {
  assert.match(lia, /play9fin2c/);
  assert.match(lia, /repeat\(5,\s*minmax\(0,\s*1fr\)\)\s*!important/);
  assert.match(styles, /play9fin2c: five tabs/);
  // home-tabbar body must not set repeat(4) (comment mentioning "was repeat(4)" OK)
  const bodies = [...styles.matchAll(/\.home-tabbar\s*\{([^}]*)\}/g)].map((m) => m[1]);
  for (const body of bodies) {
    const code = body.replace(/\/\*[^*]*\*+(?:[^/*][^*]*\*+)*\//g, '');
    if (/repeat\(4/.test(code)) {
      assert.fail('home-tabbar still has repeat(4): ' + body.slice(0, 120));
    }
  }
  assert.match(lia, /pointer-events:\s*auto !important/);
  assert.match(lia, /min-height:\s*48px !important/);
});

test('no whole-page CSS rotate; ship3b tg-vh preserved', () => {
  assert.match(orient, /viewportStableHeight/);
  assert.match(orient, /never Math\.max|prefer Telegram/);
  assert.doesNotMatch(orient, /Math\.max\([^)]*innerHeight[^)]*viewportStableHeight/);
  assert.match(jj, /Forbidden:.*rotate\(90/);
  assert.doesNotMatch(styles, /html\s*\{\s*[^}]*transform:\s*rotate\(90/);
  assert.doesNotMatch(lia, /transform:\s*rotate\(90/);
});

test('regression: DDZ / mahjong / niuniu still wired; no new game icons', () => {
  assert.match(html, /data-side-game="doudizhu"/);
  assert.match(html, /data-side-game="mahjong"/);
  assert.match(html, /data-side-game="niuniu"/);
  assert.match(html, /id="trusteeButton"/);
  assert.match(html, /id="mgTrusteeBtn"/);
  // no new unrelated game icons
  assert.doesNotMatch(html, /data-side-game="(poker|baccarat|slots|fish|lottery)"/);
  assert.doesNotMatch(html, /home-icon-btn[^>]*>\s*<strong>(老虎机|捕鱼|百家乐)</);
});

test('no Stars pay / chain withdraw path', () => {
  assert.match(html, /STARS" hidden disabled|play9fin2c: no Stars pay/);
  assert.doesNotMatch(html, /<option value="STARS">Telegram Stars<\/option>/);
  // withdraw still demo-guarded
  assert.match(html, /不可提现/);
});

test('fin1/fin2 features still referenced', () => {
  assert.match(app, /__ddzFullTrustee|toggleFullTrustee/);
  assert.match(html, /data-ad-slot="doudizhu-table-center"/);
  assert.match(html, /data-ad-slot="doudizhu-card-face"/);
});
