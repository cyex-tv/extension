// Turning a message's text into text and emote elements. Works on text nodes only, so the
// site's own markup (native emotes, mentions, links) is never touched, and running it twice on
// the same message changes nothing the second time.
import type { Animations } from '../settings';
import type { Emote, EmoteImage } from '../providers/types';
import { type Find, type Token, tokenize } from './tokenize';

export const EMOTE_CLASS = 'cyextv-emote';
const PROVIDER_NAME: Record<Emote['provider'], string> = { cyextv: 'cyex.tv', '7tv': '7TV', bttv: 'BTTV', ffz: 'FFZ' };

export type RenderOptions = { animations: Animations; tooltips: boolean };

function srcset(images: EmoteImage[]): string {
  const one = images[0]!;
  return images.map((i) => `${i.url} ${i.scale === 1 ? 1 : Math.round((i.width / one.width) * 10) / 10}x`).join(', ');
}

/** The largest image, for the rich tooltip. */
function biggest(emote: Emote): string {
  return emote.images.reduce((a, b) => (b.width > a.width ? b : a)).url;
}

/** Name, author and big image as data attributes, read by the rich tooltip. */
function describe(el: HTMLElement, emote: Emote) {
  el.dataset.provider = emote.provider;
  el.dataset.name = emote.name;
  el.dataset.id = emote.id;
  if (emote.owner) el.dataset.owner = emote.owner;
  el.dataset.big = biggest(emote);
}

function picture(doc: Document, emote: Emote, opts: RenderOptions, overlay: boolean): HTMLImageElement {
  const img = doc.createElement('img');
  const still = emote.animated && opts.animations !== 'on' && emote.stills?.length ? emote.stills : null;
  const shown = still ?? emote.images;
  const one = shown[0]!;
  img.src = one.url;
  img.srcset = srcset(shown);
  img.alt = emote.name;
  img.width = one.width;
  img.height = one.height;
  img.loading = 'lazy';
  img.decoding = 'async';
  if (overlay) {
    img.className = 'cyextv-over';
    describe(img, emote);
  }
  if (still && opts.animations === 'hover') {
    img.dataset.cyextvAnimated = emote.images[0]!.url;
    img.dataset.cyextvAnimatedSet = srcset(emote.images);
  }
  return img;
}

export function tooltip(emote: Emote): string {
  const by = emote.owner ? ` · by ${emote.owner}` : '';
  return `${emote.name}\n${PROVIDER_NAME[emote.provider]}${by}`;
}

/** One emote token as an element: the emote, any zero-width ones on top, the typed text kept. */
export function emoteElement(doc: Document, token: Extract<Token, { kind: 'emote' }>, opts: RenderOptions): HTMLElement {
  const wrap = doc.createElement('span');
  wrap.className = EMOTE_CLASS;
  describe(wrap, token.emote);
  if (opts.tooltips) wrap.title = [token.emote, ...token.overlays].map(tooltip).join('\n\n');
  wrap.append(picture(doc, token.emote, opts, false));
  for (const o of token.overlays) wrap.append(picture(doc, o, opts, true));
  // The words as typed, for copying a message (the content script's copy handler reads it).
  wrap.dataset.text = token.text;
  return wrap;
}

/** Text nodes under `root` that may be rewritten. */
export function textNodes(root: Element, skip: string): Text[] {
  const out: Text[] = [];
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || !node.nodeValue?.trim()) return NodeFilter.FILTER_REJECT;
      if (parent.closest(`.${EMOTE_CLASS}`) || (skip && parent.closest(skip) && root.contains(parent.closest(skip)))) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n as Text);
  return out;
}

/** Rewrites the emotes in `body`'s text. Returns how many emotes it placed. */
export function renderEmotes(body: Element, find: Find, skip: string, opts: RenderOptions): number {
  let placed = 0;
  const doc = body.ownerDocument;
  for (const node of textNodes(body, skip)) {
    const tokens = tokenize(node.nodeValue ?? '', find);
    if (!tokens.some((t) => t.kind === 'emote')) continue;
    const frag = doc.createDocumentFragment();
    for (const t of tokens) {
      if (t.kind === 'text') frag.append(doc.createTextNode(t.text));
      else {
        frag.append(emoteElement(doc, t, opts));
        placed++;
      }
    }
    node.replaceWith(frag);
  }
  return placed;
}

/** The page styles for placed emotes; sized like the sites' own (28 px tall at 1x). */
export const STYLES = `
.${EMOTE_CLASS} { display: inline-grid; vertical-align: middle; margin: -0.3em 0.1em; line-height: 0; }
.${EMOTE_CLASS} > img { grid-area: 1 / 1; max-height: 28px; width: auto; height: auto; place-self: center; }
.${EMOTE_CLASS} > img.cyextv-over { pointer-events: none; }
.cyextv-badges { display: inline; }
.cyextv-badges > img { display: inline-block; height: 18px; width: auto; margin: 0 3px 0 0; vertical-align: middle; border-radius: 2px; }
`;
