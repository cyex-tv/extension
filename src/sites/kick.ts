// Kick chat: entries are `[data-index]` rows inside `#chatroom-messages`; the text follows the
// ": " separator after the username. Kick's own emotes are `[data-emote-id]` spans. The channel
// comes from Kick's public channel endpoint (same origin): cyex.tv and 7TV key Kick channels by
// the broadcaster's user ID.
import { type Channel, type Site, loginFromPath } from './index';

const MESSAGE = '#chatroom-messages [data-index]';

let cached: { login: string; channel: Channel | null } | null = null;

export const kick: Site = {
  platform: 'kick',
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
  async channel(): Promise<Channel | null> {
    const login = loginFromPath(location.pathname);
    if (!login) return null;
    if (cached?.login === login) return cached.channel;
    try {
      const res = await fetch(`/api/v2/channels/${encodeURIComponent(login)}`, { headers: { accept: 'application/json' } });
      const data = res.ok ? ((await res.json()) as { user_id?: unknown; slug?: unknown }) : null;
      const id = data && (typeof data.user_id === 'number' || typeof data.user_id === 'string') ? String(data.user_id) : null;
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
};
