/**
 * play9fin3b — configurable ads: JSON / env / static manifest
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRuntimeConfigScript } from '../server.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const branding = readFileSync(join(root, 'src/shared/branding.js'), 'utf8');
const ops = readFileSync(join(root, 'src/net/ops-client.js'), 'utf8');
const adsFeat = readFileSync(join(root, 'src/features/ads/index.js'), 'utf8');
const styles = readFileSync(join(root, 'src/styles.css'), 'utf8');
const manifestPath = join(root, 'public/ads/manifest.json');

test('cache play9fin7a', () => {
  assert.match(html, /app\.js\?v=play9fin7a/);
});

test('static ads manifest covers skin/card/felt/clothes', () => {
  assert.equal(existsSync(manifestPath), true);
  const man = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.ok(Array.isArray(man.placements));
  const kinds = new Set(man.placements.map((p) => p.surfaceKind));
  for (const k of ['skin', 'card', 'felt', 'clothes']) {
    assert.ok(kinds.has(k), `missing surfaceKind ${k}`);
  }
  for (const p of man.placements) {
    assert.ok(p.logoUrl, p.slotId);
    assert.ok(p.landingUrl, p.slotId);
  }
});

test('resolveAdsUrl + inline config + normalizeAdPlacement', () => {
  assert.match(ops, /play9fin3b/);
  assert.match(ops, /resolveInlineAdsConfig/);
  assert.match(ops, /public\/ads\/manifest\.json/);
  assert.match(branding, /normalizeAdPlacement/);
  assert.match(branding, /PLACEHOLDER_AD_LOGO/);
  assert.match(branding, /fallbackApplied|onerror|error/);
  assert.match(adsFeat, /resolveInlineAdsConfig/);
  assert.match(adsFeat, /inlineConfig/);
});

test('runtime injects TEA_PARLOR_ADS_URL and ADS_CONFIG', () => {
  const js = buildRuntimeConfigScript({
    NODE_ENV: 'production',
    COLYSEUS_URL: 'wss://example',
    ADS_PUBLIC_URL: 'https://cdn.example/ads.json',
    ADS_CONFIG_JSON: JSON.stringify({ brand: { name: 'ETH' }, placements: [] }),
  });
  assert.match(js, /TEA_PARLOR_ADS_URL = "https:\/\/cdn\.example\/ads\.json"/);
  assert.match(js, /TEA_PARLOR_ADS_CONFIG = \{/);
  assert.match(js, /"name":"ETH"/);
});

test('normalizeAdPlacement unit: swappable image+link + placeholder', async () => {
  const mod = await import('../src/shared/branding.js');
  const row = mod.normalizeAdPlacement({
    slotId: 'doudizhu-table-skin',
    surface: 'table',
    logoUrl: './public/assets/logos/eth.svg',
    landingUrl: 'https://ethereum.org',
    advertiserName: 'ETH',
  });
  assert.equal(row.logoUrl, './public/assets/logos/eth.svg');
  assert.equal(row.landingUrl, 'https://ethereum.org');
  assert.equal(row.advertiserName, 'ETH');
  const empty = mod.normalizeAdPlacement({ slotId: 'x', surface: 'card' });
  assert.equal(empty.logoUrl, mod.PLACEHOLDER_AD_LOGO);
});

test('pointer-events none preserved; no Stars', () => {
  assert.match(styles, /pointer-events:\s*none !important/);
  assert.doesNotMatch(branding, /Telegram Stars|提现/);
});

test('preserve --tg-vh', () => {
  const orient = readFileSync(join(root, 'src/net/table-orient.js'), 'utf8');
  assert.match(orient, /--tg-vh/);
  assert.doesNotMatch(orient, /Math\.max\([^)]*innerHeight/);
});
