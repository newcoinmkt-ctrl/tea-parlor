import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AVATAR_ITEMS,
  AVATAR_OUTFITS,
  DEFAULT_EQUIPMENT,
  DEV_DEFAULT_INVENTORY,
  applyOutfit,
  cancelPreview,
  equipItem,
  initializeDefaultAvatar,
  resetToDefault,
  saveEquipment,
  listSkinItems,
  unequipItem,
  validateEquipment,
} from '../src/index.js';

test('initializeDefaultAvatar returns legal required clothing', () => {
  const avatar = initializeDefaultAvatar();
  assert.equal(avatar.equipment.top, 'default_top');
  assert.equal(avatar.equipment.bottom, 'default_bottom');
  assert.equal(avatar.equipment.shoes, 'default_shoes');
});

test('equip item replaces same-slot item', () => {
  const first = equipItem(DEFAULT_EQUIPMENT, 'top_black');
  assert.equal(first.ok, true);
  assert.equal(first.equipment.top, 'top_black');

  const second = equipItem(first.equipment, 'top_white');
  assert.equal(second.ok, true);
  assert.equal(second.equipment.top, 'top_white');
});

test('unequip required slot restores default instead of null', () => {
  const equipped = equipItem(DEFAULT_EQUIPMENT, 'top_black').equipment;
  const result = unequipItem(equipped, 'top');
  assert.equal(result.ok, true);
  assert.equal(result.equipment.top, 'default_top');
});

test('apply outfit then change one item keeps other pieces', () => {
  const outfit = AVATAR_OUTFITS.find((item) => item.id === 'outfit_gentleman');
  const applied = applyOutfit(DEFAULT_EQUIPMENT, outfit);
  assert.equal(applied.ok, true);
  assert.equal(applied.equipment.top, 'top_suit');
  assert.equal(applied.equipment.bottom, 'bottom_suit');
  assert.equal(applied.equipment.shoes, 'shoes_leather');
  assert.equal(applied.equipment.headwear, 'hat_gentleman');

  const changed = equipItem(applied.equipment, 'hat_cap');
  assert.equal(changed.equipment.top, 'top_suit');
  assert.equal(changed.equipment.headwear, 'hat_cap');
});

test('validateEquipment rejects unowned item', () => {
  const equipment = { ...DEFAULT_EQUIPMENT, top: 'top_suit' };
  const result = validateEquipment(equipment, {
    catalog: AVATAR_ITEMS,
    inventory: ['default_top', 'default_bottom', 'default_shoes'],
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'item_not_owned');
});

test('exclusiveGroup restores top and bottom defaults for full body item', () => {
  const equipped = equipItem(DEFAULT_EQUIPMENT, 'full_body_dress');
  assert.equal(equipped.ok, true);
  assert.equal(equipped.equipment.full_body, 'full_body_dress');
  assert.equal(equipped.equipment.top, 'default_top');
  assert.equal(equipped.equipment.bottom, 'default_bottom');
});

test('preview cancel does not mutate saved state and save promotes preview', () => {
  const saved = { ...DEFAULT_EQUIPMENT };
  const preview = equipItem(saved, 'top_black').equipment;
  assert.equal(saved.top, 'default_top');
  assert.equal(preview.top, 'top_black');

  const canceled = cancelPreview(saved);
  assert.equal(canceled.top, 'default_top');

  const savedResult = saveEquipment(preview, {
    catalog: AVATAR_ITEMS,
    inventory: [...Object.values(DEFAULT_EQUIPMENT).filter(Boolean), 'top_black'],
  });
  assert.equal(savedResult.ok, true);
  assert.equal(savedResult.savedEquipment.top, 'top_black');
});

test('resetToDefault clears optional slots and keeps required defaults', () => {
  const reset = resetToDefault();
  assert.equal(reset.top, 'default_top');
  assert.equal(reset.bottom, 'default_bottom');
  assert.equal(reset.shoes, 'default_shoes');
  assert.equal(reset.glasses, null);
  assert.equal(reset.table_skin, 'table_classic_green');
  assert.equal(reset.card_back, 'cardback_classic_green');
  assert.equal(reset.avatar_frame, 'frame_default');
});

test('skin equipment supports table cloth card back and avatar frame', () => {
  let equipment = DEFAULT_EQUIPMENT;
  const table = equipItem(equipment, 'table_tea_partner');
  assert.equal(table.ok, true);
  equipment = table.equipment;
  assert.equal(equipment.table_skin, 'table_tea_partner');

  const cardBack = equipItem(equipment, 'cardback_chain_badge');
  assert.equal(cardBack.ok, true);
  equipment = cardBack.equipment;
  assert.equal(equipment.card_back, 'cardback_chain_badge');

  const frame = equipItem(equipment, 'frame_partner_badge');
  assert.equal(frame.ok, true);
  assert.equal(frame.equipment.avatar_frame, 'frame_partner_badge');

  const items = listSkinItems();
  assert.ok(items.some((item) => item.category === 'table_skin' && item.coBranded));
  assert.ok(items.some((item) => item.category === 'card_back' && item.skinCategory === 'chain_memorial'));
  assert.ok(items.some((item) => item.category === 'avatar_frame'));
});

test('invalid skin ids are rejected without mutating valid preview equipment', () => {
  const valid = equipItem(DEFAULT_EQUIPMENT, 'table_night_gold');
  assert.equal(valid.ok, true);
  const invalidEquip = equipItem(valid.equipment, 'not_a_skin');
  assert.equal(invalidEquip.ok, false);
  assert.equal(valid.equipment.table_skin, 'table_night_gold');

  const result = saveEquipment({ ...valid.equipment, table_skin: 'broken_skin_id' }, {
    catalog: AVATAR_ITEMS,
    inventory: DEV_DEFAULT_INVENTORY,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid_item');
  assert.equal(result.slot, 'table_skin');
});
