// Clean text: invisible characters out of messages (zero-width spaces, word joiners, the U+E0000
// tag 7TV and others add to get past "duplicate message"), and stacks of combining marks cut down
// ("zalgo"). Runs before everything else, so emotes with an invisible tail still match. Letters
// that need joiners keep them: ZWNJ (Persian, Indic scripts), direction marks, and ZWJ inside
// emoji sequences (families, flags) all stay.
import { textNodes } from '../../chat/render';
import type { Feature, FeatureContext } from '../types';

// Zero-width space, word joiner and invisible operators, BOM, soft hyphen, combining grapheme
// joiner, Mongolian vowel separator, and the language tag / cancel tag on their own.
const INVISIBLE = /[​⁠-⁤﻿­͏᠎]|\u{E0000}|\u{E0001}/gu;
/** A ZWJ that doesn't join two emoji. */
const LONE_ZWJ = /(?<![\p{Extended_Pictographic}\p{Emoji_Modifier}️])‍|‍(?!\p{Extended_Pictographic})/gu;
/** Combining marks past the third on one letter. */
const ZALGO = /(\p{Mn}{3})\p{Mn}+/gu;

export function cleanText(text: string, o: { invisible: boolean; zalgo: boolean }): string {
  let out = text;
  if (o.invisible) out = out.replace(INVISIBLE, '').replace(LONE_ZWJ, '');
  if (o.zalgo) out = out.replace(ZALGO, '$1');
  return out;
}

export function cleanMessages(): Feature {
  let ctx: FeatureContext | null = null;
  return {
    id: 'cleanText',
    enabled: (s) => s.chat.cleanInvisible || s.chat.cleanZalgo,
    start(c) {
      ctx = c;
    },
    prepare(message, info) {
      if (!ctx) return;
      const body = ctx.site.body(message);
      if (!body) return;
      const o = { invisible: ctx.settings.chat.cleanInvisible, zalgo: ctx.settings.chat.cleanZalgo };
      let changed = false;
      for (const node of textNodes(body, ctx.site.skip)) {
        const before = node.nodeValue ?? '';
        const after = cleanText(before, o);
        if (after !== before) {
          node.nodeValue = after;
          changed = true;
        }
      }
      if (changed) info.text = cleanText(info.text, o);
      return changed || undefined;
    },
    stop() {
      ctx = null;
    },
  };
}
