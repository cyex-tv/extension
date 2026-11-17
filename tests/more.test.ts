// @vitest-environment jsdom
// The second feature group: clean text, line looks, emote clicks, sounds, the mentions list,
// nicknames and notes, and their settings.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMOTE_CLASS } from '../src/chat/render';
import { clickedEmote, emoteClick } from '../src/features/composer/emote-click';
import { SOUNDS, gainFor } from '../src/features/highlights/chime';
import { INBOX_KEY, INBOX_MAX, Inbox, type Mention, addToInbox, readInbox } from '../src/features/highlights/inbox';
import { cleanMessages, cleanText } from '../src/features/looks/clean';
import { lineCss } from '../src/features/looks/lines';
import { usercardNotes } from '../src/features/people/notes-card';
import { NOTES_KEY, NotesStore, applyNick, nicknames, readNotes } from '../src/features/people/notes';
import { FEATURES } from '../src/features/index';
import type { FeatureContext } from '../src/features/types';
import { channelUrl, mentionTime } from '../src/popup/model';
import { DEFAULTS, type Settings, merge } from '../src/settings';
import type { Site } from '../src/sites/index';
import { kick } from '../src/sites/kick';
import { twitch } from '../src/sites/twitch';

const withChat = (chat: Partial<Settings['chat']>): Settings => ({ ...DEFAULTS, chat: { ...DEFAULTS.chat, ...chat } });
const ctx = (settings: Settings = DEFAULTS, site: Site = twitch, local: ExtStorageArea | null = null): FeatureContext => ({
  doc: document,
  site,
  settings,
  index: null as never,
  now: () => 1000,
  channel: () => ({ platform: site.platform, id: '1', login: 'chan' }),
  others: () => [],
  local,
});

/** An in-memory storage area. */
function memory(initial: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = { ...initial };
  const area: ExtStorageArea = {
    get: async (k) => (typeof k === 'string' ? (k in data ? { [k]: data[k] } : {}) : { ...data }),
    set: async (items) => void Object.assign(data, items),
  };
  return { area, data };
}

const raf = async () => {
  await Promise.resolve();
  await new Promise((r) => requestAnimationFrame(() => r(null)));
};

const twitchLine = (login: string, body: string) =>
  `<div data-a-target="chat-line-message" data-a-user="${login}"><span class="chat-line__username"><span class="chat-author__display-name" data-a-user="${login}">${login}</span></span><span data-a-target="chat-line-message-body"><span class="text-fragment">${body}</span></span></div>`;

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});
afterEach(() => vi.useRealTimers());

describe('cleanText', () => {
  const both = { invisible: true, zalgo: true };
  it('drops zero-width spaces, word joiners, BOM and 7TV’s duplicate bypass', () => {
    expect(cleanText('KEKW\u{E0000}', both)).toBe('KEKW');
    expect(cleanText('a​b⁠c﻿d­e', both)).toBe('abcde');
  });
  it('keeps joiners letters and emoji need', () => {
    expect(cleanText('👨‍👩‍👧', both)).toBe('👨‍👩‍👧');
    expect(cleanText('می‌خواهم', both)).toBe('می‌خواهم');
    expect(cleanText('a‍b', both)).toBe('ab');
    expect(cleanText('‏שלום', both)).toBe('‏שלום');
  });
  it('cuts stacks of combining marks to three', () => {
    const zalgo = `Z${'́̂̃̄̅̆'}a`;
    expect(cleanText(zalgo, both)).toBe('Ź̂̃a');
    expect(cleanText('café Việt', both)).toBe('café Việt');
    expect(cleanText(zalgo, { invisible: true, zalgo: false })).toBe(zalgo);
  });
  it('cleans the message body before the rest see it, and says so', () => {
    document.body.innerHTML = twitchLine('a', 'KEKW\u{E0000}');
    const m = document.querySelector('[data-a-target="chat-line-message"]')!;
    const f = cleanMessages();
    f.start!(ctx());
    const info = { sender: null, login: 'a', text: 'KEKW\u{E0000}', at: 1 };
    expect(f.prepare!(m, info)).toBe(true);
    expect(m.querySelector('.text-fragment')!.textContent).toBe('KEKW');
    expect(info.text).toBe('KEKW');
    expect(f.prepare!(m, info)).toBeUndefined();
  });
  it('runs first of all the features', () => {
    expect(FEATURES[0]!().id).toBe('cleanText');
  });
});

describe('lineCss', () => {
  const base = { alternate: false, separators: false, fontSize: 0 };
  it('adds font, line height, compact lines and emote size only when set', () => {
    expect(lineCss('.m', base)).toBe('');
    const css = lineCss('.m', { ...base, font: 'mono', lineHeight: 150, compact: true, emoteScale: 200 });
    expect(css).toContain('.m{font-family:ui-monospace');
    expect(css).toContain('.m{line-height:1.5}');
    expect(css).toContain('padding-top:1px');
    expect(css).toContain(`.m .${EMOTE_CLASS}>img{max-height:56px}`);
    expect(lineCss('.m', { ...base, font: 'site' })).toBe('');
  });
});

describe('emote clicks', () => {
  const setup = (mode: Settings['chat']['emoteClick']) => {
    document.body.innerHTML = `${twitchLine('a', '')}<div data-a-target="chat-input" contenteditable="true"></div>`;
    const body = document.querySelector('[data-a-target="chat-line-message-body"]')!;
    const e = document.createElement('span');
    e.className = EMOTE_CLASS;
    e.dataset.name = 'catJAM';
    e.append(document.createElement('img'));
    body.append(e);
    const f = emoteClick();
    f.start!(ctx(withChat({ emoteClick: mode })));
    return { f, img: e.querySelector('img')! };
  };

  it('finds our emote inside a chat message only', () => {
    const { f, img } = setup('insert');
    expect(clickedEmote(img, twitch.messageSelector)).toBe('catJAM');
    const loose = document.createElement('span');
    loose.className = EMOTE_CLASS;
    loose.dataset.name = 'x';
    document.body.append(loose);
    expect(clickedEmote(loose, twitch.messageSelector)).toBeNull();
    f.stop!();
  });

  it('puts the name in the message box', () => {
    const { f, img } = setup('insert');
    img.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
    expect(document.querySelector('[data-a-target="chat-input"]')!.textContent).toContain('catJAM');
    f.stop!();
    expect(document.getElementById('cyextv-emoteClick')).toBeNull();
  });

  it('copies the name and says so', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { f, img } = setup('copy');
    img.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
    await Promise.resolve();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith('catJAM');
    expect(document.getElementById('cyextv-toast')?.textContent).toBe('Copied catJAM');
    expect(document.getElementById('cyextv-toast')?.getAttribute('role')).toBe('status');
    f.stop!();
    expect(document.getElementById('cyextv-toast')).toBeNull();
  });

  it('leaves modified clicks and "off" alone', () => {
    const { f, img } = setup('insert');
    img.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, ctrlKey: true }));
    expect(document.querySelector('[data-a-target="chat-input"]')!.textContent).toBe('');
    f.stop!();
    expect(emoteClick().enabled(withChat({ emoteClick: 'off' }))).toBe(false);
  });
});

describe('sounds', () => {
  it('has notes for each choice and a volume scale with 60 at the earlier level', () => {
    for (const k of ['chime', 'ping', 'pop'] as const) expect(SOUNDS[k].length).toBeGreaterThan(0);
    expect(gainFor(60)).toBeCloseTo(0.15);
    expect(gainFor(0)).toBe(0);
    expect(gainFor(500)).toBeCloseTo(0.25);
  });
});

describe('mentions list', () => {
  const m = (text: string, at = 1): Mention => ({ platform: 'twitch', channel: 'chan', login: 'a', text, at });
  it('reads only well-formed entries, newest first, capped', () => {
    expect(readInbox(null)).toEqual([]);
    expect(readInbox([m('x'), { nope: 1 }, 'y'])).toEqual([m('x')]);
    const many = addToInbox([], Array.from({ length: 80 }, (_, i) => m(String(i), i)));
    expect(many).toHaveLength(INBOX_MAX);
    expect(many[0]!.text).toBe('79');
    expect(addToInbox([], [m('z'.repeat(900))])[0]!.text).toHaveLength(500);
  });

  it('batches writes to the device storage', async () => {
    vi.useFakeTimers();
    const { area, data } = memory({ [INBOX_KEY]: [m('old')] });
    const inbox = new Inbox(area);
    inbox.add(m('one'));
    inbox.add(m('two'));
    expect((data[INBOX_KEY] as Mention[]).length).toBe(1);
    await vi.advanceTimersByTimeAsync(1100);
    expect((data[INBOX_KEY] as Mention[]).map((x) => x.text)).toEqual(['two', 'one', 'old']);
  });

  it('formats popup times and links', () => {
    const now = new Date(2026, 10, 17, 12, 0).getTime();
    expect(mentionTime(now - 10_000, now)).toBe('now');
    expect(mentionTime(now - 5 * 60_000, now)).toBe('5 min');
    expect(mentionTime(now - 3 * 3600_000, now)).toBe('3 h');
    expect(mentionTime(new Date(2026, 0, 2).getTime(), now)).toBe('2026/01/02');
    expect(channelUrl('twitch', 'Chan')).toBe('https://www.twitch.tv/chan');
    expect(channelUrl('kick', 'x/../evil')).toBe('https://kick.com/');
  });
});

describe('nicknames and notes', () => {
  it('reads stored notes safely', () => {
    expect(readNotes(null)).toEqual({});
    expect(readNotes({ Lumen_Fox: { nick: '  Fox  ', note: '' }, 'bad name': { nick: 'x' }, empty: { nick: '', note: ' ' }, n: { nick: 'a'.repeat(40), note: 'b'.repeat(900) } })).toEqual({
      lumen_fox: { nick: 'Fox', note: '' },
      n: { nick: 'a'.repeat(25), note: 'b'.repeat(500) },
    });
  });

  it('saves to the device, removes empty entries and tells listeners', async () => {
    const { area, data } = memory();
    const store = new NotesStore();
    await store.load(area);
    const seen = vi.fn();
    store.subscribe(seen);
    await store.set('Lumen_Fox', { nick: 'Fox', note: 'met at the meetup' });
    expect(data[NOTES_KEY]).toEqual({ lumen_fox: { nick: 'Fox', note: 'met at the meetup' } });
    expect(store.get('LUMEN_FOX')?.nick).toBe('Fox');
    await store.set('lumen_fox', { nick: '', note: '' });
    expect(data[NOTES_KEY]).toEqual({});
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it('shows the nickname in chat without touching the name’s text, and undoes it', async () => {
    document.body.innerHTML = twitchLine('lumen_fox', 'hi');
    const store = new NotesStore();
    const f = nicknames(store);
    f.start!(ctx());
    const name = document.querySelector<HTMLElement>('.chat-author__display-name')!;
    await store.set('lumen_fox', { nick: 'Fox', note: 'a note' });
    expect(name.getAttribute('data-cyextv-nick')).toBe('Fox');
    expect(name.textContent).toBe('lumen_fox');
    expect(name.title).toBe('lumen_fox (your nickname: Fox)\na note');
    expect(document.getElementById('cyextv-nicknames')!.textContent).toContain('content:attr(data-cyextv-nick)');
    f.stop!();
    expect(name.hasAttribute('data-cyextv-nick')).toBe(false);
    expect(name.hasAttribute('title')).toBe(false);
  });

  it('never changes a title the site uses (Kick reads the login from it)', () => {
    const b = document.createElement('button');
    b.title = 'Lumen_Fox';
    b.textContent = 'Lumen_Fox';
    applyNick(b, { nick: 'Fox', note: 'n' });
    expect(b.title).toBe('Lumen_Fox');
    expect(b.getAttribute('data-cyextv-nick')).toBe('Fox');
    applyNick(b, null);
    expect(b.title).toBe('Lumen_Fox');
    expect(b.hasAttribute('data-cyextv-nick')).toBe(false);
    expect(kick.login(Object.assign(document.createElement('div'), { innerHTML: b.outerHTML }))).toBe('lumen_fox');
  });

  it('adds nickname and note fields to the user card, once, above the messages, and saves them', async () => {
    const { area, data } = memory();
    const store = new NotesStore();
    await store.load(area);
    const f = usercardNotes(store);
    f.start!(ctx());
    document.body.innerHTML = '<div data-a-target="viewer-card"><h4><a href="/lumen_fox">L</a></h4><div data-cyextv-usercard="lumen_fox"></div></div>';
    await raf();
    await raf();
    const section = document.querySelectorAll('[data-cyextv-usercard-notes]');
    expect(section).toHaveLength(1);
    expect(section[0]!.nextElementSibling?.hasAttribute('data-cyextv-usercard')).toBe(true);
    const input = section[0]!.querySelector('input')!;
    input.value = 'Fox';
    input.dispatchEvent(new Event('change'));
    await Promise.resolve();
    expect((data[NOTES_KEY] as Record<string, { nick: string }>).lumen_fox!.nick).toBe('Fox');
    f.stop!();
    expect(document.querySelector('[data-cyextv-usercard-notes]')).toBeNull();
  });
});

describe('settings', () => {
  it('has the new defaults', () => {
    const c = DEFAULTS.chat;
    expect([c.font, c.lineHeight, c.compact, c.emoteScale, c.emoteClick]).toEqual(['site', 0, false, 0, 'insert']);
    expect([c.cleanInvisible, c.cleanZalgo, c.sound, c.volume, c.mentionsInbox, c.nicknames, c.usercardNotes]).toEqual([true, true, 'chime', 60, true, true, true]);
  });
  it('clamps and checks what is stored', () => {
    const c = merge({ chat: { font: 'comic', lineHeight: 900, emoteScale: 10, emoteClick: 'eat', sound: 'boom', volume: -5, compact: 'yes' } }).chat;
    expect([c.font, c.lineHeight, c.emoteScale, c.emoteClick, c.sound, c.volume, c.compact]).toEqual(['site', 200, 50, 'insert', 'chime', 0, false]);
    expect(merge({ chat: { lineHeight: 0, volume: 0 } }).chat.volume).toBe(0);
  });
});
