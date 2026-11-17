// The settings page: a sidebar of grouped pages with a search, drawn from the schema. Every change
// is saved at once (the content scripts pick it up); text fields save when they lose focus or on
// Enter. Each section can go back to its defaults, with an undo; About has the backup file.
import { ext } from '../ext';
import { HIDDEN_EMOTES_KEY, HiddenEmotesStore } from '../features/cleanup/hide-emote';
import { NICK_MAX, NOTE_MAX, NotesStore } from '../features/people/notes';
import { COSMETIC_LABEL, PROVIDER_LABEL, move, setCosmetics, setEmotes } from '../popup/model';
import type { ProviderId } from '../providers/types';
import { DEFAULTS, type Settings, load, merge, save } from '../settings';
import { ICON, el, icon, input as inputEl, segmented, toggle } from '../ui/dom';
import { useTheme } from '../ui/theme';
import { backupFile, isDefault, readBackup, resetSection, search } from './model';
import { GROUPS, type Item, PAGES, type Page, type RuleField, type Section, getPath, setPath } from './schema';

let settings: Settings;
let page = PAGES[0]!.id;
let query = '';
const notes = new NotesStore();
const hidden = new HiddenEmotesStore();

async function update(next: Settings) {
  // Through `merge`, so the page can only ever store what the content scripts accept.
  settings = merge(next);
  useTheme(document, settings.theme);
  render();
  await save(ext().storage.sync, settings);
}

const set = (key: string, value: unknown) => update(setPath(settings, key, value));

// --- Small parts -------------------------------------------------------------------------------

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
  const b = el('button', { type: 'button', className: 'icon', title: label, ariaLabel: label }, icon(ICON.x));
  b.addEventListener('click', onclick);
  return b;
}

function button(text: string, className: string, onclick: () => void): HTMLButtonElement {
  const b = el('button', { type: 'button', className }, text);
  b.addEventListener('click', onclick);
  return b;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;
/** A short note at the bottom, with an optional undo (cyex-app toast). */
function toast(text: string, undo?: () => void) {
  const box = document.querySelector<HTMLElement>('#toast')!;
  const kids: Node[] = [el('span', {}, text)];
  if (undo) {
    kids.push(
      button('Undo', 'link', () => {
        box.replaceChildren();
        undo();
      }),
    );
  }
  box.replaceChildren(...kids);
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.replaceChildren(), 6000);
}

// --- Items -------------------------------------------------------------------------------------

function namesItem(item: Extract<Item, { kind: 'names' }>): HTMLElement {
  const list = (getPath(settings, item.key) as string[]) ?? [];
  const wrap = el('div', { className: 'block' });
  const head = el('div', { className: 'text' }, el('span', { className: 'name' }, item.label));
  if (item.hint) head.append(el('span', { className: 'hint' }, item.hint));
  wrap.append(head);
  const chips = el('div', { className: 'chips' });
  for (const n of list) chips.append(el('span', { className: 'chip' }, n, removeButton(`Remove ${n}`, () => set(item.key, list.filter((x) => x !== n)))));
  const add = textInput(
    '',
    item.placeholder,
    (v) => {
      const value = item.raw ? v.trim().toLowerCase() : v;
      if (value) void set(item.key, [...list, value]);
    },
    `Add to ${item.label}`,
  );
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
      row.append(ruleControl(f, rule, (v) => void set(item.key, rules.map((r, j) => (j === i ? { ...r, [f.key]: v } : r)))));
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
    panel.append(toggle(COSMETIC_LABEL[id], settings.cosmetics[id], (on) => update(setCosmetics(settings, id, on)), id === '7tv' || id === 'cyextv' ? 'Badges and name paints' : 'Twitch'));
  }
  return panel;
}

function notesItem(): HTMLElement {
  const all = Object.entries(notes.all()).sort(([a], [b]) => a.localeCompare(b));
  if (!all.length) return el('p', { className: 'hint block' }, 'None yet. Open someone’s user card in chat to add a nickname or a note.');
  const wrap = el('div', { className: 'rules' });
  for (const [login, entry] of all) {
    const row = el('div', { className: 'rule' });
    const nick = textInput(entry.nick, 'Nickname', (v) => void notes.set(login, { ...entry, nick: v }), `Nickname for ${login}`);
    nick.maxLength = NICK_MAX;
    const note = textInput(entry.note, 'Note', (v) => void notes.set(login, { ...entry, note: v }), `Note for ${login}`);
    note.maxLength = NOTE_MAX;
    row.append(el('span', { className: 'login' }, login), nick, note, removeButton(`Remove ${login}`, () => void notes.set(login, { nick: '', note: '' })));
    wrap.append(row);
  }
  return wrap;
}

function hiddenEmotesItem(): HTMLElement {
  const all = hidden.list();
  if (!all.length) return el('p', { className: 'hint block' }, 'None yet. Right-click an emote in chat to hide it.');
  const panel = el('div', { className: 'panel' });
  for (const e of all) {
    const text = el('span', { className: 'text' }, el('span', { className: 'name' }, e.name), el('span', { className: 'hint' }, PROVIDER_LABEL[e.provider]));
    const kids: Node[] = [];
    if (e.url) {
      const img = el('img', { className: 'emote-thumb', src: e.url, alt: '' });
      img.loading = 'lazy';
      img.addEventListener('error', () => img.remove());
      kids.push(img);
    }
    const unhide = button('Unhide', 'link', () => {
      void hidden.remove(e);
      toast(`${e.name} is shown again.`, () => void hidden.add(e));
    });
    unhide.setAttribute('aria-label', `Unhide ${e.name}`);
    panel.append(el('div', { className: 'row static' }, ...kids, text, unhide));
  }
  if (all.length > 1) {
    panel.append(
      button('Unhide all', 'wide', () => {
        const before = hidden.list();
        void hidden.set([]);
        toast('Every emote is shown again.', () => void hidden.set(before));
      }),
    );
  }
  return panel;
}

function shortcutsItem(item: Extract<Item, { kind: 'shortcuts' }>): HTMLElement {
  const dl = el('dl', { className: 'keys' });
  for (const [k, what] of item.keys) dl.append(el('dt', {}, ...k.split(/(\+|, )/).map((p) => (p === '+' || p === ', ' ? p : el('kbd', {}, p)))), el('dd', {}, what));
  return dl;
}

let resetArmed: ReturnType<typeof setTimeout> | null = null;
function backupItem(): HTMLElement {
  const exportButton = button('Export', 'btn', () => {
    const file = backupFile(settings, notes.all(), new Date());
    const url = URL.createObjectURL(new Blob([file.text], { type: 'application/json' }));
    const a = el('a', { href: url, download: file.name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`Saved ${file.name}.`);
  });
  const picker = inputEl({ type: 'file' });
  picker.accept = 'application/json,.json';
  picker.hidden = true;
  picker.addEventListener('change', async () => {
    const f = picker.files?.[0];
    if (!f) return;
    const result = readBackup(await f.text());
    picker.value = '';
    if (!result.ok) return toast(result.error);
    const before = settings;
    const beforeNotes = notes.all();
    if (result.notes) await notes.setAll(result.notes);
    await update(result.settings);
    toast('Imported.', () => {
      void notes.setAll(beforeNotes);
      void update(before);
    });
  });
  const importButton = button('Import', 'btn', () => picker.click());
  const reset = button('Reset everything', 'btn danger', () => {
    if (!resetArmed) {
      reset.textContent = 'Click again to reset';
      resetArmed = setTimeout(() => {
        resetArmed = null;
        reset.textContent = 'Reset everything';
      }, 4000);
      return;
    }
    clearTimeout(resetArmed);
    resetArmed = null;
    const before = settings;
    void update(DEFAULTS);
    toast('Every setting is back to its default.', () => void update(before));
  });
  return el(
    'div',
    { className: 'panel' },
    field('Export', 'Downloads a .json file.', exportButton),
    field('Import', 'Replaces your settings with the file’s.', el('span', {}, importButton, picker)),
    field('Reset everything', 'Every setting back to its default. Nicknames and notes stay.', reset),
  );
}

function itemNode(item: Item): HTMLElement {
  switch (item.kind) {
    case 'toggle':
      return toggle(item.label, getPath(settings, item.key) === true, (on) => set(item.key, on), item.hint);
    case 'choice':
      return field(item.label, item.hint, segmented(item.label, item.options, String(getPath(settings, item.key)), (v) => set(item.key, v)));
    case 'number': {
      const value = Number(getPath(settings, item.key)) || 0;
      const input = inputEl({ type: 'number', min: String(item.min), max: String(item.max), value: value || !item.zero ? String(value) : '', placeholder: item.zero ?? '', className: 'input num' });
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
    case 'notes':
      return notesItem();
    case 'hiddenEmotes':
      return hiddenEmotesItem();
    case 'shortcuts':
      return shortcutsItem(item);
    case 'backup':
      return backupItem();
    case 'link': {
      const a = el('a', { className: 'btn', href: item.href, target: '_blank', rel: 'noreferrer' }, item.text);
      return field(item.label, item.hint, a);
    }
  }
}

// --- Sections and pages ------------------------------------------------------------------------

/** Gives each focusable control a stable name, so focus survives a redraw. */
function nameControls(root: Element, prefix: string) {
  root.querySelectorAll<HTMLElement>('button, input, a[href], [tabindex]').forEach((c, i) => (c.dataset.fk = `${prefix}#${i}`));
}

function sectionNode(p: Page, s: Section, items: Item[], withPage: boolean): HTMLElement {
  const title = withPage ? `${p.title} · ${s.title}` : s.title;
  const head = el('div', { className: 'section-head' }, el('h2', { className: 'label' }, title));
  if (!isDefault(settings, s)) {
    const r = button('Reset', 'link', () => {
      const before = settings;
      void update(resetSection(settings, s));
      toast(`${s.title} is back to the defaults.`, () => void update(before));
    });
    r.setAttribute('aria-label', `Reset ${s.title} to the defaults`);
    r.dataset.fk = `reset:${p.id}:${s.title}`;
    head.append(r);
  }
  const sec = el('section', {}, head);
  if (s.hint) sec.append(el('p', { className: 'hint' }, s.hint));
  // Switches, choices and numbers in a row share one panel; lists and the rest stand alone.
  const stack = el('div', { className: 'stack' });
  let panel: HTMLElement | null = null;
  items.forEach((item, i) => {
    const node = itemNode(item);
    nameControls(node, `${p.id}:${s.title}:${'key' in item ? item.key : `${item.kind}${i}`}`);
    if (item.kind === 'toggle' || item.kind === 'choice' || item.kind === 'number' || item.kind === 'link') {
      if (!panel) stack.append((panel = el('div', { className: 'panel' })));
      panel.append(node);
    } else {
      panel = null;
      stack.append(node);
    }
  });
  sec.append(stack);
  return sec;
}

function navNode(): HTMLElement[] {
  return GROUPS.map((g) => {
    const list = el('div', { className: 'nav-group' }, el('p', { className: 'label nav-label' }, g));
    for (const p of PAGES.filter((x) => x.group === g)) {
      const b = el('button', { type: 'button', className: 'nav-item' }, icon(p.icon), el('span', { className: 'name' }, p.title));
      b.dataset.fk = `nav:${p.id}`;
      if (p.id === page && !query) b.setAttribute('aria-current', 'page');
      b.addEventListener('click', () => {
        page = p.id;
        query = '';
        document.querySelector<HTMLInputElement>('#search')!.value = '';
        history.replaceState(null, '', `#${p.id}`);
        render();
        document.querySelector<HTMLElement>('#page h1')?.focus();
      });
      list.append(b);
    }
    return list;
  });
}

function render() {
  const focused = (document.activeElement as HTMLElement | null)?.dataset?.fk;
  document.querySelector('#nav')!.replaceChildren(...navNode());
  const main = document.querySelector('#page')!;
  if (query.trim()) {
    const hits = search(PAGES, query);
    main.replaceChildren(
      el('header', { className: 'page-head' }, el('h1', { tabIndex: -1 }, 'Search'), el('p', { className: 'hint' }, hits.length ? `Settings matching “${query.trim()}”.` : '')),
      ...(hits.length ? hits.map((h) => sectionNode(h.page, h.section, h.items, true)) : [el('p', { className: 'empty' }, `Nothing matches “${query.trim()}”. Try a shorter word.`)]),
    );
  } else {
    const current = PAGES.find((p) => p.id === page) ?? PAGES[0]!;
    main.replaceChildren(
      el('header', { className: 'page-head' }, el('h1', { tabIndex: -1 }, current.title), el('p', { className: 'hint' }, current.hint)),
      ...current.sections.map((s) => sectionNode(current, s, s.items, false)),
    );
  }
  if (focused) [...document.querySelectorAll<HTMLElement>('[data-fk]')].find((e) => e.dataset.fk === focused)?.focus();
}

async function main() {
  settings = await load(ext().storage.sync);
  useTheme(document, settings.theme);
  await notes.load(ext().storage.local);
  notes.subscribe(render);
  await hidden.load(ext().storage.local);
  hidden.subscribe(render);
  const fromHash = location.hash.slice(1);
  if (PAGES.some((p) => p.id === fromHash)) page = fromHash;
  const box = document.querySelector<HTMLInputElement>('#search')!;
  box.addEventListener('input', () => {
    query = box.value;
    render();
  });
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && box.value) {
      e.preventDefault();
      box.value = '';
      query = '';
      render();
    }
  });
  // Another tab (or the popup) changed the settings: show them.
  ext().storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && HIDDEN_EMOTES_KEY in changes) hidden.replace(changes[HIDDEN_EMOTES_KEY]?.newValue);
    if (area === 'sync' && 'settings' in changes) {
      void load(ext().storage.sync).then((s) => {
        if (JSON.stringify(s) === JSON.stringify(settings)) return;
        settings = s;
        useTheme(document, s.theme);
        render();
      });
    }
  });
  render();
}

void main();
