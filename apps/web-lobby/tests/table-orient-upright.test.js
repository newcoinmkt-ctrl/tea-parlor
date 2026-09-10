import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const orientSrc = readFileSync(path.join(root, '../src/net/table-orient.js'), 'utf8');
const handFit = readFileSync(path.join(root, '../src/hand-fit.css'), 'utf8');
const appSrc = readFileSync(path.join(root, '../src/app.js'), 'utf8');
const html = readFileSync(path.join(root, '../index.html'), 'utf8');

test('play9v3h cache bust on CSS + app.js', () => {
  assert.match(html, /app\.js\?v=play9v3h/);
  assert.match(html, /hand-fit\.css\?v=play9v3h/);
  assert.match(html, /table-landscape\.css\?v=play9v3h/);
  assert.doesNotMatch(html, /\?v=play9v3g/);
});

test('table-orient never applies rotate(90deg) to #tableView', () => {
  assert.doesNotMatch(orientSrc, /rotate\(90deg\)/);
  assert.doesNotMatch(orientSrc, /rotate\(\s*90/);
  assert.match(orientSrc, /transform", "none"/);
  assert.match(orientSrc, /table-stage-upright/);
  assert.match(orientSrc, /letterbox/i);
});

test('hand-fit kills legacy rotate target', () => {
  assert.match(handFit, /transform:\s*none\s*!important/);
  assert.match(handFit, /table-stage-upright/);
});

test('AI think delay helper is 0.8–2s', () => {
  assert.match(appSrc, /function aiThinkMs\(/);
  assert.match(appSrc, /800 \+ Math\.floor/);
  assert.match(appSrc, /setTimeout\(runAi, aiThinkMs\(\)\)/);
});

test('pinP0ActionBar forces horizontal row', () => {
  assert.match(appSrc, /flex-direction', 'row'/);
});
