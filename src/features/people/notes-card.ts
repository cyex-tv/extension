// Nickname and note fields on the site's user card. Drawn once per person shown, so typing is
// never interrupted by chat; saved when a field loses focus or on Enter (in the nickname).
import type { Feature, FeatureContext } from '../types';
import { NICK_MAX, NOTE_MAX, type NotesStore, notes } from './notes';

const ATTR = 'data-cyextv-usercard-notes';
const BORDER = 'color-mix(in srgb, currentColor 15%, transparent)';
const CSS = `
[${ATTR}]{display:grid;gap:6px;padding:8px 10px;border-top:1px solid ${BORDER};font-size:12px;text-align:left;color:inherit}
[${ATTR}] .cyextv-nc-head{font-weight:600}
[${ATTR}] label{display:grid;gap:2px}
[${ATTR}] .cyextv-nc-label{opacity:.7}
[${ATTR}] input,[${ATTR}] textarea{width:100%;box-sizing:border-box;padding:4px 6px;border:1px solid ${BORDER};border-radius:3px;background:transparent;color:inherit;font:inherit}
[${ATTR}] textarea{resize:vertical;min-height:44px}
[${ATTR}] .cyextv-nc-hint{opacity:.6}
`;

export function buildNotes(doc: Document, login: string, store: NotesStore): HTMLElement {
  const entry = store.get(login) ?? { nick: '', note: '' };
  const wrap = doc.createElement('div');
  wrap.setAttribute(ATTR, login);
  const head = doc.createElement('div');
  head.className = 'cyextv-nc-head';
  head.textContent = 'Your notes';

  const field = <T extends HTMLInputElement | HTMLTextAreaElement>(label: string, control: T) => {
    const l = doc.createElement('label');
    const text = doc.createElement('span');
    text.className = 'cyextv-nc-label';
    text.textContent = label;
    l.append(text, control);
    return l;
  };
  const nick = doc.createElement('input');
  nick.type = 'text';
  nick.maxLength = NICK_MAX;
  nick.value = entry.nick;
  nick.placeholder = 'Shown instead of their name';
  const note = doc.createElement('textarea');
  note.maxLength = NOTE_MAX;
  note.value = entry.note;
  note.placeholder = 'Only you see this';
  const save = () => void store.set(login, { nick: nick.value, note: note.value });
  nick.addEventListener('change', save);
  note.addEventListener('change', save);
  nick.addEventListener('keydown', (e) => {
    // Enter saves; the site's own keys (chat shortcuts) stay out of the field.
    e.stopPropagation();
    if (e.key === 'Enter') nick.blur();
  });
  note.addEventListener('keydown', (e) => e.stopPropagation());
  const hint = doc.createElement('div');
  hint.className = 'cyextv-nc-hint';
  hint.textContent = 'Kept on this device only.';
  wrap.append(head, field('Nickname', nick), field('Note', note), hint);
  return wrap;
}

export function usercardNotes(store: NotesStore = notes): Feature {
  let ctx: FeatureContext | null = null;
  let observer: MutationObserver | null = null;
  let style: HTMLStyleElement | null = null;
  let frame = 0;

  function sync() {
    frame = 0;
    if (!ctx) return;
    const found = ctx.site.userCard(ctx.doc);
    if (!found) return;
    const existing = found.card.querySelector(`[${ATTR}]`);
    if (existing?.getAttribute(ATTR) === found.login) return;
    existing?.remove();
    // Above the messages section when there is one (that one is redrawn at the end).
    const el = buildNotes(ctx.doc, found.login, store);
    const messages = found.card.querySelector('[data-cyextv-usercard]');
    if (messages) messages.before(el);
    else found.card.append(el);
  }
  function schedule() {
    if (frame || !ctx) return;
    const win = ctx.doc.defaultView;
    if (win) frame = win.requestAnimationFrame(sync);
    else sync();
  }

  return {
    id: 'usercardNotes',
    enabled: (s) => s.chat.usercardNotes,
    start(c) {
      ctx = c;
      style = c.doc.createElement('style');
      style.id = 'cyextv-usercardNotes';
      style.textContent = CSS;
      c.doc.head.append(style);
      observer = new MutationObserver((records) => {
        const list = c.site.chatList(c.doc);
        for (const r of records) {
          if (list && list.contains(r.target)) continue;
          for (const n of r.addedNodes) if (n instanceof Element && !n.hasAttribute(ATTR)) return schedule();
        }
      });
      observer.observe(c.doc.body, { childList: true, subtree: true });
      schedule();
    },
    stop() {
      observer?.disconnect();
      observer = null;
      if (frame) ctx?.doc.defaultView?.cancelAnimationFrame(frame);
      frame = 0;
      ctx?.doc.querySelectorAll(`[${ATTR}]`).forEach((n) => n.remove());
      style?.remove();
      style = null;
      ctx = null;
    },
  };
}
