import test from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTERS, characterIds, publicCharacters } from '../src/index.js';

test('character catalog has unique ids covering female male animal', () => {
  const ids = characterIds();
  assert.equal(ids.length, new Set(ids).size);
  assert.ok(ids.includes('f_ea_red_qipao'));
  assert.ok(ids.includes('male_hero'));
  assert.ok(ids.includes('animal_panda'));
  const groups = new Set(CHARACTERS.map((c) => c.group));
  assert.deepEqual([...groups].sort(), ['动物', '女性', '男性']);
});

test('publicCharacters matches ops appearance fields', () => {
  const pub = publicCharacters();
  assert.equal(pub.length, CHARACTERS.length);
  assert.deepEqual(Object.keys(pub[0]).sort(), ['enabled', 'group', 'id', 'name', 'sort']);
  assert.equal(pub[0].enabled, true);
});

test('frontend and ops see the same 52 character ids', () => {
  assert.equal(CHARACTERS.length, 52);
  const female = CHARACTERS.filter((c) => c.group === '女性').length;
  const male = CHARACTERS.filter((c) => c.group === '男性').length;
  const animal = CHARACTERS.filter((c) => c.group === '动物').length;
  assert.equal(female, 17);
  assert.equal(male, 17);
  assert.equal(animal, 18);
});

test('same-person outfits only reference files, never other character ids', () => {
  for (const item of CHARACTERS) {
    for (const [slot, file] of Object.entries(item.outfits)) {
      assert.match(file, /\.png$/);
      assert.ok(slot);
      assert.equal(file.includes(item.id), false);
    }
  }
});
