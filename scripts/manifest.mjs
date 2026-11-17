// The Manifest V3 for each browser. Chrome runs the background as a service worker; Firefox
// as an event page (`background.scripts`) and needs its add-on ID. Everything else is shared.

const HOSTS = ['https://api.cyex.tv/*', 'https://7tv.io/*', 'https://api.betterttv.net/*', 'https://api.frankerfacez.com/*'];
const SITES = ['https://www.twitch.tv/*', 'https://kick.com/*'];

/** @param {'chrome' | 'firefox'} target @param {string} version */
export function manifest(target, version) {
  const base = {
    manifest_version: 3,
    name: 'cyex.tv',
    short_name: 'cyex.tv',
    description: 'Emotes, badges and name paints from cyex.tv, 7TV, BTTV and FFZ in Twitch and Kick chat.',
    version,
    permissions: ['storage'],
    host_permissions: HOSTS,
    content_scripts: [{ matches: SITES, js: ['content.js'], run_at: 'document_idle' }],
    action: { default_title: 'cyex.tv', default_icon: { 16: 'icons/16.png', 32: 'icons/32.png', 48: 'icons/48.png' } },
    icons: { 16: 'icons/16.png', 32: 'icons/32.png', 48: 'icons/48.png', 128: 'icons/128.png' },
  };
  if (target === 'chrome') return { ...base, background: { service_worker: 'background.js' }, minimum_chrome_version: '116' };
  return {
    ...base,
    background: { scripts: ['background.js'] },
    browser_specific_settings: { gecko: { id: 'extension@cyex.tv', strict_min_version: '128.0' } },
  };
}
