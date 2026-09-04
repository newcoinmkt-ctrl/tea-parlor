import test from "node:test";
import assert from "node:assert/strict";
import { computeGuandanRows } from "../src/net/hand-layout.js";

/** 414 viewport minus dock left 56 + right 8 ≈ 350 */
const W414 = 350;

test("27 cards pack into exactly two rows with no lone row", () => {
  const plan = computeGuandanRows(27, W414);
  assert.equal(plan.rowCount, 2);
  assert.equal(plan.rows.length, 2);
  assert.equal(plan.rows[0].length + plan.rows[1].length, 27);
  assert.ok(plan.rows[0].length >= 2);
  assert.ok(plan.rows[1].length >= 2);
  assert.ok(Math.abs(plan.rows[0].length - plan.rows[1].length) <= 1);
  assert.ok(plan.leftPad >= 4);
  assert.ok(plan.positions[0].left >= 4);
  assert.ok(plan.lastRight <= W414 + 0.5);
});

test("selected lift does not change row plan (same inputs → same rows)", () => {
  const a = computeGuandanRows(27, W414);
  const b = computeGuandanRows(27, W414);
  assert.deepEqual(a.rows, b.rows);
  assert.equal(a.rowCount, b.rowCount);
  assert.deepEqual(
    a.positions.map((p) => [p.index, p.row, p.left, p.top]),
    b.positions.map((p) => [p.index, p.row, p.left, p.top]),
  );
});

test("no length-1 row when n >= 3", () => {
  for (const n of [3, 4, 5, 13, 14, 26, 27]) {
    const plan = computeGuandanRows(n, W414);
    for (const row of plan.rows) {
      if (n >= 3) assert.notEqual(row.length, 1, `n=${n} had lone row`);
    }
    assert.ok(plan.rowCount <= 2, `n=${n} rowCount=${plan.rowCount}`);
  }
});

test("narrow dock still keeps last card within container", () => {
  const plan = computeGuandanRows(27, 280);
  assert.equal(plan.rowCount, 2);
  assert.ok(plan.lastRight <= 280 + 0.5);
  assert.ok(plan.positions[0].left >= 0);
});
