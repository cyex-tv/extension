// The user's choices, kept in the browser's synced storage. Every provider can be switched off
// on its own; emotes and cosmetics (badges, paints) are separate switches. The chat features
// (`chat`) follow cyex deck's settings: same names, same defaults, except that sounds start off
// and anything the sites already do themselves starts off too.
import { KICK_HIDE_KEYS, type KickHide, TWITCH_HIDE_KEYS, type TwitchHide } from './hide';
import { DEFAULT_ORDER } from './providers';
import type { ProviderId } from './providers/types';

export type Animations = 'on' | 'off' | 'hover';
export type DeletedStyle = 'site' | 'strike' | 'faded' | 'hidden';
export type Clock = '24h' | '12h';
export type ChatFont = 'site' | 'system' | 'serif' | 'mono';
export type EmoteClick = 'off' | 'insert' | 'copy';
export type Sound = 'chime' | 'ping' | 'pop';

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

/** Parts of Twitch's page that can be hidden (see src/hide.ts); Kick's are `hideKick`. */
export const CLUTTER = TWITCH_HIDE_KEYS;
export type Clutter = TwitchHide;

export type ChatSettings = {
  // Messages
  deleted: DeletedStyle;
  readableColors: boolean;
  alternate: boolean;
  separators: boolean;
  /** Chat text size in px; 0 keeps the site's. */
  fontSize: number;
  font: ChatFont;
  /** Line height in percent; 0 keeps the site's. */
  lineHeight: number;
  compact: boolean;
  /** Emote size in percent of the sites' 28 px; 0 keeps it. */
  emoteScale: number;
  emoteClick: EmoteClick;
  /** Strip invisible characters (zero-width spaces, 7TV's duplicate bypass) from messages. */
  cleanInvisible: boolean;
  /** Cut stacks of combining marks ("zalgo") down to three. */
  cleanZalgo: boolean;
  lastRead: boolean;
  // Timestamps
  timestamps: boolean;
  seconds: boolean;
  clock: Clock;
  // Highlights
  mentions: boolean;
  mentionSound: boolean;
  sound: Sound;
  /** 0 to 100. */
  volume: number;
  /** Keep the latest mentions on this device, for the popup's list. */
  mentionsInbox: boolean;
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
  // Hide on Twitch, Hide on Kick
  hide: Record<TwitchHide, boolean>;
  hideKick: Record<KickHide, boolean>;
  autoClaim: boolean;
  // Emotes
  richTooltips: boolean;
  // People
  /** Show your local nicknames instead of display names. */
  nicknames: boolean;
  /** Nickname and note fields on the site's user card. */
  usercardNotes: boolean;
  // Keyboard
  shortcuts: boolean;
};

export type Settings = {
  emotes: Record<ProviderId, boolean>;
  cosmetics: { cyextv: boolean; cyexdeck: boolean; '7tv': boolean; bttv: boolean; ffz: boolean };
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

function offAll<K extends string>(keys: readonly K[]): Record<K, boolean> {
  return Object.fromEntries(keys.map((k) => [k, false])) as Record<K, boolean>;
}

export const CHAT_DEFAULTS: ChatSettings = {
  deleted: 'strike',
  readableColors: true,
  alternate: false,
  separators: false,
  fontSize: 0,
  font: 'site',
  lineHeight: 0,
  compact: false,
  emoteScale: 0,
  emoteClick: 'insert',
  cleanInvisible: true,
  cleanZalgo: true,
  lastRead: true,
  timestamps: false,
  seconds: false,
  clock: '24h',
  mentions: true,
  mentionSound: false,
  sound: 'chime',
  volume: 60,
  mentionsInbox: true,
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
  hide: offAll(TWITCH_HIDE_KEYS),
  hideKick: offAll(KICK_HIDE_KEYS),
  autoClaim: false,
  richTooltips: true,
  nicknames: true,
  usercardNotes: true,
  shortcuts: true,
};

export const DEFAULTS: Settings = {
  emotes: { cyextv: true, '7tv': true, bttv: true, ffz: true },
  cosmetics: { cyextv: true, cyexdeck: true, '7tv': true, bttv: true, ffz: true },
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
  const flags = <K extends string>(keys: readonly K[], over: unknown, base: Record<K, boolean>): Record<K, boolean> => {
    const o = isObj(over) ? over : {};
    return Object.fromEntries(keys.map((k) => [k, bool(o[k], base[k])])) as Record<K, boolean>;
  };
  const size = typeof c.fontSize === 'number' && Number.isFinite(c.fontSize) ? Math.round(c.fontSize) : 0;
  /** A whole number in [min, max], or `zero` (meaning "like the site") for 0 and junk. */
  const range = (v: unknown, min: number, max: number, zero: number) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || Math.round(v) === 0) return zero;
    return Math.min(max, Math.max(min, Math.round(v)));
  };
  return {
    deleted: oneOf(c.deleted, ['site', 'strike', 'faded', 'hidden'] as const, d.deleted),
    readableColors: b('readableColors'),
    alternate: b('alternate'),
    separators: b('separators'),
    fontSize: size === 0 ? 0 : Math.min(32, Math.max(9, size)),
    font: oneOf(c.font, ['site', 'system', 'serif', 'mono'] as const, d.font),
    lineHeight: range(c.lineHeight, 100, 200, 0),
    compact: b('compact'),
    emoteScale: range(c.emoteScale, 50, 300, 0),
    emoteClick: oneOf(c.emoteClick, ['off', 'insert', 'copy'] as const, d.emoteClick),
    cleanInvisible: b('cleanInvisible'),
    cleanZalgo: b('cleanZalgo'),
    lastRead: b('lastRead'),
    timestamps: b('timestamps'),
    seconds: b('seconds'),
    clock: oneOf(c.clock, ['24h', '12h'] as const, d.clock),
    mentions: b('mentions'),
    mentionSound: b('mentionSound'),
    sound: oneOf(c.sound, ['chime', 'ping', 'pop'] as const, d.sound),
    volume: typeof c.volume === 'number' && Number.isFinite(c.volume) ? Math.min(100, Math.max(0, Math.round(c.volume))) : d.volume,
    mentionsInbox: b('mentionsInbox'),
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
    hide: flags(TWITCH_HIDE_KEYS, c.hide, d.hide),
    hideKick: flags(KICK_HIDE_KEYS, c.hideKick, d.hideKick),
    autoClaim: b('autoClaim'),
    richTooltips: b('richTooltips'),
    nicknames: b('nicknames'),
    usercardNotes: b('usercardNotes'),
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

/**
 * What is stored: only what differs from the defaults (synced storage allows 8 KB per item, and
 * most of the switches stay as they are). `merge` fills the rest back in.
 */
export function compact(settings: Settings): Record<string, unknown> {
  return (diff(settings, DEFAULTS) ?? {}) as Record<string, unknown>;
}

function diff(value: unknown, base: unknown): unknown {
  if (isObj(value) && isObj(base)) {
    const out: Obj = {};
    for (const [k, v] of Object.entries(value)) {
      const d = k in base ? diff(v, base[k]) : v;
      if (d !== undefined) out[k] = d;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return JSON.stringify(value) === JSON.stringify(base) ? undefined : value;
}

export async function save(area: ExtStorageArea, settings: Settings): Promise<void> {
  await area.set({ [KEY]: compact(settings) });
}

export const STORAGE_KEY = KEY;
