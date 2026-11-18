// Small DOM helpers shared by the popup and the settings page (cyex-app controls).

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...kids);
  return node;
}

/** An <input> with the given properties (typed apart from `el`, whose union is too wide here). */
export function input(props: { type: string; value?: string; placeholder?: string; className?: string; checked?: boolean; min?: string; max?: string }): HTMLInputElement {
  return Object.assign(document.createElement('input'), props);
}

/** A labelled switch (cyex-app toggle): a checkbox styled as a track with a knob. */
export function toggle(label: string, checked: boolean, onchange: (on: boolean) => void, hint?: string) {
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.className = 'switch';
  input.checked = checked;
  input.addEventListener('change', () => onchange(input.checked));
  const text = el('span', { className: 'text' }, el('span', { className: 'name' }, label));
  if (hint) text.append(el('span', { className: 'hint' }, hint));
  return el('label', { className: 'row' }, text, input);
}

/** A 14 px stroke icon from a Lucide path. */
export function icon(d: string): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', d);
  svg.append(path);
  return svg;
}

export const ICON = {
  up: 'm6 15 6-6 6 6',
  down: 'm6 9 6 6 6-6',
  x: 'M18 6 6 18M6 6l12 12',
  plus: 'M12 5v14M5 12h14',
};

/** A segmented control (cyex-app): one pressed button of a few. */
export function segmented(label: string, options: [string, string][], value: string, onpick: (v: string) => void): HTMLElement {
  const seg = el('div', { className: 'seg' });
  seg.setAttribute('role', 'group');
  seg.setAttribute('aria-label', label);
  for (const [v, text] of options) {
    const b = el('button', { type: 'button', value: v }, text);
    b.setAttribute('aria-pressed', String(v === value));
    b.addEventListener('click', () => onpick(v));
    seg.append(b);
  }
  return seg;
}

/**
 * Notes on <html> whether the last input was the keyboard (`data-keys`), so a title focused by
 * script can show its focus ring for keyboard users and not after a mouse click.
 */
export function trackInputMethod(doc: Document): void {
  const root = doc.documentElement;
  doc.addEventListener('keydown', () => root.setAttribute('data-keys', ''), true);
  doc.addEventListener('pointerdown', () => root.removeAttribute('data-keys'), true);
}
