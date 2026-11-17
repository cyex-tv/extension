// The Manifest V3 for each browser. Chrome runs the background as a service worker; Firefox
// as an event page (`background.scripts`) and needs its add-on ID. Everything else is shared.

const HOSTS = ['https://api.cyex.tv/*', 'https://7tv.io/*', 'https://api.betterttv.net/*', 'https://api.frankerfacez.com/*', 'https://api.cyex.app/badges/v1/*'];
const SITES = ['https://www.twitch.tv/*', 'https://kick.com/*'];

/** @param {'chrome' | 'firefox'} target @param {string} version */
export function manifest(target, version) {
  const base = {
    manifest_version: 3,
    name: 'cyex.tv',
    short_name: 'cyex.tv',
    description: 'Emotes, badges and name paints from cyex.tv, 7TV, BTTV and FFZ in Twitch and Kick chat.',
    version,
    // activeTab: the popup reads the open tab's address (to switch a channel off) after a click.
    permissions: ['storage', 'activeTab'],
    host_permissions: HOSTS,
    content_scripts: [
      // Reads the sites' React props (sender and channel IDs) into data attributes; see src/main.
      { matches: SITES, js: ['main.js'], run_at: 'document_idle', world: 'MAIN' },
      { matches: SITES, js: ['content.js'], run_at: 'document_idle' },
    ],
    action: { default_title: 'cyex.tv', default_popup: 'popup.html', default_icon: { 16: 'icons/16.png', 32: 'icons/32.png', 48: 'icons/48.png' } },
    options_ui: { page: 'options.html', open_in_tab: true },
    icons: { 16: 'icons/16.png', 32: 'icons/32.png', 48: 'icons/48.png', 128: 'icons/128.png' },
  };
  if (target === 'chrome') return { ...base, background: { service_worker: 'background.js' }, minimum_chrome_version: '116' };
  return {
    ...base,
    background: { scripts: ['background.js'] },
    browser_specific_settings: { gecko: { id: 'extension@cyex.tv', strict_min_version: '128.0' } },
  };
}
