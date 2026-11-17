// Runs in the page's own world (manifest `world: "MAIN"`), because Twitch and Kick keep the
// sender's and the channel's IDs only in their React props, which content scripts can't see.
// It copies what the content script needs onto `data-cyextv-*` attributes and does nothing
// else: no network, no changes to the page's behaviour.
//
// - each chat message: `data-cyextv-uid` (the sender's platform user ID), `data-cyextv-first`
//   (Twitch: the sender's first message in the channel);
// - <html>: `data-cyextv-channel` (Twitch's channel ID), `data-cyextv-others` (other emote
//   extensions found: 7tv, bttv, ffz).
import { kickSender, twitchChannelId, twitchFirst, twitchSender } from './react';

const TWITCH_MESSAGE = '[data-a-target="chat-line-message"]';
const KICK_MESSAGE = '#chatroom-messages [data-index]';

const kick = location.hostname.endsWith('kick.com');
const html = document.documentElement;

function tag(el: Element) {
  if (el.hasAttribute('data-cyextv-uid')) return;
  const id = kick ? kickSender(el) : twitchSender(el);
  if (!kick && twitchFirst(el)) el.setAttribute('data-cyextv-first', '');
  if (id) el.setAttribute('data-cyextv-uid', id);
}

function scan(root: ParentNode) {
  root.querySelectorAll(kick ? KICK_MESSAGE : TWITCH_MESSAGE).forEach(tag);
  if (!kick) {
    const container = document.querySelector('[data-test-selector="chat-scrollable-area__message-container"]');
    const channel = container ? twitchChannelId(container) : null;
    if (channel && html.dataset.cyextvChannel !== channel) html.dataset.cyextvChannel = channel;
  }
}

function others(): string {
  const w = window as unknown as Record<string, unknown>;
  const found: string[] = [];
  if (document.querySelector('[id^="seventv"], [class*="seventv-"]')) found.push('7tv');
  if ('BetterTTV' in w || document.querySelector('[id^="bttv-"], [class*="bttv-"]')) found.push('bttv');
  if ('FrankerFaceZ' in w || 'ffz' in w) found.push('ffz');
  return found.join(',');
}

let queued = false;
new MutationObserver(() => {
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    scan(document);
  });
}).observe(html, { childList: true, subtree: true });
scan(document);

// Other extensions load at their own pace; look for them for the first minute.
let checks = 0;
const timer = setInterval(() => {
  const found = others();
  if (html.dataset.cyextvOthers !== found) html.dataset.cyextvOthers = found;
  if (++checks >= 12) clearInterval(timer);
}, 5000);
html.dataset.cyextvOthers = others();
