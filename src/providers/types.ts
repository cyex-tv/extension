// What every emote provider hands the chat code, whatever its API looks like.

export type ProviderId = 'cyextv' | '7tv' | 'bttv' | 'ffz';
export type Platform = 'twitch' | 'kick';
export type Scope = 'global' | 'channel' | 'personal';

/** One picture of an emote at a scale. `url` is absolute (https). */
export type EmoteImage = { scale: 1 | 2 | 3 | 4; url: string; width: number; height: number };

export type Emote = {
  provider: ProviderId;
  /** The provider's own ID. */
  id: string;
  /** What people type. */
  name: string;
  /** Drawn on top of the emote before it, not after. */
  zeroWidth: boolean;
  animated: boolean;
  /** Smallest first. At least one. */
  images: EmoteImage[];
  /** The first frame of an animated emote, for "animations off" (same scales). */
  stills?: EmoteImage[];
  /** Who made it, when the provider says. */
  owner?: string;
  /** FFZ modifiers (flip, grow, hidden...), as FFZ's bit flags. */
  modifierFlags?: number;
};

export type EmoteSet = {
  provider: ProviderId;
  scope: Scope;
  emotes: Emote[];
  /** The provider's ID for this set, for its live updates (7TV's emote set, cyex.tv's set). */
  setId?: string;
};

/** Fetches JSON from an allowed API host. Not found is `null`; anything else throws. */
export type FetchJson = (url: string, init?: { method?: 'GET' | 'POST'; body?: unknown; fresh?: boolean }) => Promise<unknown | null>;

export interface EmoteProvider {
  readonly id: ProviderId;
  /** Which platforms it has emotes for. */
  readonly platforms: readonly Platform[];
  global(fetch: FetchJson): Promise<EmoteSet>;
  /** The channel's emotes; an empty set when the channel has none there. `fresh` skips the cache. */
  channel(fetch: FetchJson, platform: Platform, channelId: string, fresh?: boolean): Promise<EmoteSet>;
}

/** Thrown when an answer doesn't have the shape the provider documents. */
export class ShapeError extends Error {
  constructor(provider: ProviderId, what: string) {
    super(`${provider}: unexpected ${what}`);
  }
}

export const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
export const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
export const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
export const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** `//cdn.example/x` or `http://…` as `https://…`. */
export function https(url: string): string {
  if (url.startsWith('//')) return `https:${url}`;
  return url.replace(/^http:\/\//, 'https://');
}
