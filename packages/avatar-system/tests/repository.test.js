import test from 'node:test';
import assert from 'node:assert/strict';

import { createAvatarRepository } from '../src/index.js';

test('repository separates item catalog, user inventory, and equipment', () => {
  const repo = createAvatarRepository({ clock: () => '2026-08-21T00:00:00.000Z' });
  const catalog = repo.getCatalog();
  const inventory = repo.getInventory('USER001');
  const equipment = repo.getEquipment('USER001');

  assert.ok(catalog.some((item) => item.id === 'top_suit' && item.owned == null));
  assert.ok(inventory.some((entry) => entry.itemId === 'default_top'));
  assert.equal(equipment.equipment.top, 'default_top');
});

test('repository refuses to save unowned or invalid equipment', () => {
  const repo = createAvatarRepository({ defaultInventory: ['default_top', 'default_bottom', 'default_shoes'] });

  assert.equal(
    repo.saveEquipment('USER002', { top: 'legendary_top_not_owned', bottom: 'default_bottom', shoes: 'default_shoes' }).reason,
    'invalid_item',
  );
  assert.equal(
    repo.saveEquipment('USER002', { top: 'top_suit', bottom: 'default_bottom', shoes: 'default_shoes' }).reason,
    'item_not_owned',
  );
});

test('repository saves valid equipment atomically', () => {
  const repo = createAvatarRepository({ defaultInventory: ['default_top', 'default_bottom', 'default_shoes', 'top_suit'] });
  const result = repo.saveEquipment('USER003', {
    top: 'top_suit',
    bottom: 'default_bottom',
    shoes: 'default_shoes',
  });
  assert.equal(result.ok, true);
  assert.equal(repo.getEquipment('USER003').equipment.top, 'top_suit');
});
