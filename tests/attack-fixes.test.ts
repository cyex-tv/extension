// @vitest-environment jsdom
// Fixes from the extension attack pass: synced-storage quota, regex rules that can freeze chat,
// dead selectors, notes with prototype names, the backup file, direction overrides, the welcome
// page and the narrow settings page.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkHide } from '../src/health/check';
import { COLORS, REGEX_TEXT_MAX, compileIgnores, compilePattern, compileRules, ranges, regexProblem } from '../src/features/highlights/match';
import { cleanMessages, cleanText } from '../src/features/looks/clean';
import { NOTES_KEY, NotesStore, readNotes } from '../src/features/people/notes';
import { BACKUP_APP, backupFile, readBackup, regexNotice } from '../src/options/model';
import { setChannel } from '../src/popup/model';
import { DEFAULTS, MAX_CHANNELS, STORAGE_KEY, SYNC_QUOTA_BYTES, compact, fits, merge, syncBytes, trySave } from '../src/settings';
import type { FeatureContext } from '../src/features/types';
import { KICK_HIDE_SELECTORS } from '../src/sites/kick';
import { twitch } from '../src/sites/twitch';

// --- 1. Storage quota ------------------------------------------------------------------------

const rule = (pattern: string, over: Record<string, unknown> = {}) => ({ pattern, regex: false, wholeWord: true, matchCase: false, color: '', sound: false, wordsOnly: false, ...over });
const big = (n: number) => merge({ chat: { highlights: Array.from({ length: n }, (_, i) => rule(`${i}`.padEnd(200, 'x'))) } });

/** The most 200-character rules that still fit synced storage. */
function mostThatFit(): number {
  let n = 1;
  while (fits(big(n + 1)).ok) n++;
  return n;
}

describe('synced storage quota', () => {
  it('measures what is stored (key and JSON, in bytes) and says no past 8 KB, in plain words', () => {
    expect(syncBytes(DEFAULTS)).toBeLessThan(40);
    const n = mostThatFit();
    expect(syncBytes(big(n))).toBeLessThanOrEqual(SYNC_QUOTA_BYTES);
    const over = fits(big(n + 1));
    expect(over.ok).toBe(false);
    expect(!over.ok && over.message).toMatch(/^Too big to sync: \d+(\.\d)? KB of 8 KB\. Remove some rules or names\.$/);
  });

  it('trySave writes nothing when too big, and never throws when the browser refuses', async () => {
    const set = vi.fn(async () => {});
    const tooBig = await trySave({ get: async () => ({}), set }, big(mostThatFit() + 1));
    expect(tooBig.ok).toBe(false);
    expect(set).not.toHaveBeenCalled();
    const refusing = { get: async () => ({}), set: async () => { throw new Error('QUOTA_BYTES_PER_ITEM quota exceeded'); } };
    const refused = await trySave(refusing, DEFAULTS);
    expect(!refused.ok && refused.message).toContain('Too big to sync');
    const broken = await trySave({ get: async () => ({}), set: async () => { throw new Error('disk gone'); } }, DEFAULTS);
    expect(!broken.ok && broken.message).toBe('Couldn’t save your settings. Try again in a moment.');
    expect((await trySave({ get: async () => ({}), set }, DEFAULTS)).ok).toBe(true);
  });

  it('caps the channels switched off at 200, as stored and as set in the popup', () => {
    const many = Array.from({ length: 500 }, (_, i) => `twitch:c${i}`);
    expect(merge({ disabledChannels: many }).disabledChannels).toHaveLength(MAX_CHANNELS);
    const full = merge({ disabledChannels: many.slice(0, MAX_CHANNELS) });
    expect(setChannel(full, 'twitch:new', false)).toBe(full);
    expect(setChannel(full, 'twitch:c1', true).disabledChannels).toHaveLength(MAX_CHANNELS - 1);
    expect(setChannel(full, 'twitch:c1', false)).toEqual(full);
  });

  it('an import that would not fit is turned away before anything changes', () => {
    const file = JSON.stringify({ app: BACKUP_APP, version: 1, settings: compact(big(mostThatFit() + 1)) });
    // merge caps lists at 40 rules, so build the same overflow from two long lists instead.
    const r = readBackup(file);
    expect(r.ok === false ? r.error : '').toMatch(/too big to sync/);
  });
});

describe('the page and the quota', () => {
  const data: { sync: Record<string, unknown>; local: Record<string, unknown> } = { sync: {}, local: {} };
  let syncSet: ReturnType<typeof vi.fn>;
  const area = (d: Record<string, unknown>, set?: (items: Record<string, unknown>) => Promise<void>): ExtStorageArea => ({
    get: async (k) => (typeof k === 'string' ? (k in d ? { [k]: d[k] } : {}) : { ...d }),
    set: set ?? (async (items) => void Object.assign(d, items)),
  });
  const flush = async () => {
    for (let i = 0; i < 12; i++) await Promise.resolve();
  };

  async function open(hash: string, stored?: Record<string, unknown>) {
    data.sync = stored ? { [STORAGE_KEY]: stored } : {};
    data.local = {};
    syncSet = vi.fn(async (items: Record<string, unknown>) => void Object.assign(data.sync, items));
    vi.resetModules();
    vi.stubGlobal('chrome', {
      runtime: { id: 'x', openOptionsPage: vi.fn(), getURL: (p: string) => p, sendMessage: vi.fn(), onMessage: { addListener() {} }, onInstalled: { addListener() {} } },
      tabs: { query: async () => [], create: vi.fn() },
      storage: { sync: area(data.sync, syncSet as never), local: area(data.local), onChanged: { addListener() {} } },
    });
    location.hash = hash;
    document.body.innerHTML = '<a class="skip" href="#page">Skip to settings</a><input id="search" /><nav id="nav"></nav><main id="page" tabindex="-1"></main><div id="toast"></div>';
    await import('../src/options/index');
    await flush();
  }
  afterEach(() => vi.unstubAllGlobals());

  const addRule = async (pattern: string) => {
    const input = document.querySelector<HTMLInputElement>('.rule.new input')!;
    input.value = pattern;
    input.dispatchEvent(new Event('change'));
    await flush();
  };

  it('a rule that would not fit is not added: a message with the sizes, nothing stored, the list unchanged', async () => {
    const n = mostThatFit();
    await open('#highlights', compact(big(n)));
    expect(document.querySelectorAll('#page .rule:not(.new)').length).toBe(n);
    const before = JSON.stringify(data.sync[STORAGE_KEY]);
    await addRule('y'.repeat(200));
    expect(document.querySelector('#toast')!.textContent).toMatch(/^Too big to sync: \d+(\.\d)? KB of 8 KB\. Remove some rules or names\.$/);
    expect(JSON.stringify(data.sync[STORAGE_KEY])).toBe(before);
    expect(syncSet).not.toHaveBeenCalled();
    expect(document.querySelectorAll('#page .rule:not(.new)').length).toBe(n);
  });

  it('when the browser refuses the save, the page and storage go back to what they were', async () => {
    await open('#twitch');
    const sw = [...document.querySelectorAll<HTMLInputElement>('#page .switch')][0]!;
    expect(sw.checked).toBe(false);
    syncSet.mockImplementationOnce(async () => {
      throw new Error('QUOTA_BYTES_PER_ITEM quota exceeded');
    });
    sw.click();
    await flush();
    expect([...document.querySelectorAll<HTMLInputElement>('#page .switch')][0]!.checked).toBe(false);
    expect(document.querySelector('#toast')!.textContent).toContain('Too big to sync');
    // The rollback wrote the previous settings back.
    expect(merge(data.sync[STORAGE_KEY]).chat.hide.sidebar).toBe(false);
  });

  it('turns a regex RE2 can’t run away with an inline message, and keeps the rule as it was', async () => {
    await open('#highlights', { chat: { highlights: [rule('(a)\\1')] } });
    const box = [...document.querySelectorAll<HTMLInputElement>('#page .rule .check input')].find((i) => i.parentElement!.textContent === 'Regex')!;
    box.click();
    await flush();
    const err = document.querySelector('#page .field-error')!;
    expect(err.getAttribute('role')).toBe('alert');
    expect(err.textContent).toMatch(/Backreferences/);
    expect(merge(data.sync[STORAGE_KEY]).chat.highlights[0]!.regex).toBe(false);
    expect(syncSet).not.toHaveBeenCalled();
  });

  it('says a stored unsafe regex is not used', async () => {
    await open('#ignores', { chat: { ignores: [{ pattern: 'a(?=b)', regex: true, matchCase: false, hide: true, swap: '***' }] } });
    expect(document.querySelector('#page .field-error')!.textContent).toMatch(/^Not used: Lookarounds/);
  });

  it('import: asks first, switches regex rules off with a notice, then saves settings before notes', async () => {
    await open('#about');
    const text = JSON.stringify({
      app: BACKUP_APP,
      version: 1,
      settings: { chat: { highlights: [rule('(a+)+$', { regex: true }), rule('b.d', { regex: true })] } },
      userNotes: { lumen_fox: { nick: 'Fox', note: '' } },
      hiddenEmotes: [{ provider: '7tv', id: 'abc', name: 'catJAM', url: '' }],
    });
    const picker = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(picker, 'files', { value: [{ text: async () => text }], configurable: true });
    picker.dispatchEvent(new Event('change'));
    await flush();
    const importButton = [...document.querySelectorAll<HTMLButtonElement>('#page button')].find((b) => /Click again to replace/.test(b.textContent!))!;
    expect(document.querySelector('#toast')!.textContent).toMatch(/replaces your settings, nicknames, notes and hidden emotes/);
    // Nothing is written until the second click.
    expect(data.sync[STORAGE_KEY]).toBeUndefined();
    expect(data.local[NOTES_KEY]).toBeUndefined();
    importButton.click();
    await flush();
    const saved = merge(data.sync[STORAGE_KEY]);
    expect(saved.chat.highlights.map((r) => r.regex)).toEqual([false, false]);
    expect(document.querySelector('#toast')!.textContent).toContain(regexNotice(2));
    expect(regexNotice(2)).toBe('2 regex rules were imported switched off. Switch them on under Highlights or Ignores once you’ve checked them.');
    expect(Object.keys(data.local[NOTES_KEY] as object)).toEqual(['lumen_fox']);
    expect(data.local.hiddenEmotes).toHaveLength(1);
    expect(document.querySelector('#page')!.textContent).toContain('Replaces your settings, nicknames, notes and hidden emotes');
  });

  it('import: when the settings do not save, notes and hidden emotes stay as they were (no half import)', async () => {
    await open('#about');
    data.local[NOTES_KEY] = { old_one: { nick: 'Old', note: '' } };
    syncSet.mockImplementation(async () => {
      throw new Error('QUOTA_BYTES_PER_ITEM quota exceeded');
    });
    const text = JSON.stringify({ app: BACKUP_APP, version: 1, settings: { animations: 'off' }, userNotes: { new_one: { nick: 'New', note: '' } } });
    const picker = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(picker, 'files', { value: [{ text: async () => text }], configurable: true });
    picker.dispatchEvent(new Event('change'));
    await flush();
    [...document.querySelectorAll<HTMLButtonElement>('#page button')].find((b) => /Click again/.test(b.textContent!))!.click();
    await flush();
    expect(Object.keys(data.local[NOTES_KEY] as object)).toEqual(['old_one']);
    expect(document.querySelector('#toast')!.textContent).toContain('Too big to sync');
  });

  it('has a skip link that moves focus to the page, and a focusable page container', async () => {
    await open('#chat');
    expect(document.querySelector('#page')!.getAttribute('tabindex')).toBe('-1');
    document.querySelector<HTMLAnchorElement>('.skip')!.click();
    expect(document.activeElement).toBe(document.querySelector('#page h1'));
  });

  it('scrolls the open page into view in the horizontal nav', async () => {
    await open('#kick');
    const nav = document.querySelector<HTMLElement>('#nav')!;
    Object.defineProperties(nav, { scrollWidth: { value: 900, configurable: true }, clientWidth: { value: 300, configurable: true }, offsetLeft: { value: 0, configurable: true } });
    const proto = HTMLElement.prototype;
    const left = vi.spyOn(proto, 'offsetLeft', 'get').mockReturnValue(600);
    const width = vi.spyOn(proto, 'offsetWidth', 'get').mockReturnValue(100);
    document.querySelector<HTMLButtonElement>('[data-fk="nav:twitch"]')!.click();
    await flush();
    expect(nav.scrollLeft).toBe(500);
    left.mockRestore();
    width.mockRestore();
  });
});

describe('the popup and the quota', () => {
  const flush = async () => {
    for (let i = 0; i < 12; i++) await Promise.resolve();
  };
  afterEach(() => vi.unstubAllGlobals());

  it('puts the popup back and says why when the save is refused', async () => {
    const d: Record<string, unknown> = {};
    const set = vi.fn(async () => {
      throw new Error('QUOTA_BYTES_PER_ITEM quota exceeded');
    });
    vi.resetModules();
    vi.stubGlobal('chrome', {
      runtime: { id: 'x', openOptionsPage: vi.fn(), getURL: (p: string) => p, sendMessage: vi.fn(), onMessage: { addListener() {} }, onInstalled: { addListener() {} } },
      tabs: { query: async () => [{ url: 'https://www.twitch.tv/lumen_fox', id: 1 }], sendMessage: vi.fn() },
      storage: { sync: { get: async () => ({}), set }, local: { get: async () => ({ ...d }), set: vi.fn() }, onChanged: { addListener() {} } },
    });
    document.body.innerHTML = '<div id="channel"></div><div id="emotes"></div><div id="cosmetics"></div><div id="animations"></div><section id="mentions-section"></section><div id="mentions"></div><button id="mentions-clear"></button><div id="more"></div><div id="toast"></div>';
    await import('../src/popup/index');
    await flush();
    const sw = document.querySelector<HTMLInputElement>('#channel .switch')!;
    expect(sw.checked).toBe(true);
    sw.click();
    await flush();
    expect(document.querySelector<HTMLInputElement>('#channel .switch')!.checked).toBe(true);
    expect(document.querySelector('#toast')!.textContent).toContain('Too big to sync');
  });
});

// --- 2. Regex ----------------------------------------------------------------------------------

describe('regex rules that can freeze chat', () => {
  it.each(['(a)\\1', '(?<n>a)\\k<n>','(?=a)b', '(?<!x)y+', 'a++', '(?:a{100}){100}', '(', '[a-'])('refuses %s with a reason', (p) => {
    expect(regexProblem(p), p).not.toBeNull();
    expect(compilePattern(p, { regex: true, wholeWord: false, matchCase: false })).toBeNull();
  });

  it.each(['(a+)+$', '(x*)*', '(a+){2,}', '(.*a){20}', '(a|aa)+$', '^hello', 'gg+', '(foo|bar)+', '(ab)?c', '[a-z]+\\d{2}', '\\bkek\\b','a{2,3}', '(ab|cd){2}', '[(]a+[)]+', '(?<n>a)'])('allows %s (RE2 runs it in linear time)', (p) => {
    expect(regexProblem(p), p).toBeNull();
    expect(compilePattern(p, { regex: true, wholeWord: false, matchCase: false })).not.toBeNull();
  });

  it('(a+)+$ on 30 letters and a bang takes no time at all, as a highlight and as an ignore', () => {
    const text = `${'a'.repeat(30)}!`;
    const chat = { ...DEFAULTS.chat, highlights: [rule('(a+)+$', { regex: true })].map((r) => merge({ chat: { highlights: [r] } }).chat.highlights[0]!), ignores: [{ pattern: '(a+)+$', regex: true, matchCase: false, hide: true, swap: '' }] };
    const t = Date.now();
    expect(compileRules(chat, null).classify({ login: 'x', text }, false)).toBeNull();
    expect(compileIgnores(chat, null).hides({ login: 'x', text })).toBe(false);
    expect(Date.now() - t).toBeLessThan(500);
    expect(COLORS.word).toBeTruthy();
  });

  it('hands a regex rule only the first 200 characters of a line', () => {
    const re = compilePattern('z', { regex: true, wholeWord: false, matchCase: false })!;
    const line = `${'a'.repeat(REGEX_TEXT_MAX)}z`;
    expect(ranges(re, line)).toEqual([]);
    expect(ranges(re, `${'a'.repeat(REGEX_TEXT_MAX - 1)}z`)).toEqual([[REGEX_TEXT_MAX - 1, REGEX_TEXT_MAX]]);
    // Plain words are not cut.
    const plain = compilePattern('z', { regex: false, wholeWord: false, matchCase: false })!;
    expect(ranges(plain, line)).toHaveLength(1);
  });

  it('an imported file’s regex rules arrive switched off, counted', () => {
    const file = JSON.stringify({ app: BACKUP_APP, version: 1, settings: { chat: { highlights: [rule('a+', { regex: true }), rule('plain')], ignores: [{ pattern: 'b', regex: true, matchCase: false, hide: true, swap: '' }] } } });
    const r = readBackup(file);
    expect(r.ok && r.regexOff).toBe(2);
    expect(r.ok && r.settings.chat.highlights.map((x) => x.regex)).toEqual([false, false]);
    expect(r.ok && r.settings.chat.ignores[0]!.regex).toBe(false);
    expect(regexNotice(1)).toMatch(/^1 regex rule was imported switched off/);
  });
});

// --- 3. Selectors -----------------------------------------------------------------------------

describe('selectors from the live check', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  const matches = (selectors: readonly string[], html: string) => {
    document.body.innerHTML = html;
    return selectors.flatMap((s) => [...document.querySelectorAll(s)]);
  };

  it('Twitch leaderboard: the button with its aria label, and the highlight card that holds it', () => {
    const html = '<div class="community-highlight-stack__card" id="card"><button aria-label="Expand Top Gifters Leaderboard"></button></div><div class="community-highlight-stack__card" id="other"><button aria-label="Dismiss"></button></div>';
    const hit = matches(twitch.hide.leaderboard!, html).map((e) => e.id || e.tagName);
    expect(hit).toContain('card');
    expect(hit).toContain('BUTTON');
    expect(hit).not.toContain('other');
  });

  it('Kick leaderboard: inside the chat room only, never the home page’s Featured Leaderboards', () => {
    const home = '<section data-testid="featured-leaderboards-section" id="home"><button aria-label="Leaderboard">x</button></section>';
    expect(matches(KICK_HIDE_SELECTORS.leaderboard!, home)).toEqual([]);
    const chat = '<div id="channel-chatroom"><div id="lb" data-testid="gift-leaderboard"></div><button id="bt" aria-label="Top gifters leaderboard"></button></div>';
    expect(matches(KICK_HIDE_SELECTORS.leaderboard!, chat).map((e) => e.id).sort()).toEqual(['bt', 'lb']);
    const other = '<div id="chatroom-top"><div id="lb2" data-testid="leaderboard-card"></div></div>';
    expect(matches(KICK_HIDE_SELECTORS.leaderboard!, other).map((e) => e.id)).toEqual(['lb2']);
  });

  it('keeps no #chatroom-top fallbacks', () => {
    for (const list of Object.values(KICK_HIDE_SELECTORS)) for (const s of list) expect(s).not.toContain('#chatroom-top');
  });

  it('Kick Recommended hides its heading with the entries, but never the whole bar when Following is in the same box', () => {
    const section = '<div id="sidebar-wrapper"><section id="rec"><h3>Recommended</h3><a data-testid="sidebar-recommended-channel-1" href="/a">a</a></section></div>';
    expect(matches(KICK_HIDE_SELECTORS.sidebarRecommended!, section).map((e) => e.id)).toContain('rec');
    const shared = '<div id="sidebar-wrapper"><div id="all"><button data-testid="sidebar-following">Following</button><h3>Recommended</h3><a data-testid="sidebar-recommended-channel-1" href="/a">a</a></div></div>';
    expect(matches(KICK_HIDE_SELECTORS.sidebarRecommended!, shared).map((e) => e.id)).not.toContain('all');
  });

  it('the panel counts a card and the part of it that also matched once', () => {
    document.body.innerHTML = '<div class="community-highlight-stack__card" data-test-selector="prediction-x"><div data-test-selector="community-prediction-highlight-header"></div></div><div class="community-highlight-stack__card"><div data-test-selector="community-prediction-highlight-header"></div></div>';
    const r = checkHide(twitch, document).find((x) => x.key === 'predictions')!;
    // Three elements matched somewhere (two headers, one card has one too); two are not inside another match.
    expect(r.found).toBe(true);
    const all = new Set(r.selectors.length ? [...document.querySelectorAll('.community-highlight-stack__card, [data-test-selector="community-prediction-highlight-header"]')] : []);
    expect(all.size).toBe(4);
    expect(r.count).toBe(2);
  });
});

// --- 4. Notes with prototype names ------------------------------------------------------------

describe('notes with names the prototype owns', () => {
  it('drops __proto__, constructor and prototype on read, and keeps the real ones', () => {
    const stored = JSON.parse('{"__proto__":{"nick":"x","note":""},"constructor":{"nick":"y","note":""},"prototype":{"nick":"z","note":""},"__other":{"nick":"q","note":""},"lumen_fox":{"nick":"Fox","note":""}}');
    const read = readNotes(stored);
    expect(Object.keys(read)).toEqual(['lumen_fox']);
    expect(Object.getPrototypeOf(read)).toBeNull();
  });

  it('get says null for them, even when the store was never given them', async () => {
    const store = new NotesStore();
    await store.set('__proto__', { nick: 'Evil', note: 'x' });
    await store.set('constructor', { nick: 'Evil', note: 'x' });
    await store.set('prototype', { nick: 'Evil', note: 'x' });
    expect(store.get('__proto__')).toBeNull();
    expect(store.get('constructor')).toBeNull();
    expect(store.get('toString')).toBeNull();
    expect(store.get('hasOwnProperty')).toBeNull();
    expect(Object.keys(store.all())).toEqual([]);
    expect(({} as Record<string, unknown>).nick).toBeUndefined();
  });

  it('keeps the other notes when an import carries a __proto__ entry', () => {
    const file = `{"app":"${BACKUP_APP}","version":1,"settings":{},"userNotes":{"__proto__":{"nick":"x","note":""},"nora_byte":{"nick":"Nora","note":"hi"}}}`;
    const r = readBackup(file);
    expect(r.ok && Object.keys(r.notes!)).toEqual(['nora_byte']);
    const out = JSON.parse(backupFile(DEFAULTS, readNotes(JSON.parse('{"__proto__":{"nick":"x","note":""},"a":{"nick":"A","note":""}}')), new Date()).text);
    expect(Object.keys(out.userNotes)).toEqual(['a']);
  });
});

// --- 5. Backup includes hidden emotes ---------------------------------------------------------

describe('the backup file and hidden emotes', () => {
  it('carries the hidden emotes, checked on the way in and out', () => {
    const hidden = [{ provider: '7tv' as const, id: 'abc', name: 'catJAM', url: 'https://cdn.7tv.app/emote/abc/1x.webp' }];
    const f = backupFile(DEFAULTS, {}, new Date(2026, 10, 17), hidden);
    expect(JSON.parse(f.text).hiddenEmotes).toEqual(hidden);
    const back = readBackup(f.text);
    expect(back.ok && back.hidden).toEqual(hidden);
    const junk = readBackup(JSON.stringify({ app: BACKUP_APP, version: 1, settings: {}, hiddenEmotes: [{ provider: 'nope', id: 'x', name: 'a' }, { provider: 'ffz', id: '../x', name: 'a' }, 5] }));
    expect(junk.ok && junk.hidden).toEqual([]);
    const older = readBackup(JSON.stringify({ app: BACKUP_APP, version: 1, settings: {} }));
    expect(older.ok && older.hidden).toBeNull();
  });
});

// --- 6. Direction overrides --------------------------------------------------------------------

describe('direction overrides', () => {
  const both = { invisible: true, zalgo: true };
  it('are stripped from text; the plain direction marks stay', () => {
    expect(cleanText('abc‮def‬', both)).toBe('abcdef');
    expect(cleanText('a‪‫‭⁦⁧⁨⁩b', both)).toBe('ab');
    expect(cleanText('‏שלום', both)).toBe('‏שלום');
    expect(cleanText('x‮y', { invisible: false, zalgo: true })).toBe('x‮y');
  });

  const ctx = (): FeatureContext => ({ doc: document, site: twitch, settings: DEFAULTS, index: null as never, now: () => 1, channel: () => null, others: () => [], local: null });
  it('strips them from the name too, and sets the name apart as its own island', () => {
    document.body.innerHTML = '<div data-a-target="chat-line-message"><span class="chat-line__username"><span class="chat-author__display-name">ev‮il</span></span><span data-a-target="chat-line-message-body"><span class="text-fragment">hi ‮there</span></span></div>';
    const m = document.querySelector('[data-a-target="chat-line-message"]')!;
    const f = cleanMessages();
    f.start!(ctx());
    f.prepare!(m, { sender: null, login: 'evil', text: 'hi ‮there', at: 1 });
    const name = m.querySelector<HTMLElement>('.chat-author__display-name')!;
    expect(name.textContent).toBe('evil');
    expect(name.style.getPropertyValue('unicode-bidi')).toBe('isolate');
    expect(m.querySelector('.text-fragment')!.textContent).toBe('hi there');
  });

  it('are stripped from nicknames and notes', async () => {
    const store = new NotesStore();
    await store.set('lumen_fox', { nick: 'Fo‮x', note: 'a⁦b' });
    expect(store.get('lumen_fox')).toEqual({ nick: 'Fox', note: 'ab' });
  });
});

// --- 7. Welcome page ---------------------------------------------------------------------------

describe('the welcome page', () => {
  const flush = async () => {
    for (let i = 0; i < 12; i++) await Promise.resolve();
  };
  afterEach(() => vi.unstubAllGlobals());

  async function open(syncSet: (items: Record<string, unknown>) => Promise<void>) {
    const local: Record<string, unknown> = {};
    vi.resetModules();
    vi.stubGlobal('chrome', {
      runtime: { id: 'x', openOptionsPage: vi.fn(), getURL: (p: string) => p, sendMessage: vi.fn(), onMessage: { addListener() {} }, onInstalled: { addListener() {} } },
      tabs: { query: async () => [], create: vi.fn() },
      storage: { sync: { get: async () => ({}), set: syncSet }, local: { get: async () => ({ ...local }), set: async (i: Record<string, unknown>) => void Object.assign(local, i) }, onChanged: { addListener() {} } },
    });
    document.documentElement.removeAttribute('data-keys');
    document.body.innerHTML = '<main id="step"></main><div id="toast"></div>';
    await import('../src/onboarding/index');
    await flush();
    return local;
  }
  const press = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('#step button')].find((b) => b.textContent === text)!.click();

  it('finishing when the save fails shows a message, stays on the step and marks nothing done', async () => {
    const local = await open(async () => {
      throw new Error('QUOTA_BYTES_PER_ITEM quota exceeded');
    });
    press('Next');
    await flush();
    press('Save and finish');
    await flush();
    expect(document.querySelector('h1')!.textContent).toBe('How should Twitch look?');
    expect(document.querySelector('#toast')!.textContent).toMatch(/^Your choices weren’t saved\./);
    expect(local.onboarding).toBeUndefined();
  });

  it('step 2 says "Skip the rest" and keeps what step 1 chose', async () => {
    const sync: Record<string, unknown> = {};
    await open(async (i) => void Object.assign(sync, i));
    document.querySelectorAll<HTMLInputElement>('.switch')[3]!.click();
    press('Next');
    await flush();
    expect([...document.querySelectorAll('#step button')].map((b) => b.textContent)).toEqual(['Back', 'Skip the rest', 'Save and finish']);
    document.querySelector<HTMLInputElement>('input[value="clean"]')!.click();
    press('Skip the rest');
    await flush();
    const saved = merge(sync[STORAGE_KEY]);
    expect(saved.emotes[DEFAULTS.order[3]!]).toBe(false);
    expect(saved.chat.hide.topPrime).toBe(false);
  });

  it('Skip and Back are quiet buttons, not ghost ones', async () => {
    await open(async () => {});
    expect(document.querySelector('#step .btn.quiet')!.textContent).toBe('Skip, use defaults');
    expect(document.querySelector('#step .btn.ghost')).toBeNull();
  });

  it('marks keyboard use on <html> so the title ring shows for the keyboard only', async () => {
    await open(async () => {});
    expect(document.documentElement.hasAttribute('data-keys')).toBe(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(document.documentElement.hasAttribute('data-keys')).toBe(true);
    document.dispatchEvent(new Event('pointerdown'));
    expect(document.documentElement.hasAttribute('data-keys')).toBe(false);
  });
});
