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

import { KICK_FIXTURES, TWITCH_FIXTURES } from './site-fixtures';

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
