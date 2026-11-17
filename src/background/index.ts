// The background (a service worker in Chrome, an event page in Firefox): answers content
// scripts' fetches for the providers' APIs.
import { ext } from '../ext';
import { HEALTH_MESSAGE } from '../health/check';
import { ONBOARDING_KEY, shouldShow } from '../onboarding/model';
import { type Request, createFetcher } from './fetcher';

const handle = createFetcher();

// The welcome page, once, on a fresh install (not on updates or browser restarts).
ext().runtime.onInstalled.addListener(({ reason }) => {
  void (async () => {
    const stored = (await ext().storage.local.get(ONBOARDING_KEY))[ONBOARDING_KEY];
    if (shouldShow(reason, stored)) await ext().tabs.create({ url: ext().runtime.getURL('onboarding.html') });
  })().catch(() => {});
});

// The keyboard shortcut for the selector check: ask the open tab's content script to show it.
ext().commands.onCommand.addListener((command) => {
  if (command !== 'selector-check') return;
  void (async () => {
    const [tab] = await ext().tabs.query({ active: true, currentWindow: true });
    if (tab?.id !== undefined) await ext().tabs.sendMessage(tab.id, { type: HEALTH_MESSAGE });
  })().catch(() => {});
});

ext().runtime.onMessage.addListener((message, sender, reply) => {
  const m = message as { type?: string; request?: Request };
  // Only this extension's own pages and content scripts.
  if (sender.id !== ext().runtime.id || m?.type !== 'fetch' || !m.request) return false;
  handle(m.request).then(reply, () => reply({ ok: false, status: 0, error: 'failed' }));
  return true;
});
