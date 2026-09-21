import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTgInviteUrl,
  parseTgInviteStartParam,
  normalizeDualRoomKey,
  collectTgInviteSources,
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
});

test('normalizeDualRoomKey', () => {
  assert.equal(normalizeDualRoomKey('dual_ddz_x'), 'dual_ddz_x');
  assert.equal(normalizeDualRoomKey('abcd'), 'dual_ddz_abcd');
  assert.equal(normalizeDualRoomKey('t_dual_ddz_z'), 'dual_ddz_z');
});

test('collectTgInviteSources from fake loc', () => {
  const src = collectTgInviteSources(
    { initDataUnsafe: { start_param: 't_dual_ddz_tg' } },
    { search: '?tgWebAppStartParam=t_other', hash: '' },
  );
  assert.equal(src.start_param, 't_dual_ddz_tg');
  assert.equal(src.tgWebAppStartParam, 't_other');
});
