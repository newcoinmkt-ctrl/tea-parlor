import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clonedGameAdapters,
  FutureGameIds,
  mahjongAdapter,
  texasHoldemAdapter,
  texasHoldemEngineAdapter,
  mahjongEngineAdapter,
  zhajinhuaEngineAdapter,
  listGames,
} from '../src/index.js';

test('texas holdem and mahjong adapters are placeholders only', () => {
  assert.equal(texasHoldemAdapter.status, 'placeholder');
  assert.equal(texasHoldemAdapter.createRoom({}).ok, false);
  assert.equal(texasHoldemAdapter.createRoom({}).reason, 'texas_holdem_rules_not_implemented');

  assert.equal(mahjongAdapter.status, 'placeholder');
  assert.equal(mahjongAdapter.startRound('room-1').ok, false);
  assert.equal(mahjongAdapter.startRound('room-1').reason, 'mahjong_rules_not_implemented');
});

test('cloned openinggame qp play types are adapter placeholders only', () => {
  const expected = [
    [FutureGameIds.OPENINGGAME_QP, 'candidate_quarantined_no_runtime_import'],
    [FutureGameIds.CHUDADI, 'candidate_playable_in_h5_only_adapter_not_implemented'],
    [FutureGameIds.ZHAJINHUA, 'engine_exists_at_@tea-parlor/zhajinhua-engine_adapter_pending'],
    [FutureGameIds.ER_MAHJONG, 'er_mahjong_rules_not_implemented'],
    [FutureGameIds.XUELIU_MAHJONG, 'xueliu_mahjong_rules_not_implemented'],
    [FutureGameIds.XUEZHAN_MAHJONG, 'xuezhan_mahjong_rules_not_implemented'],
  ];

  for (const [gameId, reason] of expected) {
    const adapter = clonedGameAdapters[gameId];
    assert.equal(adapter.gameId, gameId);
    assert.equal(adapter.status, 'placeholder');
    assert.deepEqual(adapter.createRoom({}).ok, false);
    assert.equal(adapter.settleRound('room-1').reason, reason);
  }
});

test('engine adapters expose the 7 plugin methods for texas / zjh / mahjong', () => {
  for (const adapter of [texasHoldemEngineAdapter, zhajinhuaEngineAdapter, mahjongEngineAdapter]) {
    assert.equal(adapter.status, 'ready');
    const created = adapter.createRoom({ chipCurrency: 'USDT_SHADOW', baseAmount: 10 });
    assert.equal(created.ok, true);
    assert.equal(adapter.startRound(created.roomId).ok, true);
    assert.equal(adapter.applyAction(created.roomId, 'p1', { type: 'check' }).ok, true);
    assert.equal(adapter.getPublicState(created.roomId, 'p1').ok, true);
    const intent = adapter.settleRound(created.roomId);
    assert.equal(intent.type, 'settlement_intent');
    assert.equal(intent.unit, 'USDT_SHADOW');
    assert.equal(adapter.replay(created.roomId).ok, true);
  }
});

test('registerGame list includes doudizhu and guandan', () => {
  const ids = listGames().map((g) => g.id);
  assert.ok(ids.includes('doudizhu'));
  assert.ok(ids.includes('guandan'));
});
