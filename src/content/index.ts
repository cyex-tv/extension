// The content script on Twitch and Kick. This first version loads the settings and the emote
// sets the user has switched on, through the background; the site adapters that find chat
// messages and draw the emotes come next (sites/twitch, sites/kick).
import type { Answer, Request } from '../background/fetcher';
import { EmoteIndex } from '../chat/index';
import { ext } from '../ext';
import { PROVIDERS } from '../providers';
import type { EmoteSet, FetchJson, Platform } from '../providers/types';
import { load } from '../settings';

export const fetchJson: FetchJson = async (url, init) => {
  const request: Request = { url, ...(init?.method ? { method: init.method } : {}), body: init?.body };
  const answer = (await ext().runtime.sendMessage({ type: 'fetch', request })) as Answer;
  if (!answer.ok) throw new Error(`${answer.error} (${answer.status}) for ${url}`);
  return answer.data;
};

/** The global sets of every enabled provider that has emotes on `platform`. */
export async function globalSets(platform: Platform): Promise<EmoteSet[]> {
  const settings = await load(ext().storage.sync);
  const on = settings.order.filter((id) => settings.emotes[id] && PROVIDERS[id].platforms.includes(platform));
  const results = await Promise.allSettled(on.map((id) => PROVIDERS[id].global(fetchJson)));
  return results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
}

async function start() {
  const platform: Platform = location.hostname.endsWith('kick.com') ? 'kick' : 'twitch';
  const settings = await load(ext().storage.sync);
  const index = new EmoteIndex(settings.order);
  index.setSets(await globalSets(platform));
  console.debug(`[cyex.tv] ${index.size} global emotes ready on ${platform}`);
}

start().catch((e) => console.warn('[cyex.tv]', e));
