// The selector check panel: a small floating panel on the page, in its own shadow root so the
// site's styles can't reach it and it adds nothing to the site's own UI. It lists every hook and
// every "Hide on ..." part with found / not found and a count, and copies a JSON report.
import type { Theme } from '../settings';
import { resolveTheme } from '../ui/theme';
import { type HealthReport, type HideResult, type HookResult, reportJson } from './check';

export const PANEL_ID = 'cyextv-health';

const CSS = `
:host { all: initial; position: fixed; top: 12px; right: 12px; z-index: 2147483000; }
:host { --bg:#1e1f23; --surface:#26272c; --hover:#2d2e34; --border:#34353c; --strong:#43454d; --text:#e8e8ea; --muted:#b4b5bb; --dim:#9fa1a9; --accent:#145aff; --accent-text:#7ea4ff; --accent-ink:#fff;
  --font: 'IBM Plex Sans','Segoe UI Variable Text','Segoe UI',system-ui,sans-serif; --mono: 'IBM Plex Mono',ui-monospace,Consolas,monospace; }
:host([data-theme='light']) { --bg:#f3f3f4; --surface:#fff; --hover:#f6f6f7; --border:#dcdde1; --strong:#c4c6cc; --text:#1b1c20; --muted:#4f515a; --dim:#6b6d76; --accent:#14e6ff; --accent-text:#046a82; --accent-ink:#00232b; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
.panel { display: flex; flex-direction: column; width: min(380px, calc(100vw - 24px)); max-height: min(640px, calc(100vh - 24px)); background: var(--bg); color: var(--text);
  border: 1px solid var(--strong); border-radius: 6px; box-shadow: 0 8px 24px rgba(0,0,0,.35); font: 13px/1.45 var(--font); }
.panel:focus { outline: none; }
:focus-visible { outline: 2px solid var(--text); outline-offset: 2px; }
button { font: inherit; color: inherit; }
header { display: flex; align-items: center; gap: 9px; height: 44px; padding: 0 8px 0 14px; border-bottom: 1px solid var(--border); flex: none; }
header .mark .b { fill: var(--text); } header .mark .l { fill: var(--accent); }
h2 { margin: 0; flex: 1; font-size: .95rem; font-weight: 700; }
.x { display: grid; place-items: center; width: 28px; height: 28px; border: 0; border-radius: 3px; background: none; color: var(--muted); cursor: pointer; }
.x:hover { background: var(--border); color: var(--text); }
.x svg { fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; }
.top { display: grid; gap: 8px; padding: 10px 14px; border-bottom: 1px solid var(--border); flex: none; }
.sum { margin: 0; color: var(--muted); font-size: .8rem; }
.sum b { color: var(--text); font-weight: 700; }
.seg { display: flex; gap: 2px; padding: 2px; background: var(--surface); border: 1px solid var(--strong); border-radius: 3px; }
.seg button { flex: 1; height: 26px; border: 0; border-radius: 2px; background: none; color: var(--muted); font-size: .8rem; font-weight: 400; cursor: pointer; }
.seg button:hover { background: var(--hover); color: var(--text); }
.seg button[aria-pressed='true'] { color: var(--accent-text); font-weight: 700; }
.list { overflow: auto; overscroll-behavior: contain; flex: 1; min-height: 0; }
.group { margin: 0; padding: 10px 14px 4px; font-size: .68rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--dim); position: sticky; top: 0; background: var(--bg); }
ul { margin: 0; padding: 0; list-style: none; background: var(--surface); border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
li { display: flex; align-items: flex-start; gap: 10px; padding: 7px 14px; border-bottom: 1px solid var(--border); }
li:last-child { border-bottom: 0; }
li:hover { background: var(--hover); }
.t { display: grid; flex: 1; min-width: 0; }
.n { font-weight: 600; }
.s { color: var(--dim); font-size: .75rem; overflow-wrap: anywhere; }
.s code { font-family: var(--mono); font-size: .72rem; }
.st { flex: none; text-align: right; font-size: .8rem; color: var(--dim); white-space: nowrap; }
.st.ok { color: var(--accent-text); font-weight: 700; }
.empty { margin: 0; padding: 18px 14px; color: var(--dim); text-align: center; }
footer { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 10px 14px; border-top: 1px solid var(--border); flex: none; }
.btn { height: 30px; padding: 0 12px; white-space: nowrap; border: 1px solid var(--strong); border-radius: 3px; background: var(--surface); font-weight: 600; font-size: .8rem; cursor: pointer; }
.btn:hover { background: var(--hover); }
.btn.go { color: var(--accent-text); }
/* One line of its own when the buttons leave no room (a narrow panel): never three. */
.fine { flex: 1 0 auto; text-align: right; white-space: nowrap; color: var(--dim); font-size: .72rem; }
@media (prefers-reduced-motion: no-preference) { .btn, .x, .seg button { transition: background-color .12s, color .12s; } }
`;

export type PanelDeps = {
  doc: Document;
  /** Runs the check (called on open and on Refresh). */
  run: () => HealthReport;
  theme: Theme;
  /** Puts text on the clipboard. */
  copy?: (text: string) => Promise<void>;
};

type Filter = 'all' | 'missing';

const SVG = 'http://www.w3.org/2000/svg';

function h<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]) {
  const node = Object.assign(doc.createElement(tag), props);
  node.append(...kids);
  return node;
}

function statusText(r: { found: boolean; count: number; of?: number; unused?: boolean }): string {
  if (r.unused) return 'not used here';
  if (!r.found) return 'not found on this page';
  return r.of !== undefined ? `found · ${r.count} of ${r.of}` : `found · ${r.count}`;
}

function viaText(r: HideResult): string {
  const i = r.selectors.findIndex((s) => s.matches > 0);
  return `via selector ${i + 1} of ${r.selectors.length}`;
}

export class HealthPanel {
  private host: HTMLElement | null = null;
  private root: ShadowRoot | null = null;
  private report: HealthReport | null = null;
  private filter: Filter = 'all';
  private opener: Element | null = null;
  private note: HTMLElement | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private deps: PanelDeps) {}

  setTheme(theme: Theme): void {
    this.deps = { ...this.deps, theme };
  }

  get isOpen(): boolean {
    return this.host !== null;
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  open(): void {
    if (this.host) return;
    const { doc } = this.deps;
    this.opener = doc.activeElement;
    this.host = h(doc, 'div', { id: PANEL_ID });
    this.host.setAttribute('data-cyextv', '');
    this.host.dataset.theme = resolveTheme(this.deps.theme, doc.defaultView?.matchMedia?.('(prefers-color-scheme: light)').matches ?? false);
    this.root = this.host.attachShadow({ mode: 'open' });
    (doc.body ?? doc.documentElement).append(this.host);
    this.refresh();
    this.root.querySelector<HTMLElement>('.panel')?.focus();
  }

  close(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.host?.remove();
    this.host = null;
    this.root = null;
    const back = this.opener;
    this.opener = null;
    if (back instanceof HTMLElement && back.isConnected) back.focus();
  }

  refresh(): void {
    this.report = this.deps.run();
    this.draw();
  }

  private label(): string {
    return `${this.report?.site === 'kick' ? 'Kick' : 'Twitch'} · version ${this.report?.version ?? ''}`;
  }

  private draw(): void {
    const { doc } = this.deps;
    const r = this.report;
    if (!this.root || !r) return;
    const site = r.site === 'kick' ? 'Kick' : 'Twitch';

    const mark = doc.createElementNS(SVG, 'svg');
    mark.setAttribute('class', 'mark');
    mark.setAttribute('viewBox', '3 5 25 22');
    mark.setAttribute('width', '20');
    mark.setAttribute('height', '18');
    mark.setAttribute('aria-hidden', 'true');
    for (const [cls, x, y, w] of [['b', 3, 5, 15], ['l', 10, 13, 18], ['b', 3, 21, 15]] as const) {
      const rect = doc.createElementNS(SVG, 'rect');
      rect.setAttribute('class', cls);
      rect.setAttribute('x', String(x));
      rect.setAttribute('y', String(y));
      rect.setAttribute('width', String(w));
      rect.setAttribute('height', '6');
      mark.append(rect);
    }
    const xs = doc.createElementNS(SVG, 'svg');
    xs.setAttribute('viewBox', '0 0 24 24');
    xs.setAttribute('width', '14');
    xs.setAttribute('height', '14');
    xs.setAttribute('aria-hidden', 'true');
    const xp = doc.createElementNS(SVG, 'path');
    xp.setAttribute('d', 'M18 6 6 18M6 6l12 12');
    xs.append(xp);
    const close = h(doc, 'button', { type: 'button', className: 'x', title: 'Close' }, xs);
    close.setAttribute('aria-label', 'Close selector check');
    close.addEventListener('click', () => this.close());

    const sum = h(doc, 'p', { className: 'sum' });
    sum.append(
      h(doc, 'b', {}, `${r.summary.hideFound} of ${r.summary.hideTotal}`),
      ' hide parts found, ',
      h(doc, 'b', {}, `${r.summary.hooksFound} of ${r.summary.hooksTotal}`),
      ' chat hooks found. Some parts only exist at times, like a hype train.',
    );

    const seg = h(doc, 'div', { className: 'seg' });
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', 'Show');
    for (const [v, text] of [['all', 'All'], ['missing', 'Not found']] as const) {
      const b = h(doc, 'button', { type: 'button', value: v }, text);
      b.setAttribute('aria-pressed', String(this.filter === v));
      b.addEventListener('click', () => {
        this.filter = v;
        this.draw();
      });
      seg.append(b);
    }

    const list = h(doc, 'div', { className: 'list' });
    const keep = (x: { found: boolean; unused?: boolean }) => this.filter === 'all' || (!x.found && !x.unused);
    const section = (title: string, rows: HTMLElement[]) => {
      if (!rows.length) return;
      list.append(h(doc, 'h3', { className: 'group' }, title), h(doc, 'ul', {}, ...rows));
    };
    const row = (name: string, sub: Node | string, x: { found: boolean; count: number; of?: number; unused?: boolean }) => {
      const status = h(doc, 'span', { className: `st${x.found ? ' ok' : ''}` }, statusText(x));
      return h(doc, 'li', {}, h(doc, 'span', { className: 't' }, h(doc, 'span', { className: 'n' }, name), h(doc, 'span', { className: 's' }, sub)), status);
    };
    section('Chat hooks', r.hooks.filter(keep).map((x: HookResult) => row(x.label, x.hint, x)));
    const groups = new Map<string, HideResult[]>();
    for (const x of r.hide.filter(keep)) groups.set(x.group, [...(groups.get(x.group) ?? []), x]);
    for (const [group, items] of groups) {
      section(
        `Hide · ${group}`,
        items.map((x) => {
          const sub = h(doc, 'span', {}, h(doc, 'code', {}, x.key), x.found ? ` · ${viaText(x)}` : '');
          const bad = x.selectors.filter((s) => s.invalid).length;
          if (bad) sub.append(` · ${bad} selector${bad === 1 ? '' : 's'} the browser can’t parse`);
          return row(x.label, sub, x);
        }),
      );
    }
    if (!list.childElementCount) list.append(h(doc, 'p', { className: 'empty' }, 'Everything was found on this page.'));

    this.note = h(doc, 'span', { className: 'fine' }, this.label());
    this.note.setAttribute('role', 'status');
    const refresh = h(doc, 'button', { type: 'button', className: 'btn' }, 'Refresh');
    refresh.addEventListener('click', () => this.refresh());
    const copy = h(doc, 'button', { type: 'button', className: 'btn go' }, 'Copy report');
    copy.addEventListener('click', () => void this.copyReport());

    const head = h(doc, 'header', {}, mark, h(doc, 'h2', {}, `Selector check · ${site}`), close);
    const top = h(doc, 'div', { className: 'top' }, sum, seg);
    const foot = h(doc, 'footer', {}, copy, refresh, this.note);
    const panel = h(doc, 'div', { className: 'panel', tabIndex: -1 }, head, top, list, foot);
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Selector check');
    panel.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.close();
      }
    });

    const active = this.root.activeElement;
    const focusedValue = active instanceof HTMLButtonElement ? active.value || active.textContent : null;
    const scroll = this.root.querySelector('.list')?.scrollTop ?? 0;
    this.root.replaceChildren(h(doc, 'style', {}, CSS), panel);
    const newList = this.root.querySelector('.list');
    if (newList) newList.scrollTop = scroll;
    // A redraw (filter, refresh) keeps focus on the same button; otherwise on the panel.
    const again = focusedValue ? [...this.root.querySelectorAll('button')].find((b) => (b.value || b.textContent) === focusedValue) : null;
    (again ?? panel).focus();
  }

  private async copyReport(): Promise<void> {
    if (!this.report) return;
    const text = reportJson(this.report);
    let ok = true;
    try {
      await (this.deps.copy ?? defaultCopy(this.deps.doc))(text);
    } catch {
      ok = false;
    }
    if (this.note) this.note.textContent = ok ? 'Report copied' : 'Couldn’t copy; allow clipboard access';
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.note) this.note.textContent = this.label();
    }, 2500);
  }
}

function defaultCopy(doc: Document): (text: string) => Promise<void> {
  return async (text) => {
    const nav = doc.defaultView?.navigator;
    if (nav?.clipboard?.writeText) {
      try {
        await nav.clipboard.writeText(text);
        return;
      } catch {
        /* fall through to the old way */
      }
    }
    const area = doc.createElement('textarea');
    area.value = text;
    area.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    doc.body.append(area);
    area.select();
    const ok = doc.execCommand('copy');
    area.remove();
    if (!ok) throw new Error('copy failed');
  };
}
