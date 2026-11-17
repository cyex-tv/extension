// The settings page: a sidebar of pages, drawn from the schema. Every change is saved at once
// (the content scripts pick it up); text fields save when they lose focus or on Enter.
import { ext } from '../ext';
import { COSMETIC_LABEL, PROVIDER_LABEL, move, setCosmetics, setEmotes } from '../popup/model';
import type { ProviderId } from '../providers/types';
import { type Settings, load, merge, save } from '../settings';
import { ICON, el, icon, input as inputEl, segmented, toggle } from '../ui/dom';
import { type Item, PAGES, type RuleField, getPath, setPath } from './schema';

let settings: Settings;
let page = PAGES[0]!.id;

async function update(next: Settings) {
  // Through `merge`, so the page can only ever store what the content scripts accept.
  settings = merge(next);
  render();
  await save(ext().storage.sync, settings);
}

const set = (key: string, value: unknown) => update(setPath(settings, key, value));

function field(label: string, hint: string | undefined, control: Node): HTMLElement {
  const text = el('span', { className: 'text' }, el('span', { className: 'name' }, label));
  if (hint) text.append(el('span', { className: 'hint' }, hint));
  return el('div', { className: 'row static' }, text, control);
}

function textInput(value: string, placeholder: string, onsave: (v: string) => void, label: string): HTMLInputElement {
  const input = inputEl({ type: 'text', value, placeholder, className: 'input' });
  input.setAttribute('aria-label', label);
  input.addEventListener('change', () => onsave(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur();
  });
  return input;
}

function removeButton(label: string, onclick: () => void): HTMLButtonElement {
  const b = el('button', { type: 'button', className: 'icon', title: 'Remove', ariaLabel: label }, icon(ICON.x));
  b.addEventListener('click', onclick);
  return b;
}

function namesItem(item: Extract<Item, { kind: 'names' }>): HTMLElement {
  const list = (getPath(settings, item.key) as string[]) ?? [];
  const wrap = el('div', { className: 'block' });
  const head = el('div', { className: 'text' }, el('span', { className: 'name' }, item.label));
  if (item.hint) head.append(el('span', { className: 'hint' }, item.hint));
  wrap.append(head);
  const chips = el('div', { className: 'chips' });
  for (const n of list) chips.append(el('span', { className: 'chip' }, n, removeButton(`Remove ${n}`, () => set(item.key, list.filter((x) => x !== n)))));
  const add = textInput('', item.placeholder, (v) => {
    const value = item.raw ? v.trim().toLowerCase() : v;
    if (value) set(item.key, [...list, value]);
  }, `Add to ${item.label}`);
  wrap.append(chips, add);
  return wrap;
}

function ruleControl(f: RuleField, rule: Record<string, unknown>, onchange: (v: unknown) => void): HTMLElement {
  if (f.kind === 'bool') {
    const input = inputEl({ type: 'checkbox', checked: rule[f.key] === true });
    input.addEventListener('change', () => onchange(input.checked));
    const l = el('label', { className: 'check' }, input, f.label);
    if (f.hint) l.title = f.hint;
    return l;
  }
  if (f.kind === 'color') {
    const value = typeof rule[f.key] === 'string' ? (rule[f.key] as string) : '';
    const input = inputEl({ type: 'color', value: value || '#ff6b6b', className: value ? 'swatch' : 'swatch unset' });
    input.setAttribute('aria-label', f.label);
    input.title = f.hint ?? f.label;
    input.addEventListener('change', () => onchange(input.value));
    const parts: Node[] = [input];
    if (value) parts.push(removeButton('Default color', () => onchange('')));
    return el('span', { className: 'colour' }, ...parts);
  }
  const t = textInput(String(rule[f.key] ?? ''), f.placeholder ?? '', (v) => onchange(v), f.label);
  if (f.hint) t.title = f.hint;
  return t;
}

function rulesItem(item: Extract<Item, { kind: 'rules' }>): HTMLElement {
  const rules = (getPath(settings, item.key) as Record<string, unknown>[]) ?? [];
  const wrap = el('div', { className: 'rules' });
  rules.forEach((rule, i) => {
    const row = el('div', { className: 'rule' });
    for (const f of item.fields) {
      row.append(
        ruleControl(f, rule, (v) => {
          const next = rules.map((r, j) => (j === i ? { ...r, [f.key]: v } : r));
          void set(item.key, next);
        }),
      );
    }
    row.append(removeButton('Remove rule', () => set(item.key, rules.filter((_, j) => j !== i))));
    wrap.append(row);
  });
  // A new rule needs its pattern first: the field adds it once something is typed.
  const first = item.fields[0]!;
  const add = el('div', { className: 'rule new' });
  add.append(textInput('', `Add: ${first.placeholder ?? first.label}`, (v) => v.trim() && set(item.key, [...rules, { ...item.blank, [first.key]: v.trim() }]), `Add ${item.label}`));
  wrap.append(add);
  return wrap;
}

function providers(): HTMLElement {
  const panel = el('div', { className: 'panel' });
  settings.order.forEach((id: ProviderId, i) => {
    const row = toggle(PROVIDER_LABEL[id], settings.emotes[id], (on) => update(setEmotes(settings, id, on)));
    const up = el('button', { type: 'button', className: 'icon', title: 'Wins earlier', ariaLabel: `Move ${PROVIDER_LABEL[id]} up`, disabled: i === 0 }, icon(ICON.up));
    const down = el('button', { type: 'button', className: 'icon', title: 'Wins later', ariaLabel: `Move ${PROVIDER_LABEL[id]} down`, disabled: i === settings.order.length - 1 }, icon(ICON.down));
    up.addEventListener('click', (e) => (e.preventDefault(), update(move(settings, id, -1))));
    down.addEventListener('click', (e) => (e.preventDefault(), update(move(settings, id, 1))));
    row.insertBefore(el('span', { className: 'order' }, up, down), row.lastChild);
    panel.append(row);
  });
  return panel;
}

function cosmetics(): HTMLElement {
  const panel = el('div', { className: 'panel' });
  for (const id of Object.keys(COSMETIC_LABEL) as (keyof Settings['cosmetics'])[]) {
    panel.append(toggle(COSMETIC_LABEL[id], settings.cosmetics[id], (on) => update(setCosmetics(settings, id, on)), id === '7tv' ? 'Badges and name paints' : 'Twitch'));
  }
  return panel;
}

function itemNode(item: Item): HTMLElement {
  switch (item.kind) {
    case 'toggle':
      return toggle(item.label, getPath(settings, item.key) === true, (on) => set(item.key, on), item.hint);
    case 'choice':
      return field(item.label, item.hint, segmented(item.label, item.options, String(getPath(settings, item.key)), (v) => set(item.key, v)));
    case 'number': {
      const value = Number(getPath(settings, item.key)) || 0;
      const input = inputEl({ type: 'number', min: String(item.min), max: String(item.max), value: value ? String(value) : '', placeholder: item.zero ?? '', className: 'input num' });
      input.setAttribute('aria-label', item.label);
      input.addEventListener('change', () => set(item.key, input.value === '' ? 0 : Number(input.value)));
      return field(item.label, item.hint, el('span', { className: 'unit' }, input, item.unit));
    }
    case 'names':
      return namesItem(item);
    case 'rules':
      return rulesItem(item);
    case 'providers':
      return providers();
    case 'cosmetics':
      return cosmetics();
  }
}

function render() {
  const nav = document.querySelector('#nav')!;
  nav.replaceChildren(
    ...PAGES.map((p) => {
      const b = el('button', { type: 'button', className: 'nav-item' }, el('span', { className: 'name' }, p.title));
      if (p.id === page) b.setAttribute('aria-current', 'page');
      b.addEventListener('click', () => {
        page = p.id;
        location.hash = p.id;
        render();
      });
      return b;
    }),
  );
  const current = PAGES.find((p) => p.id === page) ?? PAGES[0]!;
  const main = document.querySelector('#page')!;
  main.replaceChildren(
    el('header', { className: 'page-head' }, el('h1', {}, current.title), el('p', { className: 'hint' }, current.hint)),
    ...current.sections.map((s) => {
      const sec = el('section', {}, el('h2', { className: 'label' }, s.title));
      if (s.hint) sec.append(el('p', { className: 'hint' }, s.hint));
      const simple = s.items.every((i) => i.kind === 'toggle' || i.kind === 'choice' || i.kind === 'number');
      const items = s.items.map(itemNode);
      sec.append(simple ? el('div', { className: 'panel' }, ...items) : el('div', { className: 'stack' }, ...items));
      return sec;
    }),
  );
}

async function main() {
  settings = await load(ext().storage.sync);
  const fromHash = location.hash.slice(1);
  if (PAGES.some((p) => p.id === fromHash)) page = fromHash;
  render();
}

void main();
