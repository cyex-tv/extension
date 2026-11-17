// @vitest-environment jsdom
// Repeat counting: what counts as the same message, and what the feature folds, leaves alone and undoes.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { highlights } from '../src/features/highlights';
import { REPEAT_WINDOW_MS, repeatKey, repeats } from '../src/features/looks/repeats';
import type { Feature, FeatureContext, MessageInfo } from '../src/features/types';
import { CHAT_DEFAULTS, DEFAULTS, type Settings, merge } from '../src/settings';
import type { Site } from '../src/sites/index';
import { kick } from '../src/sites/kick';
import { twitch } from '../src/sites/twitch';

let clock = 1_000_000;
const settings = (repeats: 'off' | 'count' | 'dim', chat: Partial<Settings['chat']> = {}): Settings => ({ ...DEFAULTS, chat: { ...CHAT_DEFAULTS, repeats, ...chat } });
const ctx = (site: Site, s: Settings, index: unknown = null): FeatureContext => ({
  doc: document,
  site,
  settings: s,
  index: index as never,
  now: () => clock,
  channel: () => null,
  others: () => [],
  local: null,
});

const twitchLine = (text: string, login = 'nora') =>
  `<div class="chat-line__message" data-a-target="chat-line-message" data-a-user="${login}"><span class="chat-line__username-container"><span class="chat-author__display-name">${login}</span></span><span data-a-target="chat-line-message-body"><span class="text-fragment">${text}</span></span></div>`;
const kickLine = (text: string, login = 'nora') =>
  `<div data-index="0"><div><span>02:06 AM</span><div><button title="${login}">${login}</button></div><span aria-hidden="true">:&nbsp;</span><span class="font-normal">${text}</span></div></div>`;
const listOf = (site: Site, lines: string) => (site === kick ? `<div id="chatroom-messages">${lines}</div>` : `<div data-test-selector="chat-scrollable-area__message-container">${lines}</div>`);

/** Adds a message, runs the feature on it the way the app would, and returns it. */
function say(site: Site, f: Feature, text: string, login: string, over: Partial<MessageInfo> = {}): Element {
  const list = site.chatList(document)!;
  list.insertAdjacentHTML('beforeend', site === kick ? kickLine(text, login) : twitchLine(text, login));
  const message = list.lastElementChild!;
  const info: MessageInfo = { sender: null, login, text, at: clock, ...over };
  f.message?.(message, info);
  return message;
}

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  clock = 1_000_000;
});
afterEach(() => {
  document.head.innerHTML = '';
});

describe('repeatKey', () => {
  it('ignores case, spacing and punctuation around words', () => {
    const k = repeatKey('hello world');
    expect(repeatKey('Hello   World')).toBe(k);
    expect(repeatKey('  HELLO world!! ')).toBe(k);
    expect(repeatKey('hello, world')).toBe(k);
  });

  it('ignores invisible characters and stacked accents', () => {
    const k = repeatKey('hello world');
    expect(repeatKey('hel\u200Blo wor\u2060ld')).toBe(k);
    expect(repeatKey('hello\u{E0000} world')).toBe(k);
    expect(repeatKey('hello world' + '\u0300\u0301\u0302\u0303')).toBe(k);
  });

  it('folds full-width and similar forms', () => {
    expect(repeatKey('ＧＧ')).toBe(repeatKey('gg'));
  });

  it('counts an emote-only message by which emotes it uses, not how many', () => {
    const isEmote = (w: string) => w === 'KEKW' || w === 'OMEGALUL';
    expect(repeatKey('KEKW KEKW KEKW', isEmote)).toBe(repeatKey('KEKW', isEmote));
    expect(repeatKey('KEKW OMEGALUL', isEmote)).toBe(repeatKey('OMEGALUL KEKW KEKW', isEmote));
    expect(repeatKey('KEKW', isEmote)).not.toBe(repeatKey('OMEGALUL', isEmote));
  });

  it('treats one word said several times as that word, but not different sentences as the same', () => {
    expect(repeatKey('lol lol lol')).toBe(repeatKey('LOL'));
    expect(repeatKey('what a play')).not.toBe(repeatKey('what a pass'));
    expect(repeatKey('what a play')).not.toBe(repeatKey('play a what'));
  });

  it('keeps words made only of symbols, and gives "" for nothing', () => {
    expect(repeatKey(':)')).not.toBe('');
    expect(repeatKey(':)')).not.toBe(repeatKey(':('));
    expect(repeatKey('   ​ ')).toBe('');
  });
});

describe.each([
  ['Twitch', twitch],
  ['Kick', kick],
] as const)('%s', (_n, site) => {
  const start = (mode: 'count' | 'dim' = 'count', chat: Partial<Settings['chat']> = {}) => {
    document.body.innerHTML = listOf(site, '');
    const f = repeats();
    f.start!(ctx(site, settings(mode, chat)));
    return f;
  };

  it('folds the same message from different chatters into the first, with a counter', () => {
    const f = start();
    const first = say(site, f, 'that was close', 'a');
    const second = say(site, f, 'That was CLOSE!', 'b');
    const third = say(site, f, 'that was close', 'c');
    expect(first.hasAttribute('data-cyextv-repeat')).toBe(false);
    expect(second.getAttribute('data-cyextv-repeat')).toBe('hidden');
    expect(third.getAttribute('data-cyextv-repeat')).toBe('hidden');
    const counter = first.querySelector('.cyextv-repeat-count')!;
    expect(counter.textContent).toBe('×3');
    expect(document.querySelectorAll('.cyextv-repeat-count')).toHaveLength(1);
    // The site's own nodes are all still there.
    expect(site.messages(document)).toHaveLength(3);
    expect(getComputedStyle(second).display).toBe('none');
    expect(getComputedStyle(first).display).not.toBe('none');
  });

  it('shows no counter until a repeat comes', () => {
    const f = start();
    const first = say(site, f, 'hello there', 'a');
    say(site, f, 'something else', 'b');
    expect(first.querySelector('.cyextv-repeat-count')).toBeNull();
  });

  it('count and dim keeps the repeats, faded', () => {
    const f = start('dim');
    say(site, f, 'gg', 'a');
    const second = say(site, f, 'gg', 'b');
    expect(second.getAttribute('data-cyextv-repeat')).toBe('dim');
    expect(getComputedStyle(second).display).not.toBe('none');
    expect(document.querySelector('.cyextv-repeat-count')!.textContent).toBe('×2');
  });

  it('does not fold the same chatter repeating themselves', () => {
    const f = start();
    say(site, f, 'gg', 'a');
    const again = say(site, f, 'gg', 'a');
    expect(again.hasAttribute('data-cyextv-repeat')).toBe(false);
    expect(document.querySelector('.cyextv-repeat-count')).toBeNull();
  });

  it('starts a new group after the window, and after the first line is gone', () => {
    const f = start();
    const first = say(site, f, 'gg', 'a');
    clock += REPEAT_WINDOW_MS + 1;
    const late = say(site, f, 'gg', 'b');
    expect(late.hasAttribute('data-cyextv-repeat')).toBe(false);
    expect(first.querySelector('.cyextv-repeat-count')).toBeNull();
    const c = say(site, f, 'gg', 'c');
    expect(c.getAttribute('data-cyextv-repeat')).toBe('hidden');
    late.remove();
    const d = say(site, f, 'gg', 'd');
    expect(d.hasAttribute('data-cyextv-repeat')).toBe(false);
  });

  it('a repeat extends the window, so a long spam train stays one group', () => {
    const f = start();
    say(site, f, 'gg', 'a');
    for (let i = 0; i < 5; i++) {
      clock += 15_000;
      say(site, f, 'gg', `u${i}`);
    }
    expect(document.querySelector('.cyextv-repeat-count')!.textContent).toBe('×6');
  });

  it('never folds your own messages, either way round', () => {
    document.body.innerHTML = listOf(site, '');
    const f = repeats();
    f.start!(ctx(site, settings('count', { myNames: ['me'] })));
    const mine = say(site, f, 'gg', 'me');
    const theirs = say(site, f, 'gg', 'a');
    const theirs2 = say(site, f, 'gg', 'b');
    expect(mine.hasAttribute('data-cyextv-repeat')).toBe(false);
    expect(theirs.hasAttribute('data-cyextv-repeat')).toBe(false);
    expect(theirs2.getAttribute('data-cyextv-repeat')).toBe('hidden');
    const mine2 = say(site, f, 'gg', 'ME');
    expect(mine2.hasAttribute('data-cyextv-repeat')).toBe(false);
    expect(document.querySelector('.cyextv-repeat-count')!.textContent).toBe('×2');
  });

  it('leaves highlighted messages alone (mentions, people, words)', () => {
    const f = start();
    say(site, f, 'gg', 'a');
    const list = site.chatList(document)!;
    list.insertAdjacentHTML('beforeend', site === kick ? kickLine('gg', 'b') : twitchLine('gg', 'b'));
    const hl = list.lastElementChild!;
    hl.setAttribute('data-cyextv-hl', 'mention');
    f.message!(hl, { sender: null, login: 'b', text: 'gg', at: clock });
    expect(hl.hasAttribute('data-cyextv-repeat')).toBe(false);
    expect(document.querySelector('.cyextv-repeat-count')).toBeNull();
  });

  it('skips the backlog (at 0), messages without a chatter, and deleted messages', () => {
    const f = start();
    say(site, f, 'gg', 'a');
    const backlog = say(site, f, 'gg', 'b', { at: 0 });
    const nobody = say(site, f, 'gg', 'c', { login: null, sender: null });
    expect(backlog.hasAttribute('data-cyextv-repeat')).toBe(false);
    expect(nobody.hasAttribute('data-cyextv-repeat')).toBe(false);
    const list = site.chatList(document)!;
    list.insertAdjacentHTML('beforeend', site === kick ? kickLine('gg', 'd') : twitchLine('gg', 'd'));
    const gone = list.lastElementChild!;
    gone.insertAdjacentHTML('beforeend', site === kick ? '<span class="line-through">gone</span>' : '<span data-a-target="chat-deleted-message-placeholder"></span>');
    f.message!(gone, { sender: null, login: 'd', text: 'gg', at: clock });
    expect(gone.hasAttribute('data-cyextv-repeat')).toBe(false);
  });

  it('an unnamed chatter can be told apart by sender ID', () => {
    const f = start();
    say(site, f, 'gg', 'a', { login: null, sender: '1' });
    const other = say(site, f, 'gg', 'b', { login: null, sender: '2' });
    const same = say(site, f, 'gg', 'c', { login: null, sender: '1' });
    expect(other.getAttribute('data-cyextv-repeat')).toBe('hidden');
    expect(same.hasAttribute('data-cyextv-repeat')).toBe(false);
  });

  it('shows the repeats again when the first message is deleted', async () => {
    const f = start();
    const first = say(site, f, 'gg', 'a');
    const second = say(site, f, 'gg', 'b');
    expect(second.getAttribute('data-cyextv-repeat')).toBe('hidden');
    first.insertAdjacentHTML('beforeend', site === kick ? '<span class="line-through">gone</span>' : '<span data-a-target="chat-deleted-message-placeholder"></span>');
    await new Promise((r) => setTimeout(r, 0));
    expect(second.hasAttribute('data-cyextv-repeat')).toBe(false);
    expect(document.querySelector('.cyextv-repeat-count')).toBeNull();
  });

  it('a new repeat after the first was deleted starts again instead of joining it', () => {
    const f = start();
    const first = say(site, f, 'gg', 'a');
    first.insertAdjacentHTML('beforeend', site === kick ? '<span class="line-through">gone</span>' : '<span data-a-target="chat-deleted-message-placeholder"></span>');
    const next = say(site, f, 'gg', 'b');
    expect(next.hasAttribute('data-cyextv-repeat')).toBe(false);
  });

  it('keeps folded repeats folded after their group ends, and undoes everything on stop', () => {
    const f = start();
    say(site, f, 'gg', 'a');
    const second = say(site, f, 'gg', 'b');
    clock += REPEAT_WINDOW_MS * 3;
    say(site, f, 'other', 'c');
    expect(second.getAttribute('data-cyextv-repeat')).toBe('hidden');
    f.stop!();
    expect(document.querySelector('[data-cyextv-repeat]')).toBeNull();
    expect(document.querySelector('.cyextv-repeat-count')).toBeNull();
    expect(document.getElementById('cyextv-repeats')).toBeNull();
    f.stop!();
  });

  it('counts emote-only spam of different sizes as one', () => {
    document.body.innerHTML = listOf(site, '');
    const f = repeats();
    const index = { find: (w: string) => (['KEKW', 'LUL'].includes(w) ? { name: w } : undefined) };
    f.start!(ctx(site, settings('count'), index));
    say(site, f, 'KEKW', 'a');
    const b = say(site, f, 'KEKW KEKW KEKW', 'b');
    const c = say(site, f, 'LUL', 'c');
    expect(b.getAttribute('data-cyextv-repeat')).toBe('hidden');
    expect(c.hasAttribute('data-cyextv-repeat')).toBe(false);
  });
});

describe('with highlights', () => {
  it('a mention that is also a repeat stays visible and is not counted', () => {
    document.body.innerHTML = listOf(twitch, '');
    const s = settings('count', { myNames: ['me'] });
    const h = highlights();
    const r = repeats();
    h.start!(ctx(twitch, s));
    r.start!(ctx(twitch, s));
    const run = (text: string, login: string) => {
      const list = twitch.chatList(document)!;
      list.insertAdjacentHTML('beforeend', twitchLine(text, login));
      const m = list.lastElementChild!;
      const info: MessageInfo = { sender: null, login, text, at: clock };
      h.message!(m, info);
      r.message!(m, info);
      return m;
    };
    run('@me hello', 'a');
    const second = run('@me hello', 'b');
    const plain1 = run('gg', 'c');
    const plain2 = run('gg', 'd');
    expect(second.hasAttribute('data-cyextv-repeat')).toBe(false);
    expect(second.getAttribute('data-cyextv-hl')).toBe('mention');
    expect(plain1.hasAttribute('data-cyextv-repeat')).toBe(false);
    expect(plain2.getAttribute('data-cyextv-repeat')).toBe('hidden');
    h.stop!();
    r.stop!();
  });
});

describe('the setting', () => {
  it('is off by default and only takes off, count or dim', () => {
    expect(DEFAULTS.chat.repeats).toBe('off');
    expect(repeats().enabled(DEFAULTS)).toBe(false);
    expect(repeats().enabled(settings('count'))).toBe(true);
    expect(merge({ chat: { repeats: 'dim' } }).chat.repeats).toBe('dim');
    expect(merge({ chat: { repeats: 'nope' } }).chat.repeats).toBe('off');
    expect(merge({ chat: { repeats: 3 } }).chat.repeats).toBe('off');
  });
});
