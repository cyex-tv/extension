// The popup's changes to the settings, kept apart from the page so they can be tested.
import type { ProviderId } from '../providers/types';
import type { Animations, Settings } from '../settings';
import { loginFromPath } from '../sites/index';

export const PROVIDER_LABEL: Record<ProviderId, string> = { cyextv: 'cyex.tv', '7tv': '7TV', bttv: 'BetterTTV', ffz: 'FrankerFaceZ' };
export const COSMETIC_LABEL: Record<keyof Settings['cosmetics'], string> = {
  cyexdeck: 'cyex deck supporters',
  '7tv': '7TV',
  bttv: 'BetterTTV',
  ffz: 'FrankerFaceZ',
};

/** `platform:login` for a Twitch or Kick channel address, or null for anything else. */
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

/** Switches the extension on or off for one channel. */
export function setChannel(s: Settings, key: string, on: boolean): Settings {
  const rest = s.disabledChannels.filter((c) => c !== key);
  return { ...s, disabledChannels: on ? rest : [...rest, key] };
}
