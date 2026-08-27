import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function loadOpsStore(storePath) {
  if (!storePath) return null;
  try {
    const raw = readFileSync(storePath, 'utf8');
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return data;
  } catch {
    return null;
  }
}

export function saveOpsStore(storePath, snapshot) {
  if (!storePath) return false;
  mkdirSync(dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  return true;
}

export function snapshotFromMaps({
  frozenUsers,
  roomConfigs,
  adPlacements,
  games,
  characters,
  skins,
  costumeLogos,
  adCategories,
  adLogos,
  userProfiles,
  pendingRevenueEvents,
  wallet,
}) {
  return {
    version: 5,
    savedAt: new Date().toISOString(),
    policy: 'independent_ops_store',
    frozenUsers: [...frozenUsers.entries()],
    roomConfigs: [...roomConfigs.entries()],
    adPlacements: [...adPlacements.entries()],
    games: [...games.values()],
    characters: characters ? [...characters.values()] : [],
    skins: skins ? [...skins.values()] : [],
    costumeLogos: costumeLogos || null,
    adCategories: adCategories ? [...adCategories.values()] : [],
    adLogos: adLogos ? [...adLogos.values()] : [],
    userProfiles: [...userProfiles.entries()],
    pendingRevenueEvents: pendingRevenueEvents ? [...pendingRevenueEvents.entries()] : [],
    wallet: wallet || null,
  };
}
