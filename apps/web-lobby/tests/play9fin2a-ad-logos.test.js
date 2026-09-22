/**
 * play9fin2a — ad logo slots on skin / card face / table felt / clothes
 * Visible in play; must NOT block clicks (pointer-events: none).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const styles = readFileSync(join(root, 'src/styles.css'), 'utf8');
const jj = readFileSync(join(root, 'src/jj-table.css'), 'utf8');
const branding = readFileSync(join(root, 'src/shared/branding.js'), 'utf8');
const charLogos = readFileSync(join(root, 'src/shared/char-logos.js'), 'utf8');

test('cache play9gd1c', () => {
  assert.match(html, /app\.js\?v=play9gd1c/);
  assert.match(html, /styles\.css\?v=play9gd1c/);
  assert.match(html, /jj-table\.css\?v=play9gd1c/);
});

test('DOM hosts four ad surfaces: skin, card face, felt, clothes', () => {
  assert.match(html, /data-ad-slot="doudizhu-table-skin"/);
  assert.match(html, /data-ad-slot="doudizhu-card-face"/);
  assert.match(html, /data-ad-slot="doudizhu-table-center"/);
  assert.match(html, /data-ad-slot="doudizhu-costume-seat-0"/);
  assert.match(html, /data-ad-slot="doudizhu-costume-seat-1"/);
  assert.match(html, /data-ad-slot="doudizhu-costume-seat-2"/);
});

test('branding enables skin + card-face + felt + costume', () => {
  assert.match(branding, /play9fin2a/);
  assert.match(branding, /PLACEHOLDER_AD_LOGO/);
  assert.match(branding, /AD_LOGO_SURFACES/);
  assert.match(branding, /table-skin\|card-back\|card-face/);
  assert.match(branding, /lobby-\/\.test\(id\)\) return false/);
});

test('defaultBrandPlacements enables play surfaces (unit)', async () => {
  const mod = await import('../src/shared/branding.js');
  const list = mod.defaultBrandPlacements();
  const by = Object.fromEntries(list.map((p) => [p.slotId, p]));
  for (const id of [
    'doudizhu-table-skin',
    'doudizhu-card-face',
    'doudizhu-card-face-hand',
    'doudizhu-table-center',
    'doudizhu-costume-seat-0',
    'multi-table-skin',
    'multi-card-face',
    'multi-table-center',
  ]) {
    assert.equal(by[id]?.enabled, true, id);
    assert.ok(by[id]?.logoUrl, id + ' logoUrl');
  }
  assert.equal(by['lobby-top-banner']?.enabled, false);
});

test('CSS shows logo slots and forces pointer-events none', () => {
  assert.match(styles, /play9fin2a — ad logo slots/);
  assert.match(styles, /pointer-events:\s*none !important/);
  assert.match(styles, /\.char-chest-logos/);
  assert.doesNotMatch(
    styles,
    /\[data-ad-slot="doudizhu-card-face"\][\s\S]{0,180}display:\s*none !important;[\s\S]{0,120}opacity:\s*0 !important;/,
  );
});

test('JJ stage keeps ad logo slots visible (decorative)', () => {
  assert.match(jj, /play9fin2a/);
  assert.match(jj, /table-skin-ad:not\(\[hidden\]\)/);
  assert.match(jj, /pointer-events:\s*none !important/);
  assert.match(jj, /qq-bean-line/);
});

test('clothes chest logos module present', () => {
  assert.match(charLogos, /char-chest-logos/);
  assert.match(charLogos, /mountCharLogos/);
  assert.match(charLogos, /BUILTIN_LOGO_SRC/);
});

test('no Stars / chain pay / withdraw introduced', () => {
  assert.doesNotMatch(branding, /Telegram Stars|提现|链上支付/);
});
