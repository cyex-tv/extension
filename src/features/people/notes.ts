// Nicknames and notes: your own name for a chatter and a private note, kept on this device only
// (storage.local; the sites never see them). The nickname shows instead of their display name in
// chat (their real name stays in the tooltip, with the note); both are edited on the site's user
// card or on the settings page.
import { BIDI_CONTROLS } from '../looks/clean';
import type { Feature, FeatureContext } from '../types';

export const NOTES_KEY = 'userNotes';
/** Set once the notes are keyed by platform and login (older ones were by login alone). */
export const NOTES_VERSION_KEY = 'userNotesVersion';
export const NOTES_VERSION = 2;
export const NOTES_MAX = 500;
export const NICK_MAX = 25;
export const NOTE_MAX = 500;

export type NotePlatform = 'twitch' | 'kick';
export type UserNote = { nick: string; note: string };
/** Entries by `platform:login`: the same name on Twitch and on Kick is two people. */
export type Notes = Record<string, UserNote>;

// Not "__...": that keeps __proto__ out. Names Object.prototype owns are skipped too, so a stored
// or imported entry can never reach (or shadow) the prototype.
const LOGIN = /^(?!__)[a-z0-9_]{1,25}$/;
const RESERVED = new Set(['__proto__', 'constructor', 'prototype']);
const validLogin = (key: string) => LOGIN.test(key) && !RESERVED.has(key);
const isPlatform = (p: string): p is NotePlatform => p === 'twitch' || p === 'kick';

/** The key of a chatter's entry; null when the login can't be one. */
export function noteKey(platform: NotePlatform, login: string): string | null {
  const l = login.toLowerCase();
  return validLogin(l) ? `${platform}:${l}` : null;
}

/** Splits a key into platform and login (null for anything that isn't one). */
export function splitNoteKey(key: string): { platform: NotePlatform; login: string } | null {
  const i = key.indexOf(':');
  if (i < 0) return null;
  const platform = key.slice(0, i);
  const login = key.slice(i + 1);
  return isPlatform(platform) && validLogin(login) ? { platform, login } : null;
}

/** A notes object with no prototype, so a login can't collide with an inherited name. */
const blank = (): Notes => Object.create(null) as Notes;

/**
 * Stored notes, checked: keys `platform:login` with the login lower case, lengths capped, empty
 * entries dropped. A key without a platform is from before notes were kept per platform (or from
 * an old backup): it was a Twitch name, so it becomes `twitch:`; an entry already under
 * `twitch:` wins over it.
 */
export function readNotes(stored: unknown): Notes {
  const out = blank();
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return out;
  const entries = Object.entries(stored as Record<string, unknown>);
  // Keys with a platform first, so a legacy one never takes the place of a real one.
  entries.sort(([a], [b]) => Number(b.includes(':')) - Number(a.includes(':')));
  for (const [raw, v] of entries) {
    if (Object.keys(out).length >= NOTES_MAX) break;
    const lower = raw.toLowerCase();
    const parts = lower.includes(':') ? splitNoteKey(lower) : validLogin(lower) ? { platform: 'twitch' as const, login: lower } : null;
    if (!parts || typeof v !== 'object' || v === null) continue;
    const key = `${parts.platform}:${parts.login}`;
    if (Object.hasOwn(out, key)) continue;
    const o = v as Record<string, unknown>;
    const entry = clean({ nick: typeof o.nick === 'string' ? o.nick : '', note: typeof o.note === 'string' ? o.note : '' });
    if (entry) out[key] = entry;
  }
  return out;
}

/**
 * Once: moves notes kept by login alone to `twitch:login` (they could only ever have been
 * written from Twitch chat plus the settings page, which showed no platform). Safe to run in every
 * tab at once: it is the same result each time, and it only runs while the version is old.
 */
export async function migrateNotes(local: ExtStorageArea): Promise<void> {
  const got = await local.get([NOTES_KEY, NOTES_VERSION_KEY]);
  if (typeof got[NOTES_VERSION_KEY] === 'number' && (got[NOTES_VERSION_KEY] as number) >= NOTES_VERSION) return;
  const stored = got[NOTES_KEY];
  await local.set(stored === undefined ? { [NOTES_VERSION_KEY]: NOTES_VERSION } : { [NOTES_KEY]: readNotes(stored), [NOTES_VERSION_KEY]: NOTES_VERSION });
}

function clean(n: UserNote): UserNote | null {
  const nick = n.nick.replace(BIDI_CONTROLS, '').replace(/\s+/g, ' ').trim().slice(0, NICK_MAX);
  const note = n.note.replace(BIDI_CONTROLS, '').trim().slice(0, NOTE_MAX);
  return nick || note ? { nick, note } : null;
}

/** The notes for this content script or page: loaded once, saved on change, listeners told. */
export class NotesStore {
  private notes: Notes = blank();
  private listeners = new Set<() => void>();
  private local: ExtStorageArea | null = null;
  /** Changes are written one after the other, each onto what storage holds when its turn comes. */
  private queue: Promise<void> = Promise.resolve();

  async load(local: ExtStorageArea | null): Promise<void> {
    this.local = local;
    if (!local) return;
    try {
      await migrateNotes(local);
      this.replace((await local.get(NOTES_KEY))[NOTES_KEY]);
    } catch {
      /* no storage: no notes */
    }
  }

  /** Takes a new stored value (another tab or the settings page changed it). */
  replace(stored: unknown): void {
    this.notes = readNotes(stored);
    for (const l of this.listeners) l();
  }

  get(platform: NotePlatform, login: string): UserNote | null {
    const key = noteKey(platform, login);
    return key && Object.hasOwn(this.notes, key) ? this.notes[key]! : null;
  }

  all(): Notes {
    return Object.assign(blank(), this.notes);
  }

  /** Sets or (with both empty) removes a chatter's entry, and saves. */
  set(platform: NotePlatform, login: string, note: UserNote): Promise<void> {
    const key = noteKey(platform, login);
    if (!key) return Promise.resolve();
    const entry = clean(note);
    const run = async () => {
      // Onto what is stored now: notes added in chat (or the settings page) since this copy was
      // loaded stay, whichever page saves.
      let base = this.notes;
      if (this.local) {
        try {
          base = readNotes((await this.local.get(NOTES_KEY))[NOTES_KEY]);
        } catch {
          /* keep the loaded copy */
        }
      }
      const next = Object.assign(blank(), base);
      if (entry) next[key] = entry;
      else delete next[key];
      if (entry && Object.keys(next).length > NOTES_MAX) return;
      this.notes = next;
      for (const l of this.listeners) l();
      await this.local?.set({ [NOTES_KEY]: next, [NOTES_VERSION_KEY]: NOTES_VERSION }).catch(() => {});
    };
    this.queue = this.queue.then(run, run);
    return this.queue;
  }

  /** Replaces every entry (an imported backup), and saves. */
  async setAll(all: Notes): Promise<void> {
    this.notes = readNotes(all);
    for (const l of this.listeners) l();
    await this.local?.set({ [NOTES_KEY]: this.notes, [NOTES_VERSION_KEY]: NOTES_VERSION }).catch(() => {});
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

/** The one store the content script shares between nicknames and the user card. */
export const notes = new NotesStore();

const NICK_ATTR = 'data-cyextv-nick';
// The name's own text is shrunk to nothing and the nickname drawn after it, so the site's text
// node (which React owns) is never touched. Paints still apply: the pseudo-element is the name's.
const CSS = `[${NICK_ATTR}]{font-size:0!important;unicode-bidi:isolate}[${NICK_ATTR}]::after{content:attr(${NICK_ATTR});font-size:var(--cyextv-nick-size,13px)}`;

const TITLED = 'data-cyextv-titled';

/**
 * Puts a nickname on a name element and the note in its tooltip; null takes both off. A name
 * that has a title of its own (Kick reads the login from it) keeps it, and gets no tooltip.
 */
export function applyNick(name: HTMLElement, entry: UserNote | null): void {
  if (entry?.nick) {
    if (!name.hasAttribute(NICK_ATTR)) {
      const size = name.ownerDocument.defaultView?.getComputedStyle(name).fontSize;
      if (size && size !== '0px') name.style.setProperty('--cyextv-nick-size', size);
    }
    name.setAttribute(NICK_ATTR, entry.nick);
  } else if (name.hasAttribute(NICK_ATTR)) {
    name.removeAttribute(NICK_ATTR);
    name.style.removeProperty('--cyextv-nick-size');
  }
  if (name.hasAttribute('title') && !name.hasAttribute(TITLED)) return;
  const real = name.textContent?.trim() ?? '';
  const tip = [entry?.nick && real ? `${real} (your nickname: ${entry.nick})` : '', entry?.note ?? ''].filter(Boolean).join('\n');
  if (tip) {
    name.title = tip;
    name.setAttribute(TITLED, '');
  } else {
    name.removeAttribute('title');
    name.removeAttribute(TITLED);
  }
}

export function nicknames(store: NotesStore = notes): Feature {
  let ctx: FeatureContext | null = null;
  let style: HTMLStyleElement | null = null;
  let off: (() => void) | null = null;

  const each = (fn: (message: Element, login: string) => void) => {
    if (!ctx) return;
    for (const m of ctx.site.messages(ctx.doc)) {
      const login = ctx.site.login(m);
      if (login) fn(m, login);
    }
  };
  const apply = (message: Element, login: string) => {
    const name = ctx?.site.nameElement(message);
    const entry = ctx ? store.get(ctx.site.platform, login) : null;
    if (name && (entry || name.hasAttribute(NICK_ATTR) || name.hasAttribute(TITLED))) applyNick(name, entry);
  };

  return {
    id: 'nicknames',
    enabled: (s) => s.chat.nicknames,
    start(c) {
      ctx = c;
      style = c.doc.createElement('style');
      style.id = 'cyextv-nicknames';
      style.textContent = CSS;
      c.doc.head.append(style);
      // Notes load after the first messages are drawn, and change from the user card.
      off = store.subscribe(() => each(apply));
      each(apply);
    },
    message(message, info) {
      if (info.login) apply(message, info.login);
    },
    stop() {
      off?.();
      off = null;
      ctx?.doc.querySelectorAll<HTMLElement>(`[${NICK_ATTR}], [${TITLED}]`).forEach((n) => applyNick(n, null));
      style?.remove();
      style = null;
      ctx = null;
    },
  };
}
