// Marks the last message seen when you leave the tab, so you can find your place on return.
import type { Feature, FeatureContext } from '../types';

const ATTR = 'data-cyextv-lastread';
const CSS = `[${ATTR}]{box-shadow:inset 0 -2px 0 color-mix(in srgb,#ff6b6b 70%,transparent)}`;

export function lastRead(): Feature {
  let ctx: FeatureContext | null = null;
  let style: HTMLStyleElement | null = null;
  let marked: Element | null = null;
  const clear = () => {
    marked?.removeAttribute(ATTR);
    marked = null;
  };
  const last = () => (ctx ? (ctx.site.messages(ctx.doc).at(-1) ?? null) : null);
  const leave = () => {
    const m = last();
    clear();
    if (m) {
      m.setAttribute(ATTR, '');
      marked = m;
    }
  };
  // Nothing new arrived while away: no mark.
  const back = () => {
    if (marked && marked === last()) clear();
  };
  const onVisibility = () => (ctx?.doc.hidden ? leave() : back());
  return {
    id: 'lastRead',
    enabled: (s) => s.chat.lastRead,
    start(c) {
      ctx = c;
      style = c.doc.createElement('style');
      style.id = 'cyextv-lastRead';
      style.textContent = CSS;
      c.doc.head.append(style);
      c.doc.addEventListener('visibilitychange', onVisibility);
      c.doc.defaultView?.addEventListener('blur', leave);
      c.doc.defaultView?.addEventListener('focus', back);
    },
    stop() {
      ctx?.doc.removeEventListener('visibilitychange', onVisibility);
      ctx?.doc.defaultView?.removeEventListener('blur', leave);
      ctx?.doc.defaultView?.removeEventListener('focus', back);
      clear();
      ctx?.doc.querySelectorAll(`[${ATTR}]`).forEach((e) => e.removeAttribute(ATTR));
      style?.remove();
      style = null;
      ctx = null;
    },
  };
}
