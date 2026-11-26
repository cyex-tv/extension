// Which cyex.tv API this build talks to. Store and nightly beta builds use api.cyex.tv; a local beta
// build (`CYEX_TV_API=http://localhost:8787 npm run build -- beta`) talks to a local server or the
// website's mock API instead. The build sets `__CYEXTV_API__`; tests and stable builds leave it unset.
declare const __CYEXTV_API__: string | undefined;

export const DEFAULT_API_ORIGIN = 'https://api.cyex.tv';
export const API_ORIGIN = typeof __CYEXTV_API__ === 'string' && __CYEXTV_API__ ? __CYEXTV_API__ : DEFAULT_API_ORIGIN;
export const API_HOST = new URL(API_ORIGIN).hostname;
/** True only in a local beta build. */
export const LOCAL_API = API_ORIGIN !== DEFAULT_API_ORIGIN;

/** A url on the local API (pictures and reads over plain http there); always false outside a local build. */
export function onLocalApi(u: URL): boolean {
  return LOCAL_API && u.origin === API_ORIGIN && !u.username && !u.password;
}
