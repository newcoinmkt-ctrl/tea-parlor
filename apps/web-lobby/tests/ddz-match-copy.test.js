import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ddzMatchFailureCopy,
  ddzMatchFailureTitle,
  ddzMatchWaitingCopy,
  ddzMatchWaitingTitle,
  isDdzAuthFailureMessage,
  DDZ_LOCAL_PLAY_LABEL,
  DDZ_LOCAL_PLAY_HINT,
} from '../src/net/ddz-match-copy.js';

test('auth failure copy points players to Telegram Mini App', () => {
  assert.equal(isDdzAuthFailureMessage('auth_failed'), true);
  assert.equal(isDdzAuthFailureMessage('Error: auth_identity_mismatch'), true);
  assert.equal(ddzMatchFailureCopy('auth_failed'), '登录校验失败，请从 Telegram 打开');
  assert.equal(ddzMatchFailureTitle('auth_failed'), '匹配失败');
});

test('non-auth match failure does not claim local AI started', () => {
  assert.equal(isDdzAuthFailureMessage('colyseus room state timeout'), false);
  assert.equal(ddzMatchFailureCopy('boom'), '联网匹配失败，请重试（未开人机局）');
  assert.equal(ddzMatchFailureCopy('match_cancelled'), '已取消匹配');
  assert.equal(ddzMatchFailureTitle('match_cancelled'), '已取消');
});

test('local play labels avoid 匹配 wording', () => {
  assert.equal(DDZ_LOCAL_PLAY_LABEL, '人机畅玩');
  assert.doesNotMatch(DDZ_LOCAL_PLAY_LABEL, /匹配/);
  assert.doesNotMatch(DDZ_LOCAL_PLAY_HINT, /匹配/);
});

test('lobby HTML exposes honest local entry and keeps matching entry', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /data-lobby-action="local-doudizhu"/);
  assert.match(html, /人机畅玩/);
  assert.match(html, /data-lobby-action="quick-doudizhu"/);
  assert.match(html, /id="ddzMatchMask"/);
  assert.match(html, /app\.js\?v=play9ui1a/);
  // Local button copy must not say 匹配
  const localBtn = html.match(/data-lobby-action="local-doudizhu"[^>]*>([^<]+)</);
  assert.ok(localBtn, 'local button present');
  assert.doesNotMatch(localBtn[1], /匹配/);
});



test('play9ui1a waiting copy shows room seats ETA', () => {
  const copy = ddzMatchWaitingCopy({ roomLabel: '新手 · 底分 100', humans: 2, seats: 3, leftMs: 1500 });
  assert.match(copy, /新手/);
  assert.match(copy, /2\/3/);
  assert.match(copy, /约 2s/);
  assert.equal(ddzMatchWaitingTitle(), '匹配中');
});

test('play9ui1a match overlay markup has seats + retry', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="ddzMatchSeats"/);
  assert.match(html, /id="ddzMatchRetry"/);
  assert.match(html, /id="ddzFieldSelect"/);
});
