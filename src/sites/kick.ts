// Kick chat: entries are `[data-index]` rows inside `#chatroom-messages`; the text follows the
// ": " separator after the username. Kick's own emotes are `[data-emote-id]` spans. The channel
// comes from Kick's public channel endpoint (same origin): cyex.tv and 7TV key Kick channels by
// the broadcaster's user ID.
import type { HideSelectors, KickHide } from '../hide';
import { CHANNEL_ID, type Channel, type Site, cardLogin, loginFromPath } from './index';

// Every Kick selector the extension uses is in this file.

const MESSAGE = '#chatroom-messages [data-index]';

// What "Hide on Kick" hides. Kick has few stable hooks (Tailwind classes), so these lean on ids,
// data-testid and aria labels, and need a live check now and then. Our own buttons carry
// `data-cyextv`, which every rule here leaves alone.
const OURS = ':not([data-cyextv])';
export const KICK_HIDE_SELECTORS: Record<KickHide, HideSelectors> = {
  sidebar: ['#sidebar-wrapper', '[data-testid="sidebar"]', 'nav[data-sidebar]'],
  sidebarFollowing: ['[data-testid="sidebar-following"]', '#sidebar-wrapper [data-testid*="following"]', '#sidebar-wrapper [aria-label*="Following"]'],
  // The entries are `sidebar-recommended-channel-N`; the section holding them (heading and "show
  // more") goes too, unless it also holds the Following list (then only the entries go).
  sidebarRecommended: [
    '[data-testid="sidebar-recommended"]',
    '#sidebar-wrapper [data-testid*="recommended"]',
    '#sidebar-wrapper [aria-label*="ecommended"]',
    '#sidebar-wrapper :is(section, div):has(> [data-testid^="sidebar-recommended-channel"]):not(:has([data-testid*="following"]))',
  ],
  pinned: ['[data-testid="pinned-message"]', '[data-testid*="pinned-message"]'],
  predictions: ['[data-testid*="prediction"]', '[data-testid*="poll"]'],
  giftBanners: ['[data-testid*="gift-banner"]', '[data-testid*="sub-gift"]'],
  // Only inside the chat: the home page has a "Featured Leaderboards" section of its own.
  leaderboard: [
    '#channel-chatroom [data-testid*="leaderboard"]',
    '[id^="chatroom"] [data-testid*="leaderboard"]',
    '#channel-chatroom button[aria-label*="eaderboard" i]',
    '[id^="chatroom"] button[aria-label*="eaderboard" i]',
  ],
  emoteButton: [`#chat-emotes-btn${OURS}`, `[data-testid="emote-picker-button"]${OURS}`, `button[aria-label="Emotes"]${OURS}:not(.cyextv-em-btn)`],
  kicksButton: [`[data-testid*="kicks"]${OURS}`, `button[aria-label*="Kicks"]${OURS}`],
};

let cached: { login: string; channel: Channel | null } | null = null;

export const kick: Site = {
  platform: 'kick',
  messageSelector: MESSAGE,
  // Before the block with the name (Kick's own clock, when it shows one, stays ahead of ours).
  timeSlot(message) {
    return message.querySelector('button[title]')?.parentElement ?? null;
  },
  messages(root) {
    const out = root instanceof Element && root.matches(MESSAGE) ? [root] : [];
    return out.concat([...root.querySelectorAll(MESSAGE)]);
  },
  body(message) {
    // The ": " after the username closes the name block; the text is what follows it, either
    // right after it or after the block it ends (both seen on kick.com).
    const separator = [...message.querySelectorAll('span[aria-hidden="true"]')].find((s) => s.textContent?.trim() === ':');
    if (!separator) return null;
    return separator.nextElementSibling ?? separator.parentElement?.nextElementSibling ?? null;
  },
  sender(message) {
    return message.getAttribute('data-cyextv-uid');
  },
  login(message) {
    return message.querySelector('button[title]')?.getAttribute('title')?.toLowerCase() ?? null;
  },
  async channel(): Promise<Channel | null> {
    const login = loginFromPath(location.pathname);
    if (!login) return null;
    if (cached?.login === login) return cached.channel;
    try {
      // Kick answering slowly must not hold chat up for long: then the channel is unknown for now.
      const res = await fetch(`/api/v2/channels/${encodeURIComponent(login)}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(5000) });
      const data = res.ok ? ((await res.json()) as { user_id?: unknown; slug?: unknown }) : null;
      const raw = data && (typeof data.user_id === 'number' || typeof data.user_id === 'string') ? String(data.user_id) : null;
      // Kick's user IDs are whole numbers; anything else isn't used in topics or URLs.
      const id = raw && CHANNEL_ID.test(raw) ? raw : null;
      cached = { login, channel: id ? { platform: 'kick', id, login } : null };
    } catch {
      return null;
    }
    return cached.channel;
  },
  skip: '[data-emote-id], a, img, button',
  // The badge providers so far (cyex deck, BTTV, FFZ) are Twitch-only.
  badgeSlot() {
    return null;
  },
  nameElement(message) {
    return message.querySelector<HTMLElement>('button[title]');
  },
  // Kick keeps the signed-in user in its app state only; "Your other names" covers it.
  self() {
    return null;
  },
  chatList(doc) {
    return doc.querySelector('#chatroom-messages');
  },
  chatInput(doc) {
    return doc.querySelector<HTMLElement>('[data-testid="chat-input"], #message-input');
  },
  inputButtonSlot(doc) {
    return this.chatInput(doc)?.parentElement?.nextElementSibling ?? null;
  },
  deletedNotice(message) {
    return message.querySelector('[data-cyextv-deleted], .line-through');
  },
  isFirst(message) {
    return message.hasAttribute('data-cyextv-first');
  },
  hide: KICK_HIDE_SELECTORS,
  claimButton() {
    return null;
  },
  // Needs a live check: Kick's name popup has no stable hooks we know of, so take a popover or
  // dialog that has a bare profile link (`/name`) and isn't the chat itself.
  userCard(doc) {
    for (const card of doc.querySelectorAll('[data-testid*="user-card"], [data-testid*="user-info"], [role="dialog"], [data-radix-popper-content-wrapper]')) {
      if (card.closest('#chatroom-messages')) continue;
      const login = cardLogin(card, 'a[href^="/"]');
      if (login) return { card, login };
    }
    return null;
  },
};
