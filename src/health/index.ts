// Wires the selector check panel into the content script: the popup button and the keyboard
// command (through the background) send a message; the first one opens the panel, the next closes it.
import { ext } from '../ext';
import type { Theme } from '../settings';
import type { Site } from '../sites/index';
import { HEALTH_MESSAGE, runHealth } from './check';
import { HealthPanel } from './panel';

export function startHealth(site: Site, theme: () => Theme, doc: Document = document): void {
  const panel = new HealthPanel({
    doc,
    theme: 'system',
    run: () => runHealth(site, doc, ext().runtime.getManifest().version, doc.location?.pathname ?? '/'),
  });
  ext().runtime.onMessage.addListener((message, sender) => {
    if (sender.id !== ext().runtime.id || (message as { type?: string } | null)?.type !== HEALTH_MESSAGE) return false;
    panel.setTheme(theme());
    panel.toggle();
    return false;
  });
}
