// The content script on Twitch and Kick: picks the site adapter, loads the settings and starts
// the app. When the settings change (the popup), it starts over with the new ones. The app
// starts before any emote provider has answered, so a slow provider never holds chat up.
import type { Answer, Request } from '../background/fetcher';
import { ext } from '../ext';
import type { FetchJson } from '../providers/types';
import { HIDDEN_EMOTES_KEY, hiddenEmotes } from '../features/cleanup/hide-emote';
import { NOTES_KEY, notes } from '../features/people/notes';
import { startHealth } from '../health/index';
import { STORAGE_KEY, type Theme, load } from '../settings';
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
let theme: Theme = 'dark';

async function start() {
  // Saved twice quickly: only the latest start may finish.
  const mine = ++generation;
  const site = location.hostname.endsWith('kick.com') ? kick : twitch;
  const settings = await load(ext().storage.sync);
  if (mine !== generation) return;
  theme = settings.theme;
  const next = new App({ site, fetch: fetchJson, settings, local: ext().storage.local });
  app?.stop();
  app = next;
  // Fail open: hidden people, ignores and highlights work at once; emotes and badges are drawn
  // as each provider answers (the background gives up on one after 5 s).
  next.start();
  void next.loadGlobals();
  void next.loadBadges();
}

ext().storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && STORAGE_KEY in changes) void start();
  // Nicknames and notes changed in another tab or on the settings page: redraw, no restart.
  if (area === 'local' && NOTES_KEY in changes) notes.replace(changes[NOTES_KEY]?.newValue);
  if (area === 'local' && HIDDEN_EMOTES_KEY in changes) hiddenEmotes.replace(changes[HIDDEN_EMOTES_KEY]?.newValue);
});

void notes.load(ext().storage.local);
void hiddenEmotes.load(ext().storage.local);
startHealth(location.hostname.endsWith('kick.com') ? kick : twitch, () => theme);

start().catch((e) => console.warn('[cyex.tv]', e));
