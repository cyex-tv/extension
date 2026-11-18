// The popup's changes to the settings, kept apart from the page so they can be tested.
import type { ProviderId } from '../providers/types';
import { type Animations, MAX_CHANNELS, type Settings } from '../settings';
import { loginFromPath } from '../sites/index';

export const PROVIDER_LABEL: Record<ProviderId, string> = { cyextv: 'cyex.tv', '7tv': '7TV', bttv: 'BetterTTV', ffz: 'FrankerFaceZ' };
export const COSMETIC_LABEL: Record<keyof Settings['cosmetics'], string> = {
  cyextv: 'cyex.tv',
  cyexdeck: 'cyex deck supporters',
  '7tv': '7TV',
  bttv: 'BetterTTV',
  ffz: 'FrankerFaceZ',
};

/** `platform:login` for a Twitch or Kick channel address, or null for anything else. */
/** Whether the address is a page of Twitch or Kick (a channel or not). */
export function onSupportedSite(url: string | undefined): boolean {
  try {
    const host = new URL(url ?? '').hostname;
    return host === 'www.twitch.tv' || host === 'twitch.tv' || host === 'kick.com';
  } catch {
    return false;
  }
}

export function channelKey(url: string | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const platform = parsed.hostname === 'www.twitch.tv' || parsed.hostname === 'twitch.tv' ? 'twitch' : parsed.hostname === 'kick.com' ? 'kick' : null;
  const login = platform ? loginFromPath(parsed.pathname) : null;
  return platform && login ? `${platform}:${login}` : null;
}

export function setEmotes(s: Settings, id: ProviderId, on: boolean): Settings {
  return { ...s, emotes: { ...s.emotes, [id]: on } };
}

export function setCosmetics(s: Settings, id: keyof Settings['cosmetics'], on: boolean): Settings {
  return { ...s, cosmetics: { ...s.cosmetics, [id]: on } };
}

/** Moves a provider one place up (-1) or down (+1) in the order; at an end it stays. */
export function move(s: Settings, id: ProviderId, by: -1 | 1): Settings {
  const order = [...s.order];
  const i = order.indexOf(id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= order.length) return s;
  [order[i], order[j]] = [order[j]!, order[i]!];
  return { ...s, order };
}

export function setAnimations(s: Settings, animations: Animations): Settings {
  return { ...s, animations };
}

/** Switches the extension on or off for one channel. At the cap (`MAX_CHANNELS`) it can't switch another off. */
export function setChannel(s: Settings, key: string, on: boolean): Settings {
  const rest = s.disabledChannels.filter((c) => c !== key);
  if (!on && (s.disabledChannels.includes(key) || rest.length >= MAX_CHANNELS)) return s;
  return { ...s, disabledChannels: on ? rest : [...rest, key] };
}

/** The channel's page; logins are checked, so nothing else can end up in the address. */
export function channelUrl(platform: 'twitch' | 'kick', login: string): string {
  const safe = /^[a-z0-9_]{1,25}$/i.test(login) ? login.toLowerCase() : '';
  return platform === 'kick' ? `https://kick.com/${safe}` : `https://www.twitch.tv/${safe}`;
}

/** "now", "5 min", "3 h", then the date as YYYY/MM/DD. */
export function mentionTime(at: number, now: number): string {
  const min = Math.floor((now - at) / 60_000);
  if (min < 1) return 'now';
  if (min < 60) return `${min} min`;
  if (min < 24 * 60) return `${Math.floor(min / 60)} h`;
  const d = new Date(at);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}
