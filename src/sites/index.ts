// Site adapters: where chat messages are, which part of a message is its text, who sent it, and
// which channel this is. One module per site; all selectors live here.
import type { Platform } from '../providers/types';
import type { HideSelectors } from '../hide';

export type Channel = { platform: Platform; id: string; login: string };

export interface Site {
  platform: Platform;
  /** Chat message elements under `root` (or `root` itself). */
  messages(root: ParentNode): Element[];
  /** CSS selector matching one chat message (for styles that apply to every line). */
  messageSelector: string;
  /** Where a timestamp goes: before this element (the badges and name). */
  timeSlot(message: Element): Element | null;
  /** The element holding a message's text and emotes. */
  body(message: Element): Element | null;
  /** The sender's platform user ID, once the page script has tagged the message. */
  sender(message: Element): string | null;
  /** The sender's login, lower case. */
  login(message: Element): string | null;
  /** The channel being shown, or null while unknown. */
  channel(): Promise<Channel | null>;
  /** Parts of a message that must never be rewritten (native emotes, mentions, links). */
  skip: string;
  /** Where other providers' badges go: before this element. Null where they don't apply. */
  badgeSlot(message: Element): Element | null;
  /** The chatter's name, for name paints. */
  nameElement(message: Element): HTMLElement | null;
  /** The signed-in viewer's login, lower case, or null when signed out or unknown. */
  self(doc: Document): string | null;
  /** The scrolling list that holds the messages. */
  chatList(doc: Document): Element | null;
  /** The message box (a contenteditable or a textarea). */
  chatInput(doc: Document): HTMLElement | null;
  /** Where buttons next to the message box go (the emote menu): before this element. */
  inputButtonSlot(doc: Document): Element | null;
  /** The site's own "message deleted" notice in a message, once it was removed. */
  deletedNotice(message: Element): Element | null;
  /** Whether the page script marked this as the sender's first message in the channel. */
  isFirst(message: Element): boolean;
  /**
   * Page parts that can be hidden ("Hide on Twitch" / "Hide on Kick"), keyed as in src/hide.ts:
   * several selectors each, most stable first, so a renamed class only loses one of them.
   */
  hide: Readonly<Record<string, HideSelectors>>;
  /** The channel points "claim bonus" button, when shown. */
  claimButton(doc: Document): HTMLElement | null;
  /** The site's user card, when open, and the login it shows. */
  userCard(doc: Document): { card: Element; login: string } | null;
}

/** The login in the address: `/name`, `/popout/name/chat`, `/moderator/name`. */
export function loginFromPath(path: string): string | null {
  const parts = path.split('/').filter(Boolean);
  const first = parts[0]?.toLowerCase();
  if (!first) return null;
  if (first === 'popout' || first === 'moderator' || first === 'embed') return parts[1]?.toLowerCase() ?? null;
  const reserved = ['directory', 'search', 'settings', 'subscriptions', 'inventory', 'wallet', 'drops', 'videos', 'browse', 'categories', 'following'];
  return reserved.includes(first) ? null : first;
}

/** A cookie's value, or null. */
export function cookie(doc: Document, name: string): string | null {
  for (const part of doc.cookie.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('=')) || null;
  }
  return null;
}

const LOGIN = /^[a-z0-9_]{2,25}$/i;

/** The login a user card shows: a profile link inside it (`/name`), else an "@name" text. */
export function cardLogin(card: Element, linkSelector: string): string | null {
  for (const a of card.querySelectorAll<HTMLAnchorElement>(linkSelector)) {
    const href = a.getAttribute('href') ?? '';
    const path = href.startsWith('http') ? safePath(href) : href.split(/[?#]/)[0] ?? '';
    const parts = path.split('/').filter(Boolean);
    // Only a bare `/name` is a profile link; `/name/videos` and the like are other pages.
    const login = parts.length === 1 ? loginFromPath(`/${parts[0]}`) : null;
    if (login && LOGIN.test(login)) return login;
  }
  const at = /(?:^|\s)@([a-z0-9_]{2,25})(?:\s|$)/i.exec(card.textContent ?? '');
  return at?.[1] ? at[1].toLowerCase() : null;
}

function safePath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
}

/** A Twitch or Kick channel (user) ID: digits only. */
export const CHANNEL_ID = /^\d{1,20}$/;
