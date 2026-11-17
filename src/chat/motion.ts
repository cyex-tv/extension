// "Animate only when the window is focused": pictures that can move (animated emotes, badges)
// carry both their moving and their still sources in data attributes, and showing one or the
// other is a swap of `src` and `srcset`. Nothing is redrawn and no node is replaced.

/** A picture's sources: one URL, and the srcset to go with it. */
export type Source = { src: string; set: string };

/** What a picture can show; the one drawn now depends on whether motion is paused. */
export type Pair = { moving: Source; still: Source };

export const MOVING_SELECTOR = '.cyextv-emote img[data-cyextv-moving], .cyextv-badges img[data-cyextv-moving]';

function show(img: HTMLImageElement, s: Source): void {
  img.srcset = s.set;
  img.src = s.src;
}

/** Puts the right source on a new picture and remembers both, so the swap can happen later. */
export function placeMotion(img: HTMLImageElement, pair: Pair, paused: boolean): void {
  img.dataset.cyextvMoving = pair.moving.src;
  img.dataset.cyextvMovingSet = pair.moving.set;
  img.dataset.cyextvStillSrc = pair.still.src;
  img.dataset.cyextvStillSetValue = pair.still.set;
  show(img, paused ? pair.still : pair.moving);
}

/** Freezes (or releases) every picture in `root` that placeMotion marked. Returns how many it swapped. */
export function setPaused(root: ParentNode, paused: boolean): number {
  let n = 0;
  for (const img of root.querySelectorAll<HTMLImageElement>(MOVING_SELECTOR)) {
    const d = img.dataset;
    const s = paused ? { src: d.cyextvStillSrc ?? '', set: d.cyextvStillSetValue ?? '' } : { src: d.cyextvMoving ?? '', set: d.cyextvMovingSet ?? '' };
    if (!s.src || img.getAttribute('src') === s.src) continue;
    show(img, s);
    n++;
  }
  return n;
}

/** Whether the page's window is the one in use: focused, and its tab showing. */
export function isActive(doc: Document): boolean {
  return doc.visibilityState !== 'hidden' && doc.hasFocus();
}
