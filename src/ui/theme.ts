// The Theme setting on the extension's own pages. Storage is async, so the choice is mirrored in
// the page origin's localStorage, which the tiny theme.js reads before the page draws (no flash
// of the wrong theme). Each page calls `useTheme` once its settings are loaded.
import type { Theme } from '../settings';

export const THEME_MIRROR = 'cyextvTheme';

/** The theme to draw: "system" follows the OS. */
export function resolveTheme(theme: Theme, prefersLight: boolean): 'dark' | 'light' {
  return theme === 'system' ? (prefersLight ? 'light' : 'dark') : theme;
}

export function applyTheme(doc: Document, theme: Theme): void {
  const light = doc.defaultView?.matchMedia?.('(prefers-color-scheme: light)').matches ?? false;
  if (resolveTheme(theme, light) === 'light') doc.documentElement.dataset.theme = 'light';
  else delete doc.documentElement.dataset.theme;
}

/** Documents that already follow the OS: each page registers its listener once, however often it calls `useTheme`. */
const following = new WeakSet<Document>();

/** Applies the theme now, mirrors it for the next load, and follows the OS while on "system". */
export function useTheme(doc: Document, theme: Theme): void {
  applyTheme(doc, theme);
  try {
    doc.defaultView?.localStorage.setItem(THEME_MIRROR, theme);
  } catch {
    /* no localStorage: the page still gets the theme, just after loading */
  }
  if (following.has(doc)) return;
  const mq = doc.defaultView?.matchMedia?.('(prefers-color-scheme: light)');
  if (!mq?.addEventListener) return;
  following.add(doc);
  mq.addEventListener('change', () => {
    if (readMirror(doc) === 'system') applyTheme(doc, 'system');
  });
}

export function readMirror(doc: Document): Theme {
  try {
    const v = doc.defaultView?.localStorage.getItem(THEME_MIRROR);
    return v === 'light' || v === 'system' ? v : 'dark';
  } catch {
    return 'dark';
  }
}
