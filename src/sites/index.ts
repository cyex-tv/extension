// Site adapters: where chat messages are, which part of a message is its text, who sent it, and
// which channel this is. One module per site; all selectors live here.
import type { Platform } from '../providers/types';
import type { Clutter } from '../settings';

export type Channel = { platform: Platform; id: string; login: string };

export interface Site {
  platform: Platform;
  /** Chat message elements under `root` (or `root` itself). */
  messages(root: ParentNode): Element[];
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
  /** CSS selectors of page parts that can be hidden; a missing key isn't available here. */
  clutter: Partial<Record<Clutter, string>>;
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
