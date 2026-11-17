// @vitest-environment jsdom
// Chat looks: timestamps, deleted messages, readable colours, line styles, last read.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deleted } from '../src/features/looks/deleted';
import { lastRead } from '../src/features/looks/lastread';
import { lineCss, lineStyles } from '../src/features/looks/lines';
import { contrast, parseColor, readable, readableColors } from '../src/features/looks/readable';
import { formatTime, timestamps } from '../src/features/looks/timestamps';
import type { Feature, FeatureContext, MessageInfo } from '../src/features/types';
import { CHAT_DEFAULTS, DEFAULTS, type ChatSettings } from '../src/settings';
import type { Site } from '../src/sites/index';
import { kick } from '../src/sites/kick';
import { twitch } from '../src/sites/twitch';

const info: MessageInfo = { sender: null, login: null, text: '', at: new Date(2026, 10, 17, 9, 5, 7).getTime() };

function ctxFor(site: Site, chat: Partial<ChatSettings>, now = () => new Date(2026, 10, 17, 9, 5, 7).getTime()): FeatureContext {
  return {
    doc: document,
    site,
    settings: { ...DEFAULTS, chat: { ...CHAT_DEFAULTS, ...chat } },
    index: null as never,
    now,
    channel: () => null,
    others: () => [],
    local: null,
  };
}

const twitchLine = (text = 'hello', color = '#0000ff') =>
  `<div class="chat-line__message" data-a-target="chat-line-message"><span class="chat-line__username-container"><span class="chat-line__username"><span class="chat-author__display-name" style="color:${color}">nora</span></span></span><span data-a-target="chat-line-message-body"><span class="text-fragment">${text}</span></span></div>`;
const twitchList = (...lines: string[]) => `<div data-test-selector="chat-scrollable-area__message-container">${lines.join('')}</div>`;
const kickList = (...n: string[]) =>
  `<div id="chatroom-messages">${n.map((t, i) => `<div data-index="${i}"><div><span>02:06 AM</span><div><button title="nora">nora</button></div><span aria-hidden="true">:&nbsp;</span><span class="font-normal">${t}</span></div></div>`).join('')}</div>`;

const run = (f: Feature, m: Element) => {
  f.prepare?.(m, info);
  f.message?.(m, info);
};

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});
afterEach(() => {
  document.head.innerHTML = '';
});

describe('formatTime', () => {
  const d = (h: number, m = 5, s = 7) => new Date(2026, 10, 17, h, m, s);
  it('24h pads the hour', () => {
    expect(formatTime(d(9), '24h', false)).toBe('09:05');
    expect(formatTime(d(9), '24h', true)).toBe('09:05:07');
    expect(formatTime(d(0), '24h', false)).toBe('00:05');
  });
  it('12h has no leading zero and lower case am/pm', () => {
    expect(formatTime(d(9), '12h', false)).toBe('9:05 am');
    expect(formatTime(d(13, 30, 9), '12h', true)).toBe('1:30:09 pm');
    expect(formatTime(d(0), '12h', false)).toBe('12:05 am');
    expect(formatTime(d(12), '12h', false)).toBe('12:05 pm');
  });
});

describe('timestamps', () => {
  for (const [name, site, html] of [
    ['twitch', twitch, twitchList(twitchLine())],
    ['kick', kick, kickList('hi')],
  ] as const) {
    it(`adds a time before the name on ${name} and stop() removes it`, () => {
      document.body.innerHTML = html;
      const f = timestamps();
      f.start!(ctxFor(site, { timestamps: true, seconds: true, clock: '12h' }));
      const m = site.messages(document)[0]!;
      run(f, m);
      run(f, m);
      const t = m.querySelectorAll('.cyextv-time');
      expect(t).toHaveLength(1);
      expect(t[0]!.textContent).toBe('9:05:07 am');
      expect((t[0] as HTMLElement).title).toBe('2026/11/17 09:05:07');
      expect(t[0]!.nextElementSibling).toBe(site.timeSlot(m));
      expect(document.getElementById('cyextv-timestamps')).not.toBeNull();
      f.stop!();
      expect(document.querySelector('.cyextv-time')).toBeNull();
      expect(document.getElementById('cyextv-timestamps')).toBeNull();
    });
  }
  it('does nothing without a slot', () => {
    document.body.innerHTML = '<div data-a-target="chat-line-message">x</div>';
    const f = timestamps();
    f.start!(ctxFor(twitch, {}));
    run(f, twitch.messages(document)[0]!);
    expect(document.querySelector('.cyextv-time')).toBeNull();
    f.stop!();
  });
});

describe('contrast and readable', () => {
  const bg = parseColor('#18181b')!;
  it('parses hex and rgb', () => {
    expect(parseColor('#fff')).toEqual([255, 255, 255]);
    expect(parseColor('rgb(1, 2, 3)')).toEqual([1, 2, 3]);
    expect(parseColor('rgba(1,2,3,0.5)')).toEqual([1, 2, 3]);
    expect(parseColor('nope')).toBeNull();
  });
  it('contrast is symmetric, 21 for black on white', () => {
    expect(contrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
    expect(contrast([10, 20, 30], bg)).toBeCloseTo(contrast(bg, [10, 20, 30]), 8);
  });
  it('lightens a dark colour on a dark background to 4.5:1', () => {
    const out = readable([0, 0, 255], bg);
    expect(contrast(out, bg)).toBeGreaterThanOrEqual(4.5);
    expect(out[0]).toBeGreaterThan(0);
  });
  it('leaves a readable colour alone and goes white at worst', () => {
    expect(readable([255, 200, 0], bg)).toEqual([255, 200, 0]);
    expect(readable([24, 24, 27], bg)[0]).toBeGreaterThan(100);
  });
  it('darkens on a light background', () => {
    const light: [number, number, number] = [255, 255, 255];
    const out = readable([255, 255, 0], light);
    expect(contrast(out, light)).toBeGreaterThanOrEqual(4.5);
    expect(out[2]).toBeLessThan(255);
  });
});

describe('readableColors', () => {
  it('raises a dark name colour, skips paints, and stop() restores', () => {
    document.body.innerHTML = twitchList(twitchLine('a', '#0000ff'), twitchLine('b', '#ffffff'), twitchLine('c', '#0000ff'));
    const f = readableColors();
    f.start!(ctxFor(twitch, {}));
    const ms = twitch.messages(document);
    ms[2]!.querySelector<HTMLElement>('.chat-author__display-name')!.dataset.cyextvPaint = 'p1';
    ms.forEach((m) => run(f, m));
    const names = ms.map((m) => twitch.nameElement(m)!);
    expect(names[0]!.style.color).not.toBe('rgb(0, 0, 255)');
    expect(contrast(parseColor(names[0]!.style.color)!, [0x18, 0x18, 0x1b])).toBeGreaterThanOrEqual(4.5);
    expect(names[1]!.style.color).toBe('rgb(255, 255, 255)');
    expect(names[2]!.style.color).toBe('rgb(0, 0, 255)');
    f.stop!();
    expect(names[0]!.style.color).toBe('rgb(0, 0, 255)');
    expect(names[0]!.dataset.cyextvReadable).toBeUndefined();
  });
  it('ignores names without an inline colour, and works on kick', () => {
    document.body.innerHTML = kickList('x');
    const f = readableColors();
    f.start!(ctxFor(kick, {}));
    const m = kick.messages(document)[0]!;
    run(f, m);
    expect(kick.nameElement(m)!.style.color).toBe('');
    kick.nameElement(m)!.style.color = 'rgb(10, 10, 200)';
    run(f, m);
    expect(kick.nameElement(m)!.style.color).not.toBe('rgb(10, 10, 200)');
    f.stop!();
  });
});

describe('lineStyles', () => {
  it('builds css only for what is on', () => {
    expect(lineCss('.m', { alternate: false, separators: false, fontSize: 0 })).toBe('');
    const css = lineCss('.m', { alternate: true, separators: true, fontSize: 16 });
    expect(css).toContain('.m{font-size:16px}');
    expect(css).toContain('border-bottom:1px solid color-mix(in srgb,currentColor 12%');
    expect(css).toContain('[data-cyextv-odd]');
  });
  it('stripes by a running counter and cleans up', () => {
    document.body.innerHTML = twitchList(twitchLine(), twitchLine(), twitchLine(), twitchLine());
    const f = lineStyles();
    f.start!(ctxFor(twitch, { alternate: true }));
    const ms = twitch.messages(document);
    ms.forEach((m) => run(f, m));
    expect(ms.map((m) => m.hasAttribute('data-cyextv-odd'))).toEqual([false, true, false, true]);
    // Old lines dropping off must not shift the rest.
    ms[0]!.remove();
    const extra = document.createElement('div');
    extra.setAttribute('data-a-target', 'chat-line-message');
    document.querySelector('[data-test-selector]')!.append(extra);
    run(f, extra);
    expect(ms[1]!.hasAttribute('data-cyextv-odd')).toBe(true);
    expect(extra.hasAttribute('data-cyextv-odd')).toBe(false);
    f.stop!();
    expect(document.querySelector('[data-cyextv-odd]')).toBeNull();
    expect(document.getElementById('cyextv-lineStyles')).toBeNull();
  });
  it('uses the kick selector and is enabled by any option', () => {
    const f = lineStyles();
    expect(f.enabled({ ...DEFAULTS, chat: { ...CHAT_DEFAULTS } })).toBe(false);
    expect(f.enabled({ ...DEFAULTS, chat: { ...CHAT_DEFAULTS, fontSize: 18 } })).toBe(true);
    f.start!(ctxFor(kick, { fontSize: 18 }));
    expect(document.getElementById('cyextv-lineStyles')!.textContent).toContain('#chatroom-messages [data-index]{font-size:18px}');
    f.stop!();
  });
});

describe('lastRead', () => {
  const setHidden = (v: boolean) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => v });
    document.dispatchEvent(new Event('visibilitychange'));
  };
  afterEach(() => setHidden(false));
  it('marks the last message when hidden, moves it, and clears when nothing new came', () => {
    document.body.innerHTML = twitchList(twitchLine('a'), twitchLine('b'));
    const f = lastRead();
    f.start!(ctxFor(twitch, {}));
    const list = document.querySelector('[data-test-selector]')!;
    setHidden(true);
    expect(document.querySelectorAll('[data-cyextv-lastread]')).toHaveLength(1);
    expect(twitch.messages(document)[1]!.hasAttribute('data-cyextv-lastread')).toBe(true);
    setHidden(false);
    expect(document.querySelector('[data-cyextv-lastread]')).toBeNull();
    setHidden(true);
    list.insertAdjacentHTML('beforeend', twitchLine('c'));
    setHidden(false);
    expect(twitch.messages(document)[1]!.hasAttribute('data-cyextv-lastread')).toBe(true);
    setHidden(true);
    expect(document.querySelectorAll('[data-cyextv-lastread]')).toHaveLength(1);
    expect(twitch.messages(document)[2]!.hasAttribute('data-cyextv-lastread')).toBe(true);
    f.stop!();
    expect(document.querySelector('[data-cyextv-lastread]')).toBeNull();
    setHidden(true);
    expect(document.querySelector('[data-cyextv-lastread]')).toBeNull();
  });
  it('reacts to window blur on kick; empty chat is fine', () => {
    document.body.innerHTML = kickList();
    const f = lastRead();
    f.start!(ctxFor(kick, {}));
    window.dispatchEvent(new Event('blur'));
    expect(document.querySelector('[data-cyextv-lastread]')).toBeNull();
    document.body.innerHTML = kickList('a', 'b');
    window.dispatchEvent(new Event('blur'));
    expect(kick.messages(document)[1]!.hasAttribute('data-cyextv-lastread')).toBe(true);
    window.dispatchEvent(new Event('focus'));
    expect(document.querySelector('[data-cyextv-lastread]')).toBeNull();
    f.stop!();
  });
});

describe('deleted', () => {
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const fire = async (mode: 'strike' | 'faded' | 'hidden') => {
    document.body.innerHTML = twitchList(twitchLine('secret text'));
    const f = deleted();
    f.start!(ctxFor(twitch, { deleted: mode }));
    const m = twitch.messages(document)[0]!;
    run(f, m);
    const body = twitch.body(m)!;
    // The site swaps the body for its notice.
    body.insertAdjacentHTML('afterend', '<span data-a-target="chat-deleted-message-placeholder">message deleted</span>');
    await tick();
    return { f, m, body };
  };
  it('keeps the text after the notice and hides the notice (strike)', async () => {
    const { f, m, body } = await fire('strike');
    expect(m.hasAttribute('data-cyextv-deleted')).toBe(true);
    expect(m.classList.contains('cyextv-deleted')).toBe(true);
    const notice = twitch.deletedNotice(m)!;
    expect(notice.hasAttribute('data-cyextv-notice')).toBe(true);
    const kept = m.querySelector('.cyextv-kept')!;
    expect(kept.textContent).toBe('secret text');
    expect(notice.nextElementSibling).toBe(kept);
    expect(kept.nextElementSibling!.textContent).toBe('(deleted)');
    expect(body.isConnected).toBe(true);
    expect(document.getElementById('cyextv-deleted')!.textContent).toContain('line-through');
    f.stop!();
    expect(m.querySelector('.cyextv-kept, .cyextv-deleted-note')).toBeNull();
    expect(m.hasAttribute('data-cyextv-deleted')).toBe(false);
    expect(notice.hasAttribute('data-cyextv-notice')).toBe(false);
    expect(document.getElementById('cyextv-deleted')).toBeNull();
  });
  it('faded and hidden styles', async () => {
    let r = await fire('faded');
    expect(document.getElementById('cyextv-deleted')!.textContent).toContain('opacity:.4');
    r.f.stop!();
    r = await fire('hidden');
    expect(document.getElementById('cyextv-deleted')!.textContent).toContain('display:none');
    r.f.stop!();
  });
  it('only handles a notice once and ignores messages it never saw', async () => {
    const { f, m } = await fire('strike');
    m.querySelector('.cyextv-kept')!.insertAdjacentHTML('beforeend', '<i>x</i>');
    await tick();
    expect(m.querySelectorAll('.cyextv-kept')).toHaveLength(1);
    document.querySelector('[data-test-selector]')!.insertAdjacentHTML('beforeend', '<div data-a-target="chat-line-message"><span data-a-target="chat-deleted-message-placeholder">x</span></div>');
    await tick();
    expect(document.querySelectorAll('.cyextv-kept')).toHaveLength(1);
    f.stop!();
  });
  it('follows a replaced list', async () => {
    document.body.innerHTML = twitchList(twitchLine('one'));
    const f = deleted();
    f.start!(ctxFor(twitch, { deleted: 'strike' }));
    document.body.innerHTML = twitchList(twitchLine('two'));
    await tick();
    const m = twitch.messages(document)[0]!;
    run(f, m);
    twitch.body(m)!.insertAdjacentHTML('afterend', '<span class="chat-line__message--deleted-notice">gone</span>');
    await tick();
    expect(m.querySelector('.cyextv-kept')!.textContent).toBe('two');
    f.stop!();
  });
  it('works on kick with its line-through notice; off for "site"', async () => {
    document.body.innerHTML = kickList('kicked words');
    const f = deleted();
    expect(f.enabled({ ...DEFAULTS, chat: { ...CHAT_DEFAULTS, deleted: 'site' } })).toBe(false);
    f.start!(ctxFor(kick, { deleted: 'strike' }));
    const m = kick.messages(document)[0]!;
    run(f, m);
    kick.body(m)!.insertAdjacentHTML('afterend', '<span class="line-through">deleted</span>');
    await tick();
    expect(m.querySelector('.cyextv-kept')!.textContent).toBe('kicked words');
    f.stop!();
  });
});
