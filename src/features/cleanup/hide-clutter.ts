// "Hide on Twitch" / "Hide on Kick": one stylesheet with a rule per selector, each scoped to a
// feature class on <html> (`cyextv-hide-bits` and so on). Switching a part on or off only flips a
// class: no per-node work, no layout jank, and nothing removed from the page, so the sites' React
// never notices. One selector per rule, so a selector a browser can't parse drops alone.
import { hideClass, type HideSelectors } from '../../hide';
import type { ChatSettings } from '../../settings';
import type { Site } from '../../sites/index';
import type { Feature } from '../types';

/** The rules for every key the site has selectors for (all of them, whether on or not). */
export function hideCss(selectors: Readonly<Record<string, HideSelectors>>): string {
  return Object.entries(selectors)
    .flatMap(([key, list]) => list.map((sel) => `html.${hideClass(key)} ${sel} { display: none !important; }`))
    .join('\n');
}

/** The switches that apply on this site. */
export function hideFlags(site: Site, chat: ChatSettings): Record<string, boolean> {
  return site.platform === 'kick' ? chat.hideKick : chat.hide;
}

/** The keys switched on that this site can hide. */
export function hiddenKeys(site: Site, chat: ChatSettings): string[] {
  const flags = hideFlags(site, chat);
  return Object.keys(site.hide).filter((k) => flags[k] === true);
}

export function hideClutter(): Feature {
  let style: HTMLStyleElement | null = null;
  let classes: string[] = [];
  let root: HTMLElement | null = null;
  return {
    id: 'hideClutter',
    enabled: (s) => Object.values(s.chat.hide).some(Boolean) || Object.values(s.chat.hideKick).some(Boolean),
    start(ctx) {
      const keys = hiddenKeys(ctx.site, ctx.settings.chat);
      if (!keys.length) return;
      root = ctx.doc.documentElement;
      style = ctx.doc.createElement('style');
      style.id = 'cyextv-hideClutter';
      style.textContent = hideCss(ctx.site.hide);
      (ctx.doc.head ?? root).append(style);
      classes = keys.map(hideClass);
      root.classList.add(...classes);
    },
    stop() {
      root?.classList.remove(...classes);
      style?.remove();
      style = null;
      root = null;
      classes = [];
    },
  };
}
