import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const orientSrc = readFileSync(path.join(root, '../src/net/table-orient.js'), 'utf8');
const handFit = readFileSync(path.join(root, '../src/hand-fit.css'), 'utf8');
const jjCss = readFileSync(path.join(root, '../src/jj-table.css'), 'utf8');
const mjCss = readFileSync(path.join(root, '../src/jj-mahjong.css'), 'utf8');
const appSrc = readFileSync(path.join(root, '../src/app.js'), 'utf8');
const html = readFileSync(path.join(root, '../index.html'), 'utf8');

test('play9fix1 cache bust on CSS + app.js', () => {
  assert.match(html, /app\.js\?v=play9fix1/);
  assert.match(html, /hand-fit\.css\?v=play9fix1/);
  assert.match(html, /table-landscape\.css\?v=play9fix1/);
  assert.match(html, /jj-table\.css\?v=play9fix1/);
  assert.match(html, /jj-mahjong\.css\?v=play9fix1/);
  assert.doesNotMatch(html, /\?v=play9mj1/);
  assert.doesNotMatch(html, /\?v=play9v3h/);
});

test('table-orient pins JJ zones absolute-to-stage', () => {
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

test('table-orient adaptive: landscape letterbox + portrait upright, never rotate', () => {
  assert.doesNotMatch(orientSrc, /setProperty\([^)]*rotate\(/);
  assert.match(orientSrc, /translate\(-50%, -50%\) scale/);
  assert.match(orientSrc, /table-stage-land/);
  assert.match(orientSrc, /table-stage-jj/);
  assert.match(orientSrc, /table-stage-upright/);
  assert.match(orientSrc, /applyUprightFill/);
  assert.match(orientSrc, /applyLandscapeLetterbox/);
  assert.match(orientSrc, /isPortraitViewport/);
  assert.match(orientSrc, /letterbox/i);
  assert.match(orientSrc, /transform", "none"/);
});

test('hand-fit does not force transform:none on land-target', () => {
  assert.match(handFit, /allow letterbox scale/i);
  const idx = handFit.indexOf('#tableView.table-stage-land-target');
  assert.ok(idx > 0);
  const slice = handFit.slice(idx, idx + 220);
  assert.doesNotMatch(slice, /transform:\s*none/);
});

test('jj-table cruise skin + settle hud + zones + portrait upright', () => {
  assert.match(jjCss, /jj-cruise\/game_background/);
  assert.match(jjCss, /jj-settle-hud/);
  assert.match(jjCss, /play9fix1 — portrait upright/);
  assert.match(jjCss, /table-stage-upright-target/);
  assert.match(html, /id="jjSettleHud"/);
});

test('AI think delay helper is 0.8–2s', () => {
  assert.match(appSrc, /function aiThinkMs\(/);
  assert.match(appSrc, /800 \+ Math\.floor/);
  assert.match(appSrc, /setTimeout\(runAi, aiThinkMs\(\)\)/);
});

test('pinP0ActionBar forces horizontal row + play touch recover', () => {
  assert.match(appSrc, /flex-direction', 'row'/);
  assert.match(appSrc, /lastTouchPlayAt/);
  assert.match(appSrc, /pointerType !== 'touch'/);
});

test('renderJjSettleHud present', () => {
  assert.match(appSrc, /function renderJjSettleHud\(/);
  assert.match(appSrc, /jj-win-stamp/);
});

test('play9fix1 mahjong adaptive stage (no rotate)', () => {
  assert.match(orientSrc, /isMjTableActive/);
  assert.match(orientSrc, /table-stage-mj/);
  assert.match(orientSrc, /multiGameView/);
  assert.match(orientSrc, /getStageTarget|getLetterboxTarget/);
  assert.match(html, /jj-mahjong\.css\?v=play9fix1/);
  assert.match(mjCss, /perspective\(/);
  assert.match(mjCss, /play9fix1 — portrait upright mahjong/);
  assert.doesNotMatch(mjCss, /transform:\s*rotate\(90deg\)/);
});

test('TG expand is rate-limited to avoid enter freeze', () => {
  assert.match(orientSrc, /lastExpandAt/);
  assert.match(orientSrc, /expandedTableActive/);
  assert.match(orientSrc, /1500/);
});
