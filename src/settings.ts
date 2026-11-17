// The user's choices, kept in the browser's synced storage. Every provider can be switched off
// on its own; emotes and cosmetics (badges, paints) are separate switches.
import { DEFAULT_ORDER } from './providers';
import type { ProviderId } from './providers/types';

export type Animations = 'on' | 'off' | 'hover';

export type Settings = {
  emotes: Record<ProviderId, boolean>;
  cosmetics: { cyexdeck: boolean; '7tv': boolean; bttv: boolean; ffz: boolean };
  /** Which provider's emote wins a shared name; earlier wins. */
  order: ProviderId[];
  animations: Animations;
  /** `platform:login` of channels where the extension stays out. */
  disabledChannels: string[];
  tooltips: boolean;
};

export const DEFAULTS: Settings = {
  emotes: { cyextv: true, '7tv': true, bttv: true, ffz: true },
  cosmetics: { cyexdeck: true, '7tv': true, bttv: true, ffz: true },
  order: [...DEFAULT_ORDER],
  animations: 'on',
  disabledChannels: [],
  tooltips: true,
};

const KEY = 'settings';

/** Stored settings over the defaults; anything missing or of the wrong type falls back. */
export function merge(stored: unknown): Settings {
  const s = (typeof stored === 'object' && stored !== null ? stored : {}) as Partial<Settings>;
  const bools = <T extends Record<string, boolean>>(base: T, over: unknown): T => {
    const out = { ...base };
    if (typeof over === 'object' && over !== null) {
      for (const k of Object.keys(base) as (keyof T)[]) {
        const v = (over as Record<keyof T, unknown>)[k];
        if (typeof v === 'boolean') out[k] = v as T[keyof T];
      }
    }
    return out;
  };
  const order = Array.isArray(s.order) ? s.order.filter((p): p is ProviderId => DEFAULT_ORDER.includes(p as ProviderId)) : [];
  return {
    emotes: bools(DEFAULTS.emotes, s.emotes),
    cosmetics: bools(DEFAULTS.cosmetics, s.cosmetics),
    // Keep the user's order, then add any provider they haven't placed (a new one, say).
    order: [...new Set([...order, ...DEFAULT_ORDER])],
    animations: s.animations === 'off' || s.animations === 'hover' ? s.animations : 'on',
    disabledChannels: Array.isArray(s.disabledChannels) ? s.disabledChannels.filter((c) => typeof c === 'string') : [],
    tooltips: typeof s.tooltips === 'boolean' ? s.tooltips : DEFAULTS.tooltips,
  };
}

export async function load(area: ExtStorageArea): Promise<Settings> {
  return merge((await area.get(KEY))[KEY]);
}

export async function save(area: ExtStorageArea, settings: Settings): Promise<void> {
  await area.set({ [KEY]: settings });
}

export const STORAGE_KEY = KEY;
