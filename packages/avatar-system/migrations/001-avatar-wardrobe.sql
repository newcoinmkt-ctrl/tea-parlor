-- Reference migration for the future persistent database.
-- Current Tea Parlor runtime uses in-memory repositories; do not apply directly to production.

CREATE TABLE IF NOT EXISTS avatar_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'item',
  category TEXT NOT NULL,
  rarity TEXT NOT NULL,
  asset TEXT NOT NULL,
  thumbnail TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  exclusive_group JSON,
  gender TEXT,
  metadata JSON,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS avatar_outfits (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  rarity TEXT NOT NULL,
  thumbnail TEXT NOT NULL,
  items JSON NOT NULL,
  metadata JSON,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_avatar_inventory (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  source TEXT NOT NULL,
  obtained_at TEXT NOT NULL,
  metadata JSON,
  UNIQUE (user_id, item_id)
);

CREATE TABLE IF NOT EXISTS user_avatar_equipment (
  user_id TEXT NOT NULL,
  slot TEXT NOT NULL,
  item_id TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, slot)
);

CREATE TABLE IF NOT EXISTS user_avatar_presets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  equipment JSON NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
