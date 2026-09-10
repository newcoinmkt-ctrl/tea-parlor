import test from "node:test";
import assert from "node:assert/strict";
import { evaluatePlaySelection } from "../src/net/ddz-play-validate.js";
import { parseHand, canBeat } from "../src/jj/rules.js";

const c = (id, rank, suit = 0) => ({ id, rank, suit });

test("empty selection disables play", () => {
  const r = evaluatePlaySelection({
    selectedCards: [],
    lastPlay: null,
    parseHand,
    canBeat,
  });
  assert.equal(r.allowPlay, false);
  assert.equal(r.reason, "empty");
});

test("illegal A+10 disables play with feedback reason", () => {
  const r = evaluatePlaySelection({
    selectedCards: [c("a", 14, 1), c("t", 10, 0)],
    lastPlay: null,
    parseHand,
    canBeat,
  });
  assert.equal(r.allowPlay, false);
  assert.equal(r.reason, "illegal_pattern");
  assert.match(r.message, /牌型不合法/);
});

test("single / pair / straight can play on lead", () => {
  const single = evaluatePlaySelection({
    selectedCards: [c("s", 5)],
    lastPlay: null,
    parseHand,
    canBeat,
  });
  assert.equal(single.allowPlay, true);
  assert.equal(single.parsed?.type, "single");

  const pair = evaluatePlaySelection({
    selectedCards: [c("p1", 9, 0), c("p2", 9, 1)],
    lastPlay: null,
    parseHand,
    canBeat,
  });
  assert.equal(pair.allowPlay, true);
  assert.equal(pair.parsed?.type, "pair");

  const straight = evaluatePlaySelection({
    selectedCards: [c("a", 3), c("b", 4), c("c", 5), c("d", 6), c("e", 7)],
    lastPlay: null,
    parseHand,
    canBeat,
  });
  assert.equal(straight.allowPlay, true);
  assert.equal(straight.parsed?.type, "straight");
});

test("legal type that cannot beat previous is disabled", () => {
  const prev = parseHand([c("x", 12)]); // Q
  const r = evaluatePlaySelection({
    selectedCards: [c("y", 8)],
    lastPlay: { player: 1, parsed: prev },
    humanSeat: 0,
    parseHand,
    canBeat,
  });
  assert.equal(r.allowPlay, false);
  assert.equal(r.reason, "cannot_beat");
});

test("beating single enables play", () => {
  const prev = parseHand([c("x", 8)]);
  const r = evaluatePlaySelection({
    selectedCards: [c("y", 11)],
    lastPlay: { player: 2, parsed: prev },
    humanSeat: 0,
    parseHand,
    canBeat,
  });
  assert.equal(r.allowPlay, true);
  assert.equal(r.reason, "ok");
});
