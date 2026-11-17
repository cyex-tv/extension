// Keyboard shortcuts: Alt+E toggles the emote menu, "/" jumps to the message box.
import type { Feature, FeatureContext } from '../types';

/** Whether focus is somewhere text is typed, where "/" must stay a character. */
export function isTyping(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  const ce = el.getAttribute('contenteditable');
  return (el as HTMLElement).isContentEditable === true || ce === 'true' || ce === '' || ce === 'plaintext-only';
}

export function shortcuts(): Feature {
  let ctx: FeatureContext | null = null;
  let handler: ((e: KeyboardEvent) => void) | null = null;

  return {
    id: 'shortcuts',
    enabled: (s) => s.chat.shortcuts,
    start(c) {
      ctx = c;
      handler = (e) => {
        if (!ctx || e.isComposing || e.ctrlKey || e.metaKey) return;
        if (e.altKey && !e.shiftKey && e.code === 'KeyE') {
          e.preventDefault();
          ctx.doc.dispatchEvent(new CustomEvent('cyextv:emote-menu'));
        } else if (e.key === '/' && !e.altKey && !isTyping(ctx.doc.activeElement)) {
          const input = ctx.site.chatInput(ctx.doc);
          if (!input) return;
          e.preventDefault();
          input.focus();
        }
      };
      c.doc.addEventListener('keydown', handler);
    },
    stop() {
      if (ctx && handler) ctx.doc.removeEventListener('keydown', handler);
      handler = null;
      ctx = null;
    },
  };
}
