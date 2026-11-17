// Clicking one of our emotes in chat: put its name in the message box, or copy it. Only our own
// emote elements answer; a click anywhere else (names, links, the sites' emotes) is the site's.
import type { Feature, FeatureContext } from '../types';
import { EMOTE_CLASS } from '../../chat/render';
import { insertAtCaret } from './editor';

const TOAST_ID = 'cyextv-toast';
const TOAST_MS = 1400;
const CSS = `#${TOAST_ID}{position:fixed;left:50%;bottom:24px;translate:-50% 0;z-index:2147483646;padding:6px 10px;border:1px solid #43454d;border-radius:3px;background:#26272c;color:#e8e8ea;font:600 12px/1.4 'IBM Plex Sans','Segoe UI',system-ui,sans-serif;pointer-events:none}`;

/** The emote name a click landed on, or null when it wasn't one of ours inside a chat message. */
export function clickedEmote(target: EventTarget | null, messageSelector: string): string | null {
  const el = target instanceof Element ? target.closest<HTMLElement>(`.${EMOTE_CLASS}`) : null;
  if (!el || !el.closest(messageSelector)) return null;
  return el.dataset.name ?? null;
}

export function emoteClick(): Feature {
  let ctx: FeatureContext | null = null;
  let style: HTMLStyleElement | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  function toast(text: string) {
    if (!ctx) return;
    let t = ctx.doc.getElementById(TOAST_ID);
    if (!t) {
      t = ctx.doc.createElement('div');
      t.id = TOAST_ID;
      t.setAttribute('role', 'status');
      ctx.doc.body.append(t);
    }
    t.textContent = text;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ctx?.doc.getElementById(TOAST_ID)?.remove(), TOAST_MS);
  }

  const onClick = (e: MouseEvent) => {
    if (!ctx || e.button !== 0 || e.ctrlKey || e.metaKey || e.altKey) return;
    const name = clickedEmote(e.target, ctx.site.messageSelector);
    if (!name) return;
    const mode = ctx.settings.chat.emoteClick;
    if (mode === 'insert') {
      const input = ctx.site.chatInput(ctx.doc);
      if (!input) return;
      e.preventDefault();
      input.focus();
      insertAtCaret(ctx.doc, input, `${name} `);
    } else if (mode === 'copy') {
      e.preventDefault();
      const clip = ctx.doc.defaultView?.navigator.clipboard;
      void clip?.writeText(name).then(
        () => toast(`Copied ${name}`),
        () => toast('Couldn’t copy'),
      );
    }
  };

  return {
    id: 'emoteClick',
    enabled: (s) => s.chat.emoteClick !== 'off',
    start(c) {
      ctx = c;
      style = c.doc.createElement('style');
      style.id = 'cyextv-emoteClick';
      style.textContent = `${CSS}
${c.site.messageSelector} .${EMOTE_CLASS}{cursor:pointer}`;
      c.doc.head.append(style);
      c.doc.addEventListener('click', onClick);
    },
    stop() {
      ctx?.doc.removeEventListener('click', onClick);
      ctx?.doc.getElementById(TOAST_ID)?.remove();
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = null;
      style?.remove();
      style = null;
      ctx = null;
    },
  };
}
