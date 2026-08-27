import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AVATAR_ITEMS,
  DEFAULT_EQUIPMENT,
  applyOutfit,
  applyThemeToEquipment,
  clothingIdForTheme,
  equipItem,
  isClothingStyleItem,
  listClothingStyles,
  listEquippedOverlays,
  resolveAppearance,
  resolveClothingStyle,
  themeIdForClothing,
} from '../src/index.js';

test('clothing styles are catalogued and mapped to hall skins', () => {
  const styles = listClothingStyles();
  assert.ok(styles.length >= 12);
  assert.equal(clothingIdForTheme('classic-green'), 'cloth_felt_green');
  assert.equal(themeIdForClothing('cloth_tea_red'), 'chinese-red');
  assert.equal(isClothingStyleItem(AVATAR_ITEMS.find((item) => item.id === 'cloth_neon')), true);
});

test('clothing style prefers same-person outfit when the character has it', () => {
  const character = {
    id: 'f_ea_black',
    kind: 'female',
    costumes: { default: 'base.png', gold_dress: 'gold.png' },
  };
  const resolved = resolveClothingStyle('cloth_night_gold', character);
  assert.equal(resolved.ok, true);
  assert.equal(resolved.mode, 'outfit');
  assert.equal(resolved.costumeId, 'gold_dress');
  assert.equal(resolved.themeId, 'dark-gold');
});

test('clothing style uses the character default outfit when it matches preferOutfit', () => {
  const character = {
    id: 'f_ea_black',
    kind: 'female',
    defaultOutfit: 'black_dress',
    costumes: { default: 'black.png', red_dress: 'red.png' },
  };
  const resolved = resolveClothingStyle('cloth_neon', character);
  assert.equal(resolved.ok, true);
  assert.equal(resolved.mode, 'outfit');
  assert.equal(resolved.costumeId, 'default');
});

test('clothing style falls back to dye when character has no exclusive outfit', () => {
  const character = {
    id: 'tea_boy',
    kind: 'male',
    costumes: { default: 'boy.png' },
  };
  const resolved = resolveClothingStyle('cloth_tea_red', character);
  assert.equal(resolved.ok, true);
  assert.equal(resolved.mode, 'dye');
  assert.equal(resolved.costumeId, 'cloth_tea_red');
  assert.equal(resolved.dyeColor, '#b83a3a');
});

test('equipped overlays stack on the original character rather than replacing it', () => {
  let equipment = DEFAULT_EQUIPMENT;
  equipment = equipItem(equipment, 'hat_cap').equipment;
  equipment = equipItem(equipment, 'glasses_sun').equipment;
  equipment = equipItem(equipment, 'acc_bowtie').equipment;
  const overlays = listEquippedOverlays(equipment);
  assert.deepEqual(overlays.map((layer) => layer.slot), ['headwear', 'glasses', 'accessory']);
  assert.equal(overlays.every((layer) => layer.asset.endsWith('.svg')), true);
});

test('theme application writes clothing style into full_body without dropping accessories', () => {
  const equipped = equipItem(DEFAULT_EQUIPMENT, 'hat_gentleman').equipment;
  const next = applyThemeToEquipment(equipped, 'cyber-neon');
  assert.equal(next.ok, true);
  assert.equal(next.equipment.full_body, 'cloth_neon');
  assert.equal(next.equipment.headwear, 'hat_gentleman');
});

test('resolveAppearance exposes dye, costume and overlay layers together', () => {
  const outfit = AVATAR_ITEMS.find((item) => item.id === 'cloth_felt_green');
  assert.ok(outfit);
  const applied = applyOutfit(DEFAULT_EQUIPMENT, {
    id: 'outfit_felt_green',
    items: { full_body: 'cloth_felt_green', accessory: 'acc_bowtie' },
  });
  const appearance = resolveAppearance({
    character: { id: 'male_hero', kind: 'male', costumes: { default: 'suit.png', casual: 'casual.png' } },
    costumeId: 'default',
    equipment: applied.equipment,
  });
  assert.equal(appearance.clothingStyleId, 'cloth_felt_green');
  assert.equal(appearance.costumeId, 'casual');
  assert.equal(appearance.overlays.some((layer) => layer.id === 'acc_bowtie'), true);
});
