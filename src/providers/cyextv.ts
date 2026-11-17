// cyex.tv's public reads (api.cyex.tv/v1): the global set, a channel's active set, and
// personal sets for up to 100 chatters at once. Only emotes whose files exist are kept: a fresh
// upload has none until cyex.tv's worker has made them.
import {
  type EmoteImage,
  type Emote,
  type EmoteProvider,
  type EmoteSet,
  type FetchJson,
  type Platform,
  ShapeError,
  arr,
  https,
  isObject,
  num,
  str,
} from './types';

export const API = 'https://api.cyex.tv/v1';
/** Chatters per personal-set lookup (cyex.tv's limit). */
export const LOOKUP_MAX = 100;

function images(host: string, files: unknown[], still: boolean): EmoteImage[] {
  const out: EmoteImage[] = [];
  for (const f of files) {
    if (!isObject(f) || f.format !== 'WEBP' && f.format !== 'webp') continue;
    const name = str(f.name);
    const width = num(f.width);
    const height = num(f.height);
    const isStatic = f.is_static === true || f.isStatic === true;
    const scale = num(f.scale) ?? Number(name?.match(/^(\d)x/)?.[1]);
    if (!name || !width || !height || isStatic !== still || ![1, 2, 3, 4].includes(scale)) continue;
    out.push({ scale: scale as EmoteImage['scale'], url: `${https(host)}/${name}`, width, height });
  }
  return out.sort((a, b) => a.scale - b.scale);
}

/** One member of a set: its name and zero-width flag here, the emote's files. */
export function member(raw: unknown): Emote | null {
  if (!isObject(raw) || !isObject(raw.emote)) return null;
  const e = raw.emote;
  const id = str(e.id);
  const name = str(raw.name) ?? str(e.name);
  const host = str(e.host);
  if (!id || !name || !host) return null;
  const files = arr(e.files);
  const animated = e.animated === true;
  const moving = images(host, files, false);
  if (moving.length === 0) return null;
  const emote: Emote = {
    provider: 'cyextv',
    id,
    name,
    zeroWidth: raw.zero_width === true || raw.zeroWidth === true,
    animated,
    images: moving,
  };
  if (animated) {
    const stills = images(host, files, true);
    if (stills.length) emote.stills = stills;
  }
  const owner = isObject(e.owner) ? str(e.owner.display_name) ?? str(e.owner.displayName) : undefined;
  if (owner) emote.owner = owner;
  return emote;
}

export function set(raw: unknown, scope: EmoteSet['scope']): EmoteSet {
  if (!isObject(raw)) throw new ShapeError('cyextv', 'set');
  return { provider: 'cyextv', scope, emotes: arr(raw.emotes).flatMap((m) => member(m) ?? []) };
}

export const cyextv: EmoteProvider = {
  id: 'cyextv',
  platforms: ['twitch', 'kick'],
  async global(fetch: FetchJson) {
    return set(await fetch(`${API}/sets/global`), 'global');
  },
  async channel(fetch: FetchJson, platform: Platform, channelId: string, fresh = false) {
    const empty: EmoteSet = { provider: 'cyextv', scope: 'channel', emotes: [] };
    const ch = await fetch(`${API}/channels/${platform}/${encodeURIComponent(channelId)}`, { fresh });
    if (!isObject(ch)) return empty;
    const active = str(ch.active_set_id);
    if (!active) return empty;
    const raw = await fetch(`${API}/sets/${encodeURIComponent(active)}`, { fresh });
    return raw ? { ...set(raw, 'channel'), setId: active } : empty;
  },
};

/** Whether a channel shows other people's personal emotes (default yes). */
export async function allowsPersonal(fetch: FetchJson, platform: Platform, channelId: string): Promise<boolean> {
  const ch = await fetch(`${API}/channels/${platform}/${encodeURIComponent(channelId)}`);
  return !isObject(ch) || ch.allow_personal_emotes !== false;
}

/** Personal sets of these chatters, by platform user ID. Chatters without one are left out. */
export async function personal(fetch: FetchJson, platform: Platform, userIds: string[]): Promise<Map<string, EmoteSet>> {
  const out = new Map<string, EmoteSet>();
  const ids = [...new Set(userIds)].slice(0, LOOKUP_MAX);
  if (ids.length === 0) return out;
  const found = await fetch(`${API}/personal-sets/lookup`, { method: 'POST', body: { platform, user_ids: ids } });
  if (!isObject(found)) return out;
  for (const entry of arr(found.sets)) {
    if (!isObject(entry)) continue;
    const user = str(entry.platform_user_id);
    if (!user) continue;
    const s = set(entry.set, 'personal');
    if (s.emotes.length) out.set(user, s);
  }
  return out;
}
