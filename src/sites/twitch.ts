// Twitch chat: messages are `[data-a-target="chat-line-message"]`, their text sits in
// `.text-fragment` spans inside `[data-a-target="chat-line-message-body"]`. The page script
// tags each message with its sender and <html> with the channel ID. Every Twitch selector the
// extension uses is in this file, so a Twitch redesign is a fix here.
import type { HideSelectors, TwitchHide } from '../hide';
import { type Channel, type Site, cardLogin, cookie, loginFromPath } from './index';

// What "Hide on Twitch" hides. Several selectors per part, most stable first (data attributes,
// then aria labels, then class names; `[class*=]` for Twitch's hashed CSS-module names). Hiding is
// CSS only, so a selector that stops matching just stops hiding; it can't break the page. Each
// needs a check on the live site now and then (docs/test-checklist.md).
const SIDE = ':is(#side-nav, [data-a-target="side-nav-bar"], [data-a-target="side-nav-bar-collapsed"])';
export const TWITCH_HIDE_SELECTORS: Record<TwitchHide, HideSelectors> = {
  sidebar: ['#side-nav', '[data-a-target="side-nav-bar"]', '[data-a-target="side-nav-bar-collapsed"]', '.side-nav'],
  sidebarFollowed: ['.side-nav-section[aria-label*="ollowed"]', `${SIDE} [aria-label="Followed Channels"]`],
  recommended: ['.side-nav-section[aria-label*="ecommended"]', '[data-test-selector="recommended-channels"]', `${SIDE} [aria-label*="ecommended"]`],
  sidebarAlsoWatch: ['.side-nav-section[aria-label*="lso watch" i]', `${SIDE} [aria-label*="also watch" i]`],
  sidebarStories: ['[class*="storiesLeftNavSection"]', `${SIDE} [data-a-target*="stories"]`],
  topPrime: ['.top-nav__prime', '[class*="top-nav__prime"]', '[data-a-target="prime-offers-icon"]'],
  topBits: ['[data-a-target="top-nav-get-bits-button"]', 'nav button[aria-label="Get Bits"]'],
  topAdFree: ['[data-a-target*="turbo-button"]', 'nav a[href*="/turbo"]', 'button[aria-label*="Ad-Free"]', 'a[aria-label*="Ad-Free"]'],
  whispers: ['.whispers-open-threads', '[data-a-target="whisper-thread"]'],
  viewerCount: ['[data-a-target="animated-channel-viewers-count"]', '[data-a-target="channel-viewers-count"]'],
  subButtons: ['[data-a-target="subscribe-button"]', '[data-a-target="gift-button"]', '[data-a-target="sub-gift-button"]'],
  notifyBell: ['[data-a-target="notifications-toggle"]'],
  unfollow: ['[data-test-selector="unfollow-button"]', '[data-a-target="unfollow-button"]'],
  aboutPanels: ['.channel-panels', '[data-a-target="channel-panels"]', '.channel-info-content .about-section', '[data-a-target="about-panel"]'],
  highlightStack: ['.community-highlight-stack', '[class*="community-highlight-stack"]'],
  hypeTrain: ['[class*="hype-train"]', '[data-test-selector*="hype-train"]', '.community-highlight-stack__card:has([class*="hype-train"])'],
  predictions: [
    '[data-test-selector="prediction-checkout-active-header"]',
    '[data-test-selector="community-prediction-highlight-header"]',
    '.community-highlight-stack__card:has([data-test-selector*="prediction"])',
    '.community-highlight-stack__card:has([data-test-selector*="poll"])',
  ],
  hypeChat: ['[data-test-selector="paid-pinned-chat-message-list"]', '.paid-pinned-chat-message-list', '[class*="paid-pinned-chat-message-list"]'],
  // Live Twitch has a button "Expand Top Gifters Leaderboard" in the highlight stack, and entries
  // with data-testid="leaderboard-top-three-entry"; the older channel-leaderboard names stay.
  leaderboard: [
    '[data-test-selector="channel-leaderboard"]',
    '.channel-leaderboard',
    'button[aria-label*="Leaderboard" i]',
    '.community-highlight-stack__card:has(button[aria-label*="Leaderboard" i])',
    '.community-highlight-stack__card:has([data-testid*="leaderboard"])',
  ],
  giftBanners: ['[data-test-selector="gift-sub-banner"]', '.channel-root__gift-banner', '.community-highlight-stack__card[aria-label*="ift"]'],
  chatHeader: ['.stream-chat-header', '[class*="stream-chat-header"]'],
  welcome: ['[data-a-target="chat-welcome-message"]'],
  userNotices: ['[data-test-selector="user-notice-line"]', '.user-notice-line'],
  cheers: ['[data-a-target="chat-line-message"] [class*="cheermote"]', '[data-a-target="chat-line-message"] img[alt^="cheer" i]'],
  replyButton: ['[data-test-selector="chat-reply-button"]', 'button[aria-label^="Click to reply" i]'],
  linkCards: ['[data-test-selector="chat-card"]', '[data-a-target="chat-card"]', '.chat-card'],
  firstChatter: ['[data-test-selector*="first-time-chatter"]', '[class*="first-time-chatter"]'],
  bits: ['[data-a-target="bits-button"]', '[data-test-selector="bits-button"]', 'button[aria-label="Bits"]'],
  hypeChatButton: ['button[aria-label="Hype Chat"]', '[data-a-target="hype-chat-button"]'],
  points: ['[data-test-selector="community-points-summary"]', '.community-points-summary'],
  playerExtensions: ['.video-player .extension-taskbar', '.video-player .extension-container', '.extensions-dock__layout', '.extensions-notifications', '.extensions-video-overlay-size-container'],
  celebrations: ['.celebration__overlay', '[class*="celebration__overlay"]'],
  playerTopBar: ['.video-player .top-bar', '[data-a-target="player-overlay-top-bar"]'],
  clipButton: ['[data-a-target="player-clip-button"]', '.player-controls button[aria-label^="Clip" i]'],
};

const MESSAGE = '[data-a-target="chat-line-message"]';

export const twitch: Site = {
  platform: 'twitch',
  messageSelector: MESSAGE,
  timeSlot(message) {
    return message.querySelector('.chat-line__username-container, .chat-line__username');
  },
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
  hide: TWITCH_HIDE_SELECTORS,
  claimButton(doc) {
    return doc.querySelector<HTMLElement>('.community-points-summary .claimable-bonus__icon')?.closest('button') ?? null;
  },
  userCard(doc) {
    // Twitch has renamed the card's parts before: try the target, then the label, then the class.
    const card = doc.querySelector('[data-a-target="viewer-card"], [data-test-selector="viewer-card"], .viewer-card');
    if (!card) return null;
    const header = '.viewer-card-header__display-name a[href], [data-a-target="viewer-card-header"] a[href], h4 a[href], a[href^="/"], a[href*="twitch.tv/"]';
    const login = cardLogin(card, header);
    return login ? { card, login } : null;
  },
};
