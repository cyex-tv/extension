// FrankerFaceZ's public v1 API: the default global sets and a Twitch room's sets. FFZ has no
// Kick emotes. Modifier emotes (flip, grow, hidden...) change the emote before them; they're
// kept with their `modifier_flags` and marked zero-width so they never take space of their own.
import { type Emote, type EmoteImage, type EmoteProvider, type EmoteSet, type FetchJson, type Platform, ShapeError, arr, https, isObject, isPlatformId, num, str } from './types';

export const API = 'https://api.frankerfacez.com/v1';

function images(urls: unknown, width: number, height: number): EmoteImage[] {
  if (!isObject(urls)) return [];
  const out: EmoteImage[] = [];
  for (const [key, url] of Object.entries(urls)) {
    const scale = Number(key);
    if (typeof url !== 'string' || ![1, 2, 4].includes(scale)) continue;
    out.push({ scale: scale as EmoteImage['scale'], url: https(url), width: width * scale, height: height * scale });
  }
  return out.sort((a, b) => a.scale - b.scale);
}

export function emoticon(raw: unknown): Emote | null {
  if (!isObject(raw)) return null;
  const id = num(raw.id);
  const name = str(raw.name);
  const width = num(raw.width) ?? 28;
  const height = num(raw.height) ?? 28;
  if (id === undefined || !name) return null;
  const animated = isObject(raw.animated) ? images(raw.animated, width, height) : [];
  const stills = images(raw.urls, width, height);
  const shown = animated.length ? animated : stills;
  if (shown.length === 0) return null;
  const modifier = raw.modifier === true;
  const out: Emote = {
    provider: 'ffz',
    id: String(id),
    name,
    zeroWidth: modifier,
    animated: animated.length > 0,
    images: shown,
  };
  if (animated.length && stills.length) out.stills = stills;
  if (modifier) out.modifierFlags = num(raw.modifier_flags) ?? 0;
  const owner = isObject(raw.owner) ? str(raw.owner.display_name) : undefined;
  if (owner) out.owner = owner;
  return out;
}

function fromSets(sets: unknown, ids: string[] | null, scope: EmoteSet['scope']): EmoteSet {
  if (!isObject(sets)) throw new ShapeError('ffz', 'sets');
  const picked = ids ?? Object.keys(sets);
  const emotes = picked.flatMap((id) => {
    const s = sets[id];
    return isObject(s) ? arr(s.emoticons).flatMap((e) => emoticon(e) ?? []) : [];
  });
  return { provider: 'ffz', scope, emotes };
}

export const ffz: EmoteProvider = {
  id: 'ffz',
  platforms: ['twitch'],
  async global(fetch: FetchJson) {
    const raw = await fetch(`${API}/set/global`);
    if (!isObject(raw)) throw new ShapeError('ffz', 'global sets');
    const defaults = arr(raw.default_sets).map(String);
    return fromSets(raw.sets, defaults, 'global');
  },
  async channel(fetch: FetchJson, platform: Platform, channelId: string, fresh = false) {
    const empty: EmoteSet = { provider: 'ffz', scope: 'channel', emotes: [] };
    if (platform !== 'twitch' || !isPlatformId(channelId)) return empty;
    const raw = await fetch(`${API}/room/id/${encodeURIComponent(channelId)}`, { fresh });
    if (!isObject(raw) || !isObject(raw.sets)) return empty;
    return fromSets(raw.sets, null, 'channel');
  },
};
