import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePublicPath } from '../server.js';

const srcRoot = fileURLToPath(new URL('../src/', import.meta.url));

function walkJs(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) walkJs(full, acc);
    else if (name.endsWith('.js')) acc.push(full);
  }
  return acc;
}

function vendorImportsFrom(file) {
  const text = readFileSync(file, 'utf8');
  return [...text.matchAll(/['"`](\/vendor\/[a-z0-9-]+\/[^'"`?]+)['"`]/gi)].map((m) => m[1]);
}

test('H5 /vendor imports resolve to real package files', () => {
  const refs = new Set();
  for (const file of walkJs(srcRoot)) {
    for (const pathname of vendorImportsFrom(file)) refs.add(pathname);
  }

  assert.ok(refs.has('/vendor/avatar-system/index.js'));
  assert.ok(refs.has('/vendor/character-catalog/index.js'));
  assert.ok(refs.size >= 3, `expected vendor imports, got ${[...refs]}`);

  for (const pathname of refs) {
    const filePath = resolvePublicPath(pathname);
    assert.ok(filePath && existsSync(filePath), `404-risk vendor path ${pathname}`);
  }
});

test('newly added packages are served without an allowlist entry', () => {
  const filePath = resolvePublicPath('/vendor/common/index.js');
  assert.ok(filePath && existsSync(filePath));
});

test('vendor path cannot escape packages src', () => {
  assert.equal(resolvePublicPath('/vendor/avatar-system/../common/index.js'), null);
  assert.equal(resolvePublicPath('/vendor/not-a-real-pkg/index.js'), null);
});
