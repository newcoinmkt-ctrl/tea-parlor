import test from "node:test";
import assert from "node:assert/strict";
import { tableActsFromOnlineRoom } from "../src/net/ddz-table-acts.js";

test("online lastPlay seeds seat play act", () => {
  const acts = tableActsFromOnlineRoom({
    phase: "play",
    currentPlayer: 0,
    passCount: 0,
    lastPlay: {
      player: 1,
      type: "pair",
      cards: [{ id: "a", rank: 10, suit: 0 }, { id: "b", rank: 10, suit: 1 }],
    },
  }, [null, null, null]);
  assert.equal(acts[1]?.kind, "play");
  assert.equal(acts[1]?.cards?.length, 2);
  assert.equal(acts[0], null);
  assert.equal(acts[2], null);
});

test("passCount marks intermediate seats as 不出", () => {
  const acts = tableActsFromOnlineRoom({
    phase: "play",
    currentPlayer: 0,
    passCount: 1,
    lastPlay: {
      player: 1,
      type: "solo",
      cards: [{ id: "c", rank: 14, suit: 2 }],
    },
  }, null);
  assert.equal(acts[1]?.kind, "play");
  assert.equal(acts[2]?.kind, "pass");
  assert.equal(acts[0], null);
});

test("keeps previous play face when snapshot omits cards", () => {
  const prev = [null, { kind: "play", cards: [{ id: "x", rank: 8, suit: 0 }], parsed: { type: "solo" } }, null];
  const acts = tableActsFromOnlineRoom({
    phase: "play",
    currentPlayer: 0,
    passCount: 0,
    lastPlay: { player: 1, cards: [] },
  }, prev);
  assert.equal(acts[1]?.kind, "play");
  assert.equal(acts[1]?.cards?.[0]?.id, "x");
});

test("pure pass without cards shows seat 不出 bubble", () => {
  const prev = [
    null,
    { kind: "play", cards: [{ id: "p", rank: 9, suit: 0 }], parsed: { type: "solo" } },
    null,
  ];
  const acts = tableActsFromOnlineRoom({
    phase: "play",
    currentPlayer: 0,
    passCount: 1,
    lastPlay: { player: 2, type: "pass", cards: [], pass: true },
  }, prev);
  assert.equal(acts[2]?.kind, "pass");
  assert.equal(acts[1]?.kind, "play");
  assert.equal(acts[1]?.cards?.[0]?.id, "p");
  assert.equal(acts[0], null);
});

test("empty cards[] with no prior play becomes seat pass", () => {
  const acts = tableActsFromOnlineRoom({
    phase: "play",
    currentPlayer: 0,
    passCount: 0,
    lastPlay: { player: 2, cards: [] },
  }, [null, null, null]);
  assert.equal(acts[2]?.kind, "pass");
  assert.equal(acts[0], null);
  assert.equal(acts[1], null);
});

test("passCount still marks seat after play lastPlay", () => {
  const acts = tableActsFromOnlineRoom({
    phase: "play",
    currentPlayer: 2,
    passCount: 1,
    lastPlay: {
      player: 0,
      type: "pair",
      cards: [{ id: "a", rank: 5, suit: 0 }, { id: "b", rank: 5, suit: 1 }],
    },
  }, null);
  assert.equal(acts[0]?.kind, "play");
  assert.equal(acts[1]?.kind, "pass");
  assert.equal(acts[2], null);
});
