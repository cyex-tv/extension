// Nicknames and notes: your own name for a chatter and a private note, kept on this device only
// (storage.local; the sites never see them). The nickname shows instead of their display name in
// chat (their real name stays in the tooltip, with the note); both are edited on the site's user
// card or on the settings page.
import type { Feature, FeatureContext } from '../types';

export const NOTES_KEY = 'userNotes';
export const NOTES_MAX = 500;
export const NICK_MAX = 25;
export const NOTE_MAX = 500;

export type UserNote = { nick: string; note: string };
export type Notes = Record<string, UserNote>;

const LOGIN = /^[a-z0-9_]{1,25}$/;

/** Stored notes, checked: logins lower case, lengths capped, empty entries dropped. */
export function readNotes(stored: unknown): Notes {
  const out: Notes = {};
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return out;
  for (const [login, v] of Object.entries(stored as Record<string, unknown>)) {
    if (Object.keys(out).length >= NOTES_MAX) break;
    const key = login.toLowerCase();
    if (!LOGIN.test(key) || typeof v !== 'object' || v === null) continue;
    const o = v as Record<string, unknown>;
    const entry = clean({ nick: typeof o.nick === 'string' ? o.nick : '', note: typeof o.note === 'string' ? o.note : '' });
    if (entry) out[key] = entry;
  }
  return out;
}

function clean(n: UserNote): UserNote | null {
  const nick = n.nick.replace(/\s+/g, ' ').trim().slice(0, NICK_MAX);
  const note = n.note.trim().slice(0, NOTE_MAX);
  return nick || note ? { nick, note } : null;
}

/** The notes for this content script or page: loaded once, saved on change, listeners told. */
export class NotesStore {
  private notes: Notes = {};
  private listeners = new Set<() => void>();
  private local: ExtStorageArea | null = null;

  async load(local: ExtStorageArea | null): Promise<void> {
    this.local = local;
    if (!local) return;
    try {
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

  get(login: string): UserNote | null {
    return this.notes[login.toLowerCase()] ?? null;
  }

  all(): Notes {
    return { ...this.notes };
  }

  /** Sets or (with both empty) removes a chatter's entry, and saves. */
  async set(login: string, note: UserNote): Promise<void> {
    const key = login.toLowerCase();
    if (!LOGIN.test(key)) return;
    const entry = clean(note);
    const next = { ...this.notes };
    if (entry) next[key] = entry;
    else delete next[key];
    if (entry && Object.keys(next).length > NOTES_MAX) return;
    this.notes = next;
    for (const l of this.listeners) l();
    await this.local?.set({ [NOTES_KEY]: next }).catch(() => {});
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
const CSS = `[${NICK_ATTR}]{font-size:0!important}[${NICK_ATTR}]::after{content:attr(${NICK_ATTR});font-size:var(--cyextv-nick-size,13px)}`;

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
    const entry = store.get(login);
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
