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
        if (e.altKey && !e.shiftKey) {
          // A dead key (Mac é) is a typed character, not our shortcut.
          if (e.code !== 'KeyE' || e.key === 'Dead') return;
          // Only claim the key while the menu exists to answer it.
          if (!ctx.doc.documentElement.hasAttribute('data-cyextv-emote-menu')) return;
          e.preventDefault();
          ctx.doc.dispatchEvent(new CustomEvent('cyextv:emote-menu'));
        } else if (e.key === '/' && !e.altKey && !isTyping(ctx.doc.activeElement)) {
          const input = ctx.site.chatInput(ctx.doc);
          if (!input) return;
          e.preventDefault();
          input.focus();
        }
      };
      // Capture: it must work while focus is in the menu's own search box.
      c.doc.addEventListener('keydown', handler, true);
    },
    stop() {
      if (ctx && handler) ctx.doc.removeEventListener('keydown', handler, true);
      handler = null;
      ctx = null;
    },
  };
}
