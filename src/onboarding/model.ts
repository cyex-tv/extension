// The welcome page's logic, apart from the page so it can be tested: three steps, choices that
// only touch the settings when you finish, and "Skip" on every step, which keeps the defaults.
import type { ProviderId } from '../providers/types';
import { type Settings, merge } from '../settings';
import type { TwitchHide } from '../hide';

export const ONBOARDING_KEY = 'onboarding';
/** Bump when the steps change enough to show them again to people who finished an older one. */
export const ONBOARDING_VERSION = 1;

export type Step = 'providers' | 'looks' | 'done';
export const STEPS: Step[] = ['providers', 'looks', 'done'];

export type Preset = 'asIs' | 'clean';

export type Choices = {
  emotes: Record<ProviderId, boolean>;
  preset: Preset;
  readableColors: boolean;
  timestamps: boolean;
};

/** What "Clean Twitch" hides: upsells, suggestions and the busiest cards, nothing you'd miss. */
export const CLEAN_TWITCH: TwitchHide[] = [
  'topPrime',
  'topBits',
  'topAdFree',
  'sidebarStories',
  'sidebarAlsoWatch',
  'hypeChat',
  'leaderboard',
  'giftBanners',
  'celebrations',
  'firstChatter',
];

export type State = { step: Step; choices: Choices; skipped: boolean };

/** The first screen, with the choices pre-set from the current settings (defaults on a new install). */
export function initial(s: Settings): State {
  const clean = CLEAN_TWITCH.every((k) => s.chat.hide[k]);
  return {
    step: 'providers',
    skipped: false,
    choices: { emotes: { ...s.emotes }, preset: clean ? 'clean' : 'asIs', readableColors: s.chat.readableColors, timestamps: s.chat.timestamps },
  };
}

export function next(state: State): State {
  const i = STEPS.indexOf(state.step);
  return { ...state, step: STEPS[Math.min(i + 1, STEPS.length - 1)]! };
}

export function back(state: State): State {
  const i = STEPS.indexOf(state.step);
  return { ...state, step: STEPS[Math.max(i - 1, 0)]! };
}

/**
 * Skip. From the first step: straight to the end, choices dropped, the defaults stay. From the
 * second ("Skip the rest"): the first step's choices are kept and this step's are dropped.
 */
export function skip(state: State, current: Settings): State {
  if (state.step !== 'looks') return { ...state, step: 'done', skipped: true };
  const was = initial(current).choices;
  return { ...state, step: 'done', skipped: false, choices: { ...state.choices, preset: was.preset, readableColors: was.readableColors, timestamps: was.timestamps } };
}

/** The settings after the user's choices; skipped means unchanged. */
export function apply(s: Settings, state: State): Settings {
  if (state.skipped) return s;
  const c = state.choices;
  const hide = { ...s.chat.hide };
  // "Keep it as it is" changes nothing (so reopening the page never undoes your own choices).
  if (c.preset === 'clean') for (const k of CLEAN_TWITCH) hide[k] = true;
  return merge({ ...s, emotes: { ...s.emotes, ...c.emotes }, chat: { ...s.chat, hide, readableColors: c.readableColors, timestamps: c.timestamps } });
}

export type Progress = { done: boolean; version: number; at: number };

export function readProgress(stored: unknown): Progress | null {
  if (typeof stored !== 'object' || stored === null) return null;
  const o = stored as Record<string, unknown>;
  return o.done === true && typeof o.version === 'number' ? { done: true, version: o.version, at: typeof o.at === 'number' ? o.at : 0 } : null;
}

/** Whether a fresh install (or an update) should open the welcome page. */
export function shouldShow(reason: string, stored: unknown): boolean {
  if (reason !== 'install') return false;
  const p = readProgress(stored);
  return !p || p.version < ONBOARDING_VERSION;
}
