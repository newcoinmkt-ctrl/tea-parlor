import {
  resolveAdsUrl,
  resolveOpsBase,
  fetchOpsCatalog,
  fetchPlayerStatus,
} from '../../net/ops-client.js';
import { mountCharLogos, setCostumeLogoConfig } from '../../shared/char-logos.js';
import { loadAndApplyBrandPlacements } from '../../shared/branding.js';

export function initAdPlacements({ search = window.location.search, logger = console } = {}) {
  mountCharLogos();
  const adsUrl = resolveAdsUrl(new URLSearchParams(search).get('adsUrl'));
  try {
    loadAndApplyBrandPlacements(adsUrl);
  } catch (error) {
    logger.warn?.('[TeaParlor] brand', error);
  }
}

export async function syncOpsCatalog({
  setDisabledGames,
  setDisabledCharacters,
  setEnabledThemes,
  applyOpsCatalogToLobby,
  renderProfileUi,
  logger = console,
} = {}) {
  const payload = await fetchOpsCatalog();
  setDisabledGames?.(new Set((payload.games || []).filter((game) => game && game.enabled === false).map((game) => game.id)));
  setDisabledCharacters?.(new Set((payload.characters || []).filter((item) => !item.enabled).map((item) => item.id)));

  const enabledSkins = (payload.skins || []).filter((item) => item.enabled).map((item) => item.id);
  if (enabledSkins.length) setEnabledThemes?.(enabledSkins);

  if (payload.costumeLogos) {
    const sources = {};
    for (const logo of payload.adLogos || []) {
      if (logo?.id && logo.url) sources[logo.id] = `${resolveOpsBase()}${logo.url}`;
    }
    setCostumeLogoConfig({ ...payload.costumeLogos, sources });
  }

  applyOpsCatalogToLobby?.();
  try {
    renderProfileUi?.({ keepDraft: true });
  } catch (error) {
    logger.warn?.('[TeaParlor] profile render after ops catalog', error);
  }
  return payload;
}

export async function syncOpsPlayerStatus({ playerId }) {
  return fetchPlayerStatus(String(playerId || '830126'));
}
