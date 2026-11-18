// @vitest-environment jsdom
// Sign-off fixes: the welcome page patches instead of overwriting, the mentions inbox and repeat
// folding survive a restart, notes are per platform and merge, and the pages save and follow properly.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { highlights } from '../src/features/highlights/highlights';
import { INBOX_KEY, type Mention, addToInbox } from '../src/features/highlights/inbox';
import { repeats } from '../src/features/looks/repeats';
import { NOTES_KEY, NOTES_VERSION_KEY, NotesStore, migrateNotes, readNotes } from '../src/features/people/notes';
import type { FeatureContext, MessageInfo } from '../src/features/types';
import { BACKUP_APP, backupFile, readBackup } from '../src/options/model';
import { CHAT_DEFAULTS, DEFAULTS, STORAGE_KEY, type Settings, merge } from '../src/settings';
import { twitch } from '../src/sites/twitch';
import { SAVE_GAP_MS, createSaver } from '../src/ui/saver';

type Data = Record<string, unknown>;
const area = (d: Data): ExtStorageArea => ({
  get: async (k) => (typeof k === 'string' ? (k in d ? { [k]: d[k] } : {}) : Array.isArray(k) ? Object.fromEntries(k.filter((x) => x in d).map((x) => [x, d[x]])) : { ...d }),
  set: async (items) => void Object.assign(d, items),
});
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
const wait = (ms = SAVE_GAP_MS + 30) => new Promise((r) => setTimeout(r, ms));
const stored = (d: Data) => merge(d[STORAGE_KEY]);
const clear = (d: Data) => {
  for (const k of Object.keys(d)) delete d[k];
};

// --- 1. Welcome page ---------------------------------------------------------------------------

describe('the welcome page patches', () => {
  const sync: Data = {};
  const local: Data = {};
  beforeEach(async () => {
    clear(sync);
    clear(local);
    vi.resetModules();
    vi.stubGlobal('chrome', {
      runtime: { id: 'x', openOptionsPage: vi.fn(), getURL: (p: string) => p, sendMessage: vi.fn(), onMessage: { addListener() {} }, onInstalled: { addListener() {} } },
      tabs: { query: async () => [], create: vi.fn() },
      storage: { sync: area(sync), local: area(local), onChanged: { addListener() {} } },
    });
    document.body.innerHTML = '<main id="step"></main><div id="toast"></div>';
    await import('../src/onboarding/index');
    await flush();
  });
  afterEach(() => vi.unstubAllGlobals());
  const press = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('#step button')].find((b) => b.textContent === text)!.click();

  it('keeps a setting that was synced or changed after the page opened', async () => {
    // Another machine's settings arrive (or the popup changes one) while the page is open.
    sync[STORAGE_KEY] = { tooltips: false, theme: 'light', chat: { timestamps: true, hide: { sidebar: true } } };
    [...document.querySelectorAll<HTMLInputElement>('.switch')][2]!.click();
    press('Next');
    await flush();
    document.querySelector<HTMLInputElement>('input[value="clean"]')!.click();
    press('Save and finish');
    await wait();
    const s = stored(sync);
    expect(s.tooltips).toBe(false);
    expect(s.theme).toBe('light');
    expect(s.chat.hide.sidebar).toBe(true);
    expect(s.chat.hide.topPrime).toBe(true);
    expect(s.emotes[s.order[2]!]).toBe(false);
  });

  it('on a fresh machine writes only what was chosen, no defaults for the keys left alone', async () => {
    [...document.querySelectorAll<HTMLInputElement>('.switch')][0]!.click();
    press('Next');
    await flush();
    press('Save and finish');
    await wait();
    expect(sync[STORAGE_KEY]).toEqual({ emotes: { [DEFAULTS.order[0]!]: false } });
  });
});

// --- 5. Saver and theme ------------------------------------------------------------------------

describe('the saver writes when the page goes away', () => {
  const make = (d: Data) => createSaver({ area: area(d), initial: DEFAULTS, show: () => {}, fail: () => {} });

  it('on pagehide, without waiting for the fold window', async () => {
    const d: Data = {};
    const saver = make(d);
    await saver.apply((s) => merge({ ...s, tooltips: false }));
    // Right after a write: this one waits for the window.
    void saver.apply((s) => merge({ ...s, overrideOthers: true }));
    await flush();
    expect(stored(d).overrideOthers).toBe(false);
    window.dispatchEvent(new Event('pagehide'));
    await flush();
    expect(stored(d).overrideOthers).toBe(true);
    expect(stored(d).tooltips).toBe(false);
  });

  it('when the page turns hidden', async () => {
    const d: Data = {};
    const saver = make(d);
    await saver.apply((s) => merge({ ...s, tooltips: false }));
    void saver.apply((s) => merge({ ...s, overrideOthers: true }));
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(stored(d).overrideOthers).toBe(true);
  });
});

describe('useTheme', () => {
  it('registers the OS listener once, however often it is called', async () => {
    vi.resetModules();
    const add = vi.fn();
    (window as unknown as { matchMedia: unknown }).matchMedia = () => ({ matches: false, addEventListener: add });
    const { useTheme } = await import('../src/ui/theme');
    useTheme(document, 'system');
    useTheme(document, 'system');
    useTheme(document, 'light');
    expect(add).toHaveBeenCalledTimes(1);
    delete (window as unknown as { matchMedia?: unknown }).matchMedia;
  });
});

// --- 2. Mentions inbox and repeats -------------------------------------------------------------

describe('the mentions inbox', () => {
  const m = (over: Partial<Mention> = {}): Mention => ({ platform: 'twitch', channel: 'chan', login: 'amy', text: 'hi @me', at: 5, ...over });
  it('does not list the same mention twice', () => {
    expect(addToInbox([m()], [m(), m({ text: 'other' }), m({ text: 'other' })])).toHaveLength(2);
  });

  it('lists a message once across restarts of the app', async () => {
    const d: Data = {};
    const settings: Settings = { ...DEFAULTS, chat: { ...CHAT_DEFAULTS, mentions: true, mentionsInbox: true } };
    const ctx: FeatureContext = {
      doc: document,
      site: { ...twitch, self: () => 'me' },
      settings,
      index: null as never,
      now: () => 100,
      channel: () => ({ platform: 'twitch', id: '1', login: 'chan' }),
      others: () => [],
      local: area(d),
    };
    document.body.innerHTML = '<div class="chat-line__message" data-a-target="chat-line-message" data-a-user="amy"><span data-a-target="chat-line-message-body">hi @me</span></div>';
    const line = document.querySelector('.chat-line__message')!;
    const info: MessageInfo = { sender: null, login: 'amy', text: 'hi @me', at: 5 };
    for (let i = 0; i < 3; i++) {
      // A settings change: a new app, the same line on the page.
      const f = highlights();
      f.start!(ctx);
      f.message!(line, info);
      f.stop!();
      await flush();
    }
    expect(d[INBOX_KEY]).toHaveLength(1);
  });
});

describe('repeat folding', () => {
  const LIST = '[data-test-selector="chat-scrollable-area__message-container"]';
  const line = (text: string, login: string) =>
    `<div class="chat-line__message" data-a-target="chat-line-message" data-a-user="${login}"><span class="chat-author__display-name">${login}</span><span data-a-target="chat-line-message-body"><span class="text-fragment">${text}</span></span></div>`;
  let clock = 1_000_000;
  const ctx = (): FeatureContext => ({
    doc: document,
    site: twitch,
    settings: { ...DEFAULTS, chat: { ...CHAT_DEFAULTS, repeats: 'count' } },
    index: null as never,
    now: () => clock,
    channel: () => null,
    others: () => [],
    local: null,
  });
  const info = (text: string, login: string): MessageInfo => ({ sender: null, login, text, at: clock });
  const setup = () => {
    clock = 1_000_000;
    document.head.innerHTML = '';
    document.body.innerHTML = `<div data-test-selector="chat-scrollable-area__message-container"></div>`;
    return document.querySelector(LIST)!;
  };
  const add = (list: Element, f: ReturnType<typeof repeats>, text: string, login: string) => {
    list.insertAdjacentHTML('beforeend', line(text, login));
    const el = list.lastElementChild!;
    f.message!(el, info(text, login));
    return el;
  };

  it('does not fold old lines again after the app starts over', () => {
    const list = setup();
    const f = repeats();
    f.start!(ctx());
    const a = add(list, f, 'gg', 'a');
    const b = add(list, f, 'gg', 'b');
    expect(b.getAttribute('data-cyextv-repeat')).toBe('hidden');
    f.stop!();
    // Same lines, a new run (a setting changed): they were judged once, so they aren't counted again.
    const g = repeats();
    g.start!(ctx());
    g.message!(a, info('gg', 'a'));
    g.message!(b, info('gg', 'b'));
    expect(b.hasAttribute('data-cyextv-repeat')).toBe(false);
    g.stop!();
  });

  it('shows the copies again when their first line leaves the page', async () => {
    const list = setup();
    const f = repeats();
    f.start!(ctx());
    const x = add(list, f, 'hello', 'x');
    const y = add(list, f, 'hello', 'y');
    expect(y.getAttribute('data-cyextv-repeat')).toBe('hidden');
    x.remove();
    await new Promise((r) => setTimeout(r, 0));
    expect(y.hasAttribute('data-cyextv-repeat')).toBe(false);
    expect(document.querySelector('.cyextv-repeat-count')).toBeNull();
    f.stop!();
  });

  it('shows the copies again when the first line is removed after its group expired', async () => {
    const list = setup();
    const f = repeats();
    f.start!(ctx());
    const x = add(list, f, 'hello', 'x');
    const y = add(list, f, 'hello', 'y');
    clock += 5 * 60_000;
    add(list, f, 'something else', 'z');
    // The group is over (forgotten) but the copies stay folded...
    expect(y.getAttribute('data-cyextv-repeat')).toBe('hidden');
    // ...until the line they hide behind goes.
    x.remove();
    await new Promise((r) => setTimeout(r, 0));
    expect(y.hasAttribute('data-cyextv-repeat')).toBe(false);
    f.stop!();
  });
});

// --- 3. 4. Notes -------------------------------------------------------------------------------

describe('notes', () => {
  it('set merges into what is stored now, not the copy loaded earlier', async () => {
    const d: Data = { [NOTES_KEY]: { 'twitch:amy': { nick: 'A', note: '' } } };
    const store = new NotesStore();
    await store.load(area(d));
    // Added in chat (another store) while this page was open.
    d[NOTES_KEY] = { ...(d[NOTES_KEY] as object), 'twitch:bob': { nick: 'B', note: '' } };
    await store.set('twitch', 'cat', { nick: 'C', note: '' });
    expect(Object.keys(d[NOTES_KEY] as object).sort()).toEqual(['twitch:amy', 'twitch:bob', 'twitch:cat']);
  });

  it('keeps Twitch and Kick apart', async () => {
    const d: Data = {};
    const store = new NotesStore();
    await store.load(area(d));
    await store.set('twitch', 'amy', { nick: 'T', note: '' });
    await store.set('kick', 'amy', { nick: 'K', note: '' });
    expect(store.get('twitch', 'amy')?.nick).toBe('T');
    expect(store.get('kick', 'amy')?.nick).toBe('K');
    await store.set('kick', 'amy', { nick: '', note: '' });
    expect(store.get('twitch', 'amy')?.nick).toBe('T');
    expect(Object.keys(d[NOTES_KEY] as object)).toEqual(['twitch:amy']);
  });

  it('migrates login-only keys to twitch: once', async () => {
    const d: Data = { [NOTES_KEY]: { lumen_fox: { nick: 'Fox', note: '' } } };
    await migrateNotes(area(d));
    expect(d[NOTES_KEY]).toEqual({ 'twitch:lumen_fox': { nick: 'Fox', note: '' } });
    expect(d[NOTES_VERSION_KEY]).toBe(2);
    // Later: a kick entry of the same name is never turned into a twitch one.
    d[NOTES_KEY] = { 'kick:lumen_fox': { nick: 'K', note: '' } };
    await migrateNotes(area(d));
    expect(d[NOTES_KEY]).toEqual({ 'kick:lumen_fox': { nick: 'K', note: '' } });
    expect(readNotes({ lumen_fox: { nick: 'old', note: '' }, 'twitch:lumen_fox': { nick: 'new', note: '' } })['twitch:lumen_fox']!.nick).toBe('new');
  });

  it('backups write platform keys (version 2) and read version 1 files as Twitch', () => {
    const out = JSON.parse(backupFile(DEFAULTS, readNotes({ 'kick:a': { nick: 'A', note: '' } }), new Date()).text);
    expect(out.version).toBe(2);
    expect(Object.keys(out.userNotes)).toEqual(['kick:a']);
    const old = readBackup(JSON.stringify({ app: BACKUP_APP, version: 1, settings: {}, userNotes: { lumen_fox: { nick: 'Fox', note: '' } } }));
    expect(old.ok && Object.keys(old.notes!)).toEqual(['twitch:lumen_fox']);
    expect(readBackup(JSON.stringify({ app: BACKUP_APP, version: 3, settings: {} })).ok).toBe(false);
  });
});

describe('the settings page', () => {
  const sync: Data = {};
  const local: Data = {};
  let changed: (c: Record<string, { newValue?: unknown }>, areaName: string) => void = () => {};
  const nickField = () => document.querySelector<HTMLInputElement>('#page input[aria-label="Nickname for amy on Twitch"]')!;
  beforeEach(async () => {
    clear(sync);
    clear(local);
    local[NOTES_KEY] = { 'twitch:amy': { nick: 'Amy', note: 'hi' }, 'kick:amy': { nick: 'KAmy', note: '' } };
    vi.resetModules();
    vi.stubGlobal('chrome', {
      runtime: { id: 'x', openOptionsPage: vi.fn(), getURL: (p: string) => p, sendMessage: vi.fn(), onMessage: { addListener() {} }, onInstalled: { addListener() {} } },
      tabs: { query: async () => [], create: vi.fn() },
      storage: { sync: area(sync), local: area(local), onChanged: { addListener: (f: typeof changed) => void (changed = f) } },
    });
    location.hash = '#usercard';
    document.body.innerHTML = '<input id="search" /><nav id="nav"></nav><main id="page"></main><div id="toast"></div>';
    await import('../src/options/index');
    await flush();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('lists notes with their platform, and shows ones added in chat meanwhile', () => {
    const rows = () => [...document.querySelectorAll('#page .rule')].map((r) => r.querySelector('.login')!.textContent);
    expect(rows().sort()).toEqual(['amyKick', 'amyTwitch']);
    local[NOTES_KEY] = { ...(local[NOTES_KEY] as object), 'kick:zed': { nick: 'Zed', note: '' } };
    changed({ [NOTES_KEY]: { newValue: local[NOTES_KEY] } }, 'local');
    expect(rows()).toHaveLength(3);
    expect(rows()).toContain('zedKick');
  });

  it('saving a field keeps notes added in chat meanwhile', async () => {
    local[NOTES_KEY] = { ...(local[NOTES_KEY] as object), 'kick:zed': { nick: 'Zed', note: '' } };
    const nick = nickField();
    nick.value = 'Amy2';
    nick.dispatchEvent(new Event('change'));
    await flush();
    const n = local[NOTES_KEY] as Record<string, { nick: string }>;
    expect(n['kick:zed']!.nick).toBe('Zed');
    expect(n['twitch:amy']!.nick).toBe('Amy2');
  });

  it('does not rebuild a text field with unsaved typing when something else changes', () => {
    const nick = nickField();
    nick.focus();
    nick.value = 'Typed so far';
    // The popup changes the theme.
    sync[STORAGE_KEY] = { theme: 'light' };
    changed({ [STORAGE_KEY]: { newValue: sync[STORAGE_KEY] } }, 'sync');
    expect(nickField()).toBe(nick);
    expect(nick.value).toBe('Typed so far');
    expect(document.activeElement).toBe(nick);
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
