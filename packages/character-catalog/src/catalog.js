/** 前后端共用人物库。id / name / group 必须一致。file 相对 web-lobby/public/characters。 */

function char(id, name, kind, group, sort, file, extra = {}) {
  return Object.freeze({
    id,
    name,
    kind,
    group,
    style: extra.style || '立绘',
    sort,
    file,
    defaultOutfit: extra.defaultOutfit || '',
    outfits: Object.freeze(extra.outfits || {}),
  });
}

export const CHARACTERS = Object.freeze([
  char('f_ea_red_qipao', '红韵旗袍', 'female', '女性', 10, 'f-ea-red-qipao.png', {
    defaultOutfit: 'red_dress',
    outfits: { black_dress: 'f-ea-red-outfit-black.png' },
  }),
  char('f_ea_black', '墨色短裙', 'female', '女性', 20, 'f-ea-black-dress.png', {
    defaultOutfit: 'black_dress',
    outfits: {
      red_dress: 'f-ea-black-outfit-red.png',
      gold_dress: 'f-ea-black-outfit-gold.png',
    },
  }),
  char('f_ea_purple', '紫夜长裙', 'female', '女性', 30, 'f-ea-purple-gown.png', { defaultOutfit: 'purple_dress' }),
  char('f_ea_office', '职场丝袜', 'female', '女性', 40, 'f-ea-office.png', { defaultOutfit: 'office' }),
  char('f_ea_gold', '金光夜宴', 'female', '女性', 50, 'f-ea-gold-dress.png', { defaultOutfit: 'gold_dress' }),
  char('f_ea_teal', '青瓷旗袍', 'female', '女性', 60, 'f-ea-teal-qipao.png'),
  char('glam_gold', '鎏金名媛', 'female', '女性', 70, 'female-glam.png', {
    outfits: { red_dress: 'female-glam-crimson.png' },
  }),
  char('glam_crimson', '绛红名媛', 'female', '女性', 80, 'female-glam-crimson.png'),
  char('tea_qipao_girl', '茶馆旗袍', 'female', '女性', 90, 'tea-qipao.png'),
  char('tea_sister', '茶馆小妹', 'female', '女性', 100, 'tea-xiaomei.png'),
  char('tea_cool', '清冷小姐', 'female', '女性', 110, 'tea-coolgirl.png'),
  char('ink_pure', '素雅清影', 'female', '女性', 120, 'f-pure.png'),
  char('ink_sweet', '软甜邻家', 'female', '女性', 130, 'f-sweet.png'),
  char('ink_smart', '知性文员', 'female', '女性', 140, 'f-smart.png'),
  char('ink_cold', '高冷侧颜', 'female', '女性', 150, 'f-cold.png'),
  char('stereo_red', '立体红裙', 'female', '女性', 160, 'f-real3d-red.png', {
    outfits: { black_dress: 'f-real3d-black.png' },
  }),
  char('stereo_black', '立体黑裙', 'female', '女性', 170, 'f-real3d-black.png'),

  char('male_hero', '西装绅士', 'male', '男性', 210, 'm-ea-suit.png', {
    outfits: {
      casual: 'm-suit-outfit-casual.png',
      gold_dress: 'male-hero-gold.png',
    },
  }),
  char('male_charm', '休闲型男', 'male', '男性', 220, 'm-ea-casual.png', { defaultOutfit: 'casual' }),
  char('m_sport', '热血运动', 'male', '男性', 230, 'm-ea-sport.png'),
  char('m_cool', '黑衣高冷', 'male', '男性', 240, 'm-ea-cool.png'),
  char('m_street', '街头风尚', 'male', '男性', 250, 'm-ea-street.png'),
  char('m_shirt', '白衬衫', 'male', '男性', 260, 'm-ea-shirt.png'),
  char('m_sweater', '针织绅士', 'male', '男性', 270, 'm-ea-sweater.png'),
  char('m_navy', '蓝金礼服', 'male', '男性', 280, 'm-ea-navy-suit.png'),
  char('gold_hero', '金纹礼服', 'male', '男性', 290, 'male-hero-gold.png'),
  char('tea_boy', '茶馆小伙', 'male', '男性', 300, 'tea-xiaoming.png'),
  char('tea_lele_boy', '乐乐', 'male', '男性', 310, 'tea-lele.png'),
  char('tea_uncle', '茶馆大叔', 'male', '男性', 320, 'tea-shushu.png'),
  char('tea_rich', '茶馆大亨', 'male', '男性', 330, 'tea-tuhao.png'),
  char('tea_smart_boy', '聪明仔', 'male', '男性', 340, 'tea-congming.png'),
  char('tea_master', '牌桌大神', 'male', '男性', 350, 'tea-dashen.png'),
  char('stereo_man_suit', '立体西装', 'male', '男性', 360, 'm-real3d-suit.png', {
    outfits: { casual: 'm-real3d-casual.png' },
  }),
  char('stereo_man_casual', '立体休闲', 'male', '男性', 370, 'm-real3d-casual.png'),

  char('animal_fox', '狐仙', 'animal', '动物', 410, 'animal-fox.png', {
    outfits: { violet: 'animal-fox-violet.png' },
  }),
  char('a_foxboy', '狐少侠', 'animal', '动物', 420, 'a-foxboy.png'),
  char('a_wolf', '狼女侠', 'animal', '动物', 430, 'a-wolf.png'),
  char('animal_panda', '熊猫大侠', 'animal', '动物', 440, 'animal-panda.png'),
  char('tea_panda', '团子熊猫', 'animal', '动物', 450, 'tea-panda.png'),
  char('animal_tiger', '白虎少侠', 'animal', '动物', 460, 'animal-tiger.png'),
  char('tea_tiger', '虎威少侠', 'animal', '动物', 470, 'tea-tiger.png'),
  char('a_lion', '狮王少主', 'animal', '动物', 480, 'a-lion.png'),
  char('a_deer', '鹿灵仙子', 'animal', '动物', 490, 'a-deer.png'),
  char('a_bear', '熊仔卫士', 'animal', '动物', 500, 'a-bear.png'),
  char('a_squirrel', '松鼠精灵', 'animal', '动物', 510, 'a-squirrel.png'),
  char('a_penguin', '企鹅绅士', 'animal', '动物', 520, 'a-penguin.png'),
  char('tea_cat', '橘猫公子', 'animal', '动物', 530, 'tea-cat.png'),
  char('tea_dog', '忠犬侠', 'animal', '动物', 540, 'tea-dog.png'),
  char('tea_dragon', '龙裔少侠', 'animal', '动物', 550, 'tea-dragon.png'),
  char('tea_owl', '夜枭智者', 'animal', '动物', 560, 'tea-owl.png'),
  char('tea_rabbit', '玉兔仙子', 'animal', '动物', 570, 'tea-rabbit.png'),
  char('tea_fox', '茶馆小狐', 'animal', '动物', 580, 'tea-fox.png'),
]);

export function publicCharacters() {
  return CHARACTERS.map((item) => ({
    id: item.id,
    name: item.name,
    group: item.group,
    enabled: true,
    sort: item.sort,
  }));
}

export function characterIds() {
  return CHARACTERS.map((item) => item.id);
}
