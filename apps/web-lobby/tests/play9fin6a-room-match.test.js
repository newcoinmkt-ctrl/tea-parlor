/**
 * play9ui2b — room select / match thicken
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CACHE_STAMP, BUILD_VERSION } from '../src/net/build-stamp.js';
import {
  ddzMatchWaitingCopy,
  ddzMatchWaitingTitle,
  ddzMatchFailureCopy,
  ddzMatchFailureTitle,
} from '../src/net/ddz-match-copy.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(root, '../..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const app = readFileSync(join(root, 'src/app.js'), 'utf8');
const styles = readFileSync(join(root, 'src/styles.css'), 'utf8');
const matchCopy = readFileSync(join(root, 'src/net/ddz-match-copy.js'), 'utf8');

test('cache play9ui2b', () => {
  assert.match(html, /app\.js\?v=play9ui2b/);
  assert.equal(CACHE_STAMP, 'play9ui2b');
  assert.equal(BUILD_VERSION, 'play9ui2b');
  assert.doesNotMatch(html, /app\.js\?v=play9fin5c/);
});

test('visible room / field selection', () => {
  assert.match(html, /id="ddzFieldSelect"/);
  assert.match(html, /p0-field-select/);
  assert.match(app, /selectedDdzRoomId/);
  assert.match(app, /paintDdzFieldSelect/);
  assert.match(app, /markDdzRoomSelected/);
  assert.match(app, /is-selected/);
  assert.match(styles, /\.room-card\.is-selected/);
  assert.match(app, /data-game-room="niuniu"[\s\S]*is-selected/);
  assert.match(app, /data-game-room="mahjong"[\s\S]*is-selected/);
});

test('quick match clear waiting feedback', () => {
  assert.match(html, /id="ddzMatchSeats"/);
  assert.match(html, /id="ddzMatchField"/);
  assert.match(html, /id="ddzMatchEta"/);
  assert.match(app, /showDdzMatchWaiting/);
  assert.match(app, /ddzMatchWaitingCopy/);
  assert.match(matchCopy, /座位/);
  const copy = ddzMatchWaitingCopy({ roomLabel: '新手 · 底分 100', humans: 1, seats: 3, leftMs: 2800 });
  assert.match(copy, /新手/);
  assert.match(copy, /1\/3/);
  assert.match(copy, /3s|约/);
  assert.equal(ddzMatchWaitingTitle(), '匹配中');
});

test('match failure retryable without freeze', () => {
  assert.match(html, /id="ddzMatchRetry"/);
  assert.match(app, /retryDdzMatch/);
  assert.match(app, /showDdzMatchFailure/);
  assert.match(app, /ddzMatchRetry/);
  assert.match(styles, /p0-match-retry/);
  assert.match(styles, /pointer-events:\s*auto/);
  assert.equal(ddzMatchFailureTitle('boom'), '匹配失败');
  assert.match(ddzMatchFailureCopy('boom'), /重试/);
  assert.match(ddzMatchFailureCopy('match_window_skipped'), /重试/);
});

test('MATCH_MS still ≤3s AI fill', () => {
  const ddz = readFileSync(join(repo, 'apps/colyseus-tea-parlor/src/ddzLogic.js'), 'utf8');
  assert.match(ddz, /MATCH_MS_MAX\s*=\s*3_000/);
  assert.match(ddz, /MATCH_MS_DEFAULT\s*=\s*3_000/);
});

test('docs/qa play9ui2b present', () => {
  assert.equal(existsSync(join(repo, 'docs/qa/play9ui2b/README.md')), true);
  assert.equal(existsSync(join(repo, 'docs/qa/play9ui2b/report.json')), true);
});
