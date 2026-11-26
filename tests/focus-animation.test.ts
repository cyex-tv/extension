// @vitest-environment jsdom
// "Animate only when the window is focused": the swap of moving and still pictures, the setting,
// and the app following the window's focus for emotes, badges and cyex.tv paints.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isActive, placeMotion, setPaused } from '../src/chat/motion';
import { renderEmotes } from '../src/chat/render';
import { App } from '../src/content/app';
import type { Emote } from '../src/providers/types';
import { DEFAULTS, type Settings, merge } from '../src/settings';
import { PAGES } from '../src/options/schema';
import { twitch } from '../src/sites/twitch';
import { table } from './fixtures';

const MOVING = 'https://cdn.7tv.app/dance/1x.webp';
const STILL = 'https://cdn.7tv.app/dance/1x_static.webp';
const dance: Emote = {
  provider: '7tv',
  id: 'dance',
  name: 'dance',
  zeroWidth: false,
  animated: true,
  images: [
    { scale: 1, url: MOVING, width: 32, height: 32 },
    { scale: 2, url: 'https://cdn.7tv.app/dance/2x.webp', width: 64, height: 64 },
  ],
  stills: [
    { scale: 1, url: STILL, width: 32, height: 32 },
    { scale: 2, url: 'https://cdn.7tv.app/dance/2x_static.webp', width: 64, height: 64 },
  ],
};
const plain: Emote = { ...dance, id: 'plain', name: 'plain', animated: false, stills: undefined };
const find = (w: string) => (w === 'dance' ? dance : w === 'plain' ? plain : undefined);
const imgs = () => [...document.querySelectorAll<HTMLImageElement>('.cyextv-emote img')];

let hasFocus = true;
const focusTo = (on: boolean) => {
  hasFocus = on;
  window.dispatchEvent(new Event(on ? 'focus' : 'blur'));
};

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  hasFocus = true;
  vi.spyOn(document, 'hasFocus').mockImplementation(() => hasFocus);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('motion', () => {
  const pair = { moving: { src: 'a.webp', set: 'a.webp 1x' }, still: { src: 's.webp', set: 's.webp 1x' } };

  it('puts the moving or the still source on, and swaps both ways', () => {
    const wrap = document.createElement('div');
    wrap.className = 'cyextv-badges';
    const a = document.createElement('img');
    const b = document.createElement('img');
    wrap.append(a, b);
    placeMotion(a, pair, false);
    placeMotion(b, pair, true);
    expect([a.getAttribute('src'), b.getAttribute('src')]).toEqual(['a.webp', 's.webp']);
    expect(setPaused(wrap, true)).toBe(1);
    expect([a.getAttribute('src'), a.srcset]).toEqual(['s.webp', 's.webp 1x']);
    expect(setPaused(wrap, true)).toBe(0);
    expect(setPaused(wrap, false)).toBe(2);
    expect([a.getAttribute('src'), b.getAttribute('src'), b.srcset]).toEqual(['a.webp', 'a.webp', 'a.webp 1x']);
  });

  it('leaves pictures it did not mark alone', () => {
    document.body.innerHTML = '<span class="cyextv-emote"><img src="x.webp"></span>';
    expect(setPaused(document, true)).toBe(0);
    expect(document.querySelector('img')!.getAttribute('src')).toBe('x.webp');
  });

  it('reads the window as in use when it has focus and its tab shows', () => {
    expect(isActive(document)).toBe(true);
    hasFocus = false;
    expect(isActive(document)).toBe(false);
  });
});

describe('rendering emotes', () => {
  const render = (opts: Parameters<typeof renderEmotes>[3]) => {
    document.body.innerHTML = '<div id="b"><span class="text-fragment">dance plain</span></div>';
    renderEmotes(document.getElementById('b')!, find, '', opts);
    return imgs();
  };

  it('draws the moving one and keeps the still when it can be frozen later', () => {
    const [d, p] = render({ animations: 'on', tooltips: false, pausable: true, paused: false });
    expect(d!.getAttribute('src')).toBe(MOVING);
    expect(d!.dataset.cyextvStillSrc).toBe(STILL);
    expect(p!.dataset.cyextvMoving).toBeUndefined();
  });

  it('draws the still first when the window is not in use, and still keeps the moving one', () => {
    const [d] = render({ animations: 'on', tooltips: false, pausable: true, paused: true });
    expect(d!.getAttribute('src')).toBe(STILL);
    expect(d!.dataset.cyextvMoving).toBe(MOVING);
    expect(setPaused(document, false)).toBe(1);
    expect(d!.getAttribute('src')).toBe(MOVING);
  });

  it('is as before without the option', () => {
    const [d] = render({ animations: 'on', tooltips: false });
    expect(d!.getAttribute('src')).toBe(MOVING);
    expect(d!.dataset.cyextvMoving).toBeUndefined();
    const [off] = render({ animations: 'off', tooltips: false, pausable: true, paused: true });
    expect(off!.getAttribute('src')).toBe(STILL);
    expect(off!.dataset.cyextvMoving).toBeUndefined();
  });
});

describe('the app follows the window', () => {
  const LINE = (uid: string) =>
    `<div data-a-target="chat-line-message" data-cyextv-uid="${uid}"><span class="chat-line__username"><span class="chat-author__display-name">nora</span></span><span data-a-target="chat-line-message-body"><span class="text-fragment">dance</span></span></div>`;
  const settings = (over: Partial<Settings> = {}): Settings => ({ ...DEFAULTS, tooltips: false, ...over });
  const setup = (s: Settings) => {
    document.body.innerHTML = LINE('111');
    const app = new App({ site: twitch, fetch: table({}).fetch, settings: s, sockets: null });
    app.index.setSets([{ provider: '7tv', scope: 'global', emotes: [dance] }]);
    app.start();
    app.process(document.querySelector('[data-a-target="chat-line-message"]')!);
    return app;
  };

  it('is off by default and changes nothing', () => {
    expect(DEFAULTS.animateOnlyFocused).toBe(false);
    const app = setup(settings());
    focusTo(false);
    expect(imgs()[0]!.getAttribute('src')).toBe(MOVING);
    app.stop();
  });

  it('freezes emotes on blur, releases them on focus, and covers emotes drawn while away', () => {
    const app = setup(settings({ animateOnlyFocused: true }));
    expect(imgs()[0]!.getAttribute('src')).toBe(MOVING);
    focusTo(false);
    expect(imgs()[0]!.getAttribute('src')).toBe(STILL);
    expect(app.moving()).toBe(false);
    document.body.insertAdjacentHTML('beforeend', LINE('222'));
    app.process(document.querySelectorAll('[data-a-target="chat-line-message"]')[1]!);
    expect(imgs().map((i) => i.getAttribute('src'))).toEqual([STILL, STILL]);
    focusTo(true);
    expect(imgs().map((i) => i.getAttribute('src'))).toEqual([MOVING, MOVING]);
    expect(app.moving()).toBe(true);
    app.stop();
  });

  it('treats a hidden tab as not in use', () => {
    const app = setup(settings({ animateOnlyFocused: true }));
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(imgs()[0]!.getAttribute('src')).toBe(STILL);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(imgs()[0]!.getAttribute('src')).toBe(MOVING);
    app.stop();
  });

  it('starts frozen when the window is already in the background', () => {
    hasFocus = false;
    const app = setup(settings({ animateOnlyFocused: true }));
    expect(imgs()[0]!.getAttribute('src')).toBe(STILL);
    app.stop();
  });

  it('only matters with Animations on', () => {
    for (const animations of ['off', 'hover'] as const) {
      const app = setup(settings({ animateOnlyFocused: true, animations }));
      focusTo(false);
      focusTo(true);
      expect(imgs()[0]!.getAttribute('src')).toBe(STILL);
      app.stop();
    }
  });

  it('stops listening, and leaves nothing frozen, when the app stops', () => {
    const app = setup(settings({ animateOnlyFocused: true }));
    focusTo(false);
    app.stop();
    expect(imgs()[0]!.getAttribute('src')).toBe(MOVING);
    focusTo(true);
    focusTo(false);
    expect(imgs()[0]!.getAttribute('src')).toBe(MOVING);
  });

  it('freezes animated badges and swaps cyex.tv image paints for their still', () => {
    document.body.innerHTML = LINE('111');
    const app = new App({ site: twitch, fetch: table({}).fetch, settings: settings({ animateOnlyFocused: true }), sockets: null });
    // A badge with a still, and a paint with a still, for chatter 111.
    const U = (n: string, f: string) => [`https://cdn.7tv.app/${n}/1x${f}.webp`, `https://cdn.7tv.app/${n}/2x${f}.webp`, `https://cdn.7tv.app/${n}/4x${f}.webp`] as [string, string, string];
    app.start();
    (app as unknown as { cyexLooks: unknown }).cyexLooks = {
      badgeOf: () => ({ provider: 'cyextv', id: 'b', title: 'Badge', urls: U('b', ''), stills: U('b', '_s') }),
      paintOf: () => ({ id: 'p', name: 'Paint', kind: 'image', image: { url: 'https://cdn.7tv.app/p/moving.webp', still: 'https://cdn.7tv.app/p/still.webp' }, shadows: [], stops: [], repeat: false }),
    };
    app.process(document.querySelector('[data-a-target="chat-line-message"]')!);
    const badge = document.querySelector<HTMLImageElement>('.cyextv-badges img')!;
    const name = document.querySelector<HTMLElement>('.chat-author__display-name')!;
    expect(badge.getAttribute('src')).toBe('https://cdn.7tv.app/b/1x.webp');
    expect(name.style.backgroundImage).toContain('moving.webp');
    focusTo(false);
    expect(badge.getAttribute('src')).toBe('https://cdn.7tv.app/b/1x_s.webp');
    expect(name.style.backgroundImage).toContain('still.webp');
    focusTo(true);
    expect(badge.getAttribute('src')).toBe('https://cdn.7tv.app/b/1x.webp');
    expect(name.style.backgroundImage).toContain('moving.webp');
    app.stop();
  });
});

describe('the setting', () => {
  it('is a boolean that falls back to off, and is on the settings page next to Animations', () => {
    expect(merge({ animateOnlyFocused: true }).animateOnlyFocused).toBe(true);
    expect(merge({ animateOnlyFocused: 'yes' }).animateOnlyFocused).toBe(false);
    const items = PAGES.find((p) => p.id === 'emotes')!.sections[0]!.items.map((i) => ('key' in i ? i.key : i.kind));
    expect(items.indexOf('animateOnlyFocused')).toBe(items.indexOf('animations') + 1);
  });
});
