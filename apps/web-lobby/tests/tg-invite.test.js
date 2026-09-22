import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTgInviteUrl,
  parseTgInviteStartParam,
  normalizeDualRoomKey,
  collectTgInviteSources,
  buildInvitePayload,
  inferGameIdFromRoomKey,
  validateInviteRoomKey,
  shortGameId,
  formatInviteJoinError,
} from '../src/net/tg-invite.js';

test('buildTgInviteUrl startapp', () => {
  assert.equal(
    buildTgInviteUrl('dual_ddz_ab12', 'teaparlorbot'),
    'https://t.me/teaparlorbot/app?startapp=t_dual_ddz_ab12',
  );
});

test('parse sources prefer start_param', () => {
  const p = parseTgInviteStartParam({
    start_param: 't_dual_ddz_one',
    tgWebAppStartParam: 't_dual_ddz_two',
  });
  assert.equal(p.roomKey, 'dual_ddz_one');
  assert.equal(p.gameId, 'ddz');
});

test('normalizeDualRoomKey', () => {
  assert.equal(normalizeDualRoomKey('dual_ddz_x'), 'dual_ddz_x');
  assert.equal(normalizeDualRoomKey('abcd'), 'dual_ddz_abcd');
  assert.equal(normalizeDualRoomKey('t_dual_ddz_z'), 'dual_ddz_z');
  assert.equal(normalizeDualRoomKey('wxyz', 'gd'), 'dual_gd_wxyz');
  assert.equal(normalizeDualRoomKey('dual_gd_aa'), 'dual_gd_aa');
});

test('collectTgInviteSources from fake loc', () => {
  const src = collectTgInviteSources(
    { initDataUnsafe: { start_param: 't_dual_ddz_tg' } },
    { search: '?tgWebAppStartParam=t_other', hash: '' },
  );
  assert.equal(src.start_param, 't_dual_ddz_tg');
  assert.equal(src.tgWebAppStartParam, 't_other');
});

test('buildInvitePayload includes roomKey + gameId', () => {
  const p = buildInvitePayload({ roomKey: 'dual_gd_table1', gameId: 'guandan' });
  assert.equal(p.roomKey, 'dual_gd_table1');
  assert.equal(p.gameId, 'gd');
  assert.match(p.url, /startapp=t_dual_gd_table1/);
  assert.match(p.copyText, /dual_gd_table1/);
});

test('infer + validate', () => {
  assert.equal(inferGameIdFromRoomKey('dual_gd_xyz'), 'gd');
  assert.equal(shortGameId('guandan'), 'gd');
  const ok = validateInviteRoomKey('dual_ddz_ok12');
  assert.equal(ok.ok, true);
  const bad = validateInviteRoomKey('');
  assert.equal(bad.ok, false);
});

test('parse guandan startapp', () => {
  const p = parseTgInviteStartParam({ startapp: 't_dual_gd_room99' });
  assert.equal(p.roomKey, 'dual_gd_room99');
  assert.equal(p.gameId, 'gd');
});

test('formatInviteJoinError readable', () => {
  assert.match(formatInviteJoinError(new Error('FULL')), /已满/);
  assert.match(formatInviteJoinError(new Error('expired')), /过期|关闭/);
});
