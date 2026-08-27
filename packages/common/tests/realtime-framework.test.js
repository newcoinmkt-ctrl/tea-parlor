import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RealtimeFrameworkIds,
  getRealtimeFramework,
  getRecommendedRealtimeFramework,
  isOnlineRealtimeFramework,
  normalizeRealtimeFramework,
  realtimeFrameworks,
} from '../src/index.js';

test('realtime framework strategy prefers colyseus and keeps pinus as compatibility backend', () => {
  assert.equal(getRecommendedRealtimeFramework().id, RealtimeFrameworkIds.COLYSEUS);
  assert.equal(realtimeFrameworks.colyseus.recommended, true);
  assert.equal(realtimeFrameworks.pinus.role, 'compatibility-backend');
  assert.equal(realtimeFrameworks.local.role, 'offline-default');
});

test('realtime framework normalization preserves old online mode as colyseus', () => {
  assert.equal(normalizeRealtimeFramework('online'), RealtimeFrameworkIds.COLYSEUS);
  assert.equal(normalizeRealtimeFramework('bad'), RealtimeFrameworkIds.LOCAL);
  assert.equal(getRealtimeFramework('pinus').endpoint, 'ws://127.0.0.1:3010');
  assert.equal(isOnlineRealtimeFramework('local'), false);
  assert.equal(isOnlineRealtimeFramework('colyseus'), true);
  assert.equal(isOnlineRealtimeFramework('pinus'), true);
});
