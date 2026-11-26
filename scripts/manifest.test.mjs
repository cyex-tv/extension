import { describe, expect, it } from 'vitest';
import { manifest } from './manifest.mjs';

describe('manifest flavours', () => {
  it('store build is unchanged', () => {
    const m = manifest('firefox', '0.1.0');
    expect(m.name).toBe('cyex.tv');
    expect(m.browser_specific_settings.gecko.id).toBe('extension@cyex.tv');
    expect(m.host_permissions.some((h) => h.startsWith('http://'))).toBe(false);
  });

  it('beta installs next to it, with its own name and ID', () => {
    const m = manifest('firefox', '0.1.0.330', { beta: true });
    expect(m.name).toBe('cyex.tv beta');
    expect(m.version).toBe('0.1.0.330');
    expect(m.browser_specific_settings.gecko.id).toBe('extension-beta@cyex.tv');
  });

  it('a local beta may reach its local API, any port', () => {
    const m = manifest('chrome', '0.1.0.330', { beta: true, api: 'http://localhost:8787' });
    expect(m.name).toBe('cyex.tv beta (local)');
    expect(m.host_permissions).toContain('http://localhost/*');
  });
});
