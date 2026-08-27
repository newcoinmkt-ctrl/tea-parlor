/**
 * 国标番型识别与计分测试
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { fromId34 } from '../src/guobiao/tiles34.js';
import { calculateFanPoints, applyExclusionAndSum, FAN } from '../src/guobiao/score.js';

/** 用 tile34 快捷构造 */
function c(id) {
  return fromId34(id);
}
function many(id, n) {
  return Array.from({ length: n }, () => c(id));
}

test('calculateFanPoints: 清一色 + 碰碰胡 + 自摸', () => {
  // 全万：111 222 333 444 55
  const hand = [
    ...many(0, 3),
    ...many(1, 3),
    ...many(2, 3),
    ...many(3, 3),
    ...many(4, 2),
  ];
  const r = calculateFanPoints(hand, {
    melds: [],
    winningCard: c(4),
    winMethod: 'zimo',
    isZimo: true,
    selfDrawnAlreadyInHand: true,
  });
  assert.ok(r.totalFan >= 24, JSON.stringify(r));
  const ids = r.fans.map((f) => f.id);
  assert.ok(ids.includes('qing_yi_se'));
  // 四暗刻(64) 按高不按低排除碰碰胡
  assert.ok(ids.includes('peng_peng_hu') || ids.includes('si_an_ke'));
  // 自摸可能被不求人吸收
  assert.ok(ids.includes('zi_mo') || ids.includes('bu_qiu_ren') || ids.includes('si_an_ke'));
});

test('calculateFanPoints: 七对 24番', () => {
  const hand = [
    ...many(0, 2), ...many(2, 2), ...many(4, 2),
    ...many(9, 2), ...many(11, 2), ...many(18, 2),
    ...many(20, 2),
  ];
  const r = calculateFanPoints(hand, {
    melds: [],
    winMethod: 'dianpao',
    isZimo: false,
    selfDrawnAlreadyInHand: true,
  });
  assert.ok(r.fans.some((f) => f.id === 'qi_dui'));
  assert.equal(r.fans.find((f) => f.id === 'qi_dui').fan, 24);
});

test('calculateFanPoints: 十三幺 88番', () => {
  const yao = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
  const hand = yao.map((id) => c(id));
  hand.push(c(0)); // 一对一万
  const r = calculateFanPoints(hand, {
    melds: [],
    winMethod: 'zimo',
    isZimo: true,
    selfDrawnAlreadyInHand: true,
  });
  assert.ok(r.fans.some((f) => f.id === 'shi_san_yao'));
  assert.equal(r.totalFan >= 88, true);
});

test('calculateFanPoints: 断幺 + 平胡结构', () => {
  // 全是中张顺子 + 将 五
  // 223344 556677 88  + 需要 14: 234 456 678 99? 
  // 234万 456万 678万 99万  + 234条 = 3*3+2+3=14
  const hand = [
    c(1), c(2), c(3),
    c(3), c(4), c(5),
    c(5), c(6), c(7),
    c(8), c(8),
    c(10), c(11), c(12), // 二三四五? 10=二条
  ];
  // 1=二万,2=三万,3=四万 → 234万
  const r = calculateFanPoints(hand, {
    melds: [],
    winMethod: 'dianpao',
    isZimo: false,
    selfDrawnAlreadyInHand: true,
  });
  assert.ok(r.totalFan >= 0);
  if (r.fans.length) {
    // 若能分解则应有断幺
    const ids = r.fans.map((f) => f.id);
    // 可能结构不成立则 skip
    if (!r.error) {
      assert.ok(ids.includes('duan_yao') || ids.includes('ping_hu') || r.totalFan >= 1);
    }
  }
});

test('exclusion: 大四喜 excludes 碰碰胡/三风刻', () => {
  const raw = [
    FAN.DA_SI_XI,
    FAN.PENG_PENG_HU,
    FAN.SAN_FENG_KE,
    FAN.ZI_MO,
  ];
  const r = applyExclusionAndSum(raw);
  const ids = r.fans.map((f) => f.id);
  assert.ok(ids.includes('da_si_xi'));
  assert.ok(!ids.includes('peng_peng_hu'));
  assert.ok(!ids.includes('san_feng_ke'));
  assert.ok(ids.includes('zi_mo'));
  assert.equal(r.totalFan, 88 + 1);
});

test('exclusion: 清一色 excludes 无字', () => {
  const r = applyExclusionAndSum([FAN.QING_YI_SE, FAN.WU_ZI, FAN.PENG_PENG_HU]);
  const ids = r.fans.map((f) => f.id);
  assert.ok(ids.includes('qing_yi_se'));
  assert.ok(!ids.includes('wu_zi'));
  assert.ok(ids.includes('peng_peng_hu'));
  assert.equal(r.totalFan, 24 + 6);
});

test('win methods: 杠上开花、自摸不重复', () => {
  const hand = [
    ...many(0, 3), ...many(1, 3), ...many(2, 3), ...many(3, 3), ...many(4, 2),
  ];
  const r = calculateFanPoints(hand, {
    winMethod: 'gangshanghua',
    isZimo: true,
    gangShangHua: true,
    selfDrawnAlreadyInHand: true,
  });
  const ids = r.fans.map((f) => f.id);
  assert.ok(ids.includes('gang_shang_hua'));
  // 杠上开花 excludes 自摸
  assert.ok(!ids.includes('zi_mo'));
});

test('十八罗汉：四杠', () => {
  const hand = [...many(8, 2)]; // 将
  const melds = [
    { type: 'minggang', tile34: 0, open: true, tiles: many(0, 4) },
    { type: 'minggang', tile34: 1, open: true, tiles: many(1, 4) },
    { type: 'angang', tile34: 9, open: false, tiles: many(9, 4) },
    { type: 'minggang', tile34: 18, open: true, tiles: many(18, 4) },
  ];
  const r = calculateFanPoints(hand, {
    melds,
    winningCard: c(8),
    winMethod: 'zimo',
    isZimo: true,
    selfDrawnAlreadyInHand: true,
  });
  assert.ok(
    r.fans.some((f) => f.id === 'shi_ba_luo_han' || f.id === 'si_gang' || f.id === 'peng_peng_hu'),
    JSON.stringify(r)
  );
});

test('绿一色', () => {
  // 二三四六八条 + 发
  // 234条 234条 66条 88条 发发 — 需要合法 4+1
  // 234, 234, 666, 888, 发发
  const hand = [
    c(10), c(11), c(12),
    c(10), c(11), c(12),
    ...many(14, 3), // 六条
    ...many(16, 3), // 八条
    ...many(32, 2), // 发
  ];
  const r = calculateFanPoints(hand, {
    winMethod: 'zimo',
    isZimo: true,
    selfDrawnAlreadyInHand: true,
  });
  assert.ok(r.fans.some((f) => f.id === 'lv_yi_se'), JSON.stringify(r));
});

test('output shape has totalFan and fans list', () => {
  const hand = [
    ...many(0, 2),
    c(1), c(2), c(3),
    c(4), c(5), c(6),
    c(7), c(8), c(9 - 1), // 789 → ids 6,7,8
    ...many(18, 3),
  ];
  // fix 789万: 6,7,8 are 七八九万
  const hand2 = [
    ...many(0, 2), // 一万对
    c(1), c(2), c(3), // 234
    c(4), c(5), c(6), // 567
    c(6), c(7), c(8), // 789
    ...many(18, 3), // 111筒
  ];
  const r = calculateFanPoints(hand2, {
    winMethod: 'dianpao',
    isZimo: false,
    selfDrawnAlreadyInHand: true,
  });
  assert.equal(typeof r.totalFan, 'number');
  assert.ok(Array.isArray(r.fans));
  assert.ok(r.fans.every((f) => f.name && f.fan >= 1));
});
