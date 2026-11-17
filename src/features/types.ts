// A chat feature: one setting group's behaviour, kept out of the app so each can be tested and
// switched on its own. The app gives every feature the same context and calls it for each chat
// message it sees; a feature never queries the page directly, only through the site adapter.
import type { EmoteIndex } from '../chat/index';
import type { ProviderId } from '../providers/types';
import type { Settings } from '../settings';
import type { Channel, Site } from '../sites/index';

/** Another extension found on the page (the page script looks for them). */
export type Other = Extract<ProviderId, '7tv' | 'bttv' | 'ffz'>;

export type FeatureContext = {
  doc: Document;
  site: Site;
  settings: Settings;
  index: EmoteIndex;
  now: () => number;
  /** The channel shown, once known. */
  channel: () => Channel | null;
  /** Other emote extensions on the page. */
  others: () => Other[];
  /** Per-device storage (favourites, usage counts), or null outside the extension (tests). */
  local: ExtStorageArea | null;
};

/** What the app knows about a message before features see it. */
export type MessageInfo = {
  /** Sender's platform user ID, once tagged. */
  sender: string | null;
  /** Sender's login, lower case. */
  login: string | null;
  /** The message text as typed (emotes as their names), read before emotes are drawn. */
  text: string;
};

export interface Feature {
  readonly id: string;
  /**
   * Extensions that already do this; with any of them on the page the feature stays off, unless
   * the user picked "Draw anyway". Empty or absent: always runs.
   */
  readonly providedBy?: readonly Other[];
  /** Whether the user switched it on. */
  enabled(s: Settings): boolean;
  start?(ctx: FeatureContext): void;
  /** Before emotes are drawn. Returning `false` hides the message and skips the rest. */
  prepare?(message: Element, info: MessageInfo): boolean | void;
  /** After emotes and badges are drawn. */
  message?(message: Element, info: MessageInfo): void;
  stop?(): void;
}

/** Whether a feature should run, given what's installed next to us. */
export function shouldRun(f: Feature, s: Settings, others: readonly string[]): boolean {
  if (!f.enabled(s)) return false;
  if (s.overrideOthers || !f.providedBy?.length) return true;
  return !f.providedBy.some((o) => others.includes(o));
}
