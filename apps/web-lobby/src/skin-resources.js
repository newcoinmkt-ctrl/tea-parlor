export const SKIN_RESOURCE_KEYS = [
  'lobby_background',
  'game_background',
  'poker_table',
  'table_edge',
  'chair',
  'player_frame',
  'dealer_button',
  'poker_card_back',
  'poker_card_front',
  'chip',
  'gold_coin',
  'room_card',
  'primary_button',
  'secondary_button',
  'dialog_background',
  'navbar',
  'icon_set',
  'loading',
  'victory_effect',
];

const base = '/public/assets/skins';
const AVAILABLE_SKIN_ASSETS = {
  'classic-green': new Set([
    'lobby_background',
    'room_card',
    'navbar',
    'primary_button',
    'gold_coin',
  ]),
  'luxury-emerald': new Set(['poker_table', 'poker_card_back', 'chip', 'player_frame']),
  'adpack': new Set(['poker_table', 'poker_card_back', 'chip']),
};

export const SKIN_RESOURCE_MAP = {
  'classic-green': {
    label: 'Classic Green',
    resources: {
      lobby_background: `${base}/classic-green/lobby_background.svg`,
      game_background: `${base}/classic-green/game_background.svg`,
      poker_table: `${base}/classic-green/poker_table.svg`,
      table_edge: `${base}/classic-green/table_edge.svg`,
      chair: `${base}/classic-green/chair.svg`,
      player_frame: `${base}/classic-green/player_frame.svg`,
      dealer_button: `${base}/classic-green/dealer_button.svg`,
      poker_card_back: `${base}/classic-green/poker_card_back.svg`,
      poker_card_front: `${base}/classic-green/poker_card_front.svg`,
      chip: `${base}/classic-green/chip.svg`,
      gold_coin: `${base}/classic-green/gold_coin.svg`,
      room_card: `${base}/classic-green/room_card.svg`,
      primary_button: `${base}/classic-green/primary_button.svg`,
      secondary_button: `${base}/classic-green/secondary_button.svg`,
      dialog_background: `${base}/classic-green/dialog_background.svg`,
      navbar: `${base}/classic-green/navbar.svg`,
      icon_set: `${base}/classic-green/icon_set.svg`,
      loading: `${base}/classic-green/loading.svg`,
      victory_effect: `${base}/classic-green/victory_effect.svg`,
    },
  },
  'dark-gold': {
    label: 'Dark Gold',
    resources: placeholderResources('dark-gold'),
  },
  'chinese-red': {
    label: 'Chinese Red',
    resources: placeholderResources('chinese-red'),
  },
  'cyber-neon': {
    label: 'Cyber Neon',
    resources: placeholderResources('cyber-neon'),
  },
  'luxury-emerald': {
    label: 'Luxury Emerald',
    resources: {
      ...placeholderResources('luxury-emerald'),
      poker_table: `${base}/luxury-emerald/table-oval-34.jpg`,
      poker_card_back: `${base}/luxury-emerald/card-back.jpg`,
      chip: `${base}/luxury-emerald/chips.jpg`,
      player_frame: `${base}/luxury-emerald/avatar-frame.jpg`,
    },
  },
  'adpack': {
    label: 'Ad Pack',
    resources: {
      ...placeholderResources('adpack'),
      poker_table: `${base}/adpack/table-light.jpg`,
      poker_card_back: `${base}/adpack/card-light.jpg`,
      chip: `${base}/adpack/chips-full.jpg`,
    },
  },
};

function placeholderResources(skinId) {
  return Object.fromEntries(
    SKIN_RESOURCE_KEYS.map((key) => [key, `${base}/${skinId}/${key}.svg`]),
  );
}

export function applySkinResourceVariables(root, skinId) {
  const skin = SKIN_RESOURCE_MAP[skinId] || SKIN_RESOURCE_MAP['classic-green'];
  for (const key of SKIN_RESOURCE_KEYS) {
    const hasAsset = AVAILABLE_SKIN_ASSETS[skinId]?.has(key);
    const value = skin.resources[key];
    root.style.setProperty(`--skin-${key.replaceAll('_', '-')}`, hasAsset ? `url("${value}")` : 'none');
  }
  return skin;
}
