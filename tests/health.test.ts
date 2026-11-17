// @vitest-environment jsdom
// Selector health check: the check against the fixtures, the report, and the panel.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PANEL_ID, HealthPanel } from '../src/health/panel';
import { checkHide, checkHooks, pageKind, reportJson, runHealth } from '../src/health/check';
import { KICK_HIDE_KEYS, TWITCH_HIDE_KEYS } from '../src/hide';
import { kick } from '../src/sites/kick';
import { twitch } from '../src/sites/twitch';
import { KICK_CHAT, KICK_FIXTURES, TWITCH_CHAT, TWITCH_FIXTURES } from './site-fixtures';

const SITES = [
  ['Twitch', twitch, TWITCH_FIXTURES, TWITCH_HIDE_KEYS, TWITCH_CHAT],
  ['Kick', kick, KICK_FIXTURES, KICK_HIDE_KEYS, KICK_CHAT],
] as const;

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});
afterEach(() => {
  document.getElementById(PANEL_ID)?.remove();
});

describe.each(SITES)('%s check', (_name, site, fixtures, keys, chat) => {
  it('finds every hide part on a page that has them all', () => {
    document.body.innerHTML = Object.values(fixtures).join('');
    const result = checkHide(site, document);
    expect(result.map((r) => r.key).sort()).toEqual([...keys].sort());
    for (const r of result) {
      expect(r.found, r.key).toBe(true);
      expect(r.count, r.key).toBeGreaterThan(0);
      expect(r.selectors.some((s) => s.matches > 0), r.key).toBe(true);
    }
  });

  it('finds nothing on an empty page, and says so per key', () => {
    const result = checkHide(site, document);
    expect(result.every((r) => !r.found && r.count === 0)).toBe(true);
    expect(result).toHaveLength(keys.length);
  });

  it('counts distinct elements once, however many selectors match', () => {
    document.body.innerHTML = Object.values(fixtures).join('');
    for (const r of checkHide(site, document)) {
      const per = r.selectors.map((s) => s.matches);
      expect(r.count, r.key).toBeLessThanOrEqual(per.reduce((a, b) => a + b, 0));
    }
  });

  it('finds the chat hooks in a chat with two messages', () => {
    document.body.innerHTML = chat;
    const hooks = Object.fromEntries(checkHooks(site, document).map((h) => [h.key, h]));
    expect(hooks.chatList).toMatchObject({ found: true, count: 1 });
    expect(hooks.messages).toMatchObject({ found: true, count: 2 });
    expect(hooks.messageBody).toMatchObject({ found: true, count: 2, of: 2 });
    expect(hooks.messageName).toMatchObject({ found: true, count: 2, of: 2 });
    expect(hooks.messageTime).toMatchObject({ found: true, count: 2, of: 2 });
    expect(hooks.chatInput?.found).toBe(true);
    expect(hooks.inputButtonSlot?.found).toBe(true);
    // Things that only exist sometimes are not found, which is not a failure.
    expect(hooks.deletedNotice?.found).toBe(false);
    expect(hooks.userCard?.found).toBe(false);
  });

  it('finds no chat hooks on an empty page without throwing', () => {
    const hooks = checkHooks(site, document);
    expect(hooks.filter((h) => !h.unused).every((h) => !h.found)).toBe(true);
  });
});

describe('Kick has no badge slot and no claim button', () => {
  it('marks them as not used rather than missing', () => {
    const hooks = Object.fromEntries(checkHooks(kick, document).map((h) => [h.key, h]));
    expect(hooks.badgeSlot?.unused).toBe(true);
    expect(hooks.claimButton?.unused).toBe(true);
    expect(runHealth(kick, document, '1', '/x').summary.hooksTotal).toBe(checkHooks(kick, document).length - 2);
  });
});

describe('a selector the browser cannot parse', () => {
  it('is reported, and the others still count', () => {
    const odd = { ...twitch, hide: { bits: ['[[', '[data-a-target="bits-button"]'] } };
    document.body.innerHTML = TWITCH_FIXTURES.bits!;
    const [r] = checkHide(odd, document);
    expect(r!.found).toBe(true);
    expect(r!.selectors[0]).toMatchObject({ invalid: true, matches: 0 });
    expect(r!.selectors[1]!.matches).toBe(1);
  });
});

describe('the report', () => {
  it('names the page kind from the address only', () => {
    expect(pageKind('/lumen_fox')).toBe('channel');
    expect(pageKind('/popout/lumen_fox/chat')).toBe('popout');
    expect(pageKind('/directory')).toBe('other');
    expect(pageKind('/')).toBe('other');
  });

  it('is JSON with the counts and no names, messages or addresses', () => {
    document.body.innerHTML = TWITCH_CHAT + TWITCH_FIXTURES.bits!;
    document.documentElement.dataset.cyextvChannel = '12345';
    const text = reportJson(runHealth(twitch, document, '0.1.0', '/lumen_fox', new Date('2026-11-18T03:00:00Z')));
    const report = JSON.parse(text);
    expect(report).toMatchObject({ tool: 'cyex.tv selector check', version: '0.1.0', site: 'twitch', page: 'channel', date: '2026-11-18' });
    expect(report.summary.hideTotal).toBe(TWITCH_HIDE_KEYS.length);
    expect(report.hide.find((h: { key: string }) => h.key === 'bits')).toMatchObject({ found: true, count: 1 });
    // Neither the chatter, the channel nor its ID. (Message words are short here, so check the names.)
    expect(text).not.toContain('lumen_fox');
    expect(text).not.toContain('nora');
    expect(text).not.toContain('12345');
    delete document.documentElement.dataset.cyextvChannel;
  });

  it('holds only these fields', () => {
    const report = runHealth(twitch, document, '0.1.0', '/x');
    expect(Object.keys(report).sort()).toEqual(['date', 'hide', 'hooks', 'page', 'site', 'summary', 'tool', 'version']);
    expect(Object.keys(report.hide[0]!).sort()).toEqual(['count', 'found', 'group', 'key', 'label', 'selectors']);
    expect(Object.keys(report.hooks[0]!).sort()).toEqual(['count', 'found', 'hint', 'key', 'label']);
  });
});

describe('the panel', () => {
  const make = (over: Partial<ConstructorParameters<typeof HealthPanel>[0]> = {}) =>
    new HealthPanel({ doc: document, theme: 'dark', run: () => runHealth(twitch, document, '0.1.0', '/lumen_fox'), copy: async () => {}, ...over });
  const shadow = () => document.getElementById(PANEL_ID)!.shadowRoot!;
  const texts = (sel: string) => [...shadow().querySelectorAll(sel)].map((e) => e.textContent);
  const button = (name: string) => [...shadow().querySelectorAll('button')].find((b) => b.textContent === name) as HTMLButtonElement;

  it('opens in its own shadow root, off the page, and closes again', () => {
    const p = make();
    p.open();
    expect(document.getElementById(PANEL_ID)).not.toBeNull();
    expect(document.getElementById(PANEL_ID)!.parentElement).toBe(document.body);
    expect(shadow().querySelector('.panel')!.getAttribute('role')).toBe('dialog');
    p.toggle();
    expect(document.getElementById(PANEL_ID)).toBeNull();
    p.toggle();
    expect(p.isOpen).toBe(true);
    p.close();
  });

  it('lists every hook and hide part with found or not found and a count', () => {
    document.body.innerHTML = TWITCH_CHAT + TWITCH_FIXTURES.bits!;
    const p = make();
    p.open();
    const rows = shadow().querySelectorAll('li');
    expect(rows).toHaveLength(checkHooks(twitch, document).length + TWITCH_HIDE_KEYS.length);
    const bits = [...rows].find((r) => r.textContent!.includes('Bits button'))!;
    expect(bits.textContent).toContain('found · 1');
    const hype = [...rows].find((r) => r.textContent!.includes('Hype Train'))!;
    expect(hype.textContent).toContain('not found on this page');
    expect(shadow().querySelector('.sum')!.textContent).toContain(`1 of ${TWITCH_HIDE_KEYS.length} hide parts found`);
    p.close();
  });

  it('shows only what is missing with the Not found filter', () => {
    document.body.innerHTML = TWITCH_CHAT + TWITCH_FIXTURES.bits!;
    const p = make();
    p.open();
    button('Not found').click();
    expect(texts('li .n')).not.toContain('Bits button');
    expect(texts('li .n')).toContain('Hype Train');
    expect(button('Not found').getAttribute('aria-pressed')).toBe('true');
    p.close();
  });

  it('Refresh checks the page again', () => {
    const p = make();
    p.open();
    expect(texts('li .st').some((t) => t!.startsWith('found'))).toBe(false);
    document.body.insertAdjacentHTML('beforeend', TWITCH_FIXTURES.bits!);
    button('Refresh').click();
    expect(texts('li .st').filter((t) => t!.startsWith('found'))).toHaveLength(1);
    p.close();
  });

  it('copies the report as JSON and says so', async () => {
    const copy = vi.fn(async (_text: string) => {});
    const p = make({ copy });
    p.open();
    button('Copy report').click();
    await Promise.resolve();
    await Promise.resolve();
    expect(copy).toHaveBeenCalledOnce();
    expect(JSON.parse(copy.mock.calls[0]![0]).tool).toBe('cyex.tv selector check');
    expect(shadow().querySelector('[role="status"]')!.textContent).toBe('Report copied');
    p.close();
  });

  it('says when copying fails', async () => {
    const p = make({ copy: () => Promise.reject(new Error('no')) });
    p.open();
    button('Copy report').click();
    await new Promise((r) => setTimeout(r, 0));
    expect(shadow().querySelector('[role="status"]')!.textContent).toContain('copy');
    p.close();
  });

  it('closes on Escape and gives focus back', () => {
    document.body.innerHTML = '<button id="b">x</button>';
    const b = document.getElementById('b')!;
    b.focus();
    const p = make();
    p.open();
    shadow().querySelector('.panel')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
    expect(p.isOpen).toBe(false);
    expect(document.activeElement).toBe(b);
  });

  it('follows the theme', () => {
    const p = make({ theme: 'light' });
    p.open();
    expect(document.getElementById(PANEL_ID)!.dataset.theme).toBe('light');
    p.close();
  });
});
