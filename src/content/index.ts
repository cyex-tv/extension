// The content script on Twitch and Kick: picks the site adapter, loads the settings and starts
// the app. When the settings change (the popup), it starts over with the new ones.
import type { Answer, Request } from '../background/fetcher';
import { ext } from '../ext';
import type { FetchJson } from '../providers/types';
import { NOTES_KEY, notes } from '../features/people/notes';
import { STORAGE_KEY, load } from '../settings';
import { kick } from '../sites/kick';
import { twitch } from '../sites/twitch';
import { App } from './app';

export const fetchJson: FetchJson = async (url, init) => {
  const request: Request = { url, ...(init?.method ? { method: init.method } : {}), body: init?.body, ...(init?.fresh ? { fresh: true } : {}) };
  const answer = (await ext().runtime.sendMessage({ type: 'fetch', request })) as Answer;
  if (!answer.ok) throw new Error(`${answer.error} (${answer.status}) for ${url}`);
  return answer.data;
};

let app: App | null = null;

let generation = 0;

async function start() {
  // Saved twice quickly: only the latest start may finish.
  const mine = ++generation;
  const site = location.hostname.endsWith('kick.com') ? kick : twitch;
  const settings = await load(ext().storage.sync);
  if (mine !== generation) return;
  const next = new App({ site, fetch: fetchJson, settings, local: ext().storage.local });
  await Promise.all([next.loadGlobals(), next.loadBadges()]);
  if (mine !== generation) return;
  app?.stop();
  app = next;
  next.start();
}

ext().storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && STORAGE_KEY in changes) void start();
  // Nicknames and notes changed in another tab or on the settings page: redraw, no restart.
  if (area === 'local' && NOTES_KEY in changes) notes.replace(changes[NOTES_KEY]?.newValue);
});

void notes.load(ext().storage.local);

start().catch((e) => console.warn('[cyex.tv]', e));
