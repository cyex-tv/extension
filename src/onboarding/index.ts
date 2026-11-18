// The welcome page: opens once after install, three short steps, "Skip, use defaults" on each.
// Choices only reach the settings on "Save and finish"; skipping leaves the defaults as they are.
// It never touches a Twitch or Kick tab, so chat works whether or not it's ever finished.
import { ext } from '../ext';
import { PROVIDER_LABEL } from '../popup/model';
import type { ProviderId } from '../providers/types';
import { type Settings, load, trySave } from '../settings';
import { el, toggle, trackInputMethod } from '../ui/dom';
import { useTheme } from '../ui/theme';
import { toast } from '../ui/toast';
import { ONBOARDING_KEY, ONBOARDING_VERSION, type Preset, STEPS, type State, apply, back, initial, next, skip } from './model';

const PROVIDER_HINT: Record<ProviderId, string> = {
  cyextv: 'Emotes, badges and name paints from cyex.tv.',
  '7tv': 'The biggest set of channel emotes, with badges and paints.',
  bttv: 'BetterTTV’s channel and shared emotes.',
  ffz: 'FrankerFaceZ’s channel emotes and badges.',
};

const PRESETS: { id: Preset; label: string; hint: string }[] = [
  { id: 'asIs', label: 'Keep Twitch as it is', hint: 'Nothing is hidden. You can hide parts any time in settings.' },
  { id: 'clean', label: 'Clean Twitch', hint: 'Hides the Prime, Bits and Ad-Free buttons, Stories, Viewers also watch, the leaderboard, gift banners, celebrations and the first-time chatter prompt.' },
];

let settings: Settings;
let state: State;

async function finish(skipped: boolean) {
  const target = skipped ? skip(state, settings) : next(state);
  let applied = settings;
  if (!target.skipped) {
    applied = apply(settings, target);
    const saved = await trySave(ext().storage.sync, applied);
    // Nothing is marked done, so the page stays and can be tried again (or skipped).
    if (!saved.ok) return toast(`Your choices weren’t saved. ${saved.message}`);
  }
  state = target;
  settings = applied;
  let remembered = true;
  try {
    await ext().storage.local.set({ [ONBOARDING_KEY]: { done: true, version: ONBOARDING_VERSION, at: Date.now() } });
  } catch {
    remembered = false;
  }
  render();
  if (!remembered) toast('Saved, but the browser wouldn’t note that this page is done. It may open again.');
}

function button(text: string, className: string, onclick: () => void): HTMLButtonElement {
  const b = el('button', { type: 'button', className }, text);
  b.addEventListener('click', onclick);
  return b;
}

function actions(...kids: HTMLElement[]): HTMLElement {
  return el('div', { className: 'actions' }, ...kids);
}

// First step: nothing was chosen yet that is kept. Second: the first step's choices are.
const skipButton = (label: string) => button(label, 'btn quiet', () => void finish(true));

function head(title: string, lead: string): HTMLElement[] {
  const i = STEPS.indexOf(state.step);
  const h1 = el('h1', { id: 'step-title', tabIndex: -1 }, title);
  return [el('p', { className: 'label' }, `Step ${i + 1} of ${STEPS.length}`), h1, el('p', { className: 'lead' }, lead)];
}

function providersStep(): HTMLElement[] {
  const panel = el('div', { className: 'panel' });
  for (const id of settings.order) {
    panel.append(
      toggle(PROVIDER_LABEL[id], state.choices.emotes[id], (on) => {
        state = { ...state, choices: { ...state.choices, emotes: { ...state.choices.emotes, [id]: on } } };
      }, PROVIDER_HINT[id]),
    );
  }
  return [
    ...head('Which emotes should show?', 'All four are on. Switch off any you don’t want; you can change this later.'),
    panel,
    actions(skipButton('Skip, use defaults'), el('span', { className: 'grow' }), button('Next', 'btn primary', () => go(next(state)))),
  ];
}

function looksStep(): HTMLElement[] {
  const group = el('div', { className: 'panel choices' });
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-labelledby', 'preset-label');
  for (const p of PRESETS) {
    const input = Object.assign(document.createElement('input'), { type: 'radio', name: 'preset', value: p.id, checked: state.choices.preset === p.id, className: 'radio' });
    input.addEventListener('change', () => {
      state = { ...state, choices: { ...state.choices, preset: p.id } };
      group.querySelectorAll('.choice').forEach((c) => c.classList.toggle('on', (c.querySelector('input') as HTMLInputElement).checked));
    });
    const row = el('label', { className: state.choices.preset === p.id ? 'row choice on' : 'row choice' }, input, el('span', { className: 'text' }, el('span', { className: 'name' }, p.label), el('span', { className: 'hint' }, p.hint)));
    group.append(row);
  }
  const extras = el(
    'div',
    { className: 'panel' },
    toggle('Readable name colors', state.choices.readableColors, (on) => (state = { ...state, choices: { ...state.choices, readableColors: on } }), 'Names too dark (or too light) for the chat are adjusted until they read well.'),
    toggle('Timestamps', state.choices.timestamps, (on) => (state = { ...state, choices: { ...state.choices, timestamps: on } }), 'A time like 14:03 before each message.'),
  );
  return [
    ...head('How should Twitch look?', 'Pick a starting point. Every part can be switched on its own later.'),
    el('h2', { className: 'label', id: 'preset-label' }, 'Twitch page'),
    group,
    el('h2', { className: 'label' }, 'Chat'),
    extras,
    actions(button('Back', 'btn quiet', () => go(back(state))), skipButton('Skip the rest'), el('span', { className: 'grow' }), button('Save and finish', 'btn primary', () => void finish(false))),
  ];
}

function doneStep(): HTMLElement[] {
  const settingsButton = button('Open settings', 'btn primary', () => void ext().runtime.openOptionsPage());
  const site = el('a', { className: 'btn quiet', href: 'https://cyex.tv', target: '_blank', rel: 'noreferrer' }, 'Go to cyex.tv');
  const tips = el(
    'ul',
    { className: 'tips' },
    el('li', {}, el('b', {}, 'Quick changes: '), 'click the cyex.tv icon in your browser’s toolbar. Pin it from the puzzle piece menu to keep it in view.'),
    el('li', {}, el('b', {}, 'Everything else: '), 'All settings, from the same menu: hide parts of Twitch and Kick, highlights, nicknames.'),
    el('li', {}, el('b', {}, 'This page: '), 'Settings, then About, then Show the welcome page.'),
  );
  return [
    el('p', { className: 'label' }, 'Done'),
    el('h1', { id: 'step-title', tabIndex: -1 }, 'You’re set'),
    el('p', { className: 'lead' }, state.skipped ? 'The defaults are on. Open a Twitch or Kick chat and the emotes are there.' : 'Saved. Open a Twitch or Kick chat and the emotes are there.'),
    tips,
    actions(settingsButton, site),
  ];
}

function go(s: State) {
  state = s;
  render();
}

let first = true;
function render() {
  const main = document.querySelector('#step')!;
  const parts = state.step === 'providers' ? providersStep() : state.step === 'looks' ? looksStep() : doneStep();
  main.replaceChildren(...parts);
  main.setAttribute('aria-labelledby', 'step-title');
  // Move focus to the new step's title (not on first load: the page starts at the top anyway).
  if (!first) document.getElementById('step-title')?.focus();
  first = false;
}

async function main() {
  trackInputMethod(document);
  settings = await load(ext().storage.sync);
  useTheme(document, settings.theme);
  state = initial(settings);
  render();
}

void main();
