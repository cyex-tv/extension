// The content script on Twitch and Kick: picks the site adapter, loads the settings and starts
// the app. When the settings change (the popup), it starts over with the new ones.
import type { Answer, Request } from '../background/fetcher';
import { ext } from '../ext';
import type { FetchJson } from '../providers/types';
import { STORAGE_KEY, load } from '../settings';
import { kick } from '../sites/kick';
import { twitch } from '../sites/twitch';
import { App } from './app';

export const fetchJson: FetchJson = async (url, init) => {
  const request: Request = { url, ...(init?.method ? { method: init.method } : {}), body: init?.body };
  const answer = (await ext().runtime.sendMessage({ type: 'fetch', request })) as Answer;
  if (!answer.ok) throw new Error(`${answer.error} (${answer.status}) for ${url}`);
  return answer.data;
};

let app: App | null = null;

async function start() {
  app?.stop();
  const site = location.hostname.endsWith('kick.com') ? kick : twitch;
  const settings = await load(ext().storage.sync);
  app = new App({ site, fetch: fetchJson, settings });
  await Promise.all([app.loadGlobals(), app.loadBadges()]);
  app.start();
}

ext().storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && STORAGE_KEY in changes) void start();
});

start().catch((e) => console.warn('[cyex.tv]', e));
