// @vitest-environment jsdom
// Highlights and ignores: the matching alone, then the DOM effect on Twitch- and Kick-shaped markup.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/content/app';
import { highlights } from '../src/features/highlights/highlights';
import { ignores } from '../src/features/highlights/ignores';
import { compileIgnores, compilePattern, compileRules, ranges } from '../src/features/highlights/match';
import type { Feature, FeatureContext } from '../src/features/types';
import { CHAT_DEFAULTS, DEFAULTS, type ChatSettings, type HighlightRule, type IgnoreRule, type Settings } from '../src/settings';
import { kick } from '../src/sites/kick';
import { twitch } from '../src/sites/twitch';

const chat = (over: Partial<ChatSettings> = {}): ChatSettings => ({ ...CHAT_DEFAULTS, mentions: true, firstMessages: false, ...over });
const word = (pattern: string, over: Partial<HighlightRule> = {}): HighlightRule => ({
  pattern,
  regex: false,
  wholeWord: true,
  matchCase: false,
  color: '',
  sound: false,
  wordsOnly: false,
  ...over,
});
const ignore = (pattern: string, over: Partial<IgnoreRule> = {}): IgnoreRule => ({ pattern, regex: false, matchCase: false, hide: false, swap: '***', ...over });
const who = (login: string | null, text: string) => ({ login, text });

describe('patterns', () => {
  it('matches plain words whole, case-insensitively', () => {
    const re = compilePattern('cat', { regex: false, wholeWord: true, matchCase: false })!;
    expect(ranges(re, 'Cat concat cat_ cat! (CAT)')).toEqual([[0, 3], [16, 19], [22, 25]]);
  });
  it('treats regex characters in plain words literally', () => {
    const re = compilePattern('a.b+', { regex: false, wholeWord: false, matchCase: false })!;
    expect(ranges(re, 'a.b+ axbb')).toEqual([[0, 4]]);
  });
  it('whole word means no letter, digit or underscore next to it, in any script', () => {
    const re = compilePattern('наме', { regex: false, wholeWord: true, matchCase: false })!;
    expect(ranges(re, 'наме xнаме наме1 НАМЕ')).toEqual([[0, 4], [17, 21]]);
  });
  it('an invalid regex never matches and never throws', () => {
    expect(compilePattern('(', { regex: true, wholeWord: false, matchCase: false })).toBeNull();
    expect(compilePattern('[a-', { regex: true, wholeWord: false, matchCase: false })).toBeNull();
    expect(compilePattern('', { regex: true, wholeWord: false, matchCase: false })).toBeNull();
  });
  it('falls back to non-unicode mode for regexes the u flag rejects', () => {
    const re = compilePattern('\\-x', { regex: true, wholeWord: false, matchCase: false })!;
    expect(ranges(re, 'a-x')).toEqual([[1, 3]]);
  });
  it('ignores empty matches', () => {
    const re = compilePattern('a*', { regex: true, wholeWord: false, matchCase: false })!;
    expect(ranges(re, 'baab')).toEqual([[1, 3]]);
  });
  it('respects match case for regex', () => {
    const re = compilePattern('Foo', { regex: true, wholeWord: false, matchCase: true })!;
    expect(ranges(re, 'foo Foo')).toEqual([[4, 7]]);
  });
  it('survives very long text', () => {
    const re = compilePattern('needle', { regex: false, wholeWord: true, matchCase: false })!;
    expect(ranges(re, 'x '.repeat(50_000) + 'needle')).toHaveLength(1);
  });
});

describe('classify', () => {
  it('finds your name as @name or name, case-insensitively, as a whole word', () => {
    const r = compileRules(chat(), 'lumen_fox');
    for (const t of ['hi @lumen_fox', 'Lumen_Fox look', 'hey lumen_fox, hi', '@LUMEN_FOX']) expect(r.classify(who('x', t), false)?.kind).toBe('mention');
    for (const t of ['lumen_foxy', 'xlumen_fox', 'lumen_fox2', 'lumen']) expect(r.classify(who('x', t), false)).toBeNull();
  });
  it('matches your other names too, with unicode', () => {
    const r = compileRules(chat({ myNames: ['Zoë', '@Дарья'] }), null);
    expect(r.classify(who('x', 'hi zoë!'), false)?.kind).toBe('mention');
    expect(r.classify(who('x', '@дарья'), false)?.kind).toBe('mention');
    expect(r.classify(who('x', 'zoëlle'), false)).toBeNull();
  });
  it('regex characters in a name are literal', () => {
    const r = compileRules(chat({ myNames: ['a.b'] }), null);
    expect(r.classify(who('x', 'axb'), false)).toBeNull();
    expect(r.classify(who('x', 'a.b'), false)?.kind).toBe('mention');
  });
  it('never counts your own messages as mentions', () => {
    const r = compileRules(chat(), 'lumen_fox');
    expect(r.classify(who('lumen_fox', '@lumen_fox'), false)).toBeNull();
    expect(compileRules(chat({ myNames: ['alt'] }), 'lumen_fox').classify(who('alt', '@lumen_fox'), false)).toBeNull();
  });
  it('is off with mentions off or no name', () => {
    expect(compileRules(chat({ mentions: false }), 'lumen_fox').classify(who('x', '@lumen_fox'), false)).toBeNull();
    expect(compileRules(chat(), null).classify(who('x', '@lumen_fox'), false)).toBeNull();
  });
  it('mention sound follows mentionSound', () => {
    expect(compileRules(chat({ mentionSound: true }), 'me').classify(who('x', '@me'), false)).toMatchObject({ sound: true, color: '#3d7bff' });
    expect(compileRules(chat(), 'me').classify(who('x', '@me'), false)?.sound).toBe(false);
  });
  it('orders: mention, person, word, first, own', () => {
    const c = chat({
      people: [{ name: 'bob', color: '', sound: true }],
      highlights: [word('hello')],
      firstMessages: true,
      ownMessages: true,
    });
    const r = compileRules(c, 'me');
    expect(r.classify(who('bob', '@me hello'), true)?.kind).toBe('mention');
    expect(r.classify(who('bob', 'hello'), true)).toMatchObject({ kind: 'person', color: '#a970ff', sound: true });
    expect(r.classify(who('amy', 'hello'), true)).toMatchObject({ kind: 'word', color: '#ff6b6b' });
    expect(r.classify(who('amy', 'yo'), true)).toMatchObject({ kind: 'first', color: '#33d68f' });
    expect(r.classify(who('me', 'yo'), false)).toMatchObject({ kind: 'own', color: '#2a6aff' });
    expect(r.classify(who('me', 'yo'), true)?.kind).toBe('first');
    expect(r.classify(who('amy', 'yo'), false)).toBeNull();
  });
  it('a rule colour wins over the default', () => {
    const c = chat({ people: [{ name: 'bob', color: '#112233', sound: false }], highlights: [word('x', { color: '#abcdef', sound: true })] });
    const r = compileRules(c, null);
    expect(r.classify(who('bob', ''), false)?.color).toBe('#112233');
    expect(r.classify(who('amy', 'x'), false)).toMatchObject({ color: '#abcdef', sound: true });
  });
  it('first word rule that matches wins', () => {
    const r = compileRules(chat({ highlights: [word('nope'), word('hi', { color: '#111111' }), word('hi', { color: '#222222' })] }), null);
    expect(r.classify(who('a', 'hi'), false)?.color).toBe('#111111');
  });
  it('people match by login, case-insensitively', () => {
    const r = compileRules(chat({ people: [{ name: 'bob', color: '', sound: false }] }), null);
    expect(r.classify(who('BOB', 'x'), false)?.kind).toBe('person');
    expect(r.classify(who(null, 'x'), false), 'no login').toBeNull();
  });
  it('neverHighlight silences everything, sounds included', () => {
    const c = chat({ neverHighlight: ['nightbot'], people: [{ name: 'nightbot', color: '', sound: true }], highlights: [word('hi', { sound: true })], firstMessages: true });
    const r = compileRules(c, 'me');
    expect(r.classify(who('NightBot', '@me hi'), true)).toBeNull();
  });
  it('bad word rules are skipped, the rest still work', () => {
    const r = compileRules(chat({ highlights: [word('(', { regex: true }), word('ok')] }), null);
    expect(r.classify(who('a', '( ok'), false)?.kind).toBe('word');
    expect(r.classify(who('a', '('), false)).toBeNull();
  });
  it('regex rules match as written; wholeWord=false matches inside words', () => {
    const r = compileRules(chat({ highlights: [word('^!\\w+', { regex: true }), word('ell', { wholeWord: false })] }), null);
    expect(r.classify(who('a', '!cmd now'), false)?.ranges).toEqual([[0, 4]]);
    expect(r.classify(who('a', 'hello'), false)?.ranges).toEqual([[1, 4]]);
  });
  it('match case is honoured', () => {
    const r = compileRules(chat({ highlights: [word('GG', { matchCase: true })] }), null);
    expect(r.classify(who('a', 'gg'), false)).toBeNull();
    expect(r.classify(who('a', 'GG'), false)).not.toBeNull();
  });
  it('handles empty text and an empty chat', () => {
    expect(compileRules(chat({ mentions: false }), null).classify(who(null, ''), false)).toBeNull();
  });
});

describe('ignore rules', () => {
  it('hides hidden people but never you', () => {
    const r = compileIgnores(chat({ hiddenPeople: ['Bob', 'me'] }), 'me');
    expect(r.hides(who('bob', 'x'))).toBe(true);
    expect(r.hides(who('me', 'x'))).toBe(false);
    expect(r.hides(who('amy', 'x'))).toBe(false);
  });
  it('hides on a hide word rule, swaps on the others', () => {
    const r = compileIgnores(chat({ ignores: [ignore('spam', { hide: true }), ignore('darn', { swap: '#@!' }), ignore('heck')] }), null);
    expect(r.hides(who('a', 'buy SPAM now'))).toBe(true);
    expect(r.hides(who('a', 'spammer'))).toBe(false);
    expect(r.hides(who('a', 'darn'))).toBe(false);
    expect(r.swap('oh darn and heck, Darn!')).toBe('oh #@! and ***, #@!!');
  });
  it('swap text with $ patterns is literal', () => {
    expect(compileIgnores(chat({ ignores: [ignore('x', { swap: '$&$1' })] }), null).swap('a x b')).toBe('a $&$1 b');
  });
  it('an invalid regex never matches', () => {
    const r = compileIgnores(chat({ ignores: [ignore('(', { regex: true, hide: true })] }), null);
    expect(r.hides(who('a', '('))).toBe(false);
  });
  it('plain patterns need whole words, regexes are as written', () => {
    const r = compileIgnores(chat({ ignores: [ignore('ass', { swap: '*' }), ignore('b[aeiou]d', { regex: true, swap: '_' })] }), null);
    expect(r.swap('class ass bad badge')).toBe('class * _ _ge');
  });
  it('match case option', () => {
    const r = compileIgnores(chat({ ignores: [ignore('Foo', { matchCase: true })] }), null);
    expect(r.swap('foo Foo')).toBe('foo ***');
  });
  it('unicode and very long input', () => {
    const r = compileIgnores(chat({ ignores: [ignore('плохо', { swap: '…' })] }), null);
    expect(r.swap('Плохо очень плохо')).toBe('… очень …');
    expect(r.swap('a '.repeat(50_000)).length).toBe(100_000);
  });
});

// ---- the DOM ----

const TWITCH = (user: string, body: string, extra = '') => `
<div class="chat-line__message" data-a-target="chat-line-message" data-a-user="${user}" ${extra}>
  <span class="chat-author__display-name">${user}</span><span aria-hidden="true">: </span>
  <span data-a-target="chat-line-message-body">${body}</span>
</div>`;
const frag = (t: string) => `<span class="text-fragment" data-a-target="chat-message-text">${t}</span>`;
const KICK = (user: string, text: string) => `<div id="chatroom-messages"><div data-index="1"><div>
  <div><span>02:06 AM</span><div><button title="${user}">${user}</button></div><span aria-hidden="true">:&nbsp;</span></div>
  <span class="font-normal">${text}</span></div></div></div>`;

function setup(over: Partial<ChatSettings>, site = twitch, now = { t: 0 }) {
  const settings: Settings = { ...DEFAULTS, chat: chat(over) };
  const ctx: FeatureContext = {
    doc: document,
    site: { ...site, self: () => 'me' },
    settings,
    index: null as never,
    now: () => now.t,
    channel: () => null,
    others: () => [],
    local: null,
  };
  return { ctx, settings, now };
}

function run(feature: Feature, ctx: FeatureContext, html: string, selector = '[data-a-target="chat-line-message"]') {
  document.body.innerHTML = html;
  const m = document.querySelector(selector)!;
  const body = ctx.site.body(m);
  const info = { sender: null, login: ctx.site.login(m), text: body?.textContent?.replace(/\s+/g, ' ').trim() ?? '', at: 1 };
  const hidden = feature.prepare?.(m, info) === false;
  if (!hidden) feature.message?.(m, info);
  return { m, hidden, body };
}

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('ignores feature', () => {
  it('is enabled only with rules or hidden people', () => {
    expect(ignores().enabled({ ...DEFAULTS, chat: chat() })).toBe(false);
    expect(ignores().enabled({ ...DEFAULTS, chat: chat({ hiddenPeople: ['a'] }) })).toBe(true);
    expect(ignores().enabled({ ...DEFAULTS, chat: chat({ ignores: [ignore('a')] }) })).toBe(true);
  });

  it('hides hidden people with CSS and keeps the node, then stop() undoes it', () => {
    const { ctx } = setup({ hiddenPeople: ['bob'] });
    const f = ignores();
    f.start!(ctx);
    const { m, hidden } = run(f, ctx, TWITCH('Bob', frag('hello')));
    expect(hidden).toBe(true);
    expect(m.isConnected).toBe(true);
    expect(m.hasAttribute('data-cyextv-hidden')).toBe(true);
    expect(document.getElementById('cyextv-ignores')!.textContent).toContain('display: none !important');
    f.stop!();
    expect(m.hasAttribute('data-cyextv-hidden')).toBe(false);
    expect(document.getElementById('cyextv-ignores')).toBeNull();
  });

  it('hides on a hide rule on Kick markup too', () => {
    const { ctx } = setup({ ignores: [ignore('spam', { hide: true })] }, kick);
    const f = ignores();
    f.start!(ctx);
    const { m, hidden } = run(f, ctx, KICK('nora_byte', 'buy spam now'), '[data-index]');
    expect(hidden).toBe(true);
    expect(m.hasAttribute('data-cyextv-hidden')).toBe(true);
  });

  it('swaps words in text nodes only, leaving emotes, mentions and links', () => {
    const { ctx } = setup({ ignores: [ignore('darn')] });
    const f = ignores();
    f.start!(ctx);
    const html =
      frag('oh darn ') +
      '<span data-a-target="emote-name"><img alt="darn"></span>' +
      '<span class="mention-fragment">@darn</span>' +
      '<a class="link-fragment" href="https://x.tv/darn">x.tv/darn</a>' +
      frag(' darn it');
    const { m, hidden, body } = run(f, ctx, TWITCH('amy', html));
    expect(hidden).toBe(false);
    expect(m.hasAttribute('data-cyextv-hidden')).toBe(false);
    const frags = [...body!.querySelectorAll('.text-fragment')].map((e) => e.textContent);
    expect(frags).toEqual(['oh *** ', ' *** it']);
    expect(body!.querySelector('img')!.alt).toBe('darn');
    expect(body!.querySelector('.mention-fragment')!.textContent).toBe('@darn');
    expect(body!.querySelector('a')!.textContent).toBe('x.tv/darn');
  });

  it('swaps on Kick markup, skipping Kick emotes', () => {
    const { ctx } = setup({ ignores: [ignore('darn', { swap: '~' })] }, kick);
    const f = ignores();
    f.start!(ctx);
    const { body } = run(f, ctx, KICK('nora_byte', 'darn <span data-emote-id="1"><img alt="darn"></span> darn'), '[data-index]');
    expect(body!.textContent).toBe('~ ' + '' + ' ~');
    expect(body!.querySelector('img')!.alt).toBe('darn');
  });

  it('never ignores your own messages', () => {
    const { ctx } = setup({ ignores: [ignore('darn', { hide: true }), ignore('heck')], hiddenPeople: ['me'] });
    const f = ignores();
    f.start!(ctx);
    const { m, hidden, body } = run(f, ctx, TWITCH('Me', frag('darn heck')));
    expect(hidden).toBe(false);
    expect(m.hasAttribute('data-cyextv-hidden')).toBe(false);
    expect(body!.textContent).toBe('darn heck');
  });

  it('never throws with a bad regex or no body', () => {
    const { ctx } = setup({ ignores: [ignore('(', { regex: true })] });
    const f = ignores();
    f.start!(ctx);
    expect(() => run(f, ctx, TWITCH('amy', frag('('))) ).not.toThrow();
    expect(() => run(f, ctx, '<div data-a-target="chat-line-message" data-a-user="a"></div>')).not.toThrow();
  });
});

describe('highlights feature', () => {
  it('is enabled by any highlight setting', () => {
    const off = chat({ mentions: false, firstMessages: false, ownMessages: false });
    expect(highlights().enabled({ ...DEFAULTS, chat: off })).toBe(false);
    expect(highlights().enabled({ ...DEFAULTS, chat: { ...off, highlights: [word('a')] } })).toBe(true);
    expect(highlights().enabled({ ...DEFAULTS, chat: { ...off, people: [{ name: 'a', color: '', sound: false }] } })).toBe(true);
    expect(highlights().enabled({ ...DEFAULTS, chat: { ...off, ownMessages: true } })).toBe(true);
  });

  it('tints the line for a mention and cleans up on stop()', () => {
    const { ctx } = setup({});
    const f = highlights();
    f.start!(ctx);
    const { m } = run(f, ctx, TWITCH('amy', frag('hi @me')));
    expect((m as HTMLElement).dataset.cyextvHl).toBe('mention');
    expect(m.hasAttribute('data-cyextv-line')).toBe(true);
    expect((m as HTMLElement).style.getPropertyValue('--cyextv-hl')).toBe('#3d7bff');
    const css = document.getElementById('cyextv-highlights')!.textContent!;
    expect(css).toContain('color-mix(in srgb, var(--cyextv-hl) 18%, transparent)');
    expect(css).toContain('inset 3px 0 var(--cyextv-hl)');
    f.stop!();
    expect(m.hasAttribute('data-cyextv-hl')).toBe(false);
    expect(m.hasAttribute('data-cyextv-line')).toBe(false);
    expect((m as HTMLElement).style.getPropertyValue('--cyextv-hl')).toBe('');
    expect(document.getElementById('cyextv-highlights')).toBeNull();
  });

  it('works on Kick markup', () => {
    const { ctx } = setup({ people: [{ name: 'nora_byte', color: '', sound: false }] }, kick);
    const f = highlights();
    f.start!(ctx);
    const { m } = run(f, ctx, KICK('nora_byte', 'gg'), '[data-index]');
    expect((m as HTMLElement).dataset.cyextvHl).toBe('person');
    expect((m as HTMLElement).style.getPropertyValue('--cyextv-hl')).toBe('#a970ff');
  });

  it('adds a "First message" row above the text and removes it on stop()', () => {
    const { ctx } = setup({ firstMessages: true });
    const f = highlights();
    f.start!(ctx);
    const { m } = run(f, ctx, TWITCH('amy', frag('hi'), 'data-cyextv-first=""'));
    const row = m.firstElementChild as HTMLElement;
    expect(row.className).toBe('cyextv-context');
    expect(row.textContent).toBe('First message');
    expect((m as HTMLElement).dataset.cyextvHl).toBe('first');
    expect((m as HTMLElement).style.getPropertyValue('--cyextv-hl')).toBe('#33d68f');
    f.message!(m, { sender: null, login: 'amy', text: 'hi', at: 1 });
    expect(m.querySelectorAll('.cyextv-context')).toHaveLength(1);
    f.stop!();
    expect(m.querySelector('.cyextv-context')).toBeNull();
  });

  it('does not mark first messages without the flag, or with the setting off', () => {
    const a = setup({ firstMessages: true });
    const f = highlights();
    f.start!(a.ctx);
    expect(run(f, a.ctx, TWITCH('amy', frag('hi'))).m.hasAttribute('data-cyextv-hl')).toBe(false);
    f.stop!();
    const b = setup({ firstMessages: false, ownMessages: true });
    f.start!(b.ctx);
    expect(run(f, b.ctx, TWITCH('amy', frag('hi'), 'data-cyextv-first=""')).m.hasAttribute('data-cyextv-hl')).toBe(false);
  });

  it('highlights your own messages when asked, in the own colour', () => {
    const { ctx } = setup({ ownMessages: true });
    const f = highlights();
    f.start!(ctx);
    const { m } = run(f, ctx, TWITCH('Me', frag('hello @me')));
    expect((m as HTMLElement).dataset.cyextvHl).toBe('own');
    expect((m as HTMLElement).style.getPropertyValue('--cyextv-hl')).toBe('#2a6aff');
  });

  it('neverHighlight leaves the message alone', () => {
    const { ctx } = setup({ neverHighlight: ['nightbot'] });
    const f = highlights();
    f.start!(ctx);
    expect(run(f, ctx, TWITCH('NightBot', frag('@me'))).m.hasAttribute('data-cyextv-hl')).toBe(false);
  });

  it('wordsOnly marks just the words, keeps the line plain, and unwraps on stop()', () => {
    const { ctx } = setup({ highlights: [word('gg', { wordsOnly: true, color: '#ff00aa' })] });
    const f = highlights();
    f.start!(ctx);
    const html =
      frag('gg wp gg ') + '<span data-a-target="emote-name"><img alt="gg"></span><span class="mention-fragment">@gg</span>' + '<a class="link-fragment" href="#">gg</a>';
    const { m, body } = run(f, ctx, TWITCH('amy', html));
    expect(m.hasAttribute('data-cyextv-line')).toBe(false);
    expect((m as HTMLElement).dataset.cyextvHl).toBe('word');
    const marks = [...body!.querySelectorAll('mark.cyextv-word')];
    expect(marks.map((k) => k.textContent)).toEqual(['gg', 'gg']);
    expect(body!.querySelector('.mention-fragment mark')).toBeNull();
    expect(body!.querySelector('a mark')).toBeNull();
    expect(body!.querySelector('[data-a-target="emote-name"] mark')).toBeNull();
    expect((m as HTMLElement).style.getPropertyValue('--cyextv-hl')).toBe('#ff00aa');
    expect(document.getElementById('cyextv-highlights')!.textContent).toContain('var(--cyextv-hl) 38%');
    f.stop!();
    expect(body!.querySelectorAll('mark')).toHaveLength(0);
    expect(body!.querySelector('.text-fragment')!.textContent).toBe('gg wp gg ');
  });

  it('a non-wordsOnly word rule tints the line without marks', () => {
    const { ctx } = setup({ highlights: [word('gg')] });
    const f = highlights();
    f.start!(ctx);
    const { m, body } = run(f, ctx, TWITCH('amy', frag('gg')));
    expect(m.hasAttribute('data-cyextv-line')).toBe(true);
    expect(body!.querySelector('mark')).toBeNull();
  });
});

describe('the chime', () => {
  let made = 0;
  let oscillators = 0;
  let blocked = false;
  let resume = vi.fn(() => Promise.resolve());

  class FakeAudio {
    state = blocked ? 'suspended' : 'running';
    currentTime = 0;
    destination = {};
    constructor() {
      made++;
    }
    resume = resume;
    close = vi.fn(() => Promise.resolve());
    createOscillator() {
      oscillators++;
      const o = { type: '', frequency: { value: 0 }, connect: (n: unknown) => n, start: vi.fn(), stop: vi.fn() };
      return o;
    }
    createGain() {
      return { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: (n: unknown) => n };
    }
  }

  beforeEach(() => {
    made = 0;
    oscillators = 0;
    blocked = false;
    resume = vi.fn(() => Promise.resolve());
    (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudio;
  });
  afterEach(() => {
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
  });

  const line = (s: string) => TWITCH('amy', frag(s));

  it('plays two notes for a sound-on mention, creating the context lazily', () => {
    const t = { t: 10_000 };
    const { ctx } = setup({ mentionSound: true }, twitch, t);
    const f = highlights();
    f.start!(ctx);
    expect(made).toBe(0);
    t.t = 13_000;
    run(f, ctx, line('hi @me'));
    expect(made).toBe(1);
    expect(oscillators).toBe(2);
  });

  it('skips messages from the first 2 seconds, and plays after', () => {
    const t = { t: 10_000 };
    const { ctx } = setup({ mentionSound: true }, twitch, t);
    const f = highlights();
    f.start!(ctx);
    t.t = 11_999;
    run(f, ctx, line('@me'));
    expect(made).toBe(0);
    t.t = 12_000;
    run(f, ctx, line('@me'));
    expect(oscillators).toBe(2);
  });

  it('plays at most one chime per 1.5 s', () => {
    const t = { t: 0 };
    const { ctx } = setup({ mentionSound: true }, twitch, t);
    const f = highlights();
    f.start!(ctx);
    t.t = 5000;
    run(f, ctx, line('@me'));
    t.t = 6000;
    run(f, ctx, line('@me'));
    expect(oscillators).toBe(2);
    t.t = 6500;
    run(f, ctx, line('@me'));
    expect(oscillators).toBe(4);
  });

  it('plays for rule sounds and not for silent kinds', () => {
    const t = { t: 5000 };
    const { ctx } = setup({ highlights: [word('gg', { sound: true }), word('yo')], mentions: false, firstMessages: true }, twitch, t);
    const f = highlights();
    f.start!(ctx);
    t.t = 9000;
    run(f, ctx, line('yo'));
    run(f, ctx, TWITCH('amy', frag('hi'), 'data-cyextv-first=""'));
    expect(oscillators).toBe(0);
    run(f, ctx, line('gg'));
    expect(oscillators).toBe(2);
  });

  it('stays silent with the sound off, and for never-highlight people', () => {
    const t = { t: 0 };
    const { ctx } = setup({ mentionSound: true, neverHighlight: ['bot'] }, twitch, t);
    const f = highlights();
    f.start!(ctx);
    t.t = 9000;
    run(f, ctx, TWITCH('bot', frag('@me')));
    expect(oscillators).toBe(0);
    const g = setup({ mentionSound: false }, twitch, t);
    f.stop!();
    f.start!(g.ctx);
    run(f, g.ctx, line('@me'));
    expect(oscillators).toBe(0);
  });

  it('plays even when the page is hidden', () => {
    const t = { t: 0 };
    const { ctx } = setup({ mentionSound: true }, twitch, t);
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    const f = highlights();
    f.start!(ctx);
    t.t = 9000;
    run(f, ctx, line('@me'));
    expect(oscillators).toBe(2);
    delete (document as unknown as { hidden?: boolean }).hidden;
  });

  it('resumes a blocked context on a gesture, and stop() removes the listeners', () => {
    blocked = true;
    const t = { t: 0 };
    const { ctx } = setup({ mentionSound: true }, twitch, t);
    const f = highlights();
    f.start!(ctx);
    t.t = 9000;
    run(f, ctx, line('@me'));
    expect(resume).toHaveBeenCalledTimes(1);
    document.dispatchEvent(new Event('pointerdown'));
    expect(resume).toHaveBeenCalledTimes(2);
    f.stop!();
    document.dispatchEvent(new Event('keydown'));
    expect(resume).toHaveBeenCalledTimes(2);
  });

  it('ignores an audio API that throws or is missing', () => {
    const t = { t: 0 };
    const { ctx } = setup({ mentionSound: true }, twitch, t);
    const f = highlights();
    f.start!(ctx);
    t.t = 9000;
    (window as unknown as { AudioContext: unknown }).AudioContext = class {
      constructor() {
        throw new Error('blocked');
      }
    };
    expect(() => run(f, ctx, line('@me'))).not.toThrow();
    t.t = 20_000;
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
    expect(() => run(f, ctx, line('@me'))).not.toThrow();
  });
});

describe('both features inside the app', () => {
  it('ignores run before emotes are drawn; hidden messages skip highlights', () => {
    const settings: Settings = {
      ...DEFAULTS,
      chat: chat({ hiddenPeople: ['bob'], ignores: [ignore('darn')], highlights: [word('hello')] }),
    };
    const site = { ...twitch, self: () => null };
    const app = new App({ site, fetch: (async () => ({})) as never, settings, sockets: null, features: [ignores(), highlights()] });
    (app as unknown as { startFeatures(): void }).startFeatures();
    document.body.innerHTML = TWITCH('bob', frag('hello')) + TWITCH('amy', frag('hello darn'));
    for (const m of document.querySelectorAll('[data-a-target="chat-line-message"]')) app.process(m);
    const [bob, amy] = [...document.querySelectorAll('[data-a-target="chat-line-message"]')] as HTMLElement[];
    expect(bob!.hasAttribute('data-cyextv-hidden')).toBe(true);
    expect(bob!.hasAttribute('data-cyextv-hl')).toBe(false);
    expect(amy!.dataset.cyextvHl).toBe('word');
    expect(amy!.textContent).toContain('hello ***');
    expect(app.features()).toEqual(['ignores', 'highlights']);
    app.stop();
    expect(document.getElementById('cyextv-ignores')).toBeNull();
    expect(document.getElementById('cyextv-highlights')).toBeNull();
    expect(amy!.hasAttribute('data-cyextv-hl')).toBe(false);
  });
});
