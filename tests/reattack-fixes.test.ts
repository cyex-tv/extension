// @vitest-environment jsdom
// Fixes from the extension re-attack pass: regex rules on RE2 (no pattern can freeze a tab),
// chat that doesn't wait for slow emote providers, hidden tabs, the popup and settings page
// saving onto fresh settings, rapid toggles, and the small ones (section undo, CDN-only hidden
// emote pictures, channel IDs, capped lookups).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFetcher } from '../src/background/fetcher';
import { App, PENDING_MAX, SEEN_MAX, remember } from '../src/content/app';
import { readHidden } from '../src/features/cleanup/hide-emote';
import { REGEX_TEXT_MAX, compileIgnores, compilePattern, compileRules, regexProblem } from '../src/features/highlights/match';
import { resetSection, restoreSection } from '../src/options/model';
import { PAGES } from '../src/options/schema';
import { DEFAULTS, SAVING_TOO_FAST, STORAGE_KEY, type Settings, merge, trySave } from '../src/settings';
import { twitch } from '../src/sites/twitch';
import { kick } from '../src/sites/kick';
import type { Site } from '../src/sites/index';
import { SAVE_GAP_MS, createSaver, patchFrom } from '../src/ui/saver';
import * as F from './fixtures';

// --- 1. Regex rules run on RE2 -----------------------------------------------------------------

/** Every pattern from the re-attack's ReDoS sweep (screens/ext-reattack: redos.mjs, cands.txt, gen.txt). */
const ATTACK = [
  String.raw`.*.*.*.*Z`,
  String.raw`\s*\s*\s*$`,
  String.raw`^(?:a?){200}$`,
  String.raw`\s*\s*\s*\s*\s*\s*$`,
  String.raw`a*a*a*a*a*a*a*a*b`,
  String.raw`(a+)+$`,
  String.raw`(x*)*`,
  String.raw`(.*a){20}$`,
  String.raw`(a|aa)+$`,
  String.raw`(\w+\s?)*$`,
  String.raw`(?=(a+))b`,
  String.raw`(?:a|a)*b`,
  String.raw`.*.*.*.*.*.*.*.*Z`,
  String.raw`a{1,200}a{1,200}a{1,200}a{1,200}b`,
  String.raw`[a-z]{1,200}[a-z]{1,200}[a-z]{1,200}[a-z]{1,200}!`,
  String.raw`(?:a{1,50}){1,50}b`,
  String.raw`(a?){100}a{100}`,
  String.raw`(?:a?){200}a{200}`,
  String.raw`(a|b)*c`,
  String.raw`(x+x+)+y`,
  String.raw`(?:\d+\s*)+$`,
  String.raw`(?:\s*\d*){1,5}$`,
  String.raw`(?:.|.)*Z`,
  String.raw`(?:[ab]|[bc])*Z`,
  String.raw`(?:a|b|ab)*Z`,
  String.raw`(?:\w|\d)*Z`,
  String.raw`(?:\w|\s)+!!`,
  String.raw`([^]*)*!`,
  String.raw`(?:.*a){2}Z`,
  String.raw`(.*?,){11}Z`,
  String.raw`(?:.*?,){11}Z`,
  String.raw`(?:\s*\S*){0,50}Z`,
  String.raw`^(?!.*Z).*$`,
  String.raw`(?=.*a.*a.*a.*a.*a.*a)Z`,
  String.raw`(?<=.*a.*a.*a.*a.*a.*a)Z`,
  String.raw`(?:a?){1000}a{1000}`,
  String.raw`(?:a?a?a?a?a?a?a?a?a?a?a?a?a?a?a?a?a?a?a?a?a?a?a?a?a?a?a?a?a?a?)a{30}`,
  String.raw`(?:a|b)?(?:a|b)?(?:a|b)?(?:a|b)?(?:a|b)?(?:a|b)?`,
  String.raw`(?:\w+\s?){5,}!`,
  String.raw`(\w+\s?){2}!`,
  String.raw`\b(\w+)\s+(\w+)\s+(\w+)\s+(\w+)\s+(\w+)\s+(\w+)\s+Z`,
  String.raw`(?:a+b?){2}c`,
  String.raw`(\d+)(\d+)(\d+)(\d+)(\d+)(\d+)(\d+)(\d+)!`,
  String.raw`(?:(?:a*)){10}b`,
  String.raw`((a*)){3}b`,
  String.raw`(?:a*){5}b`,
  String.raw`(?:(?:a+)){5}b`,
  String.raw`(?:a*)(?:a*)(?:a*)(?:a*)(?:a*)(?:a*)(?:a*)(?:a*)(?:a*)(?:a*)(?:a*)(?:a*)b`,
  String.raw`\s*\s*\s*\s*\s*\s*\s*\s*\s*\s*$`,
  String.raw`\s*\s*\s*\s*\s*\s*\s*\s*\s*\s*\s*\s*\s*\s*$`,
  String.raw`a*a*a*a*a*a*a*a*a*a*a*a*b`,
  String.raw`.*.*.*.*.*.*.*.*!`,
  String.raw`.*?.*?.*?.*?.*?.*?.*?.*?Z`,
  String.raw`\w*\s*\w*\s*\w*\s*\w*\s*\w*\s*\w*\s*$`,
  String.raw`\p{L}*\p{L}*\p{L}*\p{L}*\p{L}*\p{L}*\p{L}*\p{L}*!`,
  String.raw`[a-z]*[a-z]*[a-z]*[a-z]*[a-z]*[a-z]*[a-z]*[a-z]*1`,
  String.raw`(?=.*a)(?=.*a)(?=.*a)(?=.*a)(?=.*a)(?=.*a)Z`,
  String.raw`(?:a*)(?:a*)(?:a*)(?:a*)(?:a*)(?:a*)b`,
  String.raw`(?:a|b)*(?:a|b)*(?:a|b)*(?:a|b)*(?:a|b)*c`,
  String.raw`(?:\s*\S*)?(?:\s*\S*)?(?:\s*\S*)?(?:\s*\S*)?Z`,
  String.raw`a?a?a?a?a?a?a?a?a?a?a?a?a?a?a?a?a?a?a?a?a`,
  String.raw`a{0,50}a{0,50}a{0,50}a{0,50}a{0,50}a{0,50}a{0,50}a{0,50}a{0,50}a{0,50}b`,
  String.raw`\d+\d+\d+\d+\d+\d+\d+\d+x`,
  String.raw`[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,Z`,
  String.raw`[^,]*,?[^,]*,?[^,]*,?[^,]*,?[^,]*,?[^,]*,?[^,]*,?[^,]*,?Z`,
  String.raw`.?.?.?.?.?.?.?.?.?.?Z`,
  // Large but legal: the most RE2 takes.
  String.raw`(?:a?){1000}b`,
  String.raw`[\s\S]{1000}`,
  String.raw`(?:a?){999}(?:b?){999}(?:c?){999}Z`,
  String.raw`(?:\w{1,30}\s?){1,30}!`,
];

/** 200-character lines that make backtracking engines give up. */
const LINES = {
  spaces: ' '.repeat(199) + 'x',
  a: 'a'.repeat(199) + '!',
  ab: 'ab'.repeat(100),
  word: 'word '.repeat(40),
  x: 'x'.repeat(200),
  dots: '.'.repeat(200),
  accents: 'é'.repeat(199) + '!',
  digits: '1'.repeat(199) + '!',
  commas: ',a'.repeat(100),
  mixed: 'a b1,'.repeat(40),
};

describe('regex rules on RE2', () => {
  it('runs every attack pattern on every 200-character attack line in under 50 ms, or refuses it', () => {
    const slow: string[] = [];
    let refused = 0;

    for (const matchCase of [false, true]) {
      for (const p of ATTACK) {
        const m = compilePattern(p, { regex: true, wholeWord: false, matchCase });
        if (!m) {
          expect(regexProblem(p), p).not.toBeNull();
          refused++;
          continue;
        }
        for (const [name, line] of Object.entries(LINES)) {
          // Lines longer than the cap are cut first; the cap stays 200.
          for (const text of [line, line.repeat(50)]) {
            const t = performance.now();
            m.ranges(text);
            const ms = performance.now() - t;
            if (ms >= 50) slow.push(`${p} on ${name}: ${ms.toFixed(0)} ms`);
          }
        }
      }
    }
    expect(slow).toEqual([]);
    // Refused only for what RE2 can't run or for sheer size, each with its reason; everything else runs.
    const refusedNow = ATTACK.filter((p) => regexProblem(p));
    const reasons = refusedNow.map((p) => regexProblem(p)!);
    expect(reasons.every((r) => /^(Lookarounds|Not a pattern|Counted repeats|This pattern is too large)/.test(r)), reasons.join(' | ')).toBe(true);
    // The everyday ones from the findings still run.
    for (const p of ['.*.*.*.*Z', String.raw`\s*\s*\s*$`, '^(?:a?){200}$', '(a+)+$', '(a|aa)+$']) expect(refusedNow).not.toContain(p);
    expect(refused).toBe(2 * refusedNow.length);
  });

  it('keeps the findings’ three worst patterns cheap as a highlight and as an ignore', () => {
    for (const p of ['.*.*.*.*Z', String.raw`\s*\s*\s*$`, '^(?:a?){200}$']) {
      const chat = merge({ chat: { highlights: [{ pattern: p, regex: true }], ignores: [{ pattern: p, regex: true, hide: true }] } }).chat;
      const rules = compileRules(chat, null);
      const ignores = compileIgnores(chat, null);
      const t = performance.now();
      for (const text of Object.values(LINES)) {
        rules.classify({ login: 'x', text }, false);
        ignores.hides({ login: 'x', text });
      }
      expect(performance.now() - t, p).toBeLessThan(50);
    }
  });

  it('explains what RE2 doesn’t do, in words', () => {
    expect(regexProblem(String.raw`(a)\1`)).toMatch(/^Backreferences/);
    expect(regexProblem('(?<n>a)\\k<n>')).toMatch(/^Backreferences/);
    expect(regexProblem('a(?=b)')).toMatch(/^Lookarounds/);
    expect(regexProblem('a(?!b)')).toMatch(/^Lookarounds/);
    expect(regexProblem('(?<=a)b')).toMatch(/^Lookarounds/);
    expect(regexProblem('(?<!a)b')).toMatch(/^Lookarounds/);
    expect(regexProblem('a++')).toMatch(/repeat right after a repeat/);
    expect(regexProblem('a{1001}')).toMatch(/up to \{1000\}/);
    expect(regexProblem('(')).toMatch(/^Not a pattern regex rules understand/);
    // Legal in RE2 but thousands of steps per character: too slow on a slow machine.
    expect(regexProblem('(?:a?){999}(?:b?){999}(?:c?){999}Z')).toMatch(/too large/);
    expect(regexProblem('(?:a?){200}a{200}')).toBeNull();
    expect(regexProblem('(a+)+$')).toBeNull();
  });

  it('matches like before: case, Unicode letters, positions in UTF-16, empty matches skipped, 200-character cap', () => {
    const ci = compilePattern('HELLO', { regex: true, wholeWord: false, matchCase: false })!;
    expect(ci.ranges('say hello')).toEqual([[4, 9]]);
    expect(compilePattern('HELLO', { regex: true, wholeWord: false, matchCase: true })!.ranges('say hello')).toEqual([]);
    expect(compilePattern(String.raw`\p{L}+`, { regex: true, wholeWord: false, matchCase: false })!.ranges('héllo wörld')).toEqual([[0, 5], [6, 11]]);
    expect(compilePattern('b', { regex: true, wholeWord: false, matchCase: false })!.ranges('😀ab😀b')).toEqual([[3, 4], [6, 7]]);
    expect(compilePattern('z', { regex: true, wholeWord: false, matchCase: false })!.ranges('a'.repeat(REGEX_TEXT_MAX) + 'z')).toEqual([]);
  });
});

// --- 2. Fail open on slow providers -----------------------------------------------------------

describe('a provider that never answers', () => {
  it('the background gives up after its timeout and says so', async () => {
    const hang: typeof fetch = (_url, init) =>
      new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'TimeoutError'))));
    const handle = createFetcher(hang, Date.now, 40);
    const t = Date.now();
    expect(await handle({ url: 'https://7tv.io/v3/emote-sets/global' })).toEqual({ ok: false, status: 0, error: 'timeout' });
    expect(Date.now() - t).toBeLessThan(1000);
  });

  it('a body that stalls after the headers is cut too', async () => {
    const stall: typeof fetch = async (_url, init) =>
      ({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () => new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'TimeoutError')))),
      }) as unknown as Response;
    expect(await createFetcher(stall, Date.now, 40)({ url: 'https://7tv.io/v3/emote-sets/global' })).toEqual({ ok: false, status: 200, error: 'timeout' });
  });

  const LINE = (login: string, text: string) =>
    `<div class="chat-line__message" data-a-target="chat-line-message" data-a-user="${login}" data-cyextv-uid="1${login.length}"><span class="chat-author__display-name">${login}</span><span aria-hidden="true">: </span><span data-a-target="chat-line-message-body"><span class="text-fragment">${text}</span></span></div>`;
  const site = (): Site => ({ ...twitch, channel: async () => ({ platform: 'twitch', id: '141981764', login: 'lumen_fox' }) });
  let app: App | null = null;
  afterEach(() => {
    app?.stop();
    app = null;
    document.body.innerHTML = '';
  });

  it('hides hidden people at once while every provider hangs, and draws emotes when one arrives', async () => {
    let release: (v: unknown) => void = () => {};
    const answers = F.table({ 'https://7tv.io/v3/emote-sets/global': F.SEVENTV_GLOBAL });
    const fetch = (url: string, init?: { method?: 'GET' | 'POST'; body?: unknown }) =>
      url === 'https://7tv.io/v3/emote-sets/global' ? new Promise((r) => (release = r)).then(() => answers.fetch(url, init)) : new Promise<never>(() => {});
    const settings: Settings = merge({ chat: { hiddenPeople: ['user1'] } });
    document.body.innerHTML = `<div data-test-selector="chat-scrollable-area__message-container">${LINE('user1', 'hello')}${LINE('user22', 'catJAM')}</div>`;
    app = new App({ site: site(), fetch: fetch as never, settings, sockets: null });
    // What the content script does: start first, providers in the background.
    app.start();
    void app.loadGlobals();
    void app.loadBadges();
    await new Promise((r) => setTimeout(r, 60));
    expect(document.querySelector('[data-a-user="user1"]')!.hasAttribute('data-cyextv-hidden')).toBe(true);
    expect(document.querySelectorAll('.cyextv-emote')).toHaveLength(0);
    // A new line while still waiting: hidden as well.
    document.querySelector('[data-test-selector]')!.insertAdjacentHTML('beforeend', LINE('user1', 'again'));
    await new Promise((r) => setTimeout(r, 60));
    expect(document.querySelectorAll('[data-a-user="user1"][data-cyextv-hidden]')).toHaveLength(2);
    // 7TV answers: the lines on screen get its emotes.
    release(null);
    await new Promise((r) => setTimeout(r, 60));
    expect(document.querySelectorAll('[data-a-user="user22"] .cyextv-emote')).toHaveLength(1);
  });

  it('a channel switch processes messages without waiting for the channel’s sets', async () => {
    const fetch = () => new Promise<never>(() => {});
    app = new App({ site: site(), fetch, settings: merge({ chat: { hiddenPeople: ['user1'] } }), sockets: null });
    expect(await app.syncChannel()).toBe(true);
    // syncChannel came back although the channel's sets never will.
    document.body.innerHTML = LINE('user1', 'x');
    app.start();
    await new Promise((r) => setTimeout(r, 60));
    expect(document.querySelector('[data-cyextv-hidden]')).not.toBeNull();
  });
});

// --- 3. Hidden tabs --------------------------------------------------------------------------

describe('a hidden tab', () => {
  let app: App | null = null;
  const hidden = (on: boolean) => Object.defineProperty(document, 'hidden', { configurable: true, get: () => on });
  afterEach(() => {
    app?.stop();
    app = null;
    hidden(true);
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('flushes on a timer when frames don’t come, and keeps at most PENDING_MAX messages waiting', async () => {
    // Frames never run (a background tab), but the tab says it's visible.
    vi.stubGlobal('requestAnimationFrame', () => 0);
    hidden(false);
    const fetch = async () => null;
    document.body.innerHTML = '<div id="box"></div>';
    app = new App({ site: twitch, fetch, settings: merge({ chat: { hiddenPeople: ['user1'] } }), sockets: null });
    app.start();
    const box = document.getElementById('box')!;
    for (let i = 0; i < 3000; i++) {
      const d = document.createElement('div');
      d.setAttribute('data-a-target', 'chat-line-message');
      d.setAttribute('data-a-user', 'user1');
      d.innerHTML = '<span data-a-target="chat-line-message-body">x</span>';
      box.append(d);
      // The site keeps a short list; the rest are thrown away.
      if (box.children.length > 150) box.firstElementChild!.remove();
      if (i % 500 === 0) await Promise.resolve();
    }
    await Promise.resolve();
    expect(app.queued()).toBeLessThanOrEqual(PENDING_MAX);
    // The tab goes to the background: what waits is flushed without a frame.
    hidden(true);
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((r) => setTimeout(r, 60));
    expect(app.queued()).toBe(0);
    expect(document.querySelectorAll('[data-cyextv-hidden]').length).toBe(150);
  });

  it('remembers at most SEEN_MAX chatters, dropping the oldest', () => {
    const seen = new Map<string, number>();
    for (let i = 0; i < SEEN_MAX + 10; i++) remember(seen, String(i), i);
    expect(seen.size).toBe(SEEN_MAX);
    expect(seen.has('0')).toBe(false);
    remember(seen, '10', 1e9);
    // Asked again: it is the newest now.
    expect([...seen.keys()].at(-1)).toBe('10');
  });
});

// --- 4 and 5. Saving from two pages, and rapid toggles -----------------------------------------

type Area = ExtStorageArea & { data: Record<string, unknown>; writes: number; fail: ((items: Record<string, unknown>) => Error | null) | null };
function area(): Area {
  const a: Area = {
    data: {},
    writes: 0,
    fail: null,
    get: async (k) => (typeof k === 'string' ? (k in a.data ? { [k]: structuredClone(a.data[k]) } : {}) : structuredClone(a.data)),
    set: async (items) => {
      const err = a.fail?.(items);
      if (err) throw err;
      a.writes++;
      Object.assign(a.data, structuredClone(items));
    },
  };
  return a;
}
const stored = (a: Area) => merge(a.data[STORAGE_KEY]);
const wait = (ms = SAVE_GAP_MS + 40) => new Promise((r) => setTimeout(r, ms));

describe('two pages saving', () => {
  it('neither page undoes the other’s change: each writes only what it changed, onto fresh settings', async () => {
    const a = area();
    const shownA: Settings[] = [];
    const popup = createSaver({ area: a, initial: DEFAULTS, show: (s) => shownA.push(s), fail: () => {} });
    const options = createSaver({ area: a, initial: DEFAULTS, show: () => {}, fail: () => {} });
    await options.update(merge({ chat: { timestamps: true }, theme: 'light' }));
    // The popup still shows the old settings and switches a provider off.
    await popup.update({ ...popup.current(), emotes: { ...popup.current().emotes, bttv: false } });
    const s = stored(a);
    expect(s.emotes.bttv).toBe(false);
    expect(s.chat.timestamps).toBe(true);
    expect(s.theme).toBe('light');
    // After its write the popup shows what is stored, the other page's change too.
    expect(shownA.at(-1)!.theme).toBe('light');
  });

  it('a change from elsewhere is shown, with this page’s unsaved changes on top', () => {
    const shown: Settings[] = [];
    const saver = createSaver({ area: area(), initial: DEFAULTS, show: (s) => shown.push(s), fail: () => {} });
    saver.stored({ theme: 'light' });
    expect(shown.at(-1)!.theme).toBe('light');
  });

  it('patchFrom carries leaves and whole lists, nothing else', () => {
    const after = merge({ chat: { hiddenPeople: ['a'], timestamps: true } });
    const p = patchFrom(DEFAULTS, after);
    const other = merge({ theme: 'light', chat: { hiddenPeople: ['b', 'c'] } });
    const out = p(other);
    expect(out.theme).toBe('light');
    expect(out.chat.timestamps).toBe(true);
    expect(out.chat.hiddenPeople).toEqual(['a']);
  });
});

describe('rapid toggles', () => {
  it('300 clicks in a row become a couple of writes, the last value wins, and the page matches storage', async () => {
    const a = area();
    let shown = DEFAULTS;
    const saver = createSaver({ area: a, initial: DEFAULTS, show: (s) => (shown = s), fail: () => {} });
    let on = DEFAULTS.tooltips;
    for (let i = 0; i < 301; i++) {
      on = !on;
      void saver.update({ ...shown, tooltips: on });
      await Promise.resolve();
    }
    await wait();
    expect(a.writes).toBeLessThanOrEqual(3);
    expect(stored(a).tooltips).toBe(on);
    expect(shown.tooltips).toBe(on);
  });

  it('a write-rate refusal says "Saving too fast" (not a size) and puts the page back on what is stored', async () => {
    const a = area();
    a.data[STORAGE_KEY] = { tooltips: false };
    let shown = merge(a.data[STORAGE_KEY]);
    const fail = vi.fn();
    const saver = createSaver({ area: a, initial: shown, show: (s) => (shown = s), fail });
    a.fail = () => new Error('This request exceeds the MAX_WRITE_OPERATIONS_PER_MINUTE quota.');
    const r = await saver.update({ ...shown, tooltips: true });
    expect(r).toEqual({ ok: false, message: SAVING_TOO_FAST });
    expect(fail).toHaveBeenCalledWith(SAVING_TOO_FAST);
    expect(shown.tooltips).toBe(false);
    expect(stored(a).tooltips).toBe(false);
  });

  it('trySave gives the size message only for a size refusal', async () => {
    const a = area();
    a.fail = () => new Error('This request exceeds the MAX_WRITE_OPERATIONS_PER_HOUR quota.');
    expect(await trySave(a, DEFAULTS)).toEqual({ ok: false, message: SAVING_TOO_FAST });
    a.fail = () => new Error('QUOTA_BYTES_PER_ITEM quota exceeded');
    expect((await trySave(a, DEFAULTS)) as { message: string }).toMatchObject({ message: expect.stringMatching(/^Too big to sync/) });
  });
});

describe('the popup follows the settings page', () => {
  const flush = async () => {
    for (let i = 0; i < 12; i++) await Promise.resolve();
  };
  afterEach(() => vi.unstubAllGlobals());

  it('re-renders on a storage change and never writes the stale copy back', async () => {
    const a = area();
    let changed: (c: Record<string, { newValue?: unknown }>, areaName: string) => void = () => {};
    vi.resetModules();
    vi.stubGlobal('chrome', {
      runtime: { id: 'x', openOptionsPage: vi.fn(), getURL: (p: string) => p, sendMessage: vi.fn(), onMessage: { addListener() {} }, onInstalled: { addListener() {} } },
      tabs: { query: async () => [{ url: 'https://www.twitch.tv/lumen_fox', id: 1 }], sendMessage: vi.fn() },
      storage: { sync: a, local: { get: async () => ({}), set: vi.fn() }, onChanged: { addListener: (f: typeof changed) => void (changed = f) } },
    });
    document.body.innerHTML = '<div id="channel"></div><div id="emotes"></div><div id="cosmetics"></div><div id="animations"></div><section id="mentions-section"></section><div id="mentions"></div><button id="mentions-clear"></button><div id="more"></div><div id="toast"></div>';
    await import('../src/popup/index');
    await flush();
    // The settings page switches tooltips off.
    a.data[STORAGE_KEY] = { tooltips: false, chat: { timestamps: true } };
    changed({ [STORAGE_KEY]: { newValue: a.data[STORAGE_KEY] } }, 'sync');
    const tooltips = () => [...document.querySelectorAll<HTMLInputElement>('#more .switch')][0]!;
    expect(tooltips().checked).toBe(false);
    // Now the popup changes something else: the page's change stays.
    [...document.querySelectorAll<HTMLInputElement>('#emotes .switch')][0]!.click();
    await flush();
    await wait();
    const s = stored(a);
    expect(s.tooltips).toBe(false);
    expect(s.chat.timestamps).toBe(true);
    expect(s.emotes[s.order[0]!]).toBe(false);
  });
});

// --- 7. Small ones ----------------------------------------------------------------------------

describe('small fixes', () => {
  it('a section reset’s undo puts back only that section', () => {
    const section = PAGES.find((p) => p.id === 'twitch')!.sections[0]!;
    const before = merge({ chat: { hide: { sidebar: true } } });
    const reset = resetSection(before, section);
    expect(reset.chat.hide.sidebar).toBe(false);
    // Elsewhere, meanwhile: the theme changed.
    const now = { ...reset, theme: 'light' as const };
    const undone = restoreSection(now, section, before);
    expect(undone.chat.hide.sidebar).toBe(true);
    expect(undone.theme).toBe('light');
  });

  it('hidden emotes keep pictures only from the providers’ CDNs', () => {
    const list = readHidden([
      { provider: '7tv', id: 'a', name: 'a', url: 'https://cdn.7tv.app/emote/a/1x.webp' },
      { provider: 'bttv', id: 'b', name: 'b', url: 'https://cdn.betterttv.net/emote/b/1x' },
      { provider: 'ffz', id: 'c', name: 'c', url: 'https://cdn.frankerfacez.com/emote/c/1' },
      { provider: 'cyextv', id: 'd', name: 'd', url: 'https://cdn.cyex.tv/emotes/d/1x.webp' },
      { provider: '7tv', id: 'e', name: 'e', url: 'https://evil.example/x.png' },
      { provider: '7tv', id: 'f', name: 'f', url: 'https://cdn.7tv.app.evil.example/x.png' },
      { provider: '7tv', id: 'g', name: 'g', url: 'https://user:pw@cdn.7tv.app/x.png' },
      { provider: '7tv', id: 'h', name: 'h', url: 'http://cdn.7tv.app/x.png' },
    ]);
    expect(list.map((e) => [e.id, !!e.url])).toEqual([['a', true], ['b', true], ['c', true], ['d', true], ['e', false], ['f', false], ['g', false], ['h', false]]);
  });

  it('a channel ID that isn’t digits is not used', async () => {
    const html = document.documentElement;
    history.replaceState(null, '', '/lumen_fox');
    for (const bad of ['12a', '1/../x', '1 2', '', '1'.repeat(21), '"]x']) {
      html.dataset.cyextvChannel = bad;
      expect(await twitch.channel(), bad).toBeNull();
    }
    html.dataset.cyextvChannel = '141981764';
    expect(await twitch.channel()).toEqual({ platform: 'twitch', id: '141981764', login: 'lumen_fox' });
    delete html.dataset.cyextvChannel;
  });

  it('Kick’s channel ID is used only when it is a whole number', async () => {
    history.replaceState(null, '', '/kick_bad_' + Math.random().toString(36).slice(2));
    vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => ({ user_id: '1/../2' }) }));
    expect(await kick.channel()).toBeNull();
    history.replaceState(null, '', '/kick_good_' + Math.random().toString(36).slice(2));
    vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => ({ user_id: 3000 }) }));
    expect((await kick.channel())?.id).toBe('3000');
    vi.unstubAllGlobals();
  });
});

beforeEach(() => {
  // A clean page for every test.
  document.body.innerHTML = '';
});
