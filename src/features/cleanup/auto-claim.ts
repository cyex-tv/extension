// Clicks the channel points "claim bonus" button. Runs in background tabs too (that is the point),
// but never clicks more than once per COOLDOWN_MS.
import type { Feature } from '../types';

export const POLL_MS = 5000;
export const COOLDOWN_MS = 10_000;

/** Whether the button can be clicked now (not disabled, not hidden by the attribute). */
export function clickable(button: HTMLElement | null): button is HTMLElement {
  if (!button || (button as HTMLButtonElement).disabled || button.getAttribute('aria-disabled') === 'true') return false;
  return !(button.hidden || button.closest('[hidden]'));
}

export function autoClaim(): Feature {
  let timer: ReturnType<typeof setInterval> | null = null;
  let observer: MutationObserver | null = null;
  return {
    id: 'autoClaim',
    providedBy: ['7tv', 'bttv', 'ffz'],
    enabled: (s) => s.chat.autoClaim,
    start(ctx) {
      let last = -Infinity;
      const check = () => {
        const now = ctx.now();
        if (now - last < COOLDOWN_MS) return;
        const button = ctx.site.claimButton(ctx.doc);
        if (!clickable(button)) return;
        last = now;
        button.click();
      };
      timer = setInterval(check, POLL_MS);
      // The button appears under the points area; watch for it without reading layout.
      observer = new MutationObserver(check);
      observer.observe(ctx.doc.body, { childList: true, subtree: true });
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
      observer?.disconnect();
      observer = null;
    },
  };
}
