/**
 * 国标麻将番种表（节选完整计分常用 + 需求所列）
 * fan: 番数（国标计点）
 * excludes: 按高不按低 / 不重复时排除的较低番
 */

export const FAN = Object.freeze({
  // ── 88 ──
  DA_SI_XI: { id: 'da_si_xi', name: '大四喜', fan: 88, excludes: ['xiao_si_xi', 'san_feng_ke', 'peng_peng_hu', 'yao_jiu_ke', 'quan_dai_yao'] },
  DA_SAN_YUAN: { id: 'da_san_yuan', name: '大三元', fan: 88, excludes: ['xiao_san_yuan', 'shuang_jian_ke', 'jian_ke', 'que_yi_men'] },
  LV_YI_SE: { id: 'lv_yi_se', name: '绿一色', fan: 88, excludes: ['hun_yi_se'] },
  JIU_LIAN: { id: 'jiu_lian_bao_deng', name: '九莲宝灯', fan: 88, excludes: ['qing_yi_se', 'bu_qiu_ren', 'men_qian_qing', 'yao_jiu_ke'] },
  SHI_BA_LUO_HAN: { id: 'shi_ba_luo_han', name: '十八罗汉', fan: 88, excludes: ['si_gang', 'peng_peng_hu', 'dan_diao_jiang', 'san_gang'] },
  SHI_SAN_YAO: { id: 'shi_san_yao', name: '十三幺', fan: 88, excludes: ['wu_men_qi', 'bu_qiu_ren', 'men_qian_qing', 'dan_diao_jiang', 'quan_dai_yao'] },
  SI_GANG: { id: 'si_gang', name: '四杠', fan: 88, excludes: ['san_gang', 'shuang_an_gang', 'ming_gang', 'an_gang'] },

  // ── 64 ──
  XIAO_SI_XI: { id: 'xiao_si_xi', name: '小四喜', fan: 64, excludes: ['san_feng_ke', 'yao_jiu_ke'] },
  XIAO_SAN_YUAN: { id: 'xiao_san_yuan', name: '小三元', fan: 64, excludes: ['shuang_jian_ke', 'jian_ke', 'que_yi_men'] },
  ZI_YI_SE: { id: 'zi_yi_se', name: '字一色', fan: 64, excludes: ['peng_peng_hu', 'hun_yao_jiu', 'quan_dai_yao', 'yao_jiu_ke'] },
  SI_AN_KE: { id: 'si_an_ke', name: '四暗刻', fan: 64, excludes: ['peng_peng_hu', 'men_qian_qing', 'bu_qiu_ren', 'san_an_ke', 'shuang_an_ke'] },
  YI_SE_SHUANG_LONG: { id: 'yi_se_shuang_long_hui', name: '一色双龙会', fan: 64, excludes: ['qing_yi_se', 'ping_hu', 'qi_dui', 'yi_ban_gao', 'lao_shao_fu', 'que_yi_men'] },

  // ── 48 ──
  YI_SE_SI_JIE: { id: 'yi_se_si_jie_gao', name: '一色四节高', fan: 48, excludes: ['yi_se_san_jie_gao', 'peng_peng_hu', 'yi_se_san_tong_shun'] },

  // ── 32 ──
  YI_SE_SI_BU_GAO: { id: 'yi_se_si_bu_gao', name: '一色四步高', fan: 32, excludes: ['yi_se_san_bu_gao', 'lian_liu', 'lao_shao_fu'] },
  SAN_GANG: { id: 'san_gang', name: '三杠', fan: 32, excludes: ['shuang_an_gang', 'shuang_ming_gang'] },
  HUN_YAO_JIU: { id: 'hun_yao_jiu', name: '混幺九', fan: 32, excludes: ['peng_peng_hu', 'yao_jiu_ke', 'quan_dai_yao'] },

  // ── 24 ──
  QI_DUI: { id: 'qi_dui', name: '七对', fan: 24, excludes: ['men_qian_qing', 'bu_qiu_ren', 'dan_diao_jiang', 'yi_ban_gao'] },
  QING_YI_SE: { id: 'qing_yi_se', name: '清一色', fan: 24, excludes: ['wu_zi'] },
  YI_SE_SAN_TONG_SHUN: { id: 'yi_se_san_tong_shun', name: '一色三同顺', fan: 24, excludes: ['yi_se_san_jie_gao', 'yi_ban_gao'] },
  YI_SE_SAN_JIE_GAO: { id: 'yi_se_san_jie_gao', name: '一色三节高', fan: 24, excludes: ['yi_se_san_tong_shun'] },
  QING_LONG: { id: 'qing_long', name: '清龙', fan: 16, excludes: ['lian_liu', 'lao_shao_fu'] },

  // ── 16 ──
  SAN_SE_SHUANG_LONG: { id: 'san_se_shuang_long_hui', name: '三色双龙会', fan: 16, excludes: ['ping_hu', 'xi_xiang_feng', 'lao_shao_fu', 'wu_zi', 'xi_xiang_feng'] },
  YI_SE_SAN_BU_GAO: { id: 'yi_se_san_bu_gao', name: '一色三步高', fan: 16, excludes: [] },
  SAN_AN_KE: { id: 'san_an_ke', name: '三暗刻', fan: 16, excludes: [] },
  TIAN_TING: { id: 'tian_ting', name: '天听', fan: 16, excludes: [] },

  // ── 12 ──
  DA_YU_WU: { id: 'da_yu_wu', name: '大于五', fan: 12, excludes: ['wu_zi'] },
  XIAO_YU_WU: { id: 'xiao_yu_wu', name: '小于五', fan: 12, excludes: ['wu_zi'] },
  SAN_FENG_KE: { id: 'san_feng_ke', name: '三风刻', fan: 12, excludes: [] },

  // ── 8 ──
  MIAO_SHOU_HUI_CHUN: { id: 'miao_shou_hui_chun', name: '妙手回春', fan: 8, excludes: ['zi_mo'] },
  HAI_DI_LAO_YUE: { id: 'hai_di_lao_yue', name: '海底捞月', fan: 8, excludes: [] },
  GANG_SHANG_HUA: { id: 'gang_shang_hua', name: '杠上开花', fan: 8, excludes: ['zi_mo'] },
  QIANG_GANG_HU: { id: 'qiang_gang_hu', name: '抢杠胡', fan: 8, excludes: ['hu_jue_zhang'] },

  // ── 6 ──
  PENG_PENG_HU: { id: 'peng_peng_hu', name: '碰碰胡', fan: 6, excludes: [] },
  HUN_YI_SE: { id: 'hun_yi_se', name: '混一色', fan: 6, excludes: [] },
  QUAN_QIU_REN: { id: 'quan_qiu_ren', name: '全求人', fan: 6, excludes: ['dan_diao_jiang'] },
  SHUANG_AN_GANG: { id: 'shuang_an_gang', name: '双暗杠', fan: 6, excludes: ['an_gang', 'shuang_an_ke'] },

  // ── 4 ──
  BU_QIU_REN: { id: 'bu_qiu_ren', name: '不求人', fan: 4, excludes: ['zi_mo', 'men_qian_qing'] },
  SHUANG_MING_GANG: { id: 'shuang_ming_gang', name: '双明杠', fan: 4, excludes: ['ming_gang'] },
  HU_JUE_ZHANG: { id: 'hu_jue_zhang', name: '胡绝张', fan: 4, excludes: [] },

  // ── 2 ──
  DUAN_YAO: { id: 'duan_yao', name: '断幺', fan: 2, excludes: [] },
  PING_HU: { id: 'ping_hu', name: '平胡', fan: 2, excludes: [] },
  MEN_QIAN_QING: { id: 'men_qian_qing', name: '门前清', fan: 2, excludes: [] },
  SI_GUI_YI: { id: 'si_gui_yi', name: '四归一', fan: 2, excludes: [] },
  SHUANG_AN_KE: { id: 'shuang_an_ke', name: '双暗刻', fan: 2, excludes: [] },
  AN_GANG: { id: 'an_gang', name: '暗杠', fan: 2, excludes: [] },
  DUAN_YAO_JIU: { id: 'duan_yao', name: '断幺', fan: 2, excludes: [] },

  // ── 1 ──
  ZI_MO: { id: 'zi_mo', name: '自摸', fan: 1, excludes: [] },
  DAN_DIAO_JIANG: { id: 'dan_diao_jiang', name: '单钓将', fan: 1, excludes: [] },
  YI_BAN_GAO: { id: 'yi_ban_gao', name: '一般高', fan: 1, excludes: [] },
  XI_XIANG_FENG: { id: 'xi_xiang_feng', name: '喜相逢', fan: 1, excludes: [] },
  LIAN_LIU: { id: 'lian_liu', name: '连六', fan: 1, excludes: [] },
  LAO_SHAO_FU: { id: 'lao_shao_fu', name: '老少副', fan: 1, excludes: [] },
  YAO_JIU_KE: { id: 'yao_jiu_ke', name: '幺九刻', fan: 1, excludes: [] },
  MING_GANG: { id: 'ming_gang', name: '明杠', fan: 1, excludes: [] },
  QUE_YI_MEN: { id: 'que_yi_men', name: '缺一门', fan: 1, excludes: [] },
  WU_ZI: { id: 'wu_zi', name: '无字', fan: 1, excludes: [] },
  BIAN_ZHANG: { id: 'bian_zhang', name: '边张', fan: 1, excludes: [] },
  KAN_ZHANG: { id: 'kan_zhang', name: '坎张', fan: 1, excludes: [] },
  JIAN_KE: { id: 'jian_ke', name: '箭刻', fan: 1, excludes: [] },
  MEN_FENG_KE: { id: 'men_feng_ke', name: '门风刻', fan: 1, excludes: [] },
  QUAN_FENG_KE: { id: 'quan_feng_ke', name: '圈风刻', fan: 1, excludes: [] },
});

/** id → def */
export const FAN_BY_ID = Object.freeze(
  Object.fromEntries(Object.values(FAN).map((f) => [f.id, f]))
);
