/**
 * play9gd1a — Guandan Colyseus lobby entry + cache
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CACHE_STAMP, BUILD_VERSION } from '../src/net/build-stamp.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(root, '../..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const app = readFileSync(join(root, 'src/app.js'), 'utf8');
const client = readFileSync(join(root, 'src/net/colyseus-client.js'), 'utf8');
const ui = readFileSync(join(root, 'src/games/guandan/ui.js'), 'utf8');
const colyIndex = readFileSync(join(repo, 'apps/colyseus-tea-parlor/src/index.js'), 'utf8');
const orient = readFileSync(join(root, 'src/net/table-orient.js'), 'utf8');

test('cache play9gd1a', () => {
  assert.equal(CACHE_STAMP, 'play9gd1a');
  assert.equal(BUILD_VERSION, 'play9gd1a');
  assert.match(html, /app\.js\?v=play9gd1a/);
});

test('lobby startGuanDan wires Colyseus for gold', () => {
  assert.match(app, /startColyseusGdSession/);
  assert.match(app, /useColyseus/);
  assert.match(client, /joinOrCreate\('guandan'/);
  assert.match(client, /startColyseusGdSession/);
  assert.match(ui, /applyServerSnap/);
  assert.match(ui, /startOnline/);
  assert.match(ui, /play9gd1a/);
});

test('colyseus registers guandan room', () => {
  assert.match(colyIndex, /GuandanRoom/);
  assert.match(colyIndex, /define\('guandan'/);
  assert.match(colyIndex, /['"]guandan['"]/);
  assert.match(colyIndex, /play9gd1a/);
});

test('ui2c/ui2d skins preserved; no page rotate; ship3b tg-vh', () => {
  assert.match(ui, /gd-yard/);
  assert.match(ui, /play9ui2d/); // settle skin class
  assert.match(ui, /四炸|「四炸」/);
  assert.doesNotMatch(orient, /transform:\s*rotate\(|body\.style\.transform/);
  assert.match(orient, /--tg-vh/);
  assert.doesNotMatch(orient, /Math\.max\(\s*innerHeight\s*,\s*.*viewportStableHeight/);
});

test('no crypto/withdraw for gd1 wave path', () => {
  assert.match(app, /currency !== 'crypto'/);
  assert.match(app, /options\.local !== true/);
  assert.match(colyIndex, /guandan/);
  assert.doesNotMatch(app, /startGuanDan[\s\S]{0,200}withdraw/);
});

test('docs/qa play9gd1a present', () => {
  assert.equal(existsSync(join(repo, 'docs/qa/play9gd1a/README.md')), true);
  assert.equal(existsSync(join(repo, 'docs/qa/play9gd1a/report.json')), true);
  assert.equal(existsSync(join(repo, 'packages/guandan-engine')), true);
  assert.equal(existsSync(join(repo, 'apps/web-lobby/src/games/guandan2')), false);
});
