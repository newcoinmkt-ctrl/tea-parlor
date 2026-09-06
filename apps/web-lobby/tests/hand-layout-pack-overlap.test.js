import test from "node:test";
import assert from "node:assert/strict";
import { packOverlap } from "../src/net/hand-layout.js";

test("packOverlap never inflates cardW above maxW", () => {
  const p = packOverlap(20, 338, { minW: 40, maxW: 48, minPeek: 16, ratio: 1.42 });
  assert.ok(p.cardW <= 48, `cardW=${p.cardW}`);
  assert.ok(p.peek >= 1);
  assert.ok(p.cardW >= 40 || p.needsScroll);
});

test("17 cards on ~280px stay readable via scroll rather than half-digit crush", () => {
  const p = packOverlap(17, 280, { minW: 40, maxW: 48, minPeek: 16, ratio: 1.42 });
  assert.equal(p.cardW, 40);
  assert.equal(p.peek, 16);
  assert.equal(p.needsScroll, true);
  assert.ok(p.total > 280);
});

test("17 cards on 360px fit without scroll at mins", () => {
  // 40 + 16*16 = 296 <= 360
  const p = packOverlap(17, 360, { minW: 40, maxW: 48, minPeek: 16, ratio: 1.42 });
  assert.ok(p.cardW <= 48);
  assert.ok(p.cardW >= 40);
  assert.ok(p.peek >= 16);
  assert.equal(p.needsScroll, false);
  assert.ok(p.total <= 360 + 0.5);
});

test("narrow crush path does not set cardW > maxW", () => {
  const p = packOverlap(20, 250, { minW: 36, maxW: 44, minPeek: 14, ratio: 1.42 });
  assert.ok(p.cardW <= 44);
  assert.ok(p.needsScroll);
});
