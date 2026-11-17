// The popup: every setting, saved as soon as it changes (the content scripts pick it up).
import { ext } from '../ext';
import type { ProviderId } from '../providers/types';
import { type Animations, type Settings, load, save } from '../settings';
import { ICON, el, icon, toggle } from '../ui/dom';
import { COSMETIC_LABEL, PROVIDER_LABEL, channelKey, move, setAnimations, setChannel, setCosmetics, setEmotes } from './model';

const $ = <T extends Element>(sel: string) => document.querySelector<T>(sel)!;

let settings: Settings;
let here: string | null = null;

async function update(next: Settings) {
  settings = next;
  render();
  await save(ext().storage.sync, settings);
}

function render() {
  const channel = $('#channel');
  channel.replaceChildren();
  if (here) {
    const [platform, login] = here.split(':');
    channel.append(
      toggle(`On in ${login}’s chat`, !settings.disabledChannels.includes(here), (on) => update(setChannel(settings, here!, on)), platform === 'kick' ? 'Kick' : 'Twitch'),
    );
  } else {
    channel.append(el('p', { className: 'hint pad' }, 'Open a Twitch or Kick channel to switch it on or off there.'));
  }

  const emotes = $('#emotes');
  emotes.replaceChildren(
    ...settings.order.map((id: ProviderId, i) => {
      const row = toggle(PROVIDER_LABEL[id], settings.emotes[id], (on) => update(setEmotes(settings, id, on)));
      const up = el('button', { type: 'button', className: 'icon', title: 'Wins earlier', ariaLabel: `Move ${PROVIDER_LABEL[id]} up`, disabled: i === 0 }, icon(ICON.up));
      const down = el('button', { type: 'button', className: 'icon', title: 'Wins later', ariaLabel: `Move ${PROVIDER_LABEL[id]} down`, disabled: i === settings.order.length - 1 }, icon(ICON.down));
      up.addEventListener('click', (e) => (e.preventDefault(), update(move(settings, id, -1))));
      down.addEventListener('click', (e) => (e.preventDefault(), update(move(settings, id, 1))));
      row.insertBefore(el('span', { className: 'order' }, up, down), row.lastChild);
      return row;
    }),
  );

  const cosmetics = $('#cosmetics');
  cosmetics.replaceChildren(
    ...(Object.keys(COSMETIC_LABEL) as (keyof Settings['cosmetics'])[]).map((id) => {
      return toggle(COSMETIC_LABEL[id], settings.cosmetics[id], (on) => update(setCosmetics(settings, id, on)), id === '7tv' || id === 'cyextv' ? 'Badges and name paints' : 'Twitch');
    }),
  );

  document.querySelectorAll<HTMLButtonElement>('#animations button').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.value === settings.animations));
  });

  const more = $('#more');
  more.replaceChildren(
    toggle('Tooltips', settings.tooltips, (on) => update({ ...settings, tooltips: on }), 'Name, provider and author on hover.'),
    toggle('Draw anyway', settings.overrideOthers, (on) => update({ ...settings, overrideOthers: on }), 'Also show a provider’s emotes when its own extension is installed.'),
  );
  const all = el('button', { type: 'button', className: 'wide' }, 'All settings');
  all.addEventListener('click', () => void ext().runtime.openOptionsPage());
  more.append(all);
}

async function main() {
  settings = await load(ext().storage.sync);
  try {
    const [tab] = await ext().tabs.query({ active: true, currentWindow: true });
    here = channelKey(tab?.url);
  } catch {
    here = null;
  }
  document.querySelectorAll<HTMLButtonElement>('#animations button').forEach((b) => {
    b.addEventListener('click', () => update(setAnimations(settings, b.value as Animations)));
  });
  render();
}

void main();
