// The emote menu: a button by the message box and a panel with a search box, a tab per
// provider, favourites and the most used emotes. Styled like cyex deck (dark, 3px corners).
import type { Emote, EmoteImage, ProviderId } from '../../providers/types';
import { PROVIDER_LABEL } from '../../popup/model';
import type { Feature, FeatureContext } from '../types';
import { type Saved, insertAtCaret, restoreCaret, saveCaret } from './editor';
import { search } from './rank';
import { type Store, emoteKey, storeFor } from './store';

export const MENU_EVENT = 'cyextv:emote-menu';
const FAV_TAB = 'fav';
const MOST_USED = 30;
const MAX_RESULTS = 120;
const CHECK_MS = 1000;

const CSS = `
.cyextv-em-btn{all:unset;box-sizing:border-box;width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;border-radius:3px;cursor:pointer;color:inherit;opacity:.8}
.cyextv-em-btn:hover,.cyextv-em-btn[aria-expanded="true"]{background:color-mix(in srgb,currentColor 14%,transparent);opacity:1}
.cyextv-em-btn:focus-visible{outline:2px solid #145aff;outline-offset:-2px}
.cyextv-em-btn svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round}
.cyextv-em{position:fixed;z-index:2147483000;display:flex;flex-direction:column;background:#1e1f23;color:#e8e8ea;border:1px solid #34353c;border-radius:3px;box-shadow:0 8px 24px rgba(0,0,0,.45);font:13px/1.4 "IBM Plex Sans",system-ui,sans-serif;overflow:hidden}
.cyextv-em *{box-sizing:border-box}
.cyextv-em-search{margin:8px 8px 0;height:30px;padding:0 8px;background:#26272c;color:#e8e8ea;border:1px solid #34353c;border-radius:3px;font:inherit;outline:none}
.cyextv-em-search::placeholder{color:#9fa1a9}
.cyextv-em-search:focus{border-color:#145aff}
.cyextv-em-tabs{display:flex;gap:2px;padding:8px 8px 0;border-bottom:1px solid #34353c;overflow-x:auto;flex:none}
.cyextv-em-tab{all:unset;box-sizing:border-box;padding:5px 9px;color:#9fa1a9;cursor:pointer;border-radius:3px 3px 0 0;border-bottom:2px solid transparent;white-space:nowrap;font:inherit}
.cyextv-em-tab:hover{color:#e8e8ea;background:#26272c}
.cyextv-em-tab[aria-selected="true"]{color:#e8e8ea;border-bottom-color:#145aff}
.cyextv-em-tab:focus-visible{outline:2px solid #145aff;outline-offset:-2px}
.cyextv-em-body{flex:1;overflow-y:auto;padding:4px 8px 8px;min-height:0}
.cyextv-em-title{margin:10px 0 4px;color:#9fa1a9;font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase}
.cyextv-em-grid{display:flex;flex-wrap:wrap;gap:2px}
.cyextv-em-cell{all:unset;box-sizing:border-box;position:relative;width:36px;height:36px;display:flex;align-items:center;justify-content:center;border-radius:3px;cursor:pointer}
.cyextv-em-cell:hover{background:#26272c}
.cyextv-em-cell:focus-visible{outline:2px solid #145aff;outline-offset:-2px;background:#26272c}
.cyextv-em-cell img{max-width:32px;max-height:32px;object-fit:contain}
.cyextv-em-fav::after{content:"\\2605";position:absolute;top:-1px;right:1px;font-size:10px;color:#145aff}
.cyextv-em-empty{padding:16px 4px;color:#9fa1a9}
`;

const ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M8 14.2c1 1.5 2.4 2.3 4 2.3s3-.8 4-2.3"/><path d="M9 9.5v.5M15 9.5v.5"/></svg>';

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = doc.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function srcset(images: EmoteImage[]): string {
  const one = images[0]!;
  return images.map((i) => `${i.url} ${i.scale === 1 ? 1 : Math.round((i.width / one.width) * 10) / 10}x`).join(', ');
}

export function emoteMenu(): Feature {
  let ctx: FeatureContext | null = null;
  let store: Store;
  let style: HTMLStyleElement | null = null;
  let button: HTMLButtonElement | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let panel: HTMLElement | null = null;
  let searchBox: HTMLInputElement;
  let tabsBar: HTMLElement;
  let body: HTMLElement;
  let tab = FAV_TAB;
  let saved: Saved = null;
  let channelId: string | null = null;

  const field = () => ctx!.site.chatInput(ctx!.doc);

  /** Keeps the button right before the site's slot, putting it back when the site re-renders. */
  function ensureButton() {
    if (!ctx) return;
    const id = ctx.channel()?.id ?? null;
    if (panel && id !== channelId) close();
    channelId = id;
    const slot = ctx.site.inputButtonSlot(ctx.doc);
    if (!slot?.parentNode) return;
    // Kick's slot is "the element after the input", which becomes our own button once placed.
    if (slot === button || (button && button.nextElementSibling === slot && button.isConnected)) return;
    if (!button) {
      button = el(ctx.doc, 'button', 'cyextv-em-btn');
      button.type = 'button';
      button.title = 'Emotes (Alt+E)';
      button.setAttribute('aria-label', 'Emotes');
      button.setAttribute('aria-haspopup', 'dialog');
      button.setAttribute('aria-expanded', 'false');
      button.innerHTML = ICON;
      // Keep the message box focused and its caret where it was.
      button.addEventListener('mousedown', (e) => e.preventDefault());
      button.addEventListener('click', () => toggle());
    }
    slot.parentNode.insertBefore(button, slot);
  }

  const emotes = () => ctx!.index.all();

  function providers(): ProviderId[] {
    const have = new Set(emotes().map((e) => e.provider));
    return ctx!.settings.order.filter((p) => have.has(p));
  }

  function cell(e: Emote): HTMLButtonElement {
    const b = el(ctx!.doc, 'button', 'cyextv-em-cell');
    b.type = 'button';
    b.tabIndex = -1;
    b.title = e.name;
    b.dataset.key = emoteKey(e);
    if (store.isFavorite(b.dataset.key)) b.classList.add('cyextv-em-fav');
    const still = e.animated && ctx!.settings.animations !== 'on' && e.stills?.length ? e.stills : null;
    const shown = still ?? e.images;
    const img = ctx!.doc.createElement('img');
    img.src = shown[0]!.url;
    img.srcset = srcset(shown);
    img.alt = e.name;
    img.loading = 'lazy';
    img.decoding = 'async';
    b.append(img);
    return b;
  }

  function section(title: string, list: Emote[]) {
    if (list.length === 0) return;
    body.append(el(ctx!.doc, 'div', 'cyextv-em-title', title));
    const grid = el(ctx!.doc, 'div', 'cyextv-em-grid');
    for (const e of list) grid.append(cell(e));
    body.append(grid);
  }

  const byKey = () => new Map(emotes().map((e) => [emoteKey(e), e]));

  function render() {
    if (!panel || !ctx) return;
    const doc = ctx.doc;
    const top = body.scrollTop;
    body.replaceChildren();
    const all = emotes();
    const shown = providers();
    if (tab !== FAV_TAB && !shown.includes(tab as ProviderId)) tab = FAV_TAB;

    tabsBar.replaceChildren();
    for (const id of [FAV_TAB, ...shown]) {
      const t = el(doc, 'button', 'cyextv-em-tab', id === FAV_TAB ? '★ Favorites' : PROVIDER_LABEL[id as ProviderId]);
      t.type = 'button';
      t.setAttribute('role', 'tab');
      t.setAttribute('aria-selected', String(id === tab));
      t.dataset.tab = id;
      tabsBar.append(t);
    }

    const q = searchBox.value.trim();
    const keys = byKey();
    const favs = store.favorites.flatMap((k) => keys.get(k) ?? []);
    if (q) {
      const found = search(q, all, (e) => store.count(emoteKey(e)), MAX_RESULTS);
      if (found.length) section('Results', found);
      else body.append(el(doc, 'div', 'cyextv-em-empty', 'No emote matches.'));
    } else if (tab === FAV_TAB) {
      const used = Object.entries(store.usage)
        .sort((a, b) => b[1] - a[1])
        .flatMap(([k]) => keys.get(k) ?? [])
        .slice(0, MOST_USED);
      section('Favorites', favs);
      section('Most used', used);
      if (favs.length + used.length === 0) body.append(el(doc, 'div', 'cyextv-em-empty', 'Right-click an emote to favorite it. The ones you use most show up here.'));
    } else {
      const mine = all.filter((e) => e.provider === tab);
      section('Favorites', favs.filter((e) => e.provider === tab));
      section('Channel', mine.filter((e) => ctx!.index.isChannel(e)));
      section('Global', mine.filter((e) => !ctx!.index.isChannel(e)));
    }
    body.scrollTop = top;
  }

  const cells = () => [...body.querySelectorAll<HTMLElement>('.cyextv-em-cell')];

  function pick(e: Emote, keepOpen: boolean) {
    const f = field();
    if (!f || !ctx) return;
    restoreCaret(ctx.doc, f, saved);
    insertAtCaret(ctx.doc, f, `${e.name} `);
    store.bump(emoteKey(e));
    if (keepOpen) saved = saveCaret(ctx.doc, f);
    else close(false);
  }

  const emoteOf = (c: Element | null) => (c instanceof HTMLElement && c.dataset.key ? byKey().get(c.dataset.key) : undefined);

  /** The cell one row up or down, nearest across; falls back to a fixed step without layout. */
  function vertical(from: HTMLElement, list: HTMLElement[], dir: 1 | -1): HTMLElement | undefined {
    const r = from.getBoundingClientRect();
    if (r.width === 0) return list[list.indexOf(from) + dir * 8];
    let best: HTMLElement | undefined;
    let score = Infinity;
    for (const c of list) {
      const cr = c.getBoundingClientRect();
      const dy = (cr.top - r.top) * dir;
      if (dy < 4) continue;
      const s = dy * 1000 + Math.abs(cr.left - r.left);
      if (s < score) {
        score = s;
        best = c;
      }
    }
    return best;
  }

  function onPanelKey(e: KeyboardEvent) {
    // The site has its own shortcuts; keys typed here are ours.
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    const t = e.target as HTMLElement;
    const list = cells();
    if (t === searchBox) {
      if (e.key === 'Enter') {
        e.preventDefault();
        const first = emoteOf(list[0] ?? null);
        if (first && searchBox.value.trim()) pick(first, e.shiftKey);
      } else if (e.key === 'ArrowDown' && list[0]) {
        e.preventDefault();
        list[0].focus();
      }
      return;
    }
    if (!t.classList?.contains('cyextv-em-cell')) return;
    const i = list.indexOf(t);
    let to: HTMLElement | undefined;
    if (e.key === 'ArrowRight') to = list[i + 1];
    else if (e.key === 'ArrowLeft') to = list[i - 1];
    else if (e.key === 'ArrowDown') to = vertical(t, list, 1);
    else if (e.key === 'ArrowUp') to = vertical(t, list, -1) ?? searchBox;
    else return;
    e.preventDefault();
    to?.focus();
    to?.scrollIntoView?.({ block: 'nearest' });
  }

  function onPanelClick(e: MouseEvent) {
    const target = e.target as Element;
    const t = target.closest<HTMLElement>('.cyextv-em-tab');
    if (t?.dataset.tab) {
      tab = t.dataset.tab;
      store.setTab(tab);
      render();
      return;
    }
    const em = emoteOf(target.closest('.cyextv-em-cell'));
    if (em) pick(em, e.shiftKey);
  }

  function onPanelContext(e: MouseEvent) {
    const cellEl = (e.target as Element).closest<HTMLElement>('.cyextv-em-cell');
    if (!cellEl?.dataset.key) return;
    e.preventDefault();
    store.toggleFavorite(cellEl.dataset.key);
    render();
  }

  const onOutside = (e: Event) => {
    const t = e.target as Node;
    if (panel && !panel.contains(t) && !button?.contains(t)) close(false);
  };

  const onDocKey = (e: KeyboardEvent) => {
    // Escape while focus is still in the message box.
    if (panel && e.key === 'Escape' && !panel.contains(e.target as Node)) close();
  };

  function open() {
    if (!ctx || panel) return;
    const f = field();
    const doc = ctx.doc;
    const win = doc.defaultView!;
    saved = f ? saveCaret(doc, f) : null;
    panel = el(doc, 'div', 'cyextv-em');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Emotes');
    searchBox = el(doc, 'input', 'cyextv-em-search');
    searchBox.type = 'text';
    searchBox.placeholder = 'Find an emote';
    searchBox.setAttribute('aria-label', 'Find an emote');
    searchBox.autocomplete = 'off';
    searchBox.spellcheck = false;
    searchBox.addEventListener('input', render);
    tabsBar = el(doc, 'div', 'cyextv-em-tabs');
    tabsBar.setAttribute('role', 'tablist');
    body = el(doc, 'div', 'cyextv-em-body');
    panel.append(searchBox, tabsBar, body);
    panel.addEventListener('keydown', onPanelKey);
    panel.addEventListener('keyup', (e) => e.stopPropagation());
    panel.addEventListener('keypress', (e) => e.stopPropagation());
    panel.addEventListener('click', onPanelClick);
    panel.addEventListener('contextmenu', onPanelContext);
    // Emote cells and tabs must not pull focus (and the caret) from the message box.
    panel.addEventListener('mousedown', (e) => {
      if (e.target !== searchBox) e.preventDefault();
    });
    tab = store.tab ?? FAV_TAB;
    doc.body.append(panel);

    const w = Math.min(340, win.innerWidth - 16);
    const h = Math.min(400, win.innerHeight - 16);
    const anchor = (button?.isConnected ? button : f)?.getBoundingClientRect();
    const left = anchor ? anchor.right - w : win.innerWidth - w - 8;
    const above = anchor ? anchor.top - h - 6 : win.innerHeight - h - 8;
    panel.style.width = `${w}px`;
    panel.style.height = `${h}px`;
    panel.style.left = `${Math.max(8, Math.min(left, win.innerWidth - w - 8))}px`;
    panel.style.top = `${Math.max(8, Math.min(above, win.innerHeight - h - 8))}px`;
    button?.setAttribute('aria-expanded', 'true');
    doc.addEventListener('mousedown', onOutside, true);
    doc.addEventListener('keydown', onDocKey, true);
    render();
    // What was saved last time arrives a moment after the first draw.
    void store.ready.then(() => {
      if (!panel) return;
      if (searchBox.value === '') tab = store.tab ?? tab;
      render();
    });
    searchBox.focus();
  }

  /** Closes the panel; the caret goes back to the message box unless `refocus` is false. */
  function close(refocus = true) {
    if (!panel || !ctx) return;
    const doc = ctx.doc;
    doc.removeEventListener('mousedown', onOutside, true);
    doc.removeEventListener('keydown', onDocKey, true);
    panel.remove();
    panel = null;
    button?.setAttribute('aria-expanded', 'false');
    const f = field();
    if (f && refocus) restoreCaret(doc, f, saved);
  }

  function toggle(want?: boolean) {
    if (panel && want !== true) close();
    else if (!panel && want !== false) open();
  }

  const onEvent = (e: Event) => toggle((e as CustomEvent<{ open?: boolean } | null>).detail?.open);

  return {
    id: 'emoteMenu',
    providedBy: ['7tv', 'bttv', 'ffz'],
    enabled: (s) => s.chat.emoteMenu,
    start(c) {
      ctx = c;
      store = storeFor(c.local);
      style = c.doc.createElement('style');
      style.id = 'cyextv-emoteMenu';
      style.textContent = CSS;
      c.doc.head.append(style);
      channelId = c.channel()?.id ?? null;
      ensureButton();
      timer = setInterval(ensureButton, CHECK_MS);
      c.doc.addEventListener(MENU_EVENT, onEvent);
    },
    stop() {
      if (!ctx) return;
      ctx.doc.removeEventListener(MENU_EVENT, onEvent);
      if (timer) clearInterval(timer);
      timer = null;
      close(false);
      button?.remove();
      button = null;
      style?.remove();
      style = null;
      ctx = null;
    },
  };
}
