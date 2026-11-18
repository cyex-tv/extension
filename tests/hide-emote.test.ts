// @vitest-environment jsdom
// Hide an emote: the stored list, the rules, the right-click menu, and what the settings carry.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMOTE_CLASS, emoteElement } from '../src/chat/render';
import { HIDDEN_EMOTES_MAX, HiddenEmotesStore, emoteKey, emoteOf, hiddenEmoteCss, hideEmotes, readHidden } from '../src/features/cleanup/hide-emote';
import type { FeatureContext } from '../src/features/types';
import type { Emote } from '../src/providers/types';
import { PAGES } from '../src/options/schema';
import { CHAT_DEFAULTS, DEFAULTS, type Settings, merge } from '../src/settings';
import type { Site } from '../src/sites/index';
import { kick } from '../src/sites/kick';
import { twitch } from '../src/sites/twitch';

const emote = (over: Partial<Emote> = {}): Emote => ({
  provider: '7tv',
  id: '01EMOTEA',
  name: 'catJAM',
  zeroWidth: false,
  animated: false,
  images: [{ scale: 1, url: 'https://cdn.7tv.app/emote/01EMOTEA/1x.webp', width: 32, height: 32 }],
  ...over,
});
const wrap = (e: Emote, overlays: Emote[] = []) => emoteElement(document, { kind: 'emote', text: e.name, emote: e, overlays }, { animations: 'on', tooltips: true });

const settings = (chat: Partial<Settings['chat']> = {}): Settings => ({ ...DEFAULTS, chat: { ...CHAT_DEFAULTS, ...chat } });
const ctx = (site: Site, s: Settings): FeatureContext => ({ doc: document, site, settings: s, index: null as never, now: Date.now, channel: () => null, others: () => [], local: null });

const chatWith = (site: Site, inner: HTMLElement) => {
  document.body.innerHTML = site === kick ? '<div id="chatroom-messages"><div data-index="0"></div></div>' : '<div class="chat-line__message" data-a-target="chat-line-message"><span data-a-target="chat-line-message-body"></span></div>';
  const host = site === kick ? document.querySelector('[data-index]')! : document.querySelector('[data-a-target="chat-line-message-body"]')!;
  host.append(inner);
};
const menuRoot = () => document.getElementById('cyextv-emote-menu')?.shadowRoot ?? null;
const rightClick = (el: Element, init: MouseEventInit = {}) => {
  const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 50, button: 2, ...init });
  el.dispatchEvent(e);
  return e;
};
/** A store that saves into a plain object, like storage.local. */
const memory = () => {
  const data: Record<string, unknown> = {};
  const area: ExtStorageArea = { get: async (k) => (typeof k === 'string' ? (k in data ? { [k]: data[k] } : {}) : { ...data }), set: async (o) => void Object.assign(data, o) };
  return { data, area };
};

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});
afterEach(() => {
  document.getElementById('cyextv-emote-menu')?.remove();
});

describe('what is stored', () => {
  it('keeps good entries and drops the rest', () => {
    const list = readHidden([
      { provider: '7tv', id: 'A1', name: ' catJAM ', url: 'https://cdn.7tv.app/emote/A1/1x.webp' },
      { provider: '7tv', id: 'A1', name: 'dupe', url: '' },
      { provider: 'nope', id: 'B', name: 'x', url: '' },
      { provider: 'bttv', id: 'bad id!', name: 'x', url: '' },
      { provider: 'ffz', id: '5', name: '', url: '' },
      { provider: 'ffz', id: '6', name: 'ok', url: 'javascript:alert(1)' },
      'text',
      null,
    ]);
    expect(list).toEqual([
      { provider: '7tv', id: 'A1', name: 'catJAM', url: 'https://cdn.7tv.app/emote/A1/1x.webp' },
      { provider: 'ffz', id: '6', name: 'ok', url: '' },
    ]);
    expect(readHidden('x')).toEqual([]);
  });

  it('is capped', () => {
    const many = Array.from({ length: HIDDEN_EMOTES_MAX + 20 }, (_, i) => ({ provider: 'bttv', id: `e${i}`, name: `n${i}`, url: '' }));
    expect(readHidden(many)).toHaveLength(HIDDEN_EMOTES_MAX);
  });

  it('adds, removes and saves; tells listeners', async () => {
    const { data, area } = memory();
    const store = new HiddenEmotesStore();
    await store.load(area);
    const seen = vi.fn();
    store.subscribe(seen);
    const a = { provider: '7tv' as const, id: 'A', name: 'a', url: '' };
    await store.add(a);
    await store.add(a);
    expect(store.list()).toHaveLength(1);
    expect(store.has(a)).toBe(true);
    expect(data.hiddenEmotes).toEqual([a]);
    await store.remove(a);
    expect(store.list()).toEqual([]);
    expect(data.hiddenEmotes).toEqual([]);
    expect(seen).toHaveBeenCalledTimes(2);
    await store.set([a]);
    store.replace([{ provider: 'ffz', id: '1', name: 'z', url: '' }]);
    expect(store.list().map(emoteKey)).toEqual(['ffz:1']);
  });

  it('loads what is stored, and works without storage', async () => {
    const { area } = memory();
    await area.set({ hiddenEmotes: [{ provider: 'bttv', id: 'x', name: 'x', url: '' }] });
    const store = new HiddenEmotesStore();
    await store.load(area);
    expect(store.list()).toHaveLength(1);
    const none = new HiddenEmotesStore();
    await none.load(null);
    await none.add({ provider: 'bttv', id: 'y', name: 'y', url: '' });
    expect(none.list()).toHaveLength(1);
  });
});

describe('the rules', () => {
  const list = [{ provider: '7tv' as const, id: '01EMOTEA', name: 'catJAM', url: '' }];

  it('hide the emote and its overlay by provider and ID', () => {
    const css = hiddenEmoteCss(list, 'none');
    expect(css).toContain(`.${EMOTE_CLASS}[data-provider="7tv"][data-id="01EMOTEA"]{display:none!important}`);
    expect(css).toContain('img.cyextv-over[data-provider="7tv"][data-id="01EMOTEA"]');
    expect(hiddenEmoteCss([], 'none')).toBe('');
  });

  it('as text drop the picture and draw the typed name', () => {
    const css = hiddenEmoteCss(list, 'text');
    expect(css).toContain('>img{display:none!important}');
    expect(css).toContain('::after{content:attr(data-text)}');
  });

  it('really hide the emote in the page, by ID and not by name', () => {
    const f = hideEmotes(storeWith(list));
    document.body.innerHTML = '';
    document.body.append(wrap(emote()), wrap(emote({ id: 'OTHER', name: 'catJAM' })));
    f.start!(ctx(twitch, settings({ hiddenEmoteStyle: 'none' })));
    const [a, b] = [...document.querySelectorAll<HTMLElement>(`.${EMOTE_CLASS}`)];
    expect(getComputedStyle(a!).display).toBe('none');
    expect(getComputedStyle(b!).display).not.toBe('none');
    f.stop!();
  });

  it('hide only a zero-width overlay when that is the hidden one', () => {
    const over = emote({ id: 'OVER', name: 'w!', zeroWidth: true });
    const f = hideEmotes(storeWith([{ provider: '7tv', id: 'OVER', name: 'w!', url: '' }]));
    document.body.append(wrap(emote(), [over]));
    f.start!(ctx(twitch, settings({ hiddenEmoteStyle: 'none' })));
    expect(getComputedStyle(document.querySelector(`.${EMOTE_CLASS}`)!).display).not.toBe('none');
    expect(getComputedStyle(document.querySelector('img.cyextv-over')!).display).toBe('none');
    f.stop!();
  });
});

function storeWith(list: { provider: '7tv' | 'bttv' | 'ffz' | 'cyextv'; id: string; name: string; url: string }[]) {
  const s = new HiddenEmotesStore();
  s.replace(list);
  return s;
}

describe('emoteOf', () => {
  it('reads the emote from its element, with its smallest picture', () => {
    expect(emoteOf(wrap(emote()))).toEqual({ provider: '7tv', id: '01EMOTEA', name: 'catJAM', url: 'https://cdn.7tv.app/emote/01EMOTEA/1x.webp' });
  });
  it('gives null for something without an ID', () => {
    const el = document.createElement('span');
    el.dataset.provider = '7tv';
    el.dataset.name = 'x';
    expect(emoteOf(el)).toBeNull();
  });
});

describe.each([
  ['Twitch', twitch],
  ['Kick', kick],
] as const)('right-click on %s', (_n, site) => {
  const setup = (store = new HiddenEmotesStore(), chat: Partial<Settings['chat']> = {}) => {
    chatWith(site, wrap(emote()));
    const f = hideEmotes(store);
    f.start!(ctx(site, settings(chat)));
    return { f, store, target: document.querySelector<HTMLElement>(`.${EMOTE_CLASS}`)! };
  };

  it('opens a menu for the emote instead of the browser’s, in a shadow root', () => {
    const { f, target } = setup();
    const e = rightClick(target);
    expect(e.defaultPrevented).toBe(true);
    const root = menuRoot()!;
    expect(root.querySelector('[role="menuitem"]')!.textContent).toBe('Hide this emote');
    expect(root.querySelector('.who')!.textContent).toContain('catJAM');
    expect(root.querySelector('.who')!.textContent).toContain('7TV');
    f.stop!();
  });

  it('hides the emote when picked, and shows the name', async () => {
    const { f, store, target } = setup();
    rightClick(target);
    (menuRoot()!.querySelector('[role="menuitem"]') as HTMLButtonElement).click();
    await Promise.resolve();
    expect(store.list().map(emoteKey)).toEqual(['7tv:01EMOTEA']);
    expect(menuRoot()).toBeNull();
    const css = document.getElementById('cyextv-hideEmotes')!.textContent!;
    expect(css).toContain('data-id="01EMOTEA"');
    expect(css).toContain('attr(data-text)');
    f.stop!();
  });

  it('offers Show this emote on one that is hidden, and unhides it', async () => {
    const store = storeWith([{ provider: '7tv', id: '01EMOTEA', name: 'catJAM', url: '' }]);
    const { f, target } = setup(store);
    rightClick(target);
    const item = menuRoot()!.querySelector('[role="menuitem"]') as HTMLButtonElement;
    expect(item.textContent).toBe('Show this emote');
    item.click();
    await Promise.resolve();
    expect(store.list()).toEqual([]);
    expect(document.getElementById('cyextv-hideEmotes')!.textContent).toBe('');
    f.stop!();
  });

  it('leaves the browser’s menu with Shift or Ctrl, and for anything that is not our emote in chat', () => {
    const { f, target } = setup();
    expect(rightClick(target, { shiftKey: true }).defaultPrevented).toBe(false);
    expect(rightClick(target, { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(menuRoot()).toBeNull();
    document.body.insertAdjacentHTML('beforeend', '<p id="p">text</p>');
    expect(rightClick(document.getElementById('p')!).defaultPrevented).toBe(false);
    // An emote outside a chat line (the emote menu's own) keeps its own right-click.
    const loose = wrap(emote());
    document.body.append(loose);
    expect(rightClick(loose).defaultPrevented).toBe(false);
    f.stop!();
  });

  it('closes on Escape, an outside click and stop; one menu at a time', () => {
    const { f, target } = setup();
    rightClick(target);
    rightClick(target);
    expect(document.querySelectorAll('#cyextv-emote-menu')).toHaveLength(1);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(menuRoot()).toBeNull();
    rightClick(target);
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    expect(menuRoot()).toBeNull();
    rightClick(target);
    f.stop!();
    expect(menuRoot()).toBeNull();
    expect(rightClick(target).defaultPrevented).toBe(false);
  });

  it('applies a change from another tab at once', () => {
    const { f, store } = setup();
    store.replace([{ provider: '7tv', id: '01EMOTEA', name: 'catJAM', url: '' }]);
    expect(document.getElementById('cyextv-hideEmotes')!.textContent).toContain('01EMOTEA');
    f.stop!();
    expect(document.getElementById('cyextv-hideEmotes')).toBeNull();
  });
});

describe('the settings', () => {
  it('are on with the name as the default, and only take their own values', () => {
    expect(DEFAULTS.chat.emoteHide).toBe(true);
    expect(DEFAULTS.chat.hiddenEmoteStyle).toBe('text');
    expect(hideEmotes().enabled(DEFAULTS)).toBe(true);
    expect(hideEmotes().enabled(settings({ emoteHide: false }))).toBe(false);
    expect(merge({ chat: { hiddenEmoteStyle: 'none' } }).chat.hiddenEmoteStyle).toBe('none');
    expect(merge({ chat: { hiddenEmoteStyle: 'x' } }).chat.hiddenEmoteStyle).toBe('text');
  });

  it('are on the settings page under Emotes and badges', () => {
    const page = PAGES.find((p) => p.id === 'emotes')!;
    const section = page.sections.find((s) => s.title === 'Hidden emotes')!;
    expect(section.items.map((i) => ('key' in i ? i.key : i.kind))).toEqual(['chat.emoteHide', 'chat.hiddenEmoteStyle', 'hiddenEmotes']);
  });
});
