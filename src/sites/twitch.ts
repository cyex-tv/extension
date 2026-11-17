// Twitch chat: messages are `[data-a-target="chat-line-message"]`, their text sits in
// `.text-fragment` spans inside `[data-a-target="chat-line-message-body"]`. The page script
// tags each message with its sender and <html> with the channel ID. Every Twitch selector the
// extension uses is in this file, so a Twitch redesign is a fix here.
import { type Channel, type Site, cookie, loginFromPath } from './index';

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
  login(message) {
    return (message.getAttribute('data-a-user') ?? message.querySelector('.chat-author__display-name')?.getAttribute('data-a-user'))?.toLowerCase() ?? null;
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
  nameElement(message) {
    return message.querySelector<HTMLElement>('.chat-author__display-name');
  },
  self(doc) {
    return cookie(doc, 'login')?.toLowerCase() ?? null;
  },
  chatList(doc) {
    return doc.querySelector('[data-test-selector="chat-scrollable-area__message-container"]');
  },
  chatInput(doc) {
    return doc.querySelector<HTMLElement>('[data-a-target="chat-input"]');
  },
  inputButtonSlot(doc) {
    return doc.querySelector('[data-a-target="emote-picker-button"]')?.closest('div') ?? null;
  },
  deletedNotice(message) {
    return message.querySelector('[data-a-target="chat-deleted-message-placeholder"], .chat-line__message--deleted-notice');
  },
  isFirst(message) {
    return message.hasAttribute('data-cyextv-first');
  },
  clutter: {
    bits: '[data-a-target="bits-button"]',
    points: '.community-points-summary',
    predictions: '.community-highlight-stack__card',
    hypeChat: '.paid-pinned-chat-message-list',
    leaderboard: '.channel-leaderboard',
    recommended: '.side-nav-section[aria-label*="ecommended"]',
    viewerCount: '[data-a-target="animated-channel-viewers-count"]',
  },
  claimButton(doc) {
    return doc.querySelector<HTMLElement>('.community-points-summary .claimable-bonus__icon')?.closest('button') ?? null;
  },
  userCard(doc) {
    const card = doc.querySelector('[data-a-target="viewer-card"]');
    const link = card?.querySelector<HTMLAnchorElement>('.viewer-card-header__display-name a[href], h4 a[href]');
    const login = link ? loginFromPath(new URL(link.href, 'https://www.twitch.tv').pathname) : null;
    return card && login ? { card, login } : null;
  },
};
