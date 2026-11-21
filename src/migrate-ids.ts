// Moves what this device stored under an emote's old ULID to its Snowflake (ADR 0027):
// favourites and usage counts (`cyextv:<id>` keys) and hidden emotes. The API answers
// `GET /emotes/<ULID>` with the emote, Snowflake included. Safe to run any number of times and
// from several tabs: an ID is only replaced once its Snowflake is known, so an unreachable API
// loses nothing and the next run picks up where this one stopped.
import type { HiddenEmotesStore } from './features/cleanup/hide-emote';
import type { Store } from './features/composer/store';
import { isSnowflake, isUlid } from './ids';
import { API } from './providers/cyextv';
import { isObject, type FetchJson } from './providers/types';

/** Old IDs the API said it has no emote for, so they are not asked about again. */
export const GONE_KEY = 'emoteIdsGone';
/** Lookups per run, so a huge history can't flood the API; the rest follow on the next run. */
export const LOOKUP_CAP = 60;
const GONE_MAX = 500;
const PREFIX = 'cyextv:';

const legacyOf = (key: string): string | null => (key.startsWith(PREFIX) && isUlid(key.slice(PREFIX.length)) ? key.slice(PREFIX.length) : null);

export type Migration = {
  /** Old IDs found stored. */
  found: number;
  /** Replaced by a Snowflake. */
  moved: number;
  /** Not resolved yet (API unreachable or past the cap): run again later. */
  pending: number;
};

export async function migrateEmoteIds(local: ExtStorageArea | null, fetch: FetchJson, store: Store, hidden: HiddenEmotesStore): Promise<Migration> {
  if (!local) return { found: 0, moved: 0, pending: 0 };
  await store.ready;
  const gone = new Set<string>();
  try {
    const g = (await local.get(GONE_KEY))[GONE_KEY];
    if (Array.isArray(g)) for (const v of g) if (typeof v === 'string') gone.add(v.toUpperCase());
  } catch {
    /* ask again */
  }

  const old = new Set<string>();
  for (const k of [...store.favorites, ...Object.keys(store.usage)]) {
    const u = legacyOf(k);
    if (u) old.add(u.toUpperCase());
  }
  for (const h of hidden.list()) if (h.provider === 'cyextv' && isUlid(h.id)) old.add(h.id.toUpperCase());
  const found = old.size;
  const todo = [...old].filter((u) => !gone.has(u));

  const map = new Map<string, string>();
  let asked = 0;
  let goneNow = 0;
  for (const ulid of todo) {
    if (asked >= LOOKUP_CAP) break;
    asked++;
    try {
      const raw = await fetch(`${API}/emotes/${encodeURIComponent(ulid)}`);
      if (raw === null) {
        gone.add(ulid);
        goneNow++;
      } else if (isObject(raw) && isSnowflake(raw.id)) map.set(ulid, raw.id);
    } catch {
      /* try again later */
    }
  }

  if (map.size) {
    await store.remapIds(map);
    const before = hidden.list();
    const next = before.map((h) => {
      const to = h.provider === 'cyextv' && isUlid(h.id) ? map.get(h.id.toUpperCase()) : undefined;
      return to ? { ...h, id: to } : h;
    });
    if (next.some((h, i) => h.id !== before[i]!.id)) await hidden.set(next);
  }
  if (goneNow) await local.set({ [GONE_KEY]: [...gone].slice(-GONE_MAX) }).catch(() => undefined);

  return { found, moved: map.size, pending: todo.length - map.size - goneNow };
}
