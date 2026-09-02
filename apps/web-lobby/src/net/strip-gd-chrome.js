/** Tear down Guandan HUD so Mahjong / ZJH / DDZ never inherit 级牌 / 花色 / 理牌. */

export const GD_CHROME_SEL = ".gd-toolbar,.gd-level-chip,.gd-remain-meter,.gd-again-pill";
export const GD_HAND_SEL = ".gd-card,.gd-col,.gd-row-break,.gd-bomb-tag";

export function stripGuandanChrome(root) {
  if (!root || typeof root.querySelectorAll !== "function") return 0;
  let n = 0;
  root.querySelectorAll(GD_CHROME_SEL).forEach((el) => {
    el.remove();
    n += 1;
  });
  const hand = typeof root.querySelector === "function" ? root.querySelector("#mgHand") : null;
  if (hand && typeof hand.querySelectorAll === "function") {
    hand.querySelectorAll(GD_HAND_SEL).forEach((el) => {
      el.remove();
      n += 1;
    });
  }
  return n;
}

export function stripGuandanChromeFromDocument(doc = globalThis.document) {
  if (!doc || typeof doc.getElementById !== "function") return 0;
  const mg = doc.getElementById("multiGameView") || doc;
  return stripGuandanChrome(mg);
}
