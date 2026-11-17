// @vitest-environment jsdom
// The chat-feature groundwork: the chat settings, the settings page's schema, and how the app
// runs features (switched on, left to other extensions, once per message, never breaking chat).
import { beforeEach, describe, expect, it } from 'vitest';
import { App, textOf } from '../src/content/app';
import { type Feature, shouldRun } from '../src/features/types';
import { PAGES, getPath, setPath } from '../src/options/schema';
import { CHAT_DEFAULTS, DEFAULTS, MAX_RULES, merge, mergeChat } from '../src/settings';
import { cookie } from '../src/sites/index';
import { twitch } from '../src/sites/twitch';

describe('chat settings', () => {
  it('fill in defaults and keep only what fits', () => {
    expect(merge({}).chat).toEqual(CHAT_DEFAULTS);
    const c = mergeChat({
      deleted: 'faded',
      clock: 'nope',
      fontSize: 99,
      myNames: ['@Lumen_Fox', 'lumen_fox', 3, ''],
      highlights: [{ pattern: ' pog ', color: '#FF0000' }, { pattern: '' }, 'x', { pattern: 'a', color: 'red' }],
      hide: { bits: true, nope: true },
    });
    expect(c.deleted).toBe('faded');
    expect(c.clock).toBe('24h');
    expect(c.fontSize).toBe(32);
    expect(c.myNames).toEqual(['lumen_fox']);
    expect(c.highlights).toEqual([
      { pattern: 'pog', regex: false, wholeWord: true, matchCase: false, color: '#ff0000', sound: false, wordsOnly: false },
      { pattern: 'a', regex: false, wholeWord: true, matchCase: false, color: '', sound: false, wordsOnly: false },
    ]);
    expect(c.hide.bits).toBe(true);
    expect('nope' in c.hide).toBe(false);
    expect(mergeChat({ highlights: Array.from({ length: 99 }, (_, i) => ({ pattern: `w${i}` })) }).highlights).toHaveLength(MAX_RULES);
  });

  it('start with sounds off and site-duplicating features off', () => {
    expect(CHAT_DEFAULTS.mentionSound).toBe(false);
    expect(CHAT_DEFAULTS.timestamps).toBe(false);
    expect(CHAT_DEFAULTS.autoClaim).toBe(false);
    expect(Object.values(CHAT_DEFAULTS.hide).every((v) => v === false)).toBe(true);
  });

  it('fit in synced storage with full lists', () => {
    const rule = { pattern: 'x'.repeat(40), regex: false, wholeWord: true, matchCase: false, color: '#ff0000', sound: false, wordsOnly: false };
    const full = merge({ chat: { highlights: Array(10).fill(rule), ignores: Array(10).fill({ pattern: 'y'.repeat(40) }), hiddenPeople: Array.from({ length: 30 }, (_, i) => `name_${i}`) } });
    expect(JSON.stringify(full).length).toBeLessThan(8192);
  });
});

describe('the settings page schema', () => {
  it('points every item at a real setting', () => {
    for (const p of PAGES)
      for (const s of p.sections)
        for (const i of s.items) if ('key' in i) expect(getPath(DEFAULTS, i.key), `${p.id}: ${i.key}`).not.toBeUndefined();
  });

  it('sets nested keys without touching the original', () => {
    const next = setPath(DEFAULTS, 'chat.hide.bits', true);
    expect(next.chat.hide.bits).toBe(true);
    expect(DEFAULTS.chat.hide.bits).toBe(false);
    expect(merge(next).chat.hide.bits).toBe(true);
  });
});

describe('features', () => {
  const feature = (over: Partial<Feature> = {}): Feature & { seen: string[] } => {
    const seen: string[] = [];
    return { id: 'test', enabled: () => true, message: (_m, info) => void seen.push(info.text), seen, ...over };
  };

  it('stay off when switched off, or when another extension provides them', () => {
    expect(shouldRun(feature({ enabled: () => false }), DEFAULTS, [])).toBe(false);
    expect(shouldRun(feature({ providedBy: ['ffz'] }), DEFAULTS, ['ffz'])).toBe(false);
    expect(shouldRun(feature({ providedBy: ['ffz'] }), DEFAULTS, ['7tv'])).toBe(true);
    expect(shouldRun(feature({ providedBy: ['ffz'] }), { ...DEFAULTS, overrideOthers: true }, ['ffz'])).toBe(true);
  });

  beforeEach(() => {
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-cyextv-others');
  });

  const LINE = `<div data-a-target="chat-line-message" data-a-user="lumen_fox" data-cyextv-uid="111">
    <span data-a-target="chat-line-message-body"><span class="text-fragment">hello   there </span><span data-a-target="emote-name"><img alt="Kappa"></span></span></div>`;

  it('see each message once, with its text and login, and a failing one never stops the rest', () => {
    document.body.innerHTML = LINE;
    const ok = feature();
    const bad = feature({ id: 'bad', message: () => { throw new Error('boom'); } });
    const app = new App({ site: twitch, fetch: async () => ({}), settings: DEFAULTS, sockets: null, features: [bad, ok] });
    app.start();
    const [line] = twitch.messages(document);
    app.process(line!);
    app.process(line!);
    expect(ok.seen).toEqual(['hello there Kappa']);
    expect(app.features()).toEqual(['bad', 'test']);
    app.stop();
  });

  it('can hide a message before emotes are drawn', () => {
    document.body.innerHTML = LINE;
    const after = feature();
    const hider = feature({ id: 'hide', prepare: (m) => (m.remove(), false) });
    const app = new App({ site: twitch, fetch: async () => ({}), settings: DEFAULTS, sockets: null, features: [hider, after] });
    app.start();
    app.process(twitch.messages(document)[0]!);
    expect(after.seen).toEqual([]);
    expect(document.querySelector('[data-a-target="chat-line-message"]')).toBeNull();
    app.stop();
  });

  it('read text with drawn emotes as their names', () => {
    document.body.innerHTML = '<p>a <span class="cyextv-emote" data-text="catJAM"><img alt="x"></span> b</p>';
    expect(textOf(document.querySelector('p')!)).toBe('a catJAM b');
  });

  it('know the Twitch login from the cookie and the message', () => {
    document.cookie = 'login=Lumen_Fox';
    expect(cookie(document, 'login')).toBe('Lumen_Fox');
    expect(twitch.self(document)).toBe('lumen_fox');
    document.body.innerHTML = LINE;
    expect(twitch.login(twitch.messages(document)[0]!)).toBe('lumen_fox');
  });
});
