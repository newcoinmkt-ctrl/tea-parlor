import test from "node:test";
import assert from "node:assert/strict";
import {
  shouldIgnoreMouseAfterTouch,
  isTapGesture,
  TOUCH_MOUSE_GUARD_MS,
} from "../src/net/ddz-hand-touch.js";

test("firesTouchEvents mouse is ignored", () => {
  assert.equal(
    shouldIgnoreMouseAfterTouch({ sourceCapabilities: { firesTouchEvents: true } }, 0, 1000),
    true,
  );
});

test("recent touch timestamp ignores mouse", () => {
  const now = 10_000;
  assert.equal(shouldIgnoreMouseAfterTouch({}, now - 100, now), true);
  assert.equal(shouldIgnoreMouseAfterTouch({}, now - (TOUCH_MOUSE_GUARD_MS + 50), now), false);
});

test("desktop mouse without recent touch is allowed", () => {
  assert.equal(shouldIgnoreMouseAfterTouch({ sourceCapabilities: { firesTouchEvents: false } }, 0, 1000), false);
  assert.equal(shouldIgnoreMouseAfterTouch({}, 0, 1000), false);
});

test("tap vs pan threshold", () => {
  assert.equal(isTapGesture(0, 0), true);
  assert.equal(isTapGesture(8, 3), true);
  assert.equal(isTapGesture(20, 0), false);
  assert.equal(isTapGesture(0, 18), false);
});
