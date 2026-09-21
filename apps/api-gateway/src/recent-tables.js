/**
 * play9fin5a — server-backed recent same-table store (by userId / session).
 * In-memory with optional file persistence so refresh/device switch works when auth is available.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

export const RECENT_TABLE_MAX = 8;

export function createRecentTablesStore(options = {}) {
  return new RecentTablesStore(options);
}

export class RecentTablesStore {
  constructor(options = {}) {
    this.byUser = new Map();
    this.file = options.file || null;
    this.max = Number(options.max) || RECENT_TABLE_MAX;
    this._persistTimer = null;
    if (this.file) this.#load();
  }

  list(userId) {
    const key = String(userId || '').trim();
    if (!key) return [];
    const list = this.byUser.get(key) || [];
    return list.map((x) => ({ ...x }));
  }

  remember(userId, entry = {}) {
    const uid = String(userId || '').trim();
    const roomKey = String(entry.roomKey || entry.room_key || '').trim();
    if (!uid || !roomKey) {
      return { ok: false, reason: 'room_key_required' };
    }
    const game = String(entry.game || 'doudizhu').slice(0, 32);
    const label = String(entry.label || `同桌·${roomKey.slice(0, 12)}`).slice(0, 64);
    const at = Number(entry.at) || Date.now();
    const prev = this.byUser.get(uid) || [];
    const next = prev.filter((x) => x.roomKey !== roomKey);
    next.unshift({ roomKey, game, label, at });
    this.byUser.set(uid, next.slice(0, this.max));
    this.#schedulePersist();
    return { ok: true, tables: this.list(uid) };
  }

  replace(userId, tables = []) {
    const uid = String(userId || '').trim();
    if (!uid) return { ok: false, reason: 'user_required' };
    const cleaned = [];
    const seen = new Set();
    for (const raw of Array.isArray(tables) ? tables : []) {
      const roomKey = String(raw?.roomKey || raw?.room_key || '').trim();
      if (!roomKey || seen.has(roomKey)) continue;
      seen.add(roomKey);
      cleaned.push({
        roomKey,
        game: String(raw.game || 'doudizhu').slice(0, 32),
        label: String(raw.label || `同桌·${roomKey.slice(0, 12)}`).slice(0, 64),
        at: Number(raw.at) || Date.now(),
      });
      if (cleaned.length >= this.max) break;
    }
    this.byUser.set(uid, cleaned);
    this.#schedulePersist();
    return { ok: true, tables: this.list(uid) };
  }

  #load() {
    try {
      if (!this.file || !existsSync(this.file)) return;
      const raw = JSON.parse(readFileSync(this.file, 'utf8') || '{}');
      const entries = raw?.byUser || raw?.users || [];
      if (Array.isArray(entries)) {
        for (const [uid, list] of entries) {
          if (!uid || !Array.isArray(list)) continue;
          this.byUser.set(String(uid), list.slice(0, this.max).map((x) => ({
            roomKey: String(x.roomKey || ''),
            game: String(x.game || 'doudizhu'),
            label: String(x.label || ''),
            at: Number(x.at) || Date.now(),
          })).filter((x) => x.roomKey));
        }
      } else if (entries && typeof entries === 'object') {
        for (const [uid, list] of Object.entries(entries)) {
          if (!Array.isArray(list)) continue;
          this.byUser.set(String(uid), list.slice(0, this.max));
        }
      }
    } catch (_) {
      /* ignore corrupt snapshot */
    }
  }

  #schedulePersist() {
    // flush immediately so a new process/store sees the write (device switch)
    this.#persist();
  }

  #persist() {
    if (!this.file) return;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const payload = {
        byUser: [...this.byUser.entries()],
        updatedAt: new Date().toISOString(),
      };
      writeFileSync(this.file, JSON.stringify(payload), 'utf8');
    } catch (_) {
      /* ignore disk errors in tests / ephemeral FS */
    }
  }
}
