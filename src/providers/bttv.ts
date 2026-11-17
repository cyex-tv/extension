// BetterTTV's public v3 API: global emotes and a Twitch channel's own and shared emotes.
// BTTV has no Kick emotes. A handful of old global emotes are drawn on top of the one before
// them; BTTV marks them by name only.
import { type Emote, type EmoteProvider, type EmoteSet, type FetchJson, type Platform, ShapeError, arr, isObject, isPlatformId, str } from './types';

export const API = 'https://api.betterttv.net/3';
export const CDN = 'https://cdn.betterttv.net/emote';

export const ZERO_WIDTH = new Set(['SoSnowy', 'IceCold', 'SantaHat', 'TopHat', 'ReinDeer', 'CandyCane', 'cvMask', 'cvHazmat']);

/** One emote. BTTV's 1x is 28 px tall; wide emotes give their own width. */
export function emote(raw: unknown): Emote | null {
  if (!isObject(raw)) return null;
  const id = str(raw.id);
  const name = str(raw.code);
  if (!id || !name || raw.modifier === true) return null;
  const width = typeof raw.width === 'number' ? raw.width : 28;
  const height = typeof raw.height === 'number' ? raw.height : 28;
  const animated = raw.animated === true || raw.imageType === 'gif';
  const out: Emote = {
    provider: 'bttv',
    id,
    name,
    zeroWidth: ZERO_WIDTH.has(name),
    animated,
    images: ([1, 2, 3] as const).map((scale) => ({
      scale,
      url: `${CDN}/${id}/${scale}x.webp`,
      width: width * scale,
      height: height * scale,
    })),
  };
  if (animated) {
    out.stills = ([1, 2, 3] as const).map((scale) => ({
      scale,
      url: `${CDN}/${id}/static/${scale}x.webp`,
      width: width * scale,
      height: height * scale,
    }));
  }
  const owner = isObject(raw.user) ? str(raw.user.displayName) : undefined;
  if (owner) out.owner = owner;
  return out;
}

export const bttv: EmoteProvider = {
  id: 'bttv',
  platforms: ['twitch'],
  async global(fetch: FetchJson) {
    const list = await fetch(`${API}/cached/emotes/global`);
    if (!Array.isArray(list)) throw new ShapeError('bttv', 'global emotes');
    return { provider: 'bttv', scope: 'global', emotes: list.flatMap((e) => emote(e) ?? []) };
  },
  async channel(fetch: FetchJson, platform: Platform, channelId: string, fresh = false) {
    const empty: EmoteSet = { provider: 'bttv', scope: 'channel', emotes: [] };
    if (platform !== 'twitch' || !isPlatformId(channelId)) return empty;
    const user = await fetch(`${API}/cached/users/twitch/${encodeURIComponent(channelId)}`, { fresh });
    if (!isObject(user)) return empty;
    const all = [...arr(user.channelEmotes), ...arr(user.sharedEmotes)];
    return { provider: 'bttv', scope: 'channel', emotes: all.flatMap((e) => emote(e) ?? []) };
  },
};
