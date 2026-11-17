// @vitest-environment jsdom
// The welcome page: the steps, skipping, what finishing writes, when it opens, and the theme.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLEAN_TWITCH, ONBOARDING_KEY, ONBOARDING_VERSION, apply, back, initial, next, readProgress, shouldShow, skip } from '../src/onboarding/model';
import { DEFAULTS, STORAGE_KEY, merge } from '../src/settings';
import { THEME_MIRROR, applyTheme, readMirror, resolveTheme } from '../src/ui/theme';

describe('steps', () => {
  it('starts on the providers with the defaults pre-ticked and Keep as it is picked', () => {
    const s = initial(DEFAULTS);
    expect(s.step).toBe('providers');
    expect(Object.values(s.choices.emotes).every(Boolean)).toBe(true);
    expect(s.choices.preset).toBe('asIs');
    expect(s.choices.readableColors).toBe(true);
    expect(s.choices.timestamps).toBe(false);
  });

  it('goes forward and back within the three steps', () => {
    let s = initial(DEFAULTS);
    s = next(s);
    expect(s.step).toBe('looks');
    s = next(next(s));
    expect(s.step).toBe('done');
    expect(back(back(back(s))).step).toBe('providers');
  });

  it('skips from any step to the end, keeping the settings as they were', () => {
    for (const start of [initial(DEFAULTS), next(initial(DEFAULTS))]) {
      const changed = { ...start, choices: { ...start.choices, preset: 'clean' as const, timestamps: true } };
      const s = skip(changed);
      expect(s.step).toBe('done');
      expect(apply(DEFAULTS, s)).toBe(DEFAULTS);
    }
  });

  it('applies the choices on finish: providers, Clean Twitch, colours and timestamps', () => {
    const s = initial(DEFAULTS);
    s.choices = { emotes: { ...s.choices.emotes, bttv: false }, preset: 'clean', readableColors: false, timestamps: true };
    const out = apply(DEFAULTS, next(next(s)));
    expect(out.emotes.bttv).toBe(false);
    expect(out.emotes['7tv']).toBe(true);
    for (const k of CLEAN_TWITCH) expect(out.chat.hide[k], k).toBe(true);
    expect(out.chat.hide.sidebar).toBe(false);
    expect(out.chat.readableColors).toBe(false);
    expect(out.chat.timestamps).toBe(true);
  });

  it('"Keep it as it is" never undoes parts you hid yourself, and reopening shows Clean when it is on', () => {
    const own = merge({ chat: { hide: { sidebar: true, topPrime: true } } });
    expect(apply(own, next(next(initial(own)))).chat.hide).toEqual(own.chat.hide);
    const clean = merge({ chat: { hide: Object.fromEntries(CLEAN_TWITCH.map((k) => [k, true])) } });
    expect(initial(clean).choices.preset).toBe('clean');
  });
});

describe('when it opens', () => {
  it('opens on a fresh install only, and not again once finished', () => {
    expect(shouldShow('install', undefined)).toBe(true);
    expect(shouldShow('update', undefined)).toBe(false);
    expect(shouldShow('browser_update', undefined)).toBe(false);
    expect(shouldShow('install', { done: true, version: ONBOARDING_VERSION, at: 1 })).toBe(false);
    expect(shouldShow('install', { done: true, version: 0 })).toBe(true);
    expect(readProgress('junk')).toBeNull();
  });
});

describe('theme', () => {
  afterEach(() => {
    delete document.documentElement.dataset.theme;
    localStorage.clear();
  });
  it('resolves system from the OS and sets data-theme for light only', () => {
    expect(resolveTheme('system', true)).toBe('light');
    expect(resolveTheme('system', false)).toBe('dark');
    applyTheme(document, 'light');
    expect(document.documentElement.dataset.theme).toBe('light');
    applyTheme(document, 'dark');
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
  it('reads the mirror, dark when unset or junk', () => {
    expect(readMirror(document)).toBe('dark');
    localStorage.setItem(THEME_MIRROR, 'light');
    expect(readMirror(document)).toBe('light');
    localStorage.setItem(THEME_MIRROR, 'neon');
    expect(readMirror(document)).toBe('dark');
  });
  it('keeps the theme setting valid', () => {
    expect(DEFAULTS.theme).toBe('dark');
    expect(merge({ theme: 'system' }).theme).toBe('system');
    expect(merge({ theme: 'pink' }).theme).toBe('dark');
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
  const buttons = () => [...document.querySelectorAll<HTMLButtonElement>('#step button')];
  const press = (text: string) => buttons().find((b) => b.textContent === text)!.click();

  beforeEach(async () => {
    data.sync = {};
    data.local = {};
    vi.resetModules();
    const api = {
      runtime: { id: 'x', openOptionsPage: vi.fn(async () => {}), getURL: (p: string) => p, sendMessage: vi.fn(), onMessage: { addListener() {} }, onInstalled: { addListener() {} } },
      tabs: { query: async () => [], create: vi.fn(async () => ({})) },
      storage: { sync: area(data.sync), local: area(data.local), onChanged: { addListener() {} } },
    };
    vi.stubGlobal('chrome', api);
    document.body.innerHTML = '<main id="step"></main>';
    await import('../src/onboarding/index');
    await flush();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows step 1 with a skip on it, every provider ticked', () => {
    expect(document.querySelector('h1')!.textContent).toBe('Which emotes should show?');
    expect(document.querySelector('.label')!.textContent).toBe('Step 1 of 3');
    expect(buttons().map((b) => b.textContent)).toEqual(['Skip, use defaults', 'Next']);
    expect([...document.querySelectorAll<HTMLInputElement>('.switch')].every((i) => i.checked)).toBe(true);
  });

  it('skipping marks it done and writes no settings', async () => {
    press('Skip, use defaults');
    await flush();
    expect(document.querySelector('h1')!.textContent).toBe('You’re set');
    expect(data.sync[STORAGE_KEY]).toBeUndefined();
    expect(readProgress(data.local[ONBOARDING_KEY])?.done).toBe(true);
    expect(document.activeElement).toBe(document.querySelector('h1'));
  });

  it('finishing saves the choices, with a radio group and skip on step 2', async () => {
    const sw = document.querySelectorAll<HTMLInputElement>('.switch');
    sw[2]!.click();
    press('Next');
    await flush();
    expect(document.querySelector('h1')!.textContent).toBe('How should Twitch look?');
    expect(document.querySelector('[role="radiogroup"]')).not.toBeNull();
    expect(buttons().map((b) => b.textContent)).toContain('Skip, use defaults');
    const clean = document.querySelector<HTMLInputElement>('input[value="clean"]')!;
    clean.click();
    expect(clean.closest('.choice')!.classList.contains('on')).toBe(true);
    press('Save and finish');
    await flush();
    const saved = merge(data.sync[STORAGE_KEY]);
    expect(saved.emotes[DEFAULTS.order[2]!]).toBe(false);
    expect(saved.chat.hide.topPrime).toBe(true);
    expect(readProgress(data.local[ONBOARDING_KEY])?.version).toBe(ONBOARDING_VERSION);
    expect(document.querySelector('a[href="https://cyex.tv"]')).not.toBeNull();
  });
});
