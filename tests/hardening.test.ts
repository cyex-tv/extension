// @vitest-environment jsdom
// Restarts and stops: what a settings change must keep, and what stop() must leave behind.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/content/app';
import { autoClaim } from '../src/features/cleanup/auto-claim';
import { richTooltips } from '../src/features/cleanup/rich-tooltips';
import { highlights } from '../src/features/highlights/highlights';
import { ignores } from '../src/features/highlights/ignores';
import { readableColors } from '../src/features/looks/readable';
import { timestamps } from '../src/features/looks/timestamps';
import { shortcuts } from '../src/features/people/shortcuts';
import { usercardMessages } from '../src/features/people/usercard';
import type { Feature, FeatureContext } from '../src/features/types';
import { CHAT_DEFAULTS, DEFAULTS, type Settings } from '../src/settings';
import type { Site } from '../src/sites/index';
import { twitch } from '../src/sites/twitch';

const line = (text: string, extra = '') =>
  `<div class="chat-line__message" data-a-target="chat-line-message" data-a-user="nora" ${extra}><span class="chat-line__username-container"><span class="chat-line__username"><span class="chat-author__display-name">nora</span></span></span><span data-a-target="chat-line-message-body"><span class="text-fragment">${text}</span></span></div>`;
const list = (...lines: string[]) => `<div data-test-selector="chat-scrollable-area__message-container">${lines.join('')}</div>`;
const frames = async (n = 3) => {
  for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(() => r(null)));
};
const site: Site = { ...twitch, channel: async () => null };
const settings = (chat: Partial<Settings['chat']> = {}): Settings => ({ ...DEFAULTS, chat: { ...CHAT_DEFAULTS, ...chat } });
const never = (async () => {
  throw new Error('no network');
}) as never;

function ctx(over: Partial<FeatureContext> = {}): FeatureContext {
  return { doc: document, site, settings: DEFAULTS, index: null as never, now: () => 1000, channel: () => null, others: () => [], local: null, ...over };
}

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('data-cyextv-emote-menu');
});
afterEach(() => vi.restoreAllMocks());

describe('restarting the app', () => {
  it('runs the features again on lines already seen, keeps real times, gives the backlog none', async () => {
    document.body.innerHTML = list(line('old'));
    let t = new Date(2026, 10, 17, 9, 5, 7).getTime();
    const seen: string[] = [];
    const spy = (): Feature => ({ id: 'spy', enabled: () => true, message: (_m, info) => void seen.push(`${info.text}@${info.at}`) });
    const make = () => new App({ site, fetch: never, settings: settings({ timestamps: true }), sockets: null, now: () => t, features: [timestamps(), spy()] });

    const a = make();
    a.start();
    await frames();
    document.querySelector('[data-test-selector="chat-scrollable-area__message-container"]')!.insertAdjacentHTML('beforeend', line('new'));
    await frames();
    expect(seen).toEqual(['old@0', `new@${t}`]);
    // The backlog line has no time; the new one does.
    const times = () => [...document.querySelectorAll('[data-a-target="chat-line-message"]')].map((m) => m.querySelector('.cyextv-time')?.textContent ?? null);
    expect(times()[0]).toBeNull();
    expect(times()[1]).toMatch(/^\d{2}:\d{2}$/);
    const first = times()[1];

    a.stop();
    expect(document.querySelectorAll('.cyextv-time')).toHaveLength(0);
    t += 60_000;
    seen.length = 0;
    const b = make();
    b.start();
    await frames();
    // Both lines run again in the new App; "new" keeps the time it arrived at.
    expect(seen).toEqual(['old@0', `new@${new Date(2026, 10, 17, 9, 5, 7).getTime()}`]);
    expect(times()).toEqual([null, first]);
    expect(document.querySelector('[data-cyextv-seen]')).toBeNull();
    b.stop();
  });

  it('stop() halts queued work and takes back badges and paints', async () => {
    document.body.innerHTML = list(line('hi'));
    const n = vi.fn();
    const app = new App({ site, fetch: never, settings: settings(), sockets: null, features: [{ id: 'c', enabled: () => true, message: n }] });
    app.start();
    app.stop();
    await frames();
    expect(n).not.toHaveBeenCalled();
    app.process(document.querySelector('[data-a-target="chat-line-message"]')!);
    expect(n).not.toHaveBeenCalled();

    document.body.innerHTML = list(line('x'));
    const name = document.querySelector<HTMLElement>('.chat-author__display-name')!;
    name.dataset.cyextvPaint = 'p1';
    name.style.color = 'transparent';
    name.style.backgroundImage = 'linear-gradient(red, blue)';
    name.insertAdjacentHTML('beforebegin', '<span class="cyextv-badges"><img></span>');
    const again = new App({ site, fetch: never, settings: settings(), sockets: null, features: [] });
    again.start();
    again.stop();
    expect(document.querySelector('.cyextv-badges')).toBeNull();
    expect(name.dataset.cyextvPaint).toBeUndefined();
    expect(name.style.color).toBe('');
    expect(name.style.backgroundImage).toBe('');
  });

  it('re-reads the text for later features after a feature changed the words', async () => {
    document.body.innerHTML = list(line('darn it'));
    let text = '';
    const swap: Feature = {
      id: 'swap',
      enabled: () => true,
      prepare(m) {
        m.querySelector('.text-fragment')!.textContent = 'stars it';
        return true;
      },
    };
    const read: Feature = { id: 'read', enabled: () => true, message: (_m, info) => void (text = info.text) };
    const app = new App({ site, fetch: never, settings: settings(), sockets: null, features: [swap, read] });
    app.start();
    await frames();
    expect(text).toBe('stars it');
    app.stop();
  });
});

describe('ignores', () => {
  it('returns true only when it swapped words', () => {
    document.body.innerHTML = list(line('a darn b'), line('clean'));
    const f = ignores();
    const s = settings({ ignores: [{ pattern: 'darn', regex: false, matchCase: false, hide: false, swap: '***' }] });
    f.start!(ctx({ settings: s }));
    const [a, b] = [...document.querySelectorAll('[data-a-target="chat-line-message"]')];
    expect(f.prepare!(a!, { sender: null, login: 'x', text: '', at: 1 })).toBe(true);
    expect(a!.textContent).toContain('a *** b');
    expect(f.prepare!(b!, { sender: null, login: 'x', text: '', at: 1 })).toBeUndefined();
    f.stop!();
  });
});

describe('highlights stop', () => {
  it('puts the exact original text node back without normalising the page', () => {
    document.body.innerHTML = list(line('say hello world'));
    const m = document.querySelector('[data-a-target="chat-line-message"]')!;
    const frag = m.querySelector('.text-fragment')!;
    const original = frag.firstChild as Text;
    // A page-owned neighbour that normalize() would merge into the original.
    const neighbour = document.createTextNode(' tail');
    frag.append(neighbour);
    const s = settings({ highlights: [{ pattern: 'hello', regex: false, wholeWord: true, matchCase: false, color: '#ff0000', sound: false, wordsOnly: true }] });
    const f = highlights();
    f.start!(ctx({ settings: s }));
    f.message!(m, { sender: null, login: 'nora', text: 'say hello world', at: 1 });
    expect(frag.querySelector('mark.cyextv-word')!.textContent).toBe('hello');
    expect(frag.contains(original)).toBe(false);
    f.stop!();
    expect(frag.querySelector('mark')).toBeNull();
    expect(frag.firstChild).toBe(original);
    expect(original.nodeValue).toBe('say hello world');
    expect(frag.childNodes).toHaveLength(2);
    expect(frag.lastChild).toBe(neighbour);
  });
});

describe('shortcuts Alt+E', () => {
  const press = (init: KeyboardEventInit, target: EventTarget = document) => {
    const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(e);
    return e;
  };
  it('ignores dead keys and does nothing when the menu is not running', () => {
    const f = shortcuts();
    f.start!(ctx());
    const fired = vi.fn();
    document.addEventListener('cyextv:emote-menu', fired);
    const off = press({ altKey: true, code: 'KeyE', key: 'e' });
    expect(fired).not.toHaveBeenCalled();
    expect(off.defaultPrevented).toBe(false);
    document.documentElement.dataset.cyextvEmoteMenu = '';
    const dead = press({ altKey: true, code: 'KeyE', key: 'Dead' });
    expect(fired).not.toHaveBeenCalled();
    expect(dead.defaultPrevented).toBe(false);
    const wrong = press({ altKey: true, code: 'KeyR', key: 'e' });
    expect(wrong.defaultPrevented).toBe(false);
    const ok = press({ altKey: true, code: 'KeyE', key: 'e' });
    expect(fired).toHaveBeenCalledTimes(1);
    expect(ok.defaultPrevented).toBe(true);
    f.stop!();
    document.removeEventListener('cyextv:emote-menu', fired);
  });
  it('works from the menu search box, which stops its own keys from bubbling', () => {
    const f = shortcuts();
    f.start!(ctx());
    document.documentElement.dataset.cyextvEmoteMenu = '';
    document.body.innerHTML = '<div id="p"><input id="s"></div>';
    document.getElementById('p')!.addEventListener('keydown', (e) => e.stopPropagation());
    const fired = vi.fn();
    document.addEventListener('cyextv:emote-menu', fired);
    press({ altKey: true, code: 'KeyE', key: 'e' }, document.getElementById('s')!);
    expect(fired).toHaveBeenCalledTimes(1);
    f.stop!();
    document.removeEventListener('cyextv:emote-menu', fired);
  });
});

describe('readable colours and paints', () => {
  it('stop() leaves a painted name alone', () => {
    document.body.innerHTML = '<span id="a" data-cyextv-readable="#111" data-cyextv-paint="p" style="color: transparent"></span><span id="b" data-cyextv-readable="#222" style="color: rgb(9, 9, 9)"></span>';
    const f = readableColors();
    f.start!(ctx());
    f.stop!();
    const a = document.getElementById('a')!;
    const b = document.getElementById('b')!;
    expect(a.style.color).toBe('transparent');
    expect(a.dataset.cyextvReadable).toBeUndefined();
    expect(b.style.color).toBe('rgb(34, 34, 34)');
  });
});

describe('rich tooltips stop', () => {
  it('gives titles back', () => {
    document.body.innerHTML = '<span id="e" data-cyextv-tip="catJAM\n7TV"></span>';
    const f = richTooltips();
    f.start!(ctx());
    f.stop!();
    const e = document.getElementById('e')!;
    expect(e.title).toBe('catJAM\n7TV');
    expect(e.dataset.cyextvTip).toBeUndefined();
  });
});

describe('perf', () => {
  it('auto-claim polls on a timer and has no observer', () => {
    vi.useFakeTimers();
    const made = vi.fn();
    vi.stubGlobal(
      'MutationObserver',
      class {
        constructor() {
          made();
        }
        observe() {}
        disconnect() {}
      },
    );
    const f = autoClaim();
    f.start!(ctx());
    expect(made).not.toHaveBeenCalled();
    f.stop!();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('usercard looks for a card only when something outside chat is added', async () => {
    document.body.innerHTML = list(line('a'));
    const userCard = vi.fn(() => null);
    const f = usercardMessages();
    f.start!(ctx({ site: { ...twitch, userCard } }));
    await frames();
    userCard.mockClear();
    const chat = document.querySelector('[data-test-selector="chat-scrollable-area__message-container"]')!;
    chat.insertAdjacentHTML('beforeend', line('b'));
    await frames();
    expect(userCard).not.toHaveBeenCalled();
    document.body.insertAdjacentHTML('beforeend', '<div data-a-target="viewer-card"></div>');
    await frames();
    expect(userCard).toHaveBeenCalled();
    f.stop!();
  });
});
