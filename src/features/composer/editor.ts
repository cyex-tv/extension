// Reading and writing the message box, which is a textarea or a contenteditable (Twitch's and
// Kick's editors). Text goes in through `execCommand('insertText')` so their editors see it as
// typing; jsdom and odd editors fall back to editing the DOM and sending an input event.
type TextField = HTMLInputElement | HTMLTextAreaElement;

const isTextField = (el: HTMLElement): el is TextField => el.tagName === 'TEXTAREA' || el.tagName === 'INPUT';

export const SPACE = /[\s\u00a0\u200b]/;

export type Caret = {
  /** The text before the caret in the same text node (or the whole field up to it). */
  before: string;
  /** The text of the whole field before the caret. */
  all(): string;
  node: Text | null;
  offset: number;
};

/** Where the caret is in `field`, or null when it isn't a collapsed caret inside it. */
export function caretOf(doc: Document, field: HTMLElement): Caret | null {
  if (isTextField(field)) {
    const { selectionStart: s, selectionEnd: e } = field;
    if (s === null || s !== e) return null;
    const before = field.value.slice(0, s);
    return { before, all: () => before, node: null, offset: s };
  }
  const sel = doc.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return null;
  const r = sel.getRangeAt(0);
  let node: Node | undefined = r.startContainer;
  let offset = r.startOffset;
  if (node.nodeType !== 3) {
    // Between nodes: the text node just before the caret, if there is one.
    node = node.childNodes[offset - 1];
    offset = node?.nodeType === 3 ? (node as Text).length : 0;
  }
  if (!node || node.nodeType !== 3 || !field.contains(node)) return null;
  const text = node as Text;
  return {
    before: text.data.slice(0, offset),
    all: () => {
      const range = doc.createRange();
      range.setStart(field, 0);
      range.setEnd(text, offset);
      return range.toString();
    },
    node: text,
    offset,
  };
}

function typed(doc: Document, field: HTMLElement, text: string): boolean {
  field.focus?.();
  const exec = (doc as Document & { execCommand?: (c: string, ui: boolean, v: string) => boolean }).execCommand;
  try {
    return typeof exec === 'function' && exec.call(doc, 'insertText', false, text) === true;
  } catch {
    return false;
  }
}

function sendInput(field: HTMLElement, text: string) {
  const win = field.ownerDocument.defaultView;
  const Ev = win?.InputEvent ?? win?.Event ?? Event;
  field.dispatchEvent(new Ev('input', { bubbles: true, inputType: 'insertText', data: text } as InputEventInit));
}

/** Replaces the `length` characters before the caret with `text`. */
export function replaceBefore(doc: Document, field: HTMLElement, caret: Caret, length: number, text: string) {
  if (isTextField(field)) {
    const end = caret.offset;
    field.setRangeText(text, Math.max(0, end - length), end, 'end');
    sendInput(field, text);
    return;
  }
  const sel = doc.getSelection();
  if (!sel || !caret.node) return;
  const range = doc.createRange();
  range.setStart(caret.node, Math.max(0, caret.offset - length));
  range.setEnd(caret.node, caret.offset);
  sel.removeAllRanges();
  sel.addRange(range);
  if (typed(doc, field, text)) return;
  range.deleteContents();
  const t = doc.createTextNode(text);
  range.insertNode(t);
  sel.collapse(t, t.length);
  sendInput(field, text);
}

export type Saved = { range: Range } | { start: number; end: number } | null;

/** Remembers the caret (focus moves to the search box while the menu is open). */
export function saveCaret(doc: Document, field: HTMLElement): Saved {
  if (isTextField(field)) return { start: field.selectionStart ?? field.value.length, end: field.selectionEnd ?? field.value.length };
  const sel = doc.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const r = sel.getRangeAt(0);
  return field.contains(r.startContainer) ? { range: r.cloneRange() } : null;
}

/** Focuses the field and puts the caret back (or at the end). */
export function restoreCaret(doc: Document, field: HTMLElement, saved: Saved) {
  field.focus?.();
  if (isTextField(field)) {
    const end = field.value.length;
    const s = saved && 'start' in saved ? Math.min(saved.start, end) : end;
    const e = saved && 'end' in saved ? Math.min(saved.end, end) : end;
    field.setSelectionRange(s, e);
    return;
  }
  const sel = doc.getSelection();
  if (!sel) return;
  if (saved && 'range' in saved && field.contains(saved.range.startContainer)) {
    sel.removeAllRanges();
    sel.addRange(saved.range);
    return;
  }
  const r = doc.createRange();
  r.selectNodeContents(field);
  r.collapse(false);
  sel.removeAllRanges();
  sel.addRange(r);
}

/** Types `text` at the caret, with a space first when the character before isn't one. */
export function insertAtCaret(doc: Document, field: HTMLElement, text: string) {
  const caret = caretOf(doc, field);
  const prev = caret ? caret.before.slice(-1) : (field.textContent ?? '').slice(-1);
  const out = prev && !SPACE.test(prev) ? ` ${text}` : text;
  if (isTextField(field)) {
    const s = field.selectionStart ?? field.value.length;
    field.setRangeText(out, s, field.selectionEnd ?? s, 'end');
    sendInput(field, out);
    return;
  }
  if (typed(doc, field, out)) return;
  const sel = doc.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const t = doc.createTextNode(out);
  range.insertNode(t);
  sel.collapse(t, t.length);
  sendInput(field, out);
}
