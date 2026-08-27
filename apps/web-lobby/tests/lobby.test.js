import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FORBIDDEN_MONEY_COPY = /真金|USDT|充值|提现|预存|兑换|模拟到账|链上|转账|收款|试玩金|真实资金|真钱|USDT 可|结算余额/;

test('lobby first screen contains real game lobby content', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(html, /茶馆/);
  assert.match(html, /茶馆主房间/);
  assert.match(html, /home-icon-grid|home-tabbar|home-hero/);
  assert.match(html, /游戏类型选择/);
  assert.match(html, /data-lobby-view="home"/);
  assert.match(html, /data-lobby-view="games"/);
  assert.match(html, /data-lobby-view="rooms"/);
  assert.match(html, /data-lobby-view="chain"/);
  assert.match(html, /链游中心/);
  assert.match(html, /影子积分|赛季积分|皮肤碎片|链游纪念资产/);
  assert.match(html, /测试网|规划中|合规后开放/);
  assert.match(html, /NFT 皮肤占位/);
  assert.match(html, /模拟绑定钱包|模拟签名/);
  assert.match(html, /data-lobby-action="open-games"/);
  assert.match(html, /data-lobby-action="chain"/);
  assert.match(html, /data-side-game="doudizhu"/);
  assert.match(html, /data-side-game="texas"/);
  assert.match(html, /data-side-game="zhajinhua"/);
  assert.match(html, /data-side-game="real"/);
  assert.match(html, /data-side-game="mahjong"/);
  assert.match(html, /data-side-game="guandan"/);
  assert.match(html, /data-side-game="blackjack"/);
  assert.match(html, /二十一点/);
  assert.match(html, /data-room-game="blackjack"/);
  assert.match(html, /data-game-room="blackjack"/);
  assert.match(html, /data-game="guandan"/);
  assert.match(html, /data-room-game="guandan"/);
  assert.match(html, /data-game-room="guandan"/);
  assert.match(html, /data-gd=/);
  assert.match(html, /掼蛋/);
  assert.doesNotMatch(html, /data-side-game="other"/);
  assert.doesNotMatch(html, /其它游戏/);
  assert.match(html, /更多游戏/);
  assert.match(html, /variant-tabs/);
  assert.match(html, /金币/);
  assert.doesNotMatch(html, /道具元宝|元宝/);
  assert.match(html, /gold-coin-icon|coin-mark/);
  assert.match(html, /每天 4 次 · 每次 4,000/);
  assert.match(html, /斗地主人机牌桌/);
  assert.match(html, /data-ad-slot="doudizhu-table-center"/);
  assert.match(html, /data-ad-slot="doudizhu-table-rail-left"/);
  assert.match(html, /data-ad-slot="doudizhu-table-rail-right"/);
  assert.match(html, /data-ad-slot="doudizhu-costume-seat-0"/);
  assert.match(html, /data-ad-slot="doudizhu-costume-seat-1"/);
  assert.match(html, /data-ad-slot="doudizhu-costume-seat-2"/);
  assert.doesNotMatch(html, /data-ad-slot="doudizhu-costume-left"/);
  assert.doesNotMatch(html, /data-ad-slot="doudizhu-costume-right"/);
  assert.doesNotMatch(html, /data-ad-slot="doudizhu-costume-self"/);
  assert.match(html, /斗地主/);
  assert.match(html, /德州扑克/);
  assert.match(html, /texasTableView/);
  assert.match(html, /data-game="texas"/);
  assert.match(html, /链游测试区/);
  assert.match(html, /data-currency="crypto"/);
  assert.match(html, /赛季积分/);
  assert.match(html, /show-card|show-art|real-show-grid/);
  assert.match(html, /炸金花/);
  assert.match(html, /二人麻将/);
  assert.match(html, /四人麻将/);
  assert.match(html, /血流成河/);
  assert.match(html, /血战到底/);
  assert.match(html, /麻将/);
  assert.match(html, /multiGameView/);
  assert.match(html, /data-game="zhajinhua"/);
  assert.match(html, /data-room-game="zhajinhua"/);
  assert.match(html, /data-room-game="real"/);
  assert.doesNotMatch(html, /data-room-game="other"/);
  assert.match(html, /data-game-room="zhajinhua"/);
  assert.match(html, /更多游戏 · 金币快捷|更多游戏/);
  assert.match(html, /data-zjh=/);
  assert.match(html, /data-mj-mode="xuezhan"/);
  assert.match(html, /data-mj-mode="siren"/);
  assert.match(html, /data-game-room="mahjong"/);
  assert.match(html, /不洗牌/);
  assert.match(html, /欢乐经典/);
  assert.match(html, /天地癞子/);
  assert.match(html, /连炸|data-ddz-variant="lianzha"/);
  assert.match(html, /doubleControls|data-double/);
  assert.match(html, /ddzRoomGrid|data-ddz-variant/);
  assert.match(html, /ddzVariantTabs/);
  assert.match(html, /src\/app\.js/);
  assert.match(html, /public\/characters/);
  // 锄大D 已下线
  assert.doesNotMatch(html, /data-side-game="chudadi"/);
  assert.doesNotMatch(html, /data-game="chudadi"/);
  assert.doesNotMatch(html, /data-room-game="chudadi"/);
  assert.doesNotMatch(html, /克隆合集|克隆候选/);
  // 赛季积分账本：测试码 + 测试编号 + 发放（内部演示账本）
  assert.match(html, /赛季积分|usdtRechargePanel|recharge-usdt|补给中心/);
  assert.match(html, /rechargeQrCanvas|rechargeAddressShow|模拟发放|测试编号/);
  assert.match(html, /rc-summary|rc-main|rc-deposit/);
  assert.doesNotMatch(html, /营销|立即购买|真实资产结算/);
  assert.doesNotMatch(html, FORBIDDEN_MONEY_COPY);
  assert.doesNotMatch(html, /external\/github-candidates|GameScreenshot|mysqldb|mongodb|openinggame\/web|openinggame\/server/);

  const js = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(js, /DAILY_CLAIM_LIMIT = 4/);
  assert.match(js, /DAILY_CLAIM_AMOUNT = 4000/);
  assert.match(js, /startRoom/);

  const branding = readFileSync(new URL('../src/shared/branding.js', import.meta.url), 'utf8');
  assert.match(branding, /doudizhu-table-rail-left/);
  assert.match(branding, /doudizhu-table-rail-right/);
  assert.match(branding, /doudizhu-costume-seat-0/);
  assert.match(branding, /doudizhu-costume-seat-1/);
  assert.match(branding, /doudizhu-costume-seat-2/);
  assert.match(branding, /assetTheme/);
  assert.match(js, /startMahjong/);
  assert.match(js, /startZhajinhua/);
  assert.match(js, /startGuanDan/);
  assert.match(js, /GUANDAN_TABLES|createGuanDanUI/);
  assert.match(js, /startBlackjack/);
  assert.match(js, /BLACKJACK_TABLES|createBlackjackUI/);
  assert.match(js, /fetchChainAssets|renderChainCenter|CHAIN_CENTER_POLICY|internal_mock_only_no_chain_transaction/);
  assert.match(js, /DDZ_VARIANTS|renderDdzRooms|buxipai|laizi/);
  assert.doesNotMatch(js, /startChudadi|createChudadiUI/);
  assert.match(js, /CRYPTO_SYMBOL/);
  assert.match(js, /CRYPTO_SYMBOL = '赛季积分'/);
  assert.doesNotMatch(js, /convertUsdtToTrial/);
  assert.doesNotMatch(js, FORBIDDEN_MONEY_COPY);
  assert.match(js, /depositUsdt|getUsdtDepositAddress|buyIngotWithUsdt/);
  assert.match(js, /parseHand|canBeat|getHint/);
  assert.match(js, /colyseus|playMode|loadPlayMode/);
  assert.match(js, /syncOpsCatalog|assertCanEnter|resolveAdsUrl/);
  assert.match(js, /opsDisabledCharacters|setEnabledThemes|lobbySkinPicker/);
  assert.match(js, /listClothingStyles|listSkinItems|applyProfileClothingStyle|linkSkinAndClothes|gearPicker/);
  assert.match(js, /cloth_felt_green|cloth_night_gold|acc_bowtie|mountGearOverlays|applyWardrobeSkinItem/);
  assert.match(html, /衣服样式|皮肤与衣服联动|gearPicker|我的衣橱|wardrobeDetailPanel/);
  assert.match(js, /glam_gold|tea_qipao_girl|ink_pure|gold_hero|character-catalog/);
  assert.match(js, /applyResultWithRevenue|quotePlatformFee|gold_table_fee|crypto_winner_fee/);
  assert.match(js, /mountCharLogos|setCostumeLogoConfig|char-chest-logos/);
  assert.match(html, /桌布|牌背|头像框|lobbySkinPicker/);
  assert.match(js, /table_skin|card_back|avatar_frame|广告联名|链游纪念|该皮肤 ID 不存在/);
  const chainSection = html.match(/<section class="panel-page chain-page"[\s\S]*?<\/section>\s*<\/section>/)?.[0] || '';
  assert.ok(chainSection, 'chain center section exists');
  assert.doesNotMatch(chainSection, /充值|提现|真钱场|USDT 入座|USDT 可|收款|转账/);
  assert.doesNotMatch(js, /external\/github-candidates|GameScreenshot|mysqldb|mongodb|openinggame\/web|openinggame\/server/);
});

test('colyseus client assets exist', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /public\/colyseus\/colyseus\.js/);
  const client = readFileSync(new URL('../src/net/colyseus-client.js', import.meta.url), 'utf8');
  assert.match(client, /startColyseusDdzSession|joinOrCreate/);
  const mode = readFileSync(new URL('../src/net/play-mode.js', import.meta.url), 'utf8');
  assert.match(mode, /colyseus|pinus|local/);
  assert.doesNotMatch(mode, /from ['"]@tea-parlor\//);
});

test('playable game modules exist', () => {
  const mj = readFileSync(new URL('../src/games/mahjong/engine.js', import.meta.url), 'utf8');
  const zj = readFileSync(new URL('../src/games/zhajinhua/engine.js', import.meta.url), 'utf8');
  assert.match(mj, /createMahjongTable/);
  assert.match(mj, /xuezhan|xueliu|er|siren/);
  assert.match(mj, /canHu/);
  assert.match(mj, /四人麻将|playerCountForMode/);
  assert.match(mj, /exchange|dingque|换三张|定缺/);
  assert.match(mj, /HU_OUT|HU_STAY|createSichuanDeck/);
  assert.match(zj, /createZhajinhuaTable/);
  assert.match(zj, /evalHand/);
  assert.match(zj, /allIn|ALL_IN|is235|getWinProbability|publicCode/);
});

test('zhajinhua engine playable smoke', async () => {
  const {
    createZhajinhuaTable, evalHand, createCard, compareHands, HandType, is235,
  } = await import('../src/games/zhajinhua/engine.js');

  // 牌型大小
  const triple = evalHand([createCard(14, 0), createCard(14, 1), createCard(14, 2)]);
  assert.equal(triple.type, HandType.TRIPLE);
  assert.equal(triple.name, '豹子');
  const a23 = [createCard(14, 0), createCard(2, 1), createCard(3, 2)];
  const r234 = [createCard(2, 0), createCard(3, 1), createCard(4, 2)];
  assert.ok(compareHands(a23, r234) < 0, 'A23 应小于 234');

  // 235 规则
  const s235 = [createCard(2, 0), createCard(3, 1), createCard(5, 2)];
  assert.equal(is235(s235), true);
  const aaa = [createCard(14, 0), createCard(14, 1), createCard(14, 2)];
  assert.ok(compareHands(s235, aaa, true) > 0, '有豹子时 235 杀豹子');
  assert.ok(compareHands(aaa, s235, false) > 0, '无豹子时豹子大于 235');

  const t = createZhajinhuaTable({ ante: 10, stake: 10, maxRounds: 8 });
  t.deal();
  const s0 = t.snapshot(0);
  assert.equal(s0.hands.length, 3);
  assert.equal(s0.pot, 30);
  assert.equal(s0.phase, 'play');
  assert.ok(s0.publicCode);

  // 完整人机：跟到可比再比牌
  let guard = 0;
  while (t.snapshot(0).phase === 'play' && guard++ < 60) {
    const s = t.snapshot(0);
    const seat = s.current;
    if (s.folded[seat] || s.allIn?.[seat]) {
      t.showdownAll('stuck');
      break;
    }
    if (seat === 0) {
      if (!s.looked[0]) t.look(0);
      const s1 = t.snapshot(0);
      if (!s1.canCompare) {
        const r = t.call(0);
        if (!r.ok && r.canAllIn) t.allIn(0);
      } else {
        const tgt = s1.alive.find((i) => i !== 0 && !s1.folded[i]);
        if (tgt != null) {
          const r = t.compare(0, tgt);
          if (!r.ok && r.canAllIn) t.allIn(0);
          else if (!r.ok) t.call(0);
        } else t.call(0);
      }
    } else {
      if (!s.looked[seat] && Math.random() < 0.5) t.look(seat);
      const r = t.call(seat);
      if (!r.ok && r.canAllIn) t.allIn(seat);
    }
  }
  const end = t.snapshot(0);
  assert.equal(end.phase, 'settle');
  assert.ok(end.winner >= 0 && end.winner <= 2);
  const sum = end.deltas.reduce((a, b) => a + b, 0);
  assert.equal(sum, 0, '零和结算');
});

test('zhajinhua all-in and side pot smoke', async () => {
  const { createZhajinhuaTable, createCard } = await import('../src/games/zhajinhua/engine.js');
  const t = createZhajinhuaTable({ ante: 10, stake: 50, maxRounds: 3, buyIn: 80 });
  t.deal();
  // 短筹全押
  t.state.current = 0;
  const r = t.allIn(0);
  assert.equal(r.ok, true);
  assert.ok(t.state.allIn[0] || t.snapshot(0).allIn[0]);
  // 推进到结算
  let g = 0;
  while (t.snapshot(0).phase === 'play' && g++ < 30) {
    const s = t.snapshot(0);
    const seat = s.current;
    if (s.folded[seat] || s.allIn[seat]) {
      t.showdownAll('test');
      break;
    }
    if (!s.looked[seat]) t.look(seat);
    const cr = t.call(seat);
    if (!cr.ok) t.allIn(seat);
  }
  const end = t.snapshot(0);
  assert.equal(end.phase, 'settle');
  const sum = end.deltas.reduce((a, b) => a + b, 0);
  assert.equal(sum, 0);
});

function playMahjongToEnd(mode, maxSteps = 500) {
  return import('../src/games/mahjong/engine.js').then(async ({ createMahjongTable }) => {
    const { decideMahjongDiscard } = await import('../src/games/mahjong/ai.js');
    const t = createMahjongTable({ mode, stake: 50 });
    t.deal();
    let s = t.snapshot();
    let g = 0;
    while (s.phase !== 'settle' && g++ < maxSteps) {
      if (s.phase === 'exchange') {
        t.autoExchangeIfNeeded();
      } else if (s.phase === 'dingque') {
        t.chooseDingque(0, -1);
      } else if (s.phase === 'call') {
        if (s.callOptions?.canHu) t.humanCall('hu');
        else t.humanCall('pass');
      } else if (s.phase === 'discard' || s.phase === 'draw' || s.phase === 'play') {
        const seat = s.current;
        const hand = s.hands[seat] || [];
        if (!hand.length) break;
        const fallbackId = hand[0]?.id;
        const dec = decideMahjongDiscard(s, seat);
        let ok = false;
        if (dec?.action === 'hu') {
          const r = t.huSelf(seat);
          ok = !!r?.ok;
        } else if (dec?.action === 'gang') {
          const r = t.gangSelf(seat, {
            type: dec.type === 'ming_bu' ? 'ming_bu' : 'an',
            tile: dec.tile,
          });
          ok = !!r?.ok;
        }
        if (!ok) {
          const id = dec?.tileId || fallbackId;
          if (!id) break;
          let r = t.discard(seat, id);
          if (!r?.ok && fallbackId && fallbackId !== id) r = t.discard(seat, fallbackId);
          if (!r?.ok) {
            for (const c of hand) {
              r = t.discard(seat, c.id);
              if (r?.ok) break;
            }
          }
          if (!r?.ok) break;
        }
      } else {
        break;
      }
      s = t.snapshot();
    }
    return s;
  });
}

test('mahjong engine playable smoke', async () => {
  const s = await playMahjongToEnd('er');
  assert.equal(s.playerCount, 2);
  assert.equal(s.phase, 'settle');
});

test('mahjong four-player siren smoke', async () => {
  const { modeName, playerCountForMode, createMahjongTable } = await import('../src/games/mahjong/engine.js');
  assert.equal(playerCountForMode('siren'), 4);
  assert.equal(modeName('siren'), '四人麻将');

  const t = createMahjongTable({ mode: 'siren', stake: 100 });
  t.deal();
  let s0 = t.snapshot();
  assert.equal(s0.playerCount, 4);
  assert.equal(s0.names.length, 4);
  assert.equal(s0.modeName, '四人麻将');
  assert.equal(s0.hands.length, 4);
  assert.ok(s0.hands[0].length >= 13);

  const s = await playMahjongToEnd('siren');
  assert.equal(s.playerCount, 4);
  assert.equal(s.phase, 'settle');
  assert.equal(s.deltas.length, 4);
  if (s.winner >= 0) {
    const sum = s.deltas.reduce((a, b) => a + b, 0);
    assert.equal(sum, 0, '四人结算零和');
  }
});

test('mahjong xuezhan exchange dingque multi-hu smoke', async () => {
  const {
    createMahjongTable,
    modeName,
    PlayerStatus,
    canHu,
    createTile,
    sortMahjongHand,
  } = await import('../src/games/mahjong/engine.js');

  assert.equal(modeName('xuezhan'), '血战到底');
  const t = createMahjongTable({ mode: 'xuezhan', stake: 10 });
  t.deal({ dealer: 0 });
  let s = t.snapshot();
  assert.equal(s.phase, 'exchange');
  assert.equal(s.hands[0].length, 13);
  assert.equal(s.wallLeft, 56); // 108 - 52

  t.autoExchangeIfNeeded();
  s = t.snapshot();
  assert.equal(s.phase, 'dingque');

  t.chooseDingque(0, -1);
  s = t.snapshot();
  assert.equal(s.phase, 'discard');
  assert.ok(s.missingSuits.every((x) => x != null && x >= 0 && x <= 2));
  assert.equal(s.hands[0].length, 14); // 庄摸

  // 构造自摸胡 → 退场
  const winHand = sortMahjongHand([
    createTile(0, 1), createTile(0, 1),
    createTile(0, 2), createTile(0, 2), createTile(0, 2),
    createTile(0, 3), createTile(0, 3), createTile(0, 3),
    createTile(0, 4), createTile(0, 4), createTile(0, 4),
    createTile(0, 5), createTile(0, 5), createTile(0, 5),
  ]);
  t.state.hands[0] = winHand;
  t.state.missingSuits[0] = 1;
  t.state.melds[0] = [];
  t.state.current = 0;
  t.state.phase = 'discard';
  assert.equal(canHu(winHand, 0, 1), true);
  const hu = t.huSelf(0);
  assert.equal(hu.ok, true);
  s = t.snapshot();
  assert.equal(s.status[0], PlayerStatus.HU_OUT);
  assert.equal(s.huOrder[0], 0);
  assert.ok(s.scores[0] > 0);
  // 血战未三家胡则继续
  assert.ok(s.phase === 'discard' || s.phase === 'settle');

  // 整局能跑完
  const end = await playMahjongToEnd('xuezhan');
  assert.equal(end.phase, 'settle');
  assert.equal(end.playerCount, 4);
  const sum = end.deltas.reduce((a, b) => a + b, 0);
  assert.equal(sum, 0, '血战结算零和');
});

test('mahjong xueliu stay and score smoke', async () => {
  const {
    createMahjongTable,
    PlayerStatus,
    createTile,
    sortMahjongHand,
  } = await import('../src/games/mahjong/engine.js');

  const t = createMahjongTable({ mode: 'xueliu', stake: 20 });
  t.deal();
  t.autoExchangeIfNeeded();
  t.chooseDingque(0, 2);
  const winHand = sortMahjongHand([
    createTile(0, 1), createTile(0, 1),
    createTile(0, 2), createTile(0, 2), createTile(0, 2),
    createTile(0, 3), createTile(0, 3), createTile(0, 3),
    createTile(0, 4), createTile(0, 4), createTile(0, 4),
    createTile(0, 5), createTile(0, 5), createTile(0, 5),
  ]);
  t.state.hands[0] = winHand;
  t.state.missingSuits[0] = 2;
  t.state.melds[0] = [];
  t.state.current = 0;
  t.state.phase = 'discard';
  const r1 = t.huSelf(0);
  assert.equal(r1.ok, true);
  let s = t.snapshot();
  assert.equal(s.status[0], PlayerStatus.HU_STAY);
  assert.equal(s.huCount[0], 1);
  assert.notEqual(s.phase, 'settle');

  const end = await playMahjongToEnd('xueliu');
  assert.equal(end.phase, 'settle');
  const sum = end.deltas.reduce((a, b) => a + b, 0);
  assert.equal(sum, 0, '血流结算零和');
});

test('doudizhu laizi rules smoke', async () => {
  const { createCard } = await import('../src/jj/card.js');
  const {
    parseHandLaizi, canBeatLaizi, getHintLaizi, isWildCard, parseHandMode,
  } = await import('../src/jj/laizi-rules.js');
  const { HandType } = await import('../src/jj/rules.js');

  const wild = 8; // 8 为癞子
  assert.equal(isWildCard(createCard(8, 0), wild), true);
  assert.equal(isWildCard(createCard(16, 4), wild), false);

  // 1 普通 + 1 癞子 = 对子
  const pair = parseHandLaizi([createCard(5, 0), createCard(8, 1)], wild);
  assert.equal(pair?.type, HandType.PAIR);
  assert.equal(pair?.soft, true);
  assert.equal(pair?.weight, 5);

  // 2 普通 + 2 癞子 = 软炸
  const softBomb = parseHandLaizi(
    [createCard(7, 0), createCard(7, 1), createCard(8, 0), createCard(8, 2)],
    wild,
  );
  assert.equal(softBomb?.type, HandType.BOMB);
  assert.equal(softBomb?.soft, true);

  // 硬炸压软炸
  const hard = parseHandLaizi(
    [createCard(3, 0), createCard(3, 1), createCard(3, 2), createCard(3, 3)],
    wild,
  );
  assert.ok(canBeatLaizi(softBomb, hard), '硬炸应压软炸');
  assert.equal(canBeatLaizi(hard, softBomb), false);

  // 癞子补顺
  const st = parseHandLaizi(
    [createCard(3, 0), createCard(4, 1), createCard(8, 0), createCard(6, 2), createCard(7, 3)],
    wild,
  );
  assert.equal(st?.type, HandType.STRAIGHT);
  assert.equal(st?.length, 5);

  // 经典模式无癞子
  const pure = parseHandMode([createCard(9, 0), createCard(9, 1)], null);
  assert.equal(pure?.type, HandType.PAIR);
  assert.ok(!pure?.soft);

  // 提示能给出合法压牌
  const hand = [
    createCard(9, 0), createCard(9, 1), createCard(8, 0),
    createCard(4, 0), createCard(5, 1),
  ];
  const prev = parseHandLaizi([createCard(6, 0), createCard(6, 1)], wild);
  const hint = getHintLaizi(hand, prev, wild);
  assert.ok(hint, '应提示可用癞子凑对压 66');
  assert.ok(canBeatLaizi(prev, hint));
});

test('doudizhu four variants configured', async () => {
  const js = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(js, /buxipai[\s\S]*huanle[\s\S]*classic[\s\S]*laizi|DDZ_VARIANTS/);
  assert.match(js, /dealDeckForVariant/);
  assert.match(js, /getHintLaizi|parseHandMode|canBeatMode/);
  assert.match(js, /wildRank/);
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /不洗牌/);
  assert.match(html, /欢乐经典/);
  assert.match(html, /天地癞子/);
  assert.match(html, /data-ddz-variant="classic"/);
});
