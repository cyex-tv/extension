// Deleted messages: keeps each message's text, and when the site swaps it for its own notice,
// shows the kept text again in the chosen style. React's nodes are only hidden, never removed.
import { EMOTE_CLASS } from '../../chat/render';
import type { Feature, FeatureContext } from '../types';

const KEPT = 'cyextv-kept';

export function deletedCss(style: 'strike' | 'faded' | 'hidden'): string {
  const base = '[data-cyextv-notice]{display:none!important}.cyextv-deleted-note{margin-left:4px;font-size:.85em;color:color-mix(in srgb,currentColor 55%,transparent)}';
  if (style === 'hidden') return `${base}.cyextv-deleted{display:none!important}`;
  if (style === 'faded') return `${base}.cyextv-deleted{opacity:.4}`;
  return `${base}.${KEPT}{color:color-mix(in srgb,currentColor 55%,transparent);text-decoration:line-through}.${KEPT} .${EMOTE_CLASS}{opacity:.5}`;
}

export function deleted(): Feature {
  let ctx: FeatureContext | null = null;
  let style: HTMLStyleElement | null = null;
  let observer: MutationObserver | null = null;
  let watched: Element | null = null;
  let kept = new WeakMap<Element, Element>();

  const check = (message: Element) => {
    if (!ctx || message.hasAttribute('data-cyextv-deleted')) return;
    const clone = kept.get(message);
    const notice = ctx.site.deletedNotice(message);
    if (!clone || !notice || notice.closest(`.${KEPT}`)) return;
    message.setAttribute('data-cyextv-deleted', '');
    message.classList.add('cyextv-deleted');
    notice.setAttribute('data-cyextv-notice', '');
    const wrap = ctx.doc.createElement('span');
    wrap.className = KEPT;
    wrap.append(clone);
    const note = ctx.doc.createElement('span');
    note.className = 'cyextv-deleted-note';
    note.textContent = '(deleted)';
    notice.after(wrap, note);
  };

  // The list can be replaced (channel change, popout reload): follow it.
  const watch = () => {
    if (!ctx) return;
    const list = ctx.site.chatList(ctx.doc);
    if (list === watched) return;
    observer?.disconnect();
    watched = list;
    if (list) observer?.observe(list, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  };

  return {
    id: 'deleted',
    providedBy: ['7tv', 'bttv', 'ffz'],
    enabled: (s) => s.chat.deleted !== 'site',
    start(c) {
      ctx = c;
      kept = new WeakMap();
      const mode = c.settings.chat.deleted;
      if (mode === 'site') return;
      style = c.doc.createElement('style');
      style.id = 'cyextv-deleted';
      style.textContent = deletedCss(mode);
      c.doc.head.append(style);
      const sel = c.site.messageSelector;
      observer = new MutationObserver((records) => {
        watch();
        const seen = new Set<Element>();
        for (const r of records) {
          const t = r.target instanceof Element ? r.target : r.target.parentElement;
          const m = t?.closest(sel);
          if (m && !seen.has(m)) {
            seen.add(m);
            check(m);
          }
        }
      });
      watch();
    },
    // After emotes are drawn, so the kept copy shows them.
    message(message) {
      if (!ctx) return;
      if (!watched?.isConnected) watch();
      const body = ctx.site.body(message);
      if (body) kept.set(message, body.cloneNode(true) as Element);
    },
    stop() {
      observer?.disconnect();
      observer = null;
      watched = null;
      const doc = ctx?.doc;
      doc?.querySelectorAll(`.${KEPT}, .cyextv-deleted-note`).forEach((e) => e.remove());
      doc?.querySelectorAll('[data-cyextv-notice]').forEach((e) => e.removeAttribute('data-cyextv-notice'));
      doc?.querySelectorAll('[data-cyextv-deleted]').forEach((e) => {
        e.removeAttribute('data-cyextv-deleted');
        e.classList.remove('cyextv-deleted');
      });
      style?.remove();
      style = null;
      kept = new WeakMap();
      ctx = null;
    },
  };
}
