// A styled card instead of the native title tooltip on our emotes. The title text is moved to
// data-cyextv-tip on hover so the native one never shows; the card is built from the data
// attributes `emoteElement` sets (name, owner, provider, biggest image).
import { EMOTE_CLASS } from '../../chat/render';
import type { Feature } from '../types';

const PROVIDER_NAME: Record<string, string> = { cyextv: 'cyex.tv', '7tv': '7TV', bttv: 'BTTV', ffz: 'FFZ' };
const GAP = 8;

export const CSS = `
.cyextv-tip { position: fixed; z-index: 2147483000; pointer-events: none; box-sizing: border-box; max-width: 260px; padding: 8px;
  background: #26272c; color: #e8e8ea; border: 1px solid #43454d; border-radius: 3px; box-shadow: 0 6px 20px rgba(0,0,0,.4);
  font: 12px/1.4 "IBM Plex Sans", system-ui, sans-serif; opacity: 0; transition: opacity 120ms linear; }
.cyextv-tip[data-shown] { opacity: 1; }
.cyextv-tip img { display: block; max-height: 112px; max-width: 100%; width: auto; height: auto; margin: 0 0 6px; }
.cyextv-tip-name { font-weight: 600; overflow-wrap: anywhere; }
.cyextv-tip-by { color: #9fa1a9; overflow-wrap: anywhere; }
.cyextv-tip-part + .cyextv-tip-part { margin-top: 8px; padding-top: 8px; border-top: 1px solid #43454d; }
@media (prefers-reduced-motion: reduce) { .cyextv-tip { transition: none; } }
`;

type Part = { name: string; provider: string; owner: string; big: string };

/** What to show: the emote, then each zero-width overlay. */
export function partsOf(emote: HTMLElement): Part[] {
  const read = (el: HTMLElement): Part => ({ name: el.dataset.name ?? '', provider: el.dataset.provider ?? '', owner: el.dataset.owner ?? '', big: el.dataset.big ?? '' });
  const parts = [read(emote)];
  for (const o of emote.querySelectorAll<HTMLElement>('img.cyextv-over')) parts.push(read(o));
  return parts.filter((p) => p.name);
}

/** Where the card goes: centred above the emote, flipped below when it doesn't fit, kept in view. */
export function place(anchor: DOMRect, card: { width: number; height: number }, view: { width: number; height: number }): { left: number; top: number } {
  let top = anchor.top - card.height - GAP;
  if (top < 4) top = anchor.bottom + GAP;
  if (top + card.height > view.height - 4) top = Math.max(4, view.height - card.height - 4);
  let left = anchor.left + anchor.width / 2 - card.width / 2;
  left = Math.min(Math.max(4, left), Math.max(4, view.width - card.width - 4));
  return { left, top };
}

export function richTooltips(): Feature {
  let style: HTMLStyleElement | null = null;
  let card: HTMLElement | null = null;
  let remove: (() => void) | null = null;
  let docRef: Document | null = null;
  return {
    id: 'richTooltips',
    enabled: (s) => s.chat.richTooltips && s.tooltips,
    start(ctx) {
      const doc = ctx.doc;
      docRef = doc;
      style = doc.createElement('style');
      style.id = 'cyextv-richTooltips';
      style.textContent = CSS;
      (doc.head ?? doc.documentElement).append(style);

      const hide = () => {
        card?.remove();
        card = null;
      };
      const over = (e: Event) => {
        const target = e.target instanceof Element ? e.target.closest<HTMLElement>(`.${EMOTE_CLASS}`) : null;
        if (!target) return;
        if (target.title) {
          target.dataset.cyextvTip = target.title;
          target.removeAttribute('title');
        }
        const parts = partsOf(target);
        if (!parts.length) return;
        hide();
        const el = doc.createElement('div');
        el.className = 'cyextv-tip';
        el.setAttribute('role', 'tooltip');
        for (const p of parts) {
          const part = doc.createElement('div');
          part.className = 'cyextv-tip-part';
          if (p.big) {
            const img = doc.createElement('img');
            img.src = p.big;
            img.alt = '';
            part.append(img);
          }
          const name = doc.createElement('div');
          name.className = 'cyextv-tip-name';
          name.textContent = p.name;
          const by = doc.createElement('div');
          by.className = 'cyextv-tip-by';
          by.textContent = (PROVIDER_NAME[p.provider] ?? p.provider) + (p.owner ? ` · by ${p.owner}` : '');
          part.append(name, by);
          el.append(part);
        }
        doc.body.append(el);
        const view = doc.defaultView;
        const box = el.getBoundingClientRect();
        const pos = place(target.getBoundingClientRect(), { width: box.width, height: box.height }, { width: view?.innerWidth ?? 1024, height: view?.innerHeight ?? 768 });
        el.style.left = `${pos.left}px`;
        el.style.top = `${pos.top}px`;
        el.dataset.shown = '';
        card = el;
      };
      const out = (e: Event) => {
        if (e.target instanceof Element && e.target.closest(`.${EMOTE_CLASS}`)) hide();
      };
      doc.addEventListener('mouseover', over);
      doc.addEventListener('mouseout', out);
      doc.addEventListener('scroll', hide, true);
      remove = () => {
        doc.removeEventListener('mouseover', over);
        doc.removeEventListener('mouseout', out);
        doc.removeEventListener('scroll', hide, true);
        hide();
      };
    },
    stop() {
      // Titles moved aside on hover go back.
      docRef?.querySelectorAll<HTMLElement>('[data-cyextv-tip]').forEach((el) => {
        if (!el.title) el.title = el.dataset.cyextvTip ?? '';
        delete el.dataset.cyextvTip;
      });
      docRef = null;
      remove?.();
      remove = null;
      style?.remove();
      style = null;
    },
  };
}
