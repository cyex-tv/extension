/** Where the providers serve emote pictures. A picture from anywhere else (a hand-made backup) is dropped. */
export const EMOTE_CDN_HOSTS = ['cdn.7tv.app', 'cdn.betterttv.net', 'cdn.frankerfacez.com', 'cdn.cyex.tv'];

/** `url` when it is an https picture on a provider's CDN, else ''. */
export function cdnUrl(url: unknown): string {
  if (typeof url !== 'string' || url.length > 400) return '';
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !u.username && !u.password && !u.port && EMOTE_CDN_HOSTS.includes(u.hostname) ? url : '';
  } catch {
    return '';
  }
}
