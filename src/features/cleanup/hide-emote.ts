// Hide an emote: right-click one of our emotes in chat and pick "Hide this emote". The list is
// kept on this device (storage.local), managed on the settings page (Emotes and badges), and
// applied with CSS keyed by the emote's provider and ID, so it works at once on every message on
// screen and nothing is rewritten. A hidden emote shows as its name or as nothing (a setting).
// Shift or Ctrl with the right button keeps the browser's own menu.
import { EMOTE_CLASS } from '../../chat/render';
import { DEFAULT_ORDER } from '../../providers';
import type { ProviderId } from '../../providers/types';
import { resolveTheme } from '../../ui/theme';
import type { Feature, FeatureContext } from '../types';

export const HIDDEN_EMOTES_KEY = 'hiddenEmotes';
export const HIDDEN_EMOTES_MAX = 200;

export type HiddenEmote = { provider: ProviderId; id: string; name: string; /** Its smallest picture, for the settings list. */ url: string };

const ID = /^[\w-]{1,64}$/;
export const emoteKey = (e: Pick<HiddenEmote, 'provider' | 'id'>) => `${e.provider}:${e.id}`;

/** Stored entries, checked: known providers, plain IDs, https pictures, capped, no duplicates. */
export function readHidden(stored: unknown): HiddenEmote[] {
  if (!Array.isArray(stored)) return [];
  const seen = new Set<string>();
  const out: HiddenEmote[] = [];
  for (const v of stored) {
    if (out.length >= HIDDEN_EMOTES_MAX) break;
    if (typeof v !== 'object' || v === null) continue;
    const o = v as Record<string, unknown>;
    const provider = DEFAULT_ORDER.find((p) => p === o.provider);
    if (!provider || typeof o.id !== 'string' || !ID.test(o.id) || typeof o.name !== 'string' || !o.name.trim()) continue;
    const url = typeof o.url === 'string' && /^https:\/\//.test(o.url) && o.url.length <= 400 ? o.url : '';
    const entry = { provider, id: o.id, name: o.name.trim().slice(0, 60), url };
    if (seen.has(emoteKey(entry))) continue;
    seen.add(emoteKey(entry));
    out.push(entry);
  }
  return out;
}

/** The hidden emotes for this content script or page: loaded once, saved on change, listeners told. */
export class HiddenEmotesStore {
  private items: HiddenEmote[] = [];
  private listeners = new Set<() => void>();
  private local: ExtStorageArea | null = null;

  async load(local: ExtStorageArea | null): Promise<void> {
    this.local = local;
    if (!local) return;
    try {
      this.replace((await local.get(HIDDEN_EMOTES_KEY))[HIDDEN_EMOTES_KEY]);
    } catch {
      /* no storage: nothing hidden */
    }
  }

  /** Takes a new stored value (another tab or the settings page changed it). */
  replace(stored: unknown): void {
    this.items = readHidden(stored);
    for (const l of this.listeners) l();
  }

  list(): HiddenEmote[] {
    return [...this.items];
  }

  has(e: Pick<HiddenEmote, 'provider' | 'id'>): boolean {
    return this.items.some((x) => emoteKey(x) === emoteKey(e));
  }

  async add(e: HiddenEmote): Promise<void> {
    if (this.has(e)) return;
    await this.set(readHidden([...this.items, e]));
  }

  async remove(e: Pick<HiddenEmote, 'provider' | 'id'>): Promise<void> {
    await this.set(this.items.filter((x) => emoteKey(x) !== emoteKey(e)));
  }

  /** Replaces the whole list (unhide all, or undoing that). */
  async set(items: HiddenEmote[]): Promise<void> {
    this.items = readHidden(items);
    for (const l of this.listeners) l();
    await this.local?.set({ [HIDDEN_EMOTES_KEY]: this.items }).catch(() => {});
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

/** The one store the content script shares. */
export const hiddenEmotes = new HiddenEmotesStore();

/** The rules that hide the emotes in `list`: as their name (`text`) or not at all (`none`). */
export function hiddenEmoteCss(list: readonly HiddenEmote[], style: 'text' | 'none'): string {
  return list
    .map((e) => {
      const sel = `[data-provider="${e.provider}"][data-id="${e.id}"]`;
      const overlay = `img.cyextv-over${sel}{display:none!important}`;
      if (style === 'none') return `.${EMOTE_CLASS}${sel}{display:none!important}${overlay}`;
      return `.${EMOTE_CLASS}${sel}{display:inline!important;margin:0!important;line-height:inherit!important}.${EMOTE_CLASS}${sel}>img{display:none!important}.${EMOTE_CLASS}${sel}::after{content:attr(data-text)}${overlay}`;
    })
    .join('\n');
}

const HOST_ID = 'cyextv-emote-menu';
const MENU_CSS = `
:host { all: initial; position: fixed; z-index: 2147483000; }
:host { --surface:#26272c; --hover:#2d2e34; --border:#43454d; --text:#e8e8ea; --dim:#9fa1a9; --accent-text:#7ea4ff; --font:'IBM Plex Sans','Segoe UI Variable Text','Segoe UI',system-ui,sans-serif; }
:host([data-theme='light']) { --surface:#fff; --hover:#f6f6f7; --border:#c4c6cc; --text:#1b1c20; --dim:#6b6d76; --accent-text:#046a82; }
* { box-sizing: border-box; }
.menu { min-width: 190px; max-width: 260px; background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 6px; box-shadow: 0 8px 24px rgba(0,0,0,.35); font: 13px/1.4 var(--font); overflow: hidden; }
.head { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-bottom: 1px solid var(--border); }
.head img { height: 28px; width: auto; max-width: 56px; object-fit: contain; }
.who { display: grid; min-width: 0; }
.who b { font-weight: 600; overflow-wrap: anywhere; }
.who span { color: var(--dim); font-size: .75rem; }
button { display: block; width: 100%; height: 34px; padding: 0 10px; border: 0; background: none; color: var(--text); font: inherit; text-align: left; cursor: pointer; }
button:hover, button:focus-visible { background: var(--hover); outline: none; }
button:focus-visible { box-shadow: inset 2px 0 var(--accent-text); font-weight: 600; }
`;
const PROVIDER_NAME: Record<ProviderId, string> = { cyextv: 'cyex.tv', '7tv': '7TV', bttv: 'BTTV', ffz: 'FFZ' };

/** What a right-clicked emote element is, or null when it can't be told (no ID). */
export function emoteOf(wrap: HTMLElement): HiddenEmote | null {
  const provider = DEFAULT_ORDER.find((p) => p === wrap.dataset.provider);
  const id = wrap.dataset.id ?? '';
  const name = wrap.dataset.name ?? '';
  if (!provider || !ID.test(id) || !name) return null;
  const img = wrap.querySelector<HTMLImageElement>('img:not(.cyextv-over)');
  const src = img?.getAttribute('src') ?? '';
  return { provider, id, name, url: /^https:\/\//.test(src) ? src : '' };
}

export function hideEmotes(store: HiddenEmotesStore = hiddenEmotes): Feature {
  let ctx: FeatureContext | null = null;
  let style: HTMLStyleElement | null = null;
  let off: (() => void) | null = null;
  let menu: HTMLElement | null = null;
  let closeMenu: (() => void) | null = null;

  const draw = () => {
    if (style && ctx) style.textContent = hiddenEmoteCss(store.list(), ctx.settings.chat.hiddenEmoteStyle);
  };

  const onContext = (e: MouseEvent) => {
    if (!ctx || e.shiftKey || e.ctrlKey || e.metaKey) return;
    const target = e.target instanceof Element ? e.target : null;
    const wrap = target?.closest<HTMLElement>(`.${EMOTE_CLASS}`);
    // Only emotes in chat lines; the emote menu has its own right-click (favourites).
    if (!wrap || !wrap.closest(ctx.site.messageSelector)) return;
    const emote = emoteOf(wrap);
    if (!emote) return;
    e.preventDefault();
    e.stopPropagation();
    open(emote, e.clientX, e.clientY);
  };

  const open = (emote: HiddenEmote, x: number, y: number) => {
    if (!ctx) return;
    const doc = ctx.doc;
    closeMenu?.();
    const hidden = store.has(emote);
    const host = doc.createElement('div');
    host.id = HOST_ID;
    host.setAttribute('data-cyextv', '');
    host.dataset.theme = resolveTheme(ctx.settings.theme, doc.defaultView?.matchMedia?.('(prefers-color-scheme: light)').matches ?? false);
    const root = host.attachShadow({ mode: 'open' });
    const css = doc.createElement('style');
    css.textContent = MENU_CSS;
    const panel = doc.createElement('div');
    panel.className = 'menu';
    panel.setAttribute('role', 'menu');
    panel.setAttribute('aria-label', emote.name);
    const head = doc.createElement('div');
    head.className = 'head';
    if (emote.url) {
      const img = doc.createElement('img');
      img.src = emote.url;
      img.alt = '';
      img.addEventListener('error', () => img.remove());
      head.append(img);
    }
    const who = doc.createElement('span');
    who.className = 'who';
    const name = doc.createElement('b');
    name.textContent = emote.name;
    const by = doc.createElement('span');
    by.textContent = PROVIDER_NAME[emote.provider];
    who.append(name, by);
    head.append(who);
    const item = doc.createElement('button');
    item.type = 'button';
    item.setAttribute('role', 'menuitem');
    item.textContent = hidden ? 'Show this emote' : 'Hide this emote';
    panel.append(head, item);
    root.append(css, panel);
    (doc.body ?? doc.documentElement).append(host);
    menu = host;

    const view = doc.defaultView;
    const w = panel.offsetWidth || 200;
    const h = panel.offsetHeight || 80;
    const vw = view?.innerWidth ?? 1000;
    const vh = view?.innerHeight ?? 800;
    host.style.left = `${Math.max(4, Math.min(x, vw - w - 4))}px`;
    host.style.top = `${Math.max(4, Math.min(y, vh - h - 4))}px`;
    item.focus();

    const done = () => {
      doc.removeEventListener('pointerdown', outside, true);
      doc.removeEventListener('keydown', key, true);
      doc.removeEventListener('wheel', done, true);
      view?.removeEventListener('blur', done);
      view?.removeEventListener('resize', done);
      host.remove();
      if (menu === host) menu = null;
      closeMenu = null;
    };
    const outside = (ev: Event) => {
      if (!ev.composedPath().includes(host)) done();
    };
    const key = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        ev.stopPropagation();
        done();
      } else if (ev.key === 'Tab') done();
    };
    item.addEventListener('click', () => {
      void (hidden ? store.remove(emote) : store.add(emote));
      done();
    });
    doc.addEventListener('pointerdown', outside, true);
    doc.addEventListener('keydown', key, true);
    doc.addEventListener('wheel', done, true);
    view?.addEventListener('blur', done);
    view?.addEventListener('resize', done);
    closeMenu = done;
  };

  return {
    id: 'hideEmotes',
    enabled: (s) => s.chat.emoteHide,
    start(c) {
      ctx = c;
      style = c.doc.createElement('style');
      style.id = 'cyextv-hideEmotes';
      (c.doc.head ?? c.doc.documentElement).append(style);
      draw();
      off = store.subscribe(draw);
      c.doc.addEventListener('contextmenu', onContext, true);
    },
    stop() {
      closeMenu?.();
      off?.();
      off = null;
      ctx?.doc.removeEventListener('contextmenu', onContext, true);
      style?.remove();
      style = null;
      ctx = null;
    },
  };
}
