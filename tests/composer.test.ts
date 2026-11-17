// @vitest-environment jsdom
// Tab completion and the emote menu: ranking as a pure module, then the DOM on Twitch- and
// Kick-shaped markup (message box, button slot), including stop() cleanup.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EmoteIndex } from '../src/chat/index';
import { emoteMenu, MENU_EVENT } from '../src/features/composer';
import { insertion, MAX_CHATTERS, tabComplete } from '../src/features/composer/tab';
import { complete, fold, rank, search, type Cand } from '../src/features/composer/rank';
import { emoteKey, Store, storeFor, USAGE_CAP } from '../src/features/composer/store';
import { shouldRun, type Feature, type FeatureContext } from '../src/features/types';
import { DEFAULT_ORDER } from '../src/providers';
import type { Emote, EmoteSet, ProviderId } from '../src/providers/types';
import { DEFAULTS, type Settings } from '../src/settings';
import type { Site } from '../src/sites/index';
import { kick } from '../src/sites/kick';
import { twitch } from '../src/sites/twitch';

const emote = (name: string, provider: ProviderId = '7tv', extra: Partial<Emote> = {}): Emote => ({
  provider,
  id: `${provider}-${name}`,
  name,
  zeroWidth: false,
  animated: false,
  images: [{ scale: 1, url: `https://cdn.example/${name}/1x.webp`, width: 32, height: 32 }],
  ...extra,
});
const em = (name: string, provider?: ProviderId): Cand => ({ name, kind: 'emote', provider });
const names = (l: { name: string }[]) => l.map((c) => c.name);
const ORDER: ProviderId[] = ['cyextv', '7tv', 'bttv', 'ffz'];

describe('rank', () => {
  it('orders the seven levels', () => {
    expect(rank('Kappa', 'Kappa')).toBe(7);
    expect(rank('Kappa', 'kappa')).toBe(6);
    expect(rank('KappaPride', 'kap')).toBe(5);
    expect(rank('peepoHappy', 'happy')).toBe(4);
    expect(rank('foo_bar-baz', 'baz')).toBe(4);
    expect(rank('catJAM2', '2')).toBe(4);
    expect(rank('xcatx', 'cat')).toBe(3);
    expect(rank('peepoHappy', 'ph')).toBe(2);
    expect(rank('peepoHappy', 'pphy')).toBe(0);
    expect(rank('peepoHappy', 'pphy', true)).toBe(1);
    expect(rank('abc', '')).toBe(0);
  });

  it('folds accents both ways', () => {
    expect(fold('café')).toBe('cafe');
    expect(rank('café', 'cafe')).toBe(7);
    expect(rank('Café', 'cafe')).toBe(6);
    expect(rank('cafe', 'CAFÉ')).toBe(6);
    expect(rank('crème', 'cre')).toBe(5);
  });

  it('splits parts at case runs', () => {
    expect(rank('XMLHttpRequest', 'http')).toBe(4);
    expect(rank('XMLHttpRequest', 'xml')).toBe(5);
    expect(rank('xmlHttpRequest', 'req')).toBe(4);
  });

  it('handles unicode, emoji and very long names', () => {
    expect(rank('Привет', 'при')).toBe(5);
    expect(rank('😀smile', 'smile')).toBe(3);
    expect(rank('a'.repeat(5000) + 'Tail', 'tail')).toBe(4);
  });
});

describe('complete', () => {
  it('leads with a name equal to the typed word in any case', () => {
    expect(names(complete('kappa', [em('KappaPride'), em('Kappa'), em('KappaHD')], ORDER))[0]).toBe('Kappa');
  });

  it('prefers the same case when two names are equal in any case', () => {
    expect(names(complete('Kappa', [em('kappa'), em('Kappa')], ORDER))).toEqual(['Kappa', 'kappa']);
  });

  it('leads with the shortest name that starts with it, ties A-Z', () => {
    const r = complete('ka', [em('KappaPride'), em('Kab'), em('Kaa'), em('KappaHD')], ORDER);
    expect(names(r).slice(0, 2)).toEqual(['Kaa', 'Kab']);
  });

  it('orders the rest by rank, then A-Z without case', () => {
    const r = complete('ha', [em('xhax'), em('peepoHappy'), em('Hat'), em('hag'), em('pHa')], ORDER);
    expect(names(r)).toEqual(['hag', 'Hat', 'peepoHappy', 'pHa', 'xhax']);
  });

  it('breaks dead heats by provider order, chatters last', () => {
    const items: Cand[] = [{ name: 'Same', kind: 'chatter' }, em('Sam', 'ffz'), em('Sa', 'bttv')];
    expect(names(complete('sa', items, ORDER))).toEqual(['Sa', 'Sam', 'Same']);
    const heat = complete('b', [em('Bb', 'ffz'), em('bb', '7tv')], ORDER);
    expect(heat.map((c) => c.provider)).toEqual(['7tv', 'ffz']);
    const dup = complete('x', [em('Xx', 'ffz'), em('Xx', '7tv')], ORDER);
    expect(dup).toHaveLength(1);
  });

  it('finds by acronym, never by letters in order', () => {
    expect(names(complete('ph', [em('peepoHappy'), em('pxhx')], ORDER))).toEqual(['peepoHappy']);
    expect(complete('pphy', [em('peepoHappy')], ORDER)).toEqual([]);
  });

  it('caps at 30 and ignores an empty query', () => {
    const many = Array.from({ length: 80 }, (_, i) => em(`emote${i}`));
    expect(complete('emote', many, ORDER)).toHaveLength(30);
    expect(complete('', many, ORDER)).toEqual([]);
    expect(complete('zzz', many, ORDER)).toEqual([]);
  });

  it('finds accented names from plain letters', () => {
    expect(names(complete('cafe', [em('Café'), em('cafeteria')], ORDER))[0]).toBe('Café');
  });
});

describe('search', () => {
  it('ranks, then most used, then keeps the menu order', () => {
    const items = [{ name: 'peepoHappy' }, { name: 'pHappy' }, { name: 'happy' }, { name: 'zzhappyzz' }];
    const r = search('happy', items, (i) => (i.name === 'pHappy' ? 5 : 0));
    expect(names(r)).toEqual(['happy', 'pHappy', 'peepoHappy', 'zzhappyzz']);
  });
  it('uses the count between equal ranks', () => {
    expect(names(search('ha', [{ name: 'hab' }, { name: 'hac' }], (i) => (i.name === 'hac' ? 3 : 0)))).toEqual(['hac', 'hab']);
  });
  it('lists letters-in-order matches last', () => {
    expect(names(search('pphy', [{ name: 'peepoHappy' }, { name: 'pphy' }], () => 0))).toEqual(['pphy', 'peepoHappy']);
  });
  it('gives nothing for an empty query and caps the results', () => {
    expect(search('', [{ name: 'a' }], () => 0)).toEqual([]);
    expect(search('a', Array.from({ length: 300 }, (_, i) => ({ name: `a${i}` })), () => 0, 50)).toHaveLength(50);
  });
});

describe('insertion', () => {
  it('adds a space, and @ and a comma for a first-word chatter', () => {
    expect(insertion('Kappa', 'emote', { at: false, first: true, comma: true })).toBe('Kappa ');
    expect(insertion('nora', 'chatter', { at: false, first: false, comma: true })).toBe('nora ');
    expect(insertion('nora', 'chatter', { at: true, first: false, comma: true })).toBe('@nora ');
    expect(insertion('nora', 'chatter', { at: true, first: true, comma: true })).toBe('@nora, ');
    expect(insertion('nora', 'chatter', { at: false, first: true, comma: true })).toBe('@nora, ');
    expect(insertion('nora', 'chatter', { at: true, first: true, comma: false })).toBe('@nora ');
  });
});

const fakeArea = (init: Record<string, unknown> = {}) => {
  const data: Record<string, unknown> = { ...init };
  const area: ExtStorageArea = {
    get: async (keys) => Object.fromEntries((Array.isArray(keys) ? keys : []).filter((k) => k in data).map((k) => [k, data[k]])),
    set: async (items) => void Object.assign(data, items),
  };
  return { area, data };
};

describe('store', () => {
  it('reads saved data, toggles favourites and counts', async () => {
    const { area, data } = fakeArea({ emoteFavorites: ['7tv:a', 5], emoteUsage: { '7tv:a': 3 }, emoteMenuTab: 'bttv' });
    const s = new Store(area);
    await s.ready;
    expect(s.favorites).toEqual(['7tv:a']);
    expect(s.count('7tv:a')).toBe(3);
    expect(s.tab).toBe('bttv');
    s.toggleFavorite('7tv:b');
    s.toggleFavorite('7tv:a');
    expect(data.emoteFavorites).toEqual(['7tv:b']);
    s.bump('7tv:b');
    expect((data.emoteUsage as Record<string, number>)['7tv:b']).toBe(1);
  });

  it('caps usage at 500 entries, dropping the least used', () => {
    const s = new Store(null);
    for (let i = 0; i < USAGE_CAP; i++) s.usage[`p:${i}`] = 10 + i;
    s.usage['p:low'] = 1;
    s.bump('p:new');
    expect(Object.keys(s.usage)).toHaveLength(USAGE_CAP);
    expect('p:low' in s.usage).toBe(false);
    expect(s.usage['p:new']).toBe(1);
  });

  it('shares one store per storage area', () => {
    const { area } = fakeArea();
    expect(storeFor(area)).toBe(storeFor(area));
    expect(storeFor(null)).not.toBe(storeFor(null));
  });
});

// ---- DOM ----

function setCaret(node: Node, offset: number) {
  const sel = document.getSelection()!;
  sel.removeAllRanges();
  const r = document.createRange();
  r.setStart(node, offset);
  r.collapse(true);
  sel.addRange(r);
}

function press(target: Element, key: string, init: KeyboardEventInit = {}) {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
}

function makeIndex(sets: EmoteSet[]) {
  const index = new EmoteIndex(DEFAULT_ORDER);
  index.setSets(sets);
  return index;
}

const SETS: EmoteSet[] = [
  {
    provider: '7tv',
    scope: 'channel',
    emotes: [
      emote('catJAM'),
      emote('peepoHappy'),
      emote('Kappa', '7tv', { animated: true, stills: [{ scale: 1, url: 'https://cdn.example/Kappa/still.webp', width: 32, height: 32 }] }),
    ],
  },
  { provider: 'bttv', scope: 'global', emotes: [emote('KappaPride', 'bttv'), emote('monkaS', 'bttv')] },
  { provider: 'ffz', scope: 'global', emotes: [emote('ZrehplaR', 'ffz')] },
];

function context(site: Site, over: Partial<FeatureContext> = {}, settings: Settings = DEFAULTS): FeatureContext {
  return {
    doc: document,
    site,
    settings,
    index: makeIndex(SETS),
    now: () => 0,
    channel: () => ({ platform: site.platform, id: '12345678', login: 'somechannel' }),
    others: () => [],
    local: null,
    ...over,
  };
}

const settingsWith = (chat: Partial<Settings['chat']>): Settings => ({ ...DEFAULTS, chat: { ...DEFAULTS.chat, ...chat } });

const TWITCH_COMPOSER = `
<div class="chat-input"><div data-a-target="chat-input" role="textbox" contenteditable="true"><span data-slate-node="element"><span data-slate-string="true"></span></span></div></div>
<div class="buttons"><div><button data-a-target="emote-picker-button">smile</button></div></div>`;
const KICK_COMPOSER = `
<div class="composer"><div><div id="message-input" data-testid="chat-input" contenteditable="true"></div></div><div class="actions"><button>send</button></div></div>`;

function type(site: Site, text: string): { input: HTMLElement; node: Text } {
  const input = site.chatInput(document)!;
  input.replaceChildren(document.createTextNode(text));
  const node = input.firstChild as Text;
  setCaret(node, text.length);
  return { input, node };
}

const msg = (login: string, display?: string) => {
  const m = document.createElement('div');
  if (display) m.innerHTML = `<span class="chat-author__display-name">${display}</span><button title="${login}">${display}</button>`;
  return { m, info: { sender: null, login, text: '', at: 1 } };
};

describe.each([
  ['twitch', twitch, TWITCH_COMPOSER],
  ['kick', kick, KICK_COMPOSER],
] as const)('tab completion on %s', (_n, site, html) => {
  let f: Feature;
  const say = (login: string, display?: string) => {
    const { m, info } = msg(login, display);
    f.message!(m, info);
  };
  beforeEach(() => {
    document.body.innerHTML = html;
    f = tabComplete();
  });
  afterEach(() => f.stop?.());

  it('completes the last word and keeps the rest', () => {
    f.start!(context(site));
    const { input } = type(site, 'hello cat');
    const e = press(input, 'Tab');
    expect(e.defaultPrevented).toBe(true);
    expect(input.textContent).toBe('hello catJAM ');
  });

  it('cycles with Tab, goes back with Shift+Tab, wraps, and any other key ends the cycle', () => {
    f.start!(context(site));
    const { input } = type(site, 'kap');
    press(input, 'Tab');
    expect(input.textContent).toBe('Kappa ');
    press(input, 'Tab');
    expect(input.textContent).toBe('KappaPride ');
    press(input, 'Tab');
    expect(input.textContent).toBe('Kappa ');
    press(input, 'Tab', { shiftKey: true });
    expect(input.textContent).toBe('KappaPride ');
    // Shift alone is not "another key"
    press(input, 'Shift');
    press(input, 'Tab');
    expect(input.textContent).toBe('Kappa ');
    // a letter ends the cycle; the next Tab completes the new word
    press(input, 'x');
    const node = input.lastChild as Text;
    node.data += 'cat';
    setCaret(node, node.length);
    press(input, 'Tab');
    expect(input.textContent).toContain('catJAM');
  });

  it('keeps an exact emote on the first Tab, then cycles', () => {
    f.start!(context(site));
    const { input } = type(site, 'Kappa');
    press(input, 'Tab');
    expect(input.textContent).toBe('Kappa ');
    press(input, 'Tab');
    expect(input.textContent).toBe('KappaPride ');
  });

  it('after @ offers only chatters and keeps the @', () => {
    f.start!(context(site));
    say('katsu');
    say('nora_byte');
    const { input } = type(site, 'hi @ka');
    press(input, 'Tab');
    expect(input.textContent).toBe('hi @katsu ');
    type(site, '@cat'); // an emote name, but no chatter matches
    expect(press(input, 'Tab').defaultPrevented).toBe(false);
  });

  it('offers chatters among emotes without @', () => {
    f.start!(context(site));
    say('monkey_joe');
    const { input } = type(site, 'monk');
    press(input, 'Tab');
    expect(input.textContent).toBe('monkaS ');
    press(input, 'Tab');
    expect(input.textContent).toBe('monkey_joe ');
  });

  it('writes @name, for a chatter first in the message with mentionComma', () => {
    f.start!(context(site, {}, settingsWith({ mentionComma: true })));
    say('zebra');
    const { input } = type(site, 'zeb');
    press(input, 'Tab');
    expect(input.textContent).toBe('@zebra, ');
    const second = type(site, 'hey zeb');
    press(second.input, 'Tab');
    expect(second.input.textContent).toBe('hey zebra ');
  });

  it('uses the display name when it is the login in other letters', () => {
    f.start!(context(site));
    say('nora_byte', 'Nora_Byte');
    const { input } = type(site, 'nora');
    press(input, 'Tab');
    expect(input.textContent).toBe('Nora_Byte ');
  });

  it('leaves Tab to the site with no candidate or an empty word', () => {
    f.start!(context(site));
    let { input } = type(site, 'qqqq');
    expect(press(input, 'Tab').defaultPrevented).toBe(false);
    ({ input } = type(site, 'hello '));
    expect(press(input, 'Tab').defaultPrevented).toBe(false);
    ({ input } = type(site, ''));
    expect(press(input, 'Tab').defaultPrevented).toBe(false);
  });

  it('ignores Tab outside the message box and with modifiers', () => {
    f.start!(context(site));
    const { input } = type(site, 'cat');
    expect(press(document.body, 'Tab').defaultPrevented).toBe(false);
    expect(press(input, 'Tab', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(input.textContent).toBe('cat');
  });

  it('keeps at most 500 chatters, the most recent', () => {
    f.start!(context(site));
    for (let i = 0; i < MAX_CHATTERS + 20; i++) say(`user${i}x`);
    const { input } = type(site, 'user0x');
    expect(press(input, 'Tab').defaultPrevented).toBe(false);
    type(site, 'user519x');
    expect(press(input, 'Tab').defaultPrevented).toBe(true);
  });

  it('counts the emote picked when the cycle ends', () => {
    const { area } = fakeArea();
    f.start!(context(site, { local: area }));
    const { input } = type(site, 'cat');
    press(input, 'Tab');
    press(input, 'x');
    expect(storeFor(area).count(emoteKey(emote('catJAM')))).toBe(1);
  });

  it('removes its listener on stop', () => {
    f.start!(context(site));
    f.stop!();
    const { input } = type(site, 'cat');
    expect(press(input, 'Tab').defaultPrevented).toBe(false);
    expect(input.textContent).toBe('cat');
  });
});

describe('tab completion in a textarea', () => {
  const textareaSite: Site = { ...twitch, chatInput: (doc) => doc.querySelector<HTMLElement>('textarea') };
  afterEach(() => (document.body.innerHTML = ''));
  it('replaces at the caret and sends an input event', () => {
    document.body.innerHTML = '<textarea></textarea>';
    const f = tabComplete();
    f.start!(context(textareaSite));
    const ta = document.querySelector('textarea')!;
    ta.value = 'yo cat and more';
    ta.setSelectionRange(6, 6);
    let inputs = 0;
    ta.addEventListener('input', () => inputs++);
    press(ta, 'Tab');
    expect(ta.value).toBe('yo catJAM  and more');
    expect(ta.selectionStart).toBe(10);
    expect(inputs).toBe(1);
    f.stop!();
  });
});

describe('emote menu', () => {
  let f: Feature;
  const panel = () => document.querySelector('.cyextv-em') as HTMLElement | null;
  const cellEls = () => [...document.querySelectorAll<HTMLElement>('.cyextv-em-cell')];
  const cellNames = () => cellEls().map((c) => c.title);
  const tabEls = () => [...document.querySelectorAll<HTMLElement>('.cyextv-em-tab')];
  const titles = () => [...document.querySelectorAll('.cyextv-em-title')].map((t) => t.textContent);
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const toggle = (detail?: { open?: boolean }) => document.dispatchEvent(new CustomEvent(MENU_EVENT, { detail }));
  const cell = (name: string) => cellEls().find((c) => c.title === name)!;
  const searchFor = (q: string) => {
    const box = document.querySelector<HTMLInputElement>('.cyextv-em-search')!;
    box.value = q;
    box.dispatchEvent(new Event('input'));
    return box;
  };

  beforeEach(() => {
    document.body.innerHTML = TWITCH_COMPOSER;
    f = emoteMenu();
  });
  afterEach(() => f.stop?.());

  it('puts the button before the site slot and styles it once', () => {
    f.start!(context(twitch));
    const btn = document.querySelector<HTMLButtonElement>('.cyextv-em-btn')!;
    expect(btn.nextElementSibling).toBe(twitch.inputButtonSlot(document));
    expect(btn.title).toBe('Emotes (Alt+E)');
    expect(document.querySelectorAll('#cyextv-emoteMenu')).toHaveLength(1);
  });

  it('puts the button back after the site re-renders it away', async () => {
    f.start!(context(twitch));
    document.querySelector('.cyextv-em-btn')!.remove();
    await new Promise((r) => setTimeout(r, 1100));
    expect(document.querySelectorAll('.cyextv-em-btn')).toHaveLength(1);
  });

  it('opens on click with Favorites, then a tab per provider that has emotes', () => {
    f.start!(context(twitch));
    document.querySelector<HTMLElement>('.cyextv-em-btn')!.click();
    expect(panel()).not.toBeNull();
    expect(tabEls().map((t) => t.textContent)).toEqual(['★ Favorites', '7TV', 'BetterTTV', 'FrankerFaceZ']);
    expect(document.activeElement).toBe(document.querySelector('.cyextv-em-search'));
    expect(document.querySelector('.cyextv-em-search')!.getAttribute('placeholder')).toBe('Find an emote');
  });

  it('shows Channel and Global sections inside a provider tab and remembers the tab', async () => {
    const { area, data } = fakeArea();
    f.start!(context(twitch, { local: area }));
    toggle();
    tabEls()[1]!.click();
    expect(cellNames()).toEqual(['catJAM', 'peepoHappy', 'Kappa']);
    expect(titles()).toEqual(['Channel']);
    expect(data.emoteMenuTab).toBe('7tv');
    tabEls()[2]!.click();
    expect(titles()).toEqual(['Global']);
    toggle({ open: false });
    expect(panel()).toBeNull();
    toggle({ open: true });
    await flush();
    expect(document.querySelector('.cyextv-em-tab[aria-selected="true"]')!.textContent).toBe('BetterTTV');
  });

  it('toggles with the event', () => {
    f.start!(context(twitch));
    toggle();
    expect(panel()).not.toBeNull();
    toggle();
    expect(panel()).toBeNull();
  });

  it('uses the still picture when animations are not on, and loads lazily', () => {
    f.start!(context(twitch, {}, { ...DEFAULTS, animations: 'off' }));
    toggle();
    tabEls()[1]!.click();
    const img = document.querySelector<HTMLImageElement>('.cyextv-em-cell[title="Kappa"] img')!;
    expect(img.src).toContain('still.webp');
    expect(img.loading).toBe('lazy');
  });

  it('searches with letters in order and Enter inserts the first match', () => {
    f.start!(context(twitch));
    const { input } = type(twitch, 'hi');
    toggle();
    searchFor('kappa');
    expect(cellNames()).toEqual(['Kappa', 'KappaPride']);
    searchFor('pphy');
    expect(cellNames()).toEqual(['peepoHappy']);
    const box = searchFor('kappa');
    press(box, 'Enter');
    expect(input.textContent).toBe('hi Kappa ');
    expect(panel()).toBeNull();
  });

  it('says so when nothing matches, and shows only Favorites for an empty channel', () => {
    f.start!(context(twitch));
    toggle();
    searchFor('zzzzqq');
    expect(document.querySelector('.cyextv-em-empty')!.textContent).toBe('No emote matches.');
    f.stop!();
    f = emoteMenu();
    f.start!(context(twitch, { index: makeIndex([]) }));
    toggle();
    expect(tabEls().map((t) => t.textContent)).toEqual(['★ Favorites']);
  });

  it('inserts on click with a leading space only when needed, and counts usage', () => {
    const { area } = fakeArea();
    f.start!(context(twitch, { local: area }));
    const { input } = type(twitch, 'hello');
    toggle();
    tabEls()[1]!.click();
    cell('catJAM').click();
    expect(input.textContent).toBe('hello catJAM ');
    expect(storeFor(area).count('7tv:7tv-catJAM')).toBe(1);
    expect(panel()).toBeNull();
    type(twitch, 'hello ');
    toggle();
    tabEls()[1]!.click();
    cell('Kappa').click();
    expect(input.textContent).toBe('hello Kappa ');
  });

  it('toggles a favourite on right-click and lists it first, then Most used by count', () => {
    const { area, data } = fakeArea();
    f.start!(context(twitch, { local: area }));
    toggle();
    tabEls()[1]!.click();
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    cell('peepoHappy').dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(data.emoteFavorites).toEqual(['7tv:7tv-peepoHappy']);
    expect(titles()).toEqual(['Favorites', 'Channel']);
    tabEls()[0]!.click();
    expect(cellNames()).toEqual(['peepoHappy']);
    storeFor(area).bump('bttv:bttv-monkaS');
    storeFor(area).bump('bttv:bttv-monkaS');
    storeFor(area).bump('7tv:7tv-catJAM');
    tabEls()[0]!.click();
    expect(titles()).toEqual(['Favorites', 'Most used']);
    expect(cellNames()).toEqual(['peepoHappy', 'monkaS', 'catJAM']);
    cellEls()[0]!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(data.emoteFavorites).toEqual([]);
  });

  it('explains the empty Favorites tab', () => {
    f.start!(context(twitch));
    toggle();
    expect(document.querySelector('.cyextv-em-empty')!.textContent).toContain('Right-click');
  });

  it('moves in the grid with arrows and closes on Escape', () => {
    f.start!(context(twitch));
    const { input } = type(twitch, '');
    toggle();
    tabEls()[1]!.click();
    const box = document.querySelector<HTMLInputElement>('.cyextv-em-search')!;
    press(box, 'ArrowDown');
    const cells = cellEls();
    expect(document.activeElement).toBe(cells[0]);
    press(cells[0]!, 'ArrowRight');
    expect(document.activeElement).toBe(cells[1]);
    press(cells[1]!, 'ArrowLeft');
    expect(document.activeElement).toBe(cells[0]);
    press(cells[0]!, 'ArrowUp');
    expect(document.activeElement).toBe(box);
    expect(press(box, 'Escape').defaultPrevented).toBe(true);
    expect(panel()).toBeNull();
    expect(input.textContent).toBe('');
  });

  it('inserts the focused emote on click via keyboard activation target', () => {
    f.start!(context(twitch));
    const { input } = type(twitch, '');
    toggle();
    tabEls()[1]!.click();
    cellEls()[1]!.click();
    expect(input.textContent).toBe('peepoHappy ');
  });

  it('closes on an outside click and when the channel changes', async () => {
    let id = '12345678';
    f.start!(context(twitch, { channel: () => ({ platform: 'twitch', id, login: 'a' }) }));
    toggle();
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(panel()).toBeNull();
    toggle();
    panel()!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(panel()).not.toBeNull();
    id = '87654321';
    await new Promise((r) => setTimeout(r, 1100));
    expect(panel()).toBeNull();
  });

  it('works on Kick markup too', () => {
    document.body.innerHTML = KICK_COMPOSER;
    f.start!(context(kick));
    const btn = document.querySelector('.cyextv-em-btn')!;
    expect(btn.nextElementSibling).toBe(document.querySelector('.actions'));
    expect(kick.inputButtonSlot(document)).toBe(btn);
    f.stop!();
    f.start!(context(kick));
    expect(document.querySelectorAll('.cyextv-em-btn')).toHaveLength(1);
    const { input } = type(kick, 'x');
    toggle();
    press(searchFor('cat'), 'Enter');
    expect(input.textContent).toBe('x catJAM ');
  });

  it('cleans up on stop', () => {
    f.start!(context(twitch));
    toggle();
    f.stop!();
    expect(panel()).toBeNull();
    expect(document.querySelector('.cyextv-em-btn')).toBeNull();
    expect(document.getElementById('cyextv-emoteMenu')).toBeNull();
    toggle();
    expect(panel()).toBeNull();
  });

  it('stays off when switched off or when another extension has the feature', () => {
    expect(shouldRun(f, settingsWith({ emoteMenu: false }), [])).toBe(false);
    expect(shouldRun(f, DEFAULTS, ['7tv'])).toBe(false);
    expect(shouldRun(tabComplete(), DEFAULTS, ['ffz'])).toBe(false);
    expect(shouldRun(tabComplete(), DEFAULTS, [])).toBe(true);
  });
});

describe('EmoteIndex.all', () => {
  it('lists the channel first, then global names the channel does not hide', () => {
    const index = makeIndex([
      { provider: '7tv', scope: 'global', emotes: [emote('Kappa'), emote('Global1')] },
      { provider: 'bttv', scope: 'channel', emotes: [emote('Kappa', 'bttv'), emote('Mine', 'bttv')] },
    ]);
    expect(index.all().map((e) => `${e.provider}:${e.name}`)).toEqual(['bttv:Kappa', 'bttv:Mine', '7tv:Global1']);
    expect(index.isChannel(index.all()[0]!)).toBe(true);
    expect(index.isChannel(index.all()[2]!)).toBe(false);
    expect(new EmoteIndex(DEFAULT_ORDER).all()).toEqual([]);
  });
});
