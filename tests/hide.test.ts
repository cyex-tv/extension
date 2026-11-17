// @vitest-environment jsdom
// Hide on Twitch / Hide on Kick: the catalog, the selectors (against markup fixtures shaped like
// the sites'), the stylesheet and the feature classes, and the settings that carry them.
import { beforeEach, describe, expect, it } from 'vitest';
import { hiddenKeys, hideClutter, hideCss } from '../src/features/cleanup/hide-clutter';
import type { FeatureContext } from '../src/features/types';
import { KICK_HIDE, KICK_HIDE_KEYS, TWITCH_HIDE, TWITCH_HIDE_KEYS, hideClass } from '../src/hide';
import { PAGES } from '../src/options/schema';
import { DEFAULTS, type Settings, compact, merge } from '../src/settings';
import type { Site } from '../src/sites/index';
import { KICK_HIDE_SELECTORS, kick } from '../src/sites/kick';
import { TWITCH_HIDE_SELECTORS, twitch } from '../src/sites/twitch';

/** Markup shaped like each part on twitch.tv (the element to hide carries `data-fixture`). */
const TWITCH_FIXTURES: Record<string, string> = {
  sidebar: '<div id="side-nav" data-fixture></div>',
  sidebarFollowed: '<div id="side-nav"><div class="side-nav-section" aria-label="Followed Channels" data-fixture></div></div>',
  recommended: '<div class="side-nav-section" aria-label="Recommended Channels" data-fixture></div>',
  sidebarAlsoWatch: '<div class="side-nav-section" aria-label="Viewers Also Watch" data-fixture></div>',
  sidebarStories: '<div class="storiesLeftNavSection--csO9S" data-fixture></div>',
  topPrime: '<nav><div class="top-nav__prime" data-fixture></div></nav>',
  topBits: '<nav><button data-a-target="top-nav-get-bits-button" data-fixture>Get Bits</button></nav>',
  topAdFree: '<nav><a href="https://www.twitch.tv/turbo" data-fixture>Get Ad-Free</a></nav>',
  whispers: '<div class="whispers-open-threads" data-fixture></div>',
  viewerCount: '<p data-a-target="animated-channel-viewers-count" data-fixture>1,204</p>',
  subButtons: '<button data-a-target="subscribe-button" data-fixture>Subscribe</button>',
  notifyBell: '<button data-a-target="notifications-toggle" data-fixture></button>',
  unfollow: '<button data-test-selector="unfollow-button" data-fixture></button>',
  aboutPanels: '<div class="channel-panels" data-fixture></div>',
  highlightStack: '<div class="community-highlight-stack__scroll-area--disable"><div class="community-highlight-stack" data-fixture></div></div>',
  hypeTrain: '<div class="community-highlight-stack__card"><div class="hype-train-header" data-fixture></div></div>',
  predictions: '<div class="community-highlight-stack__card" data-fixture><div data-test-selector="community-prediction-highlight-header"></div></div>',
  hypeChat: '<div class="paid-pinned-chat-message-list" data-fixture></div>',
  leaderboard: '<div class="channel-leaderboard" data-fixture></div>',
  giftBanners: '<div data-test-selector="gift-sub-banner" data-fixture></div>',
  chatHeader: '<div class="stream-chat-header" data-fixture></div>',
  welcome: '<div class="chat-line__status" data-a-target="chat-welcome-message" data-fixture>Welcome to the chat room!</div>',
  userNotices: '<div class="user-notice-line" data-test-selector="user-notice-line" data-fixture></div>',
  cheers: '<div data-a-target="chat-line-message"><img class="chat-image cheermote" alt="Cheer100" data-fixture></div>',
  replyButton: '<div data-a-target="chat-line-message"><button aria-label="Click to Reply" data-fixture></button></div>',
  linkCards: '<div data-a-target="chat-line-message"><div class="chat-card" data-test-selector="chat-card" data-fixture></div></div>',
  firstChatter: '<div data-test-selector="first-time-chatter-prompt" data-fixture></div>',
  bits: '<button data-a-target="bits-button" data-fixture></button>',
  hypeChatButton: '<button aria-label="Hype Chat" data-fixture></button>',
  points: '<div class="community-points-summary" data-fixture></div>',
  playerExtensions: '<div class="video-player"><div class="extension-taskbar" data-fixture></div></div>',
  celebrations: '<div class="celebration__overlay" data-fixture></div>',
  playerTopBar: '<div class="video-player"><div class="top-bar" data-fixture></div></div>',
  clipButton: '<div class="player-controls"><button data-a-target="player-clip-button" data-fixture></button></div>',
};

const KICK_FIXTURES: Record<string, string> = {
  sidebar: '<div id="sidebar-wrapper" data-fixture></div>',
  sidebarFollowing: '<div id="sidebar-wrapper"><div data-testid="sidebar-following" data-fixture></div></div>',
  sidebarRecommended: '<div id="sidebar-wrapper"><div data-testid="sidebar-recommended" data-fixture></div></div>',
  pinned: '<div id="chatroom-top"><div data-testid="pinned-message" data-fixture></div></div>',
  predictions: '<div id="chatroom-top"><div data-testid="prediction-card" data-fixture></div></div>',
  giftBanners: '<div id="chatroom-top"><div data-testid="gift-banner" data-fixture></div></div>',
  leaderboard: '<div id="chatroom-top"><div data-testid="gift-leaderboard" data-fixture></div></div>',
  emoteButton: '<button id="chat-emotes-btn" data-fixture></button>',
  kicksButton: '<button data-testid="kicks-gift-button" data-fixture></button>',
};

const withChat = (chat: Partial<Settings['chat']>): Settings => ({ ...DEFAULTS, chat: { ...DEFAULTS.chat, ...chat } });
const ctx = (site: Site, settings: Settings): FeatureContext => ({ doc: document, site, settings, index: null as never, now: Date.now, channel: () => null, others: () => [], local: null });

/** Whether any of the key's selectors matches the element (a selector jsdom can't parse counts as no match). */
function hiddenBy(el: Element, list: readonly string[]): boolean {
  return list.some((sel) => {
    try {
      return el.matches(sel);
    } catch {
      return false;
    }
  });
}

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  document.documentElement.className = '';
});

describe('the catalog', () => {
  it('has unique keys, a label and a one-line hint for every option', () => {
    for (const list of [TWITCH_HIDE, KICK_HIDE]) {
      const keys = list.map((o) => o.key);
      expect(new Set(keys).size).toBe(keys.length);
      for (const o of list) {
        expect(o.label.length, o.key).toBeGreaterThan(2);
        expect(o.hint.length, o.key).toBeGreaterThan(5);
        expect(o.hint, o.key).not.toContain('\n');
      }
    }
  });

  it('keeps the earlier Clean up keys so stored choices carry over', () => {
    for (const k of ['bits', 'points', 'predictions', 'hypeChat', 'leaderboard', 'recommended', 'giftBanners', 'viewerCount']) expect(TWITCH_HIDE_KEYS).toContain(k);
  });

  it('turns keys into classes', () => {
    expect(hideClass('bits')).toBe('cyextv-hide-bits');
    expect(hideClass('sidebarAlsoWatch')).toBe('cyextv-hide-sidebar-also-watch');
  });

  it('is on the settings page: every key once, grouped', () => {
    const keysOn = (id: string) => PAGES.find((p) => p.id === id)!.sections.flatMap((s) => s.items).flatMap((i) => ('key' in i ? [i.key] : []));
    expect(keysOn('twitch').filter((k) => k.startsWith('chat.hide.')).sort()).toEqual(TWITCH_HIDE_KEYS.map((k) => `chat.hide.${k}`).sort());
    expect(keysOn('kick').sort()).toEqual(KICK_HIDE_KEYS.map((k) => `chat.hideKick.${k}`).sort());
    expect(PAGES.find((p) => p.id === 'twitch')!.sections.length).toBeGreaterThan(4);
  });
});

describe.each([
  ['Twitch', TWITCH_HIDE_SELECTORS, TWITCH_FIXTURES, TWITCH_HIDE_KEYS],
  ['Kick', KICK_HIDE_SELECTORS, KICK_FIXTURES, KICK_HIDE_KEYS],
] as const)('%s selectors', (_name, selectors, fixtures, keys) => {
  it('has selectors for every key', () => {
    expect(Object.keys(selectors).sort()).toEqual([...keys].sort());
    for (const k of keys) expect((selectors as Record<string, readonly string[]>)[k]!.length, k).toBeGreaterThan(0);
  });

  it('has a fixture for every key, and a selector of the key matches it', () => {
    expect(Object.keys(fixtures).sort()).toEqual([...keys].sort());
    for (const k of keys) {
      document.body.innerHTML = fixtures[k]!;
      const target = document.querySelector('[data-fixture]')!;
      expect(hiddenBy(target, (selectors as Record<string, readonly string[]>)[k]!), k).toBe(true);
    }
  });

  it('never matches a plain chat line or our own buttons', () => {
    document.body.innerHTML =
      '<div data-a-target="chat-line-message" data-fixture><span class="text-fragment">hello</span></div><button class="cyextv-em-btn" data-cyextv aria-label="Emotes" data-fixture></button>';
    for (const target of document.querySelectorAll('[data-fixture]')) {
      for (const k of keys) expect(hiddenBy(target, (selectors as Record<string, readonly string[]>)[k]!), k).toBe(false);
    }
  });
});

describe('hideCss', () => {
  it('writes one rule per selector, scoped to the key’s class', () => {
    expect(hideCss({ bits: ['.b', '[x="1"]'], sidebarStories: ['.s'] })).toBe(
      'html.cyextv-hide-bits .b { display: none !important; }\nhtml.cyextv-hide-bits [x="1"] { display: none !important; }\nhtml.cyextv-hide-sidebar-stories .s { display: none !important; }',
    );
    expect(hideCss({})).toBe('');
  });
});

describe('hideClutter', () => {
  it('is off with the defaults, on when any key on either site is', () => {
    const f = hideClutter();
    expect(f.enabled(DEFAULTS)).toBe(false);
    expect(f.enabled(withChat({ hide: { ...DEFAULTS.chat.hide, bits: true } }))).toBe(true);
    expect(f.enabled(withChat({ hideKick: { ...DEFAULTS.chat.hideKick, pinned: true } }))).toBe(true);
  });

  it('reads the switches of the site it runs on', () => {
    const s = withChat({ hide: { ...DEFAULTS.chat.hide, bits: true }, hideKick: { ...DEFAULTS.chat.hideKick, pinned: true } });
    expect(hiddenKeys(twitch, s.chat)).toEqual(['bits']);
    expect(hiddenKeys(kick, s.chat)).toEqual(['pinned']);
  });

  it('adds one stylesheet and the classes, hides only what is on, and undoes it all on stop', () => {
    document.body.innerHTML = TWITCH_FIXTURES.bits! + TWITCH_FIXTURES.points!;
    const f = hideClutter();
    f.start!(ctx(twitch, withChat({ hide: { ...DEFAULTS.chat.hide, bits: true } })));
    expect(document.querySelectorAll('#cyextv-hideClutter')).toHaveLength(1);
    expect(document.documentElement.classList.contains('cyextv-hide-bits')).toBe(true);
    expect(document.documentElement.classList.contains('cyextv-hide-points')).toBe(false);
    expect(getComputedStyle(document.querySelector('[data-a-target="bits-button"]')!).display).toBe('none');
    expect(getComputedStyle(document.querySelector('.community-points-summary')!).display).not.toBe('none');
    f.stop!();
    expect(document.getElementById('cyextv-hideClutter')).toBeNull();
    expect(document.documentElement.className).toBe('');
    f.stop!();
  });

  it('adds nothing on Kick when only Twitch keys are on', () => {
    const f = hideClutter();
    f.start!(ctx(kick, withChat({ hide: { ...DEFAULTS.chat.hide, bits: true } })));
    expect(document.getElementById('cyextv-hideClutter')).toBeNull();
    expect(document.documentElement.className).toBe('');
  });
});

describe('settings', () => {
  it('starts with everything shown', () => {
    expect(Object.values(DEFAULTS.chat.hide).every((v) => v === false)).toBe(true);
    expect(Object.values(DEFAULTS.chat.hideKick).every((v) => v === false)).toBe(true);
  });

  it('carries over the earlier Clean up choices and drops unknown keys', () => {
    const old = { chat: { hide: { bits: true, recommended: true, viewerCount: false, nope: true } } };
    const s = merge(old);
    expect(s.chat.hide.bits).toBe(true);
    expect(s.chat.hide.recommended).toBe(true);
    expect(s.chat.hide.sidebar).toBe(false);
    expect('nope' in s.chat.hide).toBe(false);
    expect(s.chat.hideKick.pinned).toBe(false);
  });

  it('stores only what differs from the defaults, and reads it back the same', () => {
    expect(compact(DEFAULTS)).toEqual({});
    const s = merge({ animations: 'off', chat: { hide: { bits: true }, hideKick: { pinned: true }, myNames: ['me'] } });
    expect(compact(s)).toEqual({ animations: 'off', chat: { hide: { bits: true }, hideKick: { pinned: true }, myNames: ['me'] } });
    expect(merge(compact(s))).toEqual(s);
  });

  it('keeps every switch on under the 8 KB synced storage limit', () => {
    const all = merge({ chat: { hide: Object.fromEntries(TWITCH_HIDE_KEYS.map((k) => [k, true])), hideKick: Object.fromEntries(KICK_HIDE_KEYS.map((k) => [k, true])) } });
    expect(JSON.stringify(compact(all)).length).toBeLessThan(2000);
  });
});
