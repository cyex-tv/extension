// The extension API: `browser` in Firefox, `chrome` in Chrome. The one place that tells them apart.
export function ext(): ExtApi {
  if (typeof browser !== 'undefined' && browser) return browser;
  if (typeof chrome !== 'undefined' && chrome) return chrome;
  throw new Error('Not running as an extension.');
}
