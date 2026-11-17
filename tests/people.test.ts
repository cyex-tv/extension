// @vitest-environment jsdom
// Usercard messages and shortcuts.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { shortcuts } from '../src/features/people/shortcuts';
import { MessageLog, clock, usercardMessages } from '../src/features/people/usercard';
import type { FeatureContext } from '../src/features/types';
import { DEFAULTS } from '../src/settings';
import { kick } from '../src/sites/kick';
import { twitch } from '../src/sites/twitch';

let channelId = '12345678';
let time = new Date(2026, 0, 1, 9, 5).getTime();

function ctx(site = twitch): FeatureContext {
  return {
    doc: document,
    site,
    settings: DEFAULTS,
    index: undefined as never,
    now: () => time,
    channel: () => ({ platform: site.platform, id: channelId, login: 'chan' }),
    others: () => [],
    local: null,
  };
}

// After the observer's microtask, the feature's frame runs before ours (frames run in order).
const raf = async () => {
  await Promise.resolve();
  await new Promise((r) => requestAnimationFrame(() => r(null)));
};

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  channelId = '12345678';
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('MessageLog', () => {
  it('keeps 50 per login, newest first', () => {
    const l = new MessageLog();
    for (let i = 0; i < 60; i++) l.add('a', `m${i}`, i);
    expect(l.count('a')).toBe(50);
    expect(l.latest('a', 3).map((e) => e.text)).toEqual(['m59', 'm58', 'm57']);
  });
  it('drops the least recently active login past the cap', () => {
    const l = new MessageLog(50, 3);
    l.add('a', '1', 0);
    l.add('b', '1', 0);
    l.add('c', '1', 0);
    l.add('a', '2', 0); // a is fresh again
    l.add('d', '1', 0);
    expect(l.size).toBe(3);
    expect(l.count('b')).toBe(0);
    expect(l.count('a')).toBe(2);
  });
  it('formats the clock as HH:mm', () => {
    expect(clock(new Date(2026, 0, 1, 9, 5).getTime())).toBe('09:05');
  });
});

describe('site user cards', () => {
  it('reads the Twitch card login from the header link, a profile link, or @name', () => {
    document.body.innerHTML = '<div data-a-target="viewer-card"><h4><a href="/Lumen_Fox">Lumen</a></h4></div>';
    expect(twitch.userCard(document)?.login).toBe('lumen_fox');
    document.body.innerHTML = '<div data-a-target="viewer-card"><a href="/lumen_fox/videos">v</a><a href="https://www.twitch.tv/Lumen_Fox">x</a></div>';
    expect(twitch.userCard(document)?.login).toBe('lumen_fox');
    document.body.innerHTML = '<div class="viewer-card"><span>@Lumen_Fox</span></div>';
    expect(twitch.userCard(document)?.login).toBe('lumen_fox');
    document.body.innerHTML = '<div data-a-target="viewer-card"></div>';
    expect(twitch.userCard(document)).toBeNull();
  });
  it('finds a Kick popup with a profile link, but not inside chat', () => {
    document.body.innerHTML = '<div id="chatroom-messages"><div role="dialog"><a href="/other">o</a></div></div><div role="dialog"><a href="/Lumen_Fox">Lumen</a></div>';
    expect(kick.userCard(document)?.login).toBe('lumen_fox');
    document.body.innerHTML = '<div role="dialog"><p>Settings</p></div>';
    expect(kick.userCard(document)).toBeNull();
  });
});

describe('usercardMessages', () => {
  const info = (login: string, text: string) => ({ sender: null, login, text, at: 1 });

  it('adds a section to the open card with the latest messages, once', async () => {
    const f = usercardMessages();
    f.start?.(ctx());
    f.message?.(document.createElement('div'), info('lumen_fox', 'first'));
    time += 60000;
    f.message?.(document.createElement('div'), info('lumen_fox', '<b>second</b>'));
    document.body.innerHTML = '<div data-a-target="viewer-card"><h4><a href="/lumen_fox">L</a></h4></div>';
    await raf();
    const sections = document.querySelectorAll('[data-cyextv-usercard]');
    expect(sections).toHaveLength(1);
    const text = sections[0]!.textContent ?? '';
    expect(text).toContain('Messages');
    expect(sections[0]!.querySelector('.cyextv-uc-count')?.textContent).toBe('2');
    const rows = [...sections[0]!.querySelectorAll('.cyextv-uc-row')];
    expect(rows.map((r) => r.querySelector('.cyextv-uc-text')?.textContent)).toEqual(['<b>second</b>', 'first']);
    expect(rows[1]!.querySelector('.cyextv-uc-time')?.textContent).toBe('09:05');
    expect(sections[0]!.querySelector('b')).toBeNull(); // text, never markup
    await raf();
    expect(document.querySelectorAll('[data-cyextv-usercard]')).toHaveLength(1);
    f.stop?.();
  });

  it('shows the empty state, redraws on a new message, and follows a new login', async () => {
    const f = usercardMessages();
    f.start?.(ctx());
    document.body.innerHTML = '<div data-a-target="viewer-card"><h4><a href="/lumen_fox">L</a></h4></div>';
    await raf();
    expect(document.querySelector('.cyextv-uc-empty')?.textContent).toBe('No messages from them since you opened this chat.');
    f.message?.(document.createElement('div'), info('lumen_fox', 'hi'));
    await raf();
    expect(document.querySelectorAll('.cyextv-uc-row')).toHaveLength(1);
    document.querySelector('h4 a')!.setAttribute('href', '/other');
    f.message?.(document.createElement('div'), info('other', 'yo'));
    await raf();
    expect(document.querySelectorAll('[data-cyextv-usercard]')).toHaveLength(1);
    expect(document.querySelector('.cyextv-uc-text')?.textContent).toBe('yo');
    f.stop?.();
  });

  it('shows at most 10, handles long and unicode text, and resets on a new channel', async () => {
    const f = usercardMessages();
    f.start?.(ctx());
    for (let i = 0; i < 20; i++) f.message?.(document.createElement('div'), info('lumen_fox', i === 19 ? `漢字🙂${'x'.repeat(5000)}` : `m${i}`));
    document.body.innerHTML = '<div data-a-target="viewer-card"><h4><a href="/lumen_fox">L</a></h4></div>';
    await raf();
    expect(document.querySelectorAll('.cyextv-uc-row')).toHaveLength(10);
    expect(document.querySelector('.cyextv-uc-text')?.textContent?.startsWith('漢字🙂')).toBe(true);
    channelId = '999';
    f.message?.(document.createElement('div'), info('someone', 'x'));
    document.body.innerHTML = '<div data-a-target="viewer-card"><h4><a href="/lumen_fox">L</a></h4></div>';
    await raf();
    expect(document.querySelector('.cyextv-uc-count')?.textContent).toBe('0');
    f.stop?.();
  });

  it('stop removes the style, the section and the observer', async () => {
    const f = usercardMessages();
    f.start?.(ctx());
    expect(document.getElementById('cyextv-usercardMessages')).not.toBeNull();
    document.body.innerHTML = '<div data-a-target="viewer-card"><h4><a href="/lumen_fox">L</a></h4></div>';
    await raf();
    f.stop?.();
    expect(document.getElementById('cyextv-usercardMessages')).toBeNull();
    expect(document.querySelector('[data-cyextv-usercard]')).toBeNull();
    document.body.innerHTML = '<div data-a-target="viewer-card"><h4><a href="/lumen_fox">L</a></h4></div>';
    await raf();
    expect(document.querySelector('[data-cyextv-usercard]')).toBeNull();
  });

  it('is on by default and has no providedBy', () => {
    const f = usercardMessages();
    expect(f.enabled(DEFAULTS)).toBe(true);
    expect(f.providedBy).toBeUndefined();
  });
});

describe('shortcuts', () => {
  const key = (init: KeyboardEventInit) => {
    const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    document.dispatchEvent(e);
    return e;
  };

  it('Alt+E fires the emote menu event', () => {
    document.documentElement.dataset.cyextvEmoteMenu = '';
    const f = shortcuts();
    f.start?.(ctx());
    let n = 0;
    document.addEventListener('cyextv:emote-menu', () => n++);
    const e = key({ altKey: true, code: 'KeyE', key: 'e' });
    expect(n).toBe(1);
    expect(e.defaultPrevented).toBe(true);
    key({ altKey: true, ctrlKey: true, code: 'KeyE', key: 'e' });
    key({ altKey: true, metaKey: true, code: 'KeyE', key: 'e' });
    key({ altKey: true, code: 'KeyE', key: 'e', isComposing: true });
    expect(n).toBe(1);
    f.stop?.();
  });

  it('/ focuses the message box unless typing elsewhere', () => {
    document.body.innerHTML = '<input id="other"><div data-a-target="chat-input" contenteditable="true"></div><button id="b">b</button>';
    const f = shortcuts();
    f.start?.(ctx());
    const input = document.querySelector<HTMLElement>('[data-a-target="chat-input"]')!;
    document.getElementById('b')!.focus();
    const e = key({ key: '/' });
    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input);
    // Already in the box: "/" is a character.
    expect(key({ key: '/' }).defaultPrevented).toBe(false);
    document.getElementById('other')!.focus();
    expect(key({ key: '/' }).defaultPrevented).toBe(false);
    expect(document.activeElement?.id).toBe('other');
    f.stop?.();
  });

  it('does nothing without a message box, and stop removes the listener', () => {
    const f = shortcuts();
    f.start?.(ctx());
    expect(key({ key: '/' }).defaultPrevented).toBe(false);
    f.stop?.();
    let n = 0;
    document.addEventListener('cyextv:emote-menu', () => n++);
    key({ altKey: true, code: 'KeyE', key: 'e' });
    expect(n).toBe(0);
  });
});
