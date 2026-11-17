// The popup: every setting, saved as soon as it changes (the content scripts pick it up).
import { ext } from '../ext';
import type { ProviderId } from '../providers/types';
import { type Animations, type Settings, load, save } from '../settings';
import { COSMETIC_LABEL, PROVIDER_LABEL, channelKey, move, setAnimations, setChannel, setCosmetics, setEmotes } from './model';

const $ = <T extends Element>(sel: string) => document.querySelector<T>(sel)!;

let settings: Settings;
let here: string | null = null;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...kids);
  return node;
}

/** A labelled switch (cyex-app toggle): a checkbox styled as a track with a knob. */
function toggle(label: string, checked: boolean, onchange: (on: boolean) => void, hint?: string) {
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.className = 'switch';
  input.checked = checked;
  input.addEventListener('change', () => onchange(input.checked));
  const text = el('span', { className: 'text' }, el('span', { className: 'name' }, label));
  if (hint) text.append(el('span', { className: 'hint' }, hint));
  return el('label', { className: 'row' }, text, input);
}

/** A 14 px stroke chevron (Lucide path). */
function chevron(d: string): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', d);
  svg.append(path);
  return svg;
}

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
      const up = el('button', { type: 'button', className: 'icon', title: 'Wins earlier', ariaLabel: `Move ${PROVIDER_LABEL[id]} up`, disabled: i === 0 }, chevron('m6 15 6-6 6 6'));
      const down = el('button', { type: 'button', className: 'icon', title: 'Wins later', ariaLabel: `Move ${PROVIDER_LABEL[id]} down`, disabled: i === settings.order.length - 1 }, chevron('m6 9 6 6 6-6'));
      up.addEventListener('click', (e) => (e.preventDefault(), update(move(settings, id, -1))));
      down.addEventListener('click', (e) => (e.preventDefault(), update(move(settings, id, 1))));
      row.insertBefore(el('span', { className: 'order' }, up, down), row.lastChild);
      return row;
    }),
  );

  const cosmetics = $('#cosmetics');
  cosmetics.replaceChildren(
    ...(Object.keys(COSMETIC_LABEL) as (keyof Settings['cosmetics'])[]).map((id) => {
      const later = id === '7tv';
      const row = toggle(COSMETIC_LABEL[id], settings.cosmetics[id], (on) => update(setCosmetics(settings, id, on)), later ? 'Badges and paints come later.' : 'Twitch');
      // 7TV's badges and paints need its live socket; the switch waits for them.
      if (later) {
        row.classList.add('off');
        row.querySelector('input')!.disabled = true;
      }
      return row;
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
