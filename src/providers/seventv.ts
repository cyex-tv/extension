// 7TV's public v3 REST API: the global set and a channel's set, for Twitch and Kick.
// An active emote's `flags & 1` marks it zero-width in that set.
import {
  type Emote,
  type EmoteImage,
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

export const API = 'https://7tv.io/v3';
const ZERO_WIDTH = 1;

function images(host: Record<string, unknown>, still: boolean): EmoteImage[] {
  const base = str(host.url);
  if (!base) return [];
  const out: EmoteImage[] = [];
  for (const f of arr(host.files)) {
    if (!isObject(f) || str(f.format)?.toUpperCase() !== 'WEBP') continue;
    const name = str(f.name);
    const m = name?.match(/^(\d)x(_static)?\.webp$/);
    const width = num(f.width);
    const height = num(f.height);
    if (!name || !m || !width || !height || Boolean(m[2]) !== still) continue;
    const scale = Number(m[1]);
    if (![1, 2, 3, 4].includes(scale)) continue;
    out.push({ scale: scale as EmoteImage['scale'], url: `${https(base)}/${name}`, width, height });
  }
  return out.sort((a, b) => a.scale - b.scale);
}

/** One active emote of a set. */
export function active(raw: unknown): Emote | null {
  if (!isObject(raw) || !isObject(raw.data) || !isObject(raw.data.host)) return null;
  const id = str(raw.id);
  const name = str(raw.name);
  if (!id || !name) return null;
  const moving = images(raw.data.host, false);
  if (moving.length === 0) return null;
  const animated = raw.data.animated === true;
  const emote: Emote = {
    provider: '7tv',
    id,
    name,
    zeroWidth: ((num(raw.flags) ?? 0) & ZERO_WIDTH) !== 0,
    animated,
    images: moving,
  };
  if (animated) {
    const stills = images(raw.data.host, true);
    if (stills.length) emote.stills = stills;
  }
  const owner = isObject(raw.data.owner) ? str(raw.data.owner.display_name) : undefined;
  if (owner) emote.owner = owner;
  return emote;
}

export function set(raw: unknown, scope: EmoteSet['scope']): EmoteSet {
  if (!isObject(raw)) throw new ShapeError('7tv', 'emote set');
  return { provider: '7tv', scope, emotes: arr(raw.emotes).flatMap((e) => active(e) ?? []) };
}

export const seventv: EmoteProvider = {
  id: '7tv',
  platforms: ['twitch', 'kick'],
  async global(fetch: FetchJson) {
    return set(await fetch(`${API}/emote-sets/global`), 'global');
  },
  async channel(fetch: FetchJson, platform: Platform, channelId: string) {
    const user = await fetch(`${API}/users/${platform}/${encodeURIComponent(channelId)}`);
    if (!isObject(user) || !isObject(user.emote_set)) return { provider: '7tv', scope: 'channel', emotes: [] };
    return set(user.emote_set, 'channel');
  },
};
