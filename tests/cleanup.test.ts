// @vitest-environment jsdom
// Clean up: hiding page parts, auto-claiming points, rich emote tooltips.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMOTE_CLASS, emoteElement } from '../src/chat/render';
import { COOLDOWN_MS, POLL_MS, autoClaim, clickable } from '../src/features/cleanup/auto-claim';
import { clutterCss, hideClutter } from '../src/features/cleanup/hide-clutter';
import { partsOf, place, richTooltips } from '../src/features/cleanup/rich-tooltips';
import { shouldRun, type FeatureContext } from '../src/features/types';
import { FEATURES } from '../src/features/index';
import type { Emote } from '../src/providers/types';
import { CLUTTER, DEFAULTS, type Settings } from '../src/settings';
import { kick } from '../src/sites/kick';
import { twitch } from '../src/sites/twitch';
import type { Site } from '../src/sites/index';

const withChat = (chat: Partial<Settings['chat']>, rest: Partial<Settings> = {}): Settings => ({ ...DEFAULTS, ...rest, chat: { ...DEFAULTS.chat, ...chat } });
const hide = (...keys: (typeof CLUTTER)[number][]) => ({ ...DEFAULTS.chat.hide, ...Object.fromEntries(keys.map((k) => [k, true])) });

function ctx(site: Site, settings: Settings, now = () => Date.now()): FeatureContext {
  return { doc: document, site, settings, index: null as never, now, channel: () => null, others: () => [], local: null };
}

const emote = (name: string, extra: Partial<Emote> = {}): Emote => ({
  provider: '7tv',
  id: name,
  name,
  zeroWidth: false,
  animated: false,
  images: [
    { scale: 1, url: `https://cdn/${name}/1x.webp`, width: 32, height: 32 },
    { scale: 4, url: `https://cdn/${name}/4x.webp`, width: 128, height: 128 },
    { scale: 2, url: `https://cdn/${name}/2x.webp`, width: 64, height: 64 },
  ],
  ...extra,
});

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});
afterEach(() => vi.useRealTimers());

describe('hideClutter', () => {
  it('is on only when a key is on', () => {
    const f = hideClutter();
    expect(f.enabled(DEFAULTS)).toBe(false);
    expect(f.enabled(withChat({ hide: hide('bits') }))).toBe(true);
  });

  it('writes one rule per switched-on key and skips keys the site lacks', () => {
    expect(clutterCss(hide('bits', 'points'), { bits: '.b', points: '.p', leaderboard: '.l' })).toBe('.b { display: none !important; }\n.p { display: none !important; }');
    expect(clutterCss(hide('bits'), {})).toBe('');
    expect(clutterCss(DEFAULTS.chat.hide, { bits: '.b' })).toBe('');
  });

  it('injects one style, hides the matches and removes it on stop', () => {
    document.body.innerHTML = '<div data-a-target="bits-button">b</div><div class="community-points-summary">p</div>';
    const f = hideClutter();
    f.start!(ctx(twitch, withChat({ hide: hide('bits') })));
    const style = document.getElementById('cyextv-hideClutter')!;
    expect(style.textContent).toContain('[data-a-target="bits-button"]');
    expect(style.textContent).not.toContain('community-points-summary');
    expect(document.querySelectorAll('#cyextv-hideClutter')).toHaveLength(1);
    f.stop!();
    expect(document.getElementById('cyextv-hideClutter')).toBeNull();
    f.stop!();
  });

  it('adds nothing on Kick, which has no selectors yet', () => {
    const f = hideClutter();
    f.start!(ctx(kick, withChat({ hide: hide('bits') })));
    expect(document.getElementById('cyextv-hideClutter')).toBeNull();
  });

  it('has valid selector lists for every Twitch key', () => {
    for (const k of CLUTTER) {
      const sel = twitch.clutter[k];
      expect(sel, k).toBeTruthy();
      expect(() => document.querySelectorAll(sel!)).not.toThrow();
    }
  });
});

describe('autoClaim', () => {
  const claim = (extra = '') => {
    document.body.innerHTML = `<div class="community-points-summary"><button ${extra}><span class="claimable-bonus__icon"></span></button></div>`;
    const button = document.querySelector('button')!;
    const spy = vi.fn();
    button.addEventListener('click', spy);
    return spy;
  };

  it('is off by default and left to the other extensions', () => {
    const f = autoClaim();
    expect(f.enabled(DEFAULTS)).toBe(false);
    expect(f.enabled(withChat({ autoClaim: true }))).toBe(true);
    expect(shouldRun(f, withChat({ autoClaim: true }), ['7tv'])).toBe(false);
    expect(shouldRun(f, withChat({ autoClaim: true, }, { overrideOthers: true }), ['7tv'])).toBe(true);
  });

  it('clicks on the poll, at most once per cooldown', () => {
    vi.useFakeTimers();
    let t = 0;
    const spy = claim();
    const f = autoClaim();
    f.start!(ctx(twitch, withChat({ autoClaim: true }), () => t));
    t = POLL_MS;
    vi.advanceTimersByTime(POLL_MS);
    expect(spy).toHaveBeenCalledTimes(1);
    t += POLL_MS;
    vi.advanceTimersByTime(POLL_MS);
    expect(spy).toHaveBeenCalledTimes(1); // inside the cooldown
    t += COOLDOWN_MS;
    vi.advanceTimersByTime(POLL_MS);
    expect(spy).toHaveBeenCalledTimes(2);
    f.stop!();
  });

  it('ignores a disabled button and clicks nothing without one', () => {
    vi.useFakeTimers();
    const spy = claim('disabled');
    const f = autoClaim();
    f.start!(ctx(twitch, withChat({ autoClaim: true })));
    vi.advanceTimersByTime(POLL_MS * 3);
    expect(spy).not.toHaveBeenCalled();
    document.body.innerHTML = '';
    vi.advanceTimersByTime(POLL_MS);
    f.stop!();
    expect(clickable(null)).toBe(false);
  });

  it('reacts to the button appearing, and stops cleanly', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div class="community-points-summary"></div>';
    const f = autoClaim();
    f.start!(ctx(twitch, withChat({ autoClaim: true })));
    const area = document.querySelector('.community-points-summary')!;
    area.innerHTML = '<button><span class="claimable-bonus__icon"></span></button>';
    const spy = vi.fn();
    area.querySelector('button')!.addEventListener('click', spy);
    area.append(document.createElement('i')); // a second change in the same tick
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    expect(spy.mock.calls.length).toBeLessThanOrEqual(1);
    f.stop!();
    vi.advanceTimersByTime(POLL_MS * 4);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('never claims on Kick', () => {
    vi.useFakeTimers();
    const f = autoClaim();
    f.start!(ctx(kick, withChat({ autoClaim: true })));
    vi.advanceTimersByTime(POLL_MS * 2);
    f.stop!();
  });
});

describe('emote data for tooltips', () => {
  it('adds name, owner and the largest image, and keeps title and provider', () => {
    const e = emote('catJAM', { owner: 'lumen_fox' });
    const el = emoteElement(document, { kind: 'emote', text: 'catJAM', emote: e, overlays: [] } as never, { animations: 'on', tooltips: true });
    expect(el.dataset).toMatchObject({ provider: '7tv', name: 'catJAM', owner: 'lumen_fox', big: 'https://cdn/catJAM/4x.webp', text: 'catJAM' });
    expect(el.title).toBe('catJAM\n7TV · by lumen_fox');
  });

  it('omits owner when unknown', () => {
    const el = emoteElement(document, { kind: 'emote', text: 'x', emote: emote('x'), overlays: [] } as never, { animations: 'on', tooltips: false });
    expect(el.dataset.owner).toBeUndefined();
    expect(el.title).toBe('');
  });
});

describe('richTooltips', () => {
  const make = (overlay = true) => {
    const el = emoteElement(
      document,
      { kind: 'emote', text: 'catJAM', emote: emote('catJAM', { owner: 'lumen_fox' }), overlays: overlay ? [emote('w!', { provider: 'bttv', zeroWidth: true })] : [] } as never,
      { animations: 'on', tooltips: true },
    );
    document.body.append(el);
    return el;
  };
  const fire = (el: Element, type: string) => el.dispatchEvent(new MouseEvent(type, { bubbles: true }));

  it('needs the setting and the site tooltips setting', () => {
    const f = richTooltips();
    expect(f.enabled(DEFAULTS)).toBe(true);
    expect(f.enabled(withChat({ richTooltips: false }))).toBe(false);
    expect(f.enabled(withChat({}, { tooltips: false }))).toBe(false);
    expect(f.providedBy).toBeUndefined();
  });

  it('shows a card with the emote and each overlay, moves the title, hides on mouseout', () => {
    const f = richTooltips();
    f.start!(ctx(twitch, DEFAULTS));
    const el = make();
    fire(el.querySelector('img')!, 'mouseover');
    expect(el.hasAttribute('title')).toBe(false);
    expect(el.dataset.cyextvTip).toContain('catJAM');
    const card = document.querySelector('.cyextv-tip')!;
    expect(card.querySelectorAll('.cyextv-tip-part')).toHaveLength(2);
    expect(card.querySelector('img')!.getAttribute('src')).toBe('https://cdn/catJAM/4x.webp');
    expect(card.querySelector('.cyextv-tip-name')!.textContent).toBe('catJAM');
    expect(card.querySelector('.cyextv-tip-by')!.textContent).toBe('7TV · by lumen_fox');
    expect(card.textContent).toContain('BTTV');
    fire(el, 'mouseout');
    expect(document.querySelector('.cyextv-tip')).toBeNull();
    f.stop!();
  });

  it('hides on scroll, ignores other elements, and replaces the card on the next emote', () => {
    const f = richTooltips();
    f.start!(ctx(twitch, DEFAULTS));
    const a = make(false);
    const b = make(false);
    document.body.insertAdjacentHTML('beforeend', '<p id="p">hi</p>');
    fire(document.getElementById('p')!, 'mouseover');
    expect(document.querySelector('.cyextv-tip')).toBeNull();
    fire(a, 'mouseover');
    fire(b, 'mouseover');
    expect(document.querySelectorAll('.cyextv-tip')).toHaveLength(1);
    document.dispatchEvent(new Event('scroll'));
    expect(document.querySelector('.cyextv-tip')).toBeNull();
    f.stop!();
  });

  it('cleans up listeners, card and style on stop', () => {
    const f = richTooltips();
    f.start!(ctx(twitch, DEFAULTS));
    const el = make();
    fire(el, 'mouseover');
    f.stop!();
    expect(document.querySelector('.cyextv-tip')).toBeNull();
    expect(document.getElementById('cyextv-richTooltips')).toBeNull();
    fire(el, 'mouseover');
    expect(document.querySelector('.cyextv-tip')).toBeNull();
  });

  it('survives long and unicode names (text only, no markup)', () => {
    const f = richTooltips();
    f.start!(ctx(twitch, DEFAULTS));
    const el = emoteElement(document, { kind: 'emote', text: 'x', emote: emote('<b>'.repeat(50) + '猫'), overlays: [] } as never, { animations: 'on', tooltips: true });
    document.body.append(el);
    fire(el, 'mouseover');
    expect(document.querySelector('.cyextv-tip b')).toBeNull();
    expect(document.querySelector('.cyextv-tip-name')!.textContent).toContain('猫');
    f.stop!();
  });

  it('partsOf skips nameless elements', () => {
    expect(partsOf(document.createElement('span'))).toEqual([]);
  });

  it('place flips and clamps inside the viewport', () => {
    const view = { width: 400, height: 300 };
    const card = { width: 100, height: 80 };
    const rect = (l: number, t: number, w = 28, h = 28) => ({ left: l, top: t, width: w, height: h, right: l + w, bottom: t + h }) as DOMRect;
    expect(place(rect(200, 200), card, view)).toEqual({ left: 164, top: 112 }); // above
    expect(place(rect(200, 10), card, view).top).toBe(46); // below when no room above
    expect(place(rect(0, 200), card, view).left).toBe(4);
    expect(place(rect(390, 200), card, view).left).toBe(296);
    expect(place(rect(200, 290), card, { width: 400, height: 100 }).top).toBeGreaterThanOrEqual(4);
  });
});

describe('registration', () => {
  it('registers the three features with unique ids', () => {
    const ids = FEATURES.map((f) => f().id);
    expect(ids).toEqual(expect.arrayContaining(['hideClutter', 'autoClaim', 'richTooltips']));
    expect(new Set(ids).size).toBe(ids.length);
    expect(EMOTE_CLASS).toBe('cyextv-emote');
  });
});
