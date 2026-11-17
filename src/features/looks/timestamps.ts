// Message times, formatted like cyex deck: 24h "09:05[:07]" or 12h "9:05[:07] pm".
import type { Clock } from '../../settings';
import type { Feature, FeatureContext } from '../types';

const pad = (n: number) => String(n).padStart(2, '0');

export function formatTime(date: Date, clock: Clock, seconds: boolean): string {
  const m = pad(date.getMinutes());
  const s = seconds ? `:${pad(date.getSeconds())}` : '';
  if (clock === '24h') return `${pad(date.getHours())}:${m}${s}`;
  const h = date.getHours();
  return `${h % 12 === 0 ? 12 : h % 12}:${m}${s} ${h < 12 ? 'am' : 'pm'}`;
}

/** `YYYY/MM/DD HH:mm:ss`, for the tooltip. */
export function fullTime(date: Date): string {
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

const CSS = '.cyextv-time{color:color-mix(in srgb,currentColor 60%,transparent);font-variant-numeric:tabular-nums;margin-right:4px}';

export function timestamps(): Feature {
  let style: HTMLStyleElement | null = null;
  let ctx: FeatureContext | null = null;
  return {
    id: 'timestamps',
    enabled: (s) => s.chat.timestamps,
    start(c) {
      ctx = c;
      style = c.doc.createElement('style');
      style.id = 'cyextv-timestamps';
      style.textContent = CSS;
      c.doc.head.append(style);
    },
    message(message) {
      if (!ctx || message.querySelector('.cyextv-time')) return;
      const slot = ctx.site.timeSlot(message);
      if (!slot) return;
      const at = new Date(ctx.now());
      const span = ctx.doc.createElement('span');
      span.className = 'cyextv-time';
      span.textContent = formatTime(at, ctx.settings.chat.clock, ctx.settings.chat.seconds);
      span.title = fullTime(at);
      slot.before(span);
    },
    stop() {
      style?.remove();
      style = null;
      ctx?.doc.querySelectorAll('.cyextv-time').forEach((e) => e.remove());
      ctx = null;
    },
  };
}
