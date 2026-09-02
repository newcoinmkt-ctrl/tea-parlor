import test from "node:test";
import assert from "node:assert/strict";
import { stripGuandanChrome, GD_CHROME_SEL } from "../src/net/strip-gd-chrome.js";

function fakeEl(tag, className = "", id = "") {
  const kids = [];
  const el = {
    tag,
    className,
    id,
    parent: null,
    children: kids,
    removed: false,
    querySelectorAll(sel) {
      const parts = String(sel).split(",").map((s) => s.trim());
      const out = [];
      const walk = (node) => {
        for (const c of node.children) {
          if (matchSel(c, parts)) out.push(c);
          walk(c);
        }
      };
      walk(this);
      return out;
    },
    querySelector(sel) {
      return this.querySelectorAll(sel)[0] || null;
    },
    remove() {
      this.removed = true;
      if (this.parent) {
        const i = this.parent.children.indexOf(this);
        if (i >= 0) this.parent.children.splice(i, 1);
      }
    },
    append(child) {
      child.parent = this;
      this.children.push(child);
      return child;
    },
  };
  return el;
}

function matchSel(node, parts) {
  return parts.some((p) => {
    if (p.startsWith("#")) return node.id === p.slice(1);
    if (p.startsWith(".")) {
      const cls = p.slice(1);
      return String(node.className).split(/\s+/).includes(cls);
    }
    return false;
  });
}

test("stripGuandanChrome removes toolbar / level-chip / remain-meter / again-pill", () => {
  const root = fakeEl("section", "multi-game-view", "multiGameView");
  const hand = fakeEl("div", "mg-hand", "mgHand");
  root.append(hand);
  root.append(fakeEl("div", "gd-toolbar"));
  root.append(fakeEl("div", "gd-level-chip"));
  root.append(fakeEl("div", "gd-remain-meter"));
  root.append(fakeEl("button", "gd-again-pill"));
  hand.append(fakeEl("div", "gd-col"));
  hand.append(fakeEl("button", "gd-card"));
  const keep = fakeEl("div", "mg-actions");
  root.append(keep);

  const n = stripGuandanChrome(root);
  assert.equal(root.querySelectorAll(GD_CHROME_SEL).length, 0);
  assert.equal(root.querySelectorAll(".gd-card,.gd-col").length, 0);
  assert.equal(root.querySelectorAll(".mg-actions").length, 1);
  assert.ok(n >= 4);
  assert.equal(keep.removed, false);
});

test("stripGuandanChrome is a no-op on empty / missing root", () => {
  assert.equal(stripGuandanChrome(null), 0);
  assert.equal(stripGuandanChrome({}), 0);
});
