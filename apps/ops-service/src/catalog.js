/** 大厅可上下线的玩法目录。id 必须与 H5 data-side-game / data-room-game 一致。 */

export const DEFAULT_GAMES = Object.freeze([
  {
    id: 'doudizhu',
    name: '斗地主',
    group: 'core',
    enabled: true,
    sort: 10,
    summary: '经典三人叫分',
    policy: 'shadow_points_only',
    playable: 'ready',
  },
  {
    id: 'texas',
    name: '德州扑克',
    group: 'core',
    enabled: true,
    sort: 20,
    summary: '无限注三人桌',
    policy: 'shadow_points_only',
    playable: 'h5-local',
  },
  {
    id: 'zhajinhua',
    name: '炸金花',
    group: 'core',
    enabled: true,
    sort: 30,
    summary: '三张比牌',
    policy: 'shadow_points_only',
    playable: 'h5-local',
  },
  {
    id: 'mahjong',
    name: '麻将',
    group: 'core',
    enabled: true,
    sort: 40,
    summary: '四人 / 二人 / 血战 / 血流',
    policy: 'shadow_points_only',
    playable: 'h5-local',
  },
  {
    id: 'guandan',
    name: '掼蛋',
    group: 'core',
    enabled: true,
    sort: 50,
    summary: '2v2 升级',
    policy: 'shadow_points_only',
    playable: 'h5-local',
  },
  {
    id: 'blackjack',
    name: '二十一点',
    group: 'core',
    enabled: true,
    sort: 60,
    summary: '标准 Blackjack',
    policy: 'shadow_points_only',
    playable: 'h5-local',
  },
  {
    id: 'real',
    name: '链游测试区',
    group: 'surface',
    enabled: true,
    sort: 90,
    summary: '赛季积分演示账本，不可兑现',
    policy: 'shadow_points_only_test_asset_display',
    playable: 'demo',
  },
]);

export function createGameCatalog(overrides = []) {
  const byId = new Map(DEFAULT_GAMES.map((game) => [game.id, { ...game }]));
  for (const item of overrides) {
    if (!item?.id || !byId.has(item.id)) continue;
    const current = byId.get(item.id);
    byId.set(item.id, {
      ...current,
      enabled: item.enabled !== false,
      sort: Number.isFinite(Number(item.sort)) ? Number(item.sort) : current.sort,
      name: typeof item.name === 'string' && item.name.trim() ? item.name.trim().slice(0, 24) : current.name,
      summary: typeof item.summary === 'string' && item.summary.trim()
        ? item.summary.trim().slice(0, 48)
        : current.summary,
    });
  }
  return new Map([...byId.entries()].sort((a, b) => a[1].sort - b[1].sort));
}

export function publicGame(game) {
  return {
    id: game.id,
    name: game.name,
    group: game.group,
    enabled: Boolean(game.enabled),
    sort: game.sort,
    summary: game.summary,
    policy: game.policy,
    playable: game.playable || 'h5-local',
  };
}
