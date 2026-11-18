// The short note at the bottom of the extension's pages (cyex-app toast), with an optional undo.
// The page needs `<div id="toast" class="toast" role="status" aria-live="polite"></div>`.
import { el } from './dom';

let timer: ReturnType<typeof setTimeout> | null = null;

export function toast(text: string, undo?: () => void): void {
  const box = document.querySelector<HTMLElement>('#toast');
  if (!box) return;
  const kids: Node[] = [el('span', {}, text)];
  if (undo) {
    const b = el('button', { type: 'button', className: 'link' }, 'Undo');
    b.addEventListener('click', () => {
      box.replaceChildren();
      undo();
    });
    kids.push(b);
  }
  box.replaceChildren(...kids);
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => box.replaceChildren(), 6000);
}
