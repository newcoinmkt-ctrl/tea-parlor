export {
  TILE,
  NAMES34,
  toId34,
  fromId34,
  count34,
  isOrdinal,
  isHonor,
  isWind,
  isDragon,
  isYaoJiu,
  isGreenTile,
  isTerminal,
  suitOf,
} from './tiles34.js';

export {
  normalizeMelds,
  decomposeStandard,
  isSevenPairs,
  isThirteenOrphans,
} from './decompose.js';

export { FAN, FAN_BY_ID } from './fan-table.js';

export {
  calculateFanPoints,
  applyExclusionAndSum,
} from './score.js';
