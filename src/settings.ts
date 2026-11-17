// The user's choices, kept in the browser's synced storage. Every provider can be switched off
// on its own; emotes and cosmetics (badges, paints) are separate switches. The chat features
// (`chat`) follow cyex deck's settings: same names, same defaults, except that sounds start off
// and anything the sites already do themselves starts off too.
import { DEFAULT_ORDER } from './providers';
import type { ProviderId } from './providers/types';

export type Animations = 'on' | 'off' | 'hover';
export type DeletedStyle = 'site' | 'strike' | 'faded' | 'hidden';
export type Clock = '24h' | '12h';

/** A word rule (cyex deck's Highlights → Words). */
export type HighlightRule = {
  pattern: string;
  regex: boolean;
  wholeWord: boolean;
  matchCase: boolean;
  /** `#rrggbb`; empty means the default (red for words). */
  color: string;
  sound: boolean;
  /** Colour only the matched words; the line stays plain. */
  wordsOnly: boolean;
};

/** A people rule (Highlights → People): messages from this login. */
export type PersonRule = { name: string; color: string; sound: boolean };

/** An ignore rule (Ignores → Words). */
export type IgnoreRule = {
  pattern: string;
  regex: boolean;
  matchCase: boolean;
  /** Hide the whole message; off swaps the matched words for `swap`. */
  hide: boolean;
  swap: string;
};

/** Parts of the sites' pages that can be hidden (Clean up). */
export const CLUTTER = ['bits', 'points', 'predictions', 'hypeChat', 'leaderboard', 'recommended', 'giftBanners', 'viewerCount'] as const;
export type Clutter = (typeof CLUTTER)[number];

export type ChatSettings = {
  // Messages
  deleted: DeletedStyle;
  readableColors: boolean;
  alternate: boolean;
  separators: boolean;
  /** Chat text size in px; 0 keeps the site's. */
  fontSize: number;
  lastRead: boolean;
  // Timestamps
  timestamps: boolean;
  seconds: boolean;
  clock: Clock;
  // Highlights
  mentions: boolean;
  mentionSound: boolean;
  firstMessages: boolean;
  ownMessages: boolean;
  /** Other names that count as yours (nicknames, a second account). */
  myNames: string[];
  highlights: HighlightRule[];
  people: PersonRule[];
  neverHighlight: string[];
  // Ignores
  ignores: IgnoreRule[];
  hiddenPeople: string[];
  // Writing
  tabComplete: boolean;
  mentionComma: boolean;
  emoteMenu: boolean;
  // Usercard
  usercardMessages: boolean;
  // Clean up
  hide: Record<Clutter, boolean>;
  autoClaim: boolean;
  // Emotes
  richTooltips: boolean;
  // Keyboard
  shortcuts: boolean;
};

export type Settings = {
  emotes: Record<ProviderId, boolean>;
  cosmetics: { cyexdeck: boolean; '7tv': boolean; bttv: boolean; ffz: boolean };
  /** Which provider's emote wins a shared name; earlier wins. */
  order: ProviderId[];
  animations: Animations;
  /** `platform:login` of channels where the extension stays out. */
  disabledChannels: string[];
  tooltips: boolean;
  /** Draw a provider's emotes even when its own extension (7TV, BTTV, FFZ) is installed. */
  overrideOthers: boolean;
  chat: ChatSettings;
};

/** Lists are capped so the settings stay inside synced storage's 8 KB per item. */
export const MAX_RULES = 40;
export const MAX_NAMES = 100;

export const CHAT_DEFAULTS: ChatSettings = {
  deleted: 'strike',
  readableColors: true,
  alternate: false,
  separators: false,
  fontSize: 0,
  lastRead: true,
  timestamps: false,
  seconds: false,
  clock: '24h',
  mentions: true,
  mentionSound: false,
  firstMessages: true,
  ownMessages: false,
  myNames: [],
  highlights: [],
  people: [],
  neverHighlight: [],
  ignores: [],
  hiddenPeople: [],
  tabComplete: true,
  mentionComma: false,
  emoteMenu: true,
  usercardMessages: true,
  hide: Object.fromEntries(CLUTTER.map((c) => [c, false])) as Record<Clutter, boolean>,
  autoClaim: false,
  richTooltips: true,
  shortcuts: true,
};

export const DEFAULTS: Settings = {
  emotes: { cyextv: true, '7tv': true, bttv: true, ffz: true },
  cosmetics: { cyexdeck: true, '7tv': true, bttv: true, ffz: true },
  order: [...DEFAULT_ORDER],
  animations: 'on',
  disabledChannels: [],
  tooltips: true,
  overrideOthers: false,
  chat: CHAT_DEFAULTS,
};

const KEY = 'settings';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 200): string | null => (typeof v === 'string' ? v.slice(0, max) : null);
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
const oneOf = <T extends string>(v: unknown, all: readonly T[], d: T): T => (all.includes(v as T) ? (v as T) : d);
const color = (v: unknown): string => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : '');

/** Logins: trimmed, lower case, without @, unique. */
export function names(v: unknown, max = MAX_NAMES): string[] {
  if (!Array.isArray(v)) return [];
  const out = v.flatMap((n) => {
    const s = str(n, 60)?.trim().replace(/^@/, '').toLowerCase();
    return s ? [s] : [];
  });
  return [...new Set(out)].slice(0, max);
}

function list<T>(v: unknown, item: (o: Obj) => T | null): T[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((o) => {
    const r = isObj(o) ? item(o) : null;
    return r ? [r] : [];
  }).slice(0, MAX_RULES);
}

export function highlightRule(o: Obj): HighlightRule | null {
  const pattern = str(o.pattern)?.trim();
  if (!pattern) return null;
  return {
    pattern,
    regex: bool(o.regex, false),
    wholeWord: bool(o.wholeWord, true),
    matchCase: bool(o.matchCase, false),
    color: color(o.color),
    sound: bool(o.sound, false),
    wordsOnly: bool(o.wordsOnly, false),
  };
}

export function personRule(o: Obj): PersonRule | null {
  const name = names([o.name])[0];
  return name ? { name, color: color(o.color), sound: bool(o.sound, false) } : null;
}

export function ignoreRule(o: Obj): IgnoreRule | null {
  const pattern = str(o.pattern)?.trim();
  if (!pattern) return null;
  return { pattern, regex: bool(o.regex, false), matchCase: bool(o.matchCase, false), hide: bool(o.hide, false), swap: str(o.swap, 60) ?? '***' };
}

export function mergeChat(stored: unknown): ChatSettings {
  const c = isObj(stored) ? stored : {};
  const d = CHAT_DEFAULTS;
  const b = (k: keyof ChatSettings) => bool(c[k], d[k] as boolean);
  const hide = isObj(c.hide) ? c.hide : {};
  const size = typeof c.fontSize === 'number' && Number.isFinite(c.fontSize) ? Math.round(c.fontSize) : 0;
  return {
    deleted: oneOf(c.deleted, ['site', 'strike', 'faded', 'hidden'] as const, d.deleted),
    readableColors: b('readableColors'),
    alternate: b('alternate'),
    separators: b('separators'),
    fontSize: size === 0 ? 0 : Math.min(32, Math.max(9, size)),
    lastRead: b('lastRead'),
    timestamps: b('timestamps'),
    seconds: b('seconds'),
    clock: oneOf(c.clock, ['24h', '12h'] as const, d.clock),
    mentions: b('mentions'),
    mentionSound: b('mentionSound'),
    firstMessages: b('firstMessages'),
    ownMessages: b('ownMessages'),
    myNames: names(c.myNames, 10),
    highlights: list(c.highlights, highlightRule),
    people: list(c.people, personRule),
    neverHighlight: names(c.neverHighlight),
    ignores: list(c.ignores, ignoreRule),
    hiddenPeople: names(c.hiddenPeople),
    tabComplete: b('tabComplete'),
    mentionComma: b('mentionComma'),
    emoteMenu: b('emoteMenu'),
    usercardMessages: b('usercardMessages'),
    hide: Object.fromEntries(CLUTTER.map((k) => [k, bool(hide[k], d.hide[k])])) as Record<Clutter, boolean>,
    autoClaim: b('autoClaim'),
    richTooltips: b('richTooltips'),
    shortcuts: b('shortcuts'),
  };
}

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
    overrideOthers: typeof s.overrideOthers === 'boolean' ? s.overrideOthers : DEFAULTS.overrideOthers,
    chat: mergeChat(s.chat),
  };
}

export async function load(area: ExtStorageArea): Promise<Settings> {
  return merge((await area.get(KEY))[KEY]);
}

export async function save(area: ExtStorageArea, settings: Settings): Promise<void> {
  await area.set({ [KEY]: settings });
}

export const STORAGE_KEY = KEY;
