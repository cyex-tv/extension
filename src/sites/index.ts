// Site adapters: where chat messages are, which part of a message is its text, who sent it, and
// which channel this is. One module per site; all selectors live here.
import type { Platform } from '../providers/types';

export type Channel = { platform: Platform; id: string; login: string };

export interface Site {
  platform: Platform;
  /** Chat message elements under `root` (or `root` itself). */
  messages(root: ParentNode): Element[];
  /** The element holding a message's text and emotes. */
  body(message: Element): Element | null;
  /** The sender's platform user ID, once the page script has tagged the message. */
  sender(message: Element): string | null;
  /** The channel being shown, or null while unknown. */
  channel(): Promise<Channel | null>;
  /** Parts of a message that must never be rewritten (native emotes, mentions, links). */
  skip: string;
  /** Where other providers' badges go: before this element. Null where they don't apply. */
  badgeSlot(message: Element): Element | null;
  /** The chatter's name, for name paints. */
  nameElement(message: Element): HTMLElement | null;
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
