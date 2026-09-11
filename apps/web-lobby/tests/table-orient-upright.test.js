import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const orientSrc = readFileSync(path.join(root, '../src/net/table-orient.js'), 'utf8');
const handFit = readFileSync(path.join(root, '../src/hand-fit.css'), 'utf8');
const jjCss = readFileSync(path.join(root, '../src/jj-table.css'), 'utf8');
const appSrc = readFileSync(path.join(root, '../src/app.js'), 'utf8');
const html = readFileSync(path.join(root, '../index.html'), 'utf8');

test('play9match3 cache bust on CSS + app.js', () => {
  assert.match(html, /app\.js\?v=play9match3/);
  assert.match(html, /hand-fit\.css\?v=play9match3/);
  assert.match(html, /table-landscape\.css\?v=play9match3/);
  assert.match(html, /jj-table\.css\?v=play9match3/);
  assert.doesNotMatch(html, /\?v=play9v3h/);
  assert.doesNotMatch(html, /\?v=play9v3g/);
});

test('table-orient pins JJ zones absolute-to-stage (play9match3)', () => {
  assert.match(orientSrc, /function pinJjZoneGeometry/);
  assert.match(orientSrc, /padding-bottom", "4px"/);
  assert.match(orientSrc, /clearPinnedJjZones/);
});

test('jj-table zone lock beats fixed + no vw play-zone', () => {
  assert.match(jjCss, /play9jj1b — ZONE LOCK/);
  assert.match(jjCss, /No safe-area pad|no safe-area/i);
  assert.doesNotMatch(jjCss, /42vw/);
  assert.match(jjCss, /table-stage-land-target \.self-slot/);
});

test('table-orient letterbox landscape without rotate transform', () => {
  assert.doesNotMatch(orientSrc, /setProperty\([^)]*rotate\(/);
  assert.match(orientSrc, /translate\(-50%, -50%\) scale/);
  assert.match(orientSrc, /table-stage-land/);
  assert.match(orientSrc, /table-stage-jj/);
  assert.match(orientSrc, /letterbox/i);
  assert.match(orientSrc, /Math\.max\(vw, vh\)/);
  assert.match(orientSrc, /Math\.min\(vw, vh\)/);
});

test('hand-fit does not force transform:none on land-target', () => {
  assert.match(handFit, /allow letterbox scale/i);
  const idx = handFit.indexOf('#tableView.table-stage-land-target');
  assert.ok(idx > 0);
  const slice = handFit.slice(idx, idx + 220);
  assert.doesNotMatch(slice, /transform:\s*none/);
});

test('jj-table cruise skin + settle hud + zones', () => {
  assert.match(jjCss, /jj-cruise\/game_background/);
  assert.match(jjCss, /jj-settle-hud/);
  assert.match(html, /id="jjSettleHud"/);
  assert.match(html, /JJ斗地主/);
});

test('AI think delay helper is 0.8–2s', () => {
  assert.match(appSrc, /function aiThinkMs\(/);
  assert.match(appSrc, /800 \+ Math\.floor/);
  assert.match(appSrc, /setTimeout\(runAi, aiThinkMs\(\)\)/);
});

test('pinP0ActionBar forces horizontal row', () => {
  assert.match(appSrc, /flex-direction', 'row'/);
});

test('renderJjSettleHud present', () => {
  assert.match(appSrc, /function renderJjSettleHud\(/);
  assert.match(appSrc, /jj-win-stamp/);
});
