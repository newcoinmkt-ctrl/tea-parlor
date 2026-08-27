import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyBid,
  createBiddingState,
  getLegalBids,
} from '../src/bidding.js';

test('bidding exposes pass and bids above current score only', () => {
  let state = createBiddingState({ starter: 1 });
  assert.deepEqual(getLegalBids(state), [0, 1, 2, 3]);

  let result = applyBid(state, 1, 1);
  assert.equal(result.ok, true);
  state = result.state;

  assert.deepEqual(getLegalBids(state), [0, 2, 3]);
  assert.equal(applyBid(state, 2, 1).ok, false);
});

test('bid score 3 ends bidding immediately', () => {
  const result = applyBid(createBiddingState({ starter: 2 }), 2, 3);

  assert.equal(result.ok, true);
  assert.equal(result.state.finished, true);
  assert.equal(result.state.landlordIndex, 2);
  assert.equal(result.state.baseScore, 3);
  assert.equal(result.state.reason, 'bid_3');
});

test('all players passing makes starter landlord with base score 1', () => {
  let state = createBiddingState({ starter: 1 });
  for (const player of [1, 2, 0]) {
    const result = applyBid(state, player, 0);
    assert.equal(result.ok, true);
    state = result.state;
  }

  assert.equal(state.finished, true);
  assert.equal(state.landlordIndex, 1);
  assert.equal(state.baseScore, 1);
  assert.equal(state.reason, 'all_pass_starter_landlord');
});

test('highest bid after one round becomes landlord', () => {
  let state = createBiddingState({ starter: 0 });
  state = applyBid(state, 0, 1).state;
  state = applyBid(state, 1, 2).state;
  state = applyBid(state, 2, 0).state;

  assert.equal(state.finished, true);
  assert.equal(state.landlordIndex, 1);
  assert.equal(state.baseScore, 2);
  assert.equal(state.reason, 'highest_bid');
});
