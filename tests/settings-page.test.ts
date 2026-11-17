// @vitest-environment jsdom
// The settings page: groups, search, "reset this group", the backup file, and the page itself.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BACKUP_APP, backupFile, isDefault, itemKeys, readBackup, resetSection, search } from '../src/options/model';
import { GROUPS, PAGES, getPath } from '../src/options/schema';
import { DEFAULTS, STORAGE_KEY, merge } from '../src/settings';

const section = (page: string, title: string) => PAGES.find((p) => p.id === page)!.sections.find((s) => s.title === title)!;

describe('pages', () => {
  it('sit in the three groups, each with an icon, ids unique', () => {
    expect(new Set(PAGES.map((p) => p.id)).size).toBe(PAGES.length);
    for (const p of PAGES) {
      expect(GROUPS).toContain(p.group);
      expect(p.icon.length).toBeGreaterThan(5);
    }
    expect(PAGES.filter((p) => p.group === 'Chat').map((p) => p.id)).toEqual(['chat', 'emotes', 'highlights', 'ignores', 'usercard']);
  });

  it('every item key points at a real setting', () => {
    for (const p of PAGES) for (const s of p.sections) for (const i of s.items) for (const k of itemKeys(i)) expect(getPath(DEFAULTS, k), `${p.id} ${k}`).not.toBeUndefined();
  });

  it('every hint is one short line', () => {
    for (const p of PAGES)
      for (const s of p.sections)
        for (const i of s.items) if ('hint' in i && i.hint) expect(i.hint.length, i.hint).toBeLessThan(160);
  });
});

describe('search', () => {
  it('finds items by label, hint, section and page, every word', () => {
    expect(search(PAGES, '')).toEqual([]);
    const prime = search(PAGES, 'prime');
    expect(prime).toHaveLength(1);
    expect(prime[0]!.page.id).toBe('twitch');
    expect(prime[0]!.items.map((i) => ('key' in i ? i.key : ''))).toEqual(['chat.hide.topPrime']);
    // Section words count too: "side bar kick" is Kick's side bar section only.
    const kickSide = search(PAGES, 'side bar kick');
    expect(kickSide.every((h) => h.page.id === 'kick')).toBe(true);
    expect(search(PAGES, 'TIMESTAMPS').some((h) => h.section.title === 'Timestamps')).toBe(true);
    expect(search(PAGES, '7tv order').some((h) => h.items.some((i) => i.kind === 'providers'))).toBe(true);
    expect(search(PAGES, 'zzzz nothing')).toEqual([]);
  });
});

describe('reset this group', () => {
  it('knows when a section is at its defaults, and resets only that section', () => {
    const side = section('twitch', 'Side bar');
    const changed = merge({ chat: { hide: { sidebar: true, topPrime: true }, timestamps: true } });
    expect(isDefault(DEFAULTS, side)).toBe(true);
    expect(isDefault(changed, side)).toBe(false);
    const out = resetSection(changed, side);
    expect(out.chat.hide.sidebar).toBe(false);
    expect(out.chat.hide.topPrime).toBe(true);
    expect(out.chat.timestamps).toBe(true);
    expect(isDefault(out, side)).toBe(true);
  });

  it('resets drawn items too (provider order and switches)', () => {
    const which = section('emotes', 'Which wins');
    const changed = merge({ order: ['ffz', 'bttv', '7tv', 'cyextv'], emotes: { bttv: false } });
    expect(isDefault(changed, which)).toBe(false);
    const out = resetSection(changed, which);
    expect(out.order).toEqual(DEFAULTS.order);
    expect(out.emotes.bttv).toBe(true);
  });
});

describe('backup file', () => {
  it('holds only the changed settings and the notes, named by date', () => {
    const s = merge({ animations: 'off', chat: { hide: { bits: true } } });
    const f = backupFile(s, { lumen_fox: { nick: 'Fox', note: '' } }, new Date(2026, 10, 17));
    expect(f.name).toBe('cyextv-settings-2026-11-17.json');
    const data = JSON.parse(f.text);
    expect(data.app).toBe(BACKUP_APP);
    expect(data.settings).toEqual({ animations: 'off', chat: { hide: { bits: true } } });
    expect(data.userNotes.lumen_fox.nick).toBe('Fox');
  });

  it('reads its own file back the same', () => {
    const s = merge({ theme: 'light', chat: { myNames: ['me'], hideKick: { pinned: true } } });
    const back = readBackup(backupFile(s, {}, new Date()).text);
    expect(back.ok && back.settings).toEqual(s);
    expect(back.ok && back.notes).toEqual({});
  });

  it('turns away anything else with a clear message', () => {
    expect(readBackup('nope')).toEqual({ ok: false, error: 'That file isn’t valid JSON.' });
    expect(readBackup('{"settings":{}}')).toMatchObject({ ok: false, error: 'That isn’t a cyex.tv settings file.' });
    expect(readBackup(JSON.stringify({ app: BACKUP_APP, version: 99, settings: {} }))).toMatchObject({ ok: false });
    expect(readBackup('x'.repeat(300_000))).toMatchObject({ ok: false });
    const junk = readBackup(JSON.stringify({ app: BACKUP_APP, version: 1, settings: { animations: 'sideways', chat: { volume: 'loud', hide: { bits: 'yes' } } } }));
    expect(junk.ok && junk.settings).toEqual(DEFAULTS);
  });
});

describe('the page', () => {
  const data: { sync: Record<string, unknown>; local: Record<string, unknown> } = { sync: {}, local: {} };
  const area = (d: Record<string, unknown>): ExtStorageArea => ({
    get: async (k) => (typeof k === 'string' ? (k in d ? { [k]: d[k] } : {}) : { ...d }),
    set: async (items) => void Object.assign(d, items),
  });
  const flush = async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  };

  beforeEach(async () => {
    data.sync = {};
    data.local = {};
    vi.resetModules();
    vi.stubGlobal('chrome', {
      runtime: { id: 'x', openOptionsPage: vi.fn(), getURL: (p: string) => p, sendMessage: vi.fn(), onMessage: { addListener() {} }, onInstalled: { addListener() {} } },
      tabs: { query: async () => [], create: vi.fn() },
      storage: { sync: area(data.sync), local: area(data.local), onChanged: { addListener() {} } },
    });
    location.hash = '#twitch';
    document.body.innerHTML = '<input id="search" /><nav id="nav"></nav><main id="page"></main><div id="toast"></div>';
    await import('../src/options/index');
    await flush();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows the grouped nav with the open page marked, and its sections', () => {
    expect([...document.querySelectorAll('.nav-label')].map((l) => l.textContent)).toEqual(['Chat', 'Page', 'Extension']);
    expect(document.querySelector('[aria-current="page"]')!.textContent).toBe('Hide on Twitch');
    expect(document.querySelector('#page h1')!.textContent).toBe('Hide on Twitch');
    expect(document.querySelectorAll('#page section').length).toBeGreaterThan(5);
  });

  it('a switch saves, keeps focus, and its section offers Reset with an undo', async () => {
    const sw = [...document.querySelectorAll<HTMLInputElement>('#page .switch')][0]!;
    sw.focus();
    sw.click();
    await flush();
    expect(merge(data.sync[STORAGE_KEY]).chat.hide.sidebar).toBe(true);
    expect((document.activeElement as HTMLElement).dataset.fk).toBe(sw.dataset.fk);
    const reset = document.querySelector<HTMLButtonElement>('[aria-label="Reset Side bar to the defaults"]')!;
    reset.click();
    await flush();
    expect(merge(data.sync[STORAGE_KEY]).chat.hide.sidebar).toBe(false);
    expect(document.querySelector('#toast')!.textContent).toContain('Side bar is back to the defaults.');
    [...document.querySelectorAll<HTMLButtonElement>('#toast button')].find((b) => b.textContent === 'Undo')!.click();
    await flush();
    expect(merge(data.sync[STORAGE_KEY]).chat.hide.sidebar).toBe(true);
  });

  it('search shows matches from every page and clears with Escape', () => {
    const box = document.querySelector<HTMLInputElement>('#search')!;
    box.value = 'nickname';
    box.dispatchEvent(new Event('input'));
    expect(document.querySelector('#page h1')!.textContent).toBe('Search');
    expect(document.querySelector('#page')!.textContent).toContain('Usercard · Usercard');
    expect(document.querySelector('[aria-current="page"]')).toBeNull();
    box.value = 'qqqq';
    box.dispatchEvent(new Event('input'));
    expect(document.querySelector('.empty')!.textContent).toContain('Nothing matches');
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('#page h1')!.textContent).toBe('Hide on Twitch');
  });
});
