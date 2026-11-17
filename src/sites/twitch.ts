// Twitch chat: messages are `[data-a-target="chat-line-message"]`, their text sits in
// `.text-fragment` spans inside `[data-a-target="chat-line-message-body"]`. The page script
// tags each message with its sender and <html> with the channel ID.
import { type Channel, type Site, loginFromPath } from './index';

const MESSAGE = '[data-a-target="chat-line-message"]';

export const twitch: Site = {
  platform: 'twitch',
  messages(root) {
    const out = root instanceof Element && root.matches(MESSAGE) ? [root] : [];
    return out.concat([...root.querySelectorAll(MESSAGE)]);
  },
  body(message) {
    return message.querySelector('[data-a-target="chat-line-message-body"]');
  },
  sender(message) {
    return message.getAttribute('data-cyextv-uid');
  },
  async channel(): Promise<Channel | null> {
    const id = document.documentElement.dataset.cyextvChannel;
    const login = loginFromPath(location.pathname);
    return id && login ? { platform: 'twitch', id, login } : null;
  },
  skip: '[data-a-target="emote-name"], .mention-fragment, .link-fragment, a, img, button',
  badgeSlot(message) {
    return message.querySelector('.chat-line__username');
  },
};
