// Splits a chat message's text into plain text and emotes. Words are separated by whitespace and
// matched exactly (case matters, punctuation is part of the word, as in every emote extension).
// Links and `code` are never touched. A zero-width emote, or an FFZ modifier, after an emote
// sits on top of it instead of taking its own place, together with the space between them.
import type { Emote } from '../providers/types';

export type Token =
  | { kind: 'text'; text: string }
  | { kind: 'emote'; emote: Emote; text: string; overlays: Emote[] };

export type Find = (word: string) => Emote | undefined;

const LINK = /^(?:https?:\/\/|www\.)\S+$|^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:[/?#]\S*)?$/i;

/** Whether `word` reads as a link (the platforms make those clickable; leave them be). */
export function isLink(word: string): boolean {
  return LINK.test(word);
}

function pushText(out: Token[], text: string) {
  if (!text) return;
  const last = out.at(-1);
  if (last?.kind === 'text') last.text += text;
  else out.push({ kind: 'text', text });
}

/** `text` as tokens. `find` says which emote a word is, if any. */
export function tokenize(text: string, find: Find): Token[] {
  const out: Token[] = [];
  // Split into code spans and the rest; code spans stay text.
  const parts = text.split(/(`[^`\n]+`)/);
  for (const part of parts) {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 1) {
      pushText(out, part);
      continue;
    }
    for (const piece of part.split(/(\s+)/)) {
      if (!piece) continue;
      if (/^\s+$/.test(piece) || isLink(piece)) {
        pushText(out, piece);
        continue;
      }
      const emote = find(piece);
      if (!emote) {
        pushText(out, piece);
        continue;
      }
      if (emote.zeroWidth) {
        // On top of the emote before it, when only whitespace separates them.
        const last = out.at(-1);
        const before = out.at(-2);
        const target = last?.kind === 'emote' ? last : last?.kind === 'text' && /^\s+$/.test(last.text) && before?.kind === 'emote' ? before : null;
        if (target) {
          if (target !== last) out.pop();
          target.overlays.push(emote);
          target.text += (target !== last ? (last as { text: string }).text : '') + piece;
          continue;
        }
      }
      out.push({ kind: 'emote', emote, text: piece, overlays: [] });
    }
  }
  return out;
}
