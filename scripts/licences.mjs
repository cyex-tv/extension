// Fails when an installed package's licence isn't on the allow-list (ADR 0007 in
// cyex-tv/platform: only licences compatible with AGPL-3.0). No dependency of its own: it reads
// each package.json under node_modules.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const ALLOW = new Set([
  'MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', '0BSD', 'BlueOak-1.0.0', 'CC0-1.0',
  'Python-2.0', 'Unlicense', 'MPL-2.0', 'CC-BY-4.0', 'Zlib',
]);

function ok(licence) {
  if (!licence) return false;
  const text = String(licence).replace(/[()]/g, '');
  // "A OR B": one allowed is enough. "A AND B": all must be.
  if (/ OR /.test(text)) return text.split(/ OR /).some((l) => ok(l.trim()));
  if (/ AND /.test(text)) return text.split(/ AND /).every((l) => ok(l.trim()));
  return ALLOW.has(text.trim());
}

async function packages(dir) {
  const out = [];
  let names = [];
  try {
    names = await readdir(dir);
  } catch {
    return out;
  }
  for (const name of names) {
    if (name.startsWith('.')) continue;
    if (name.startsWith('@')) {
      out.push(...(await packages(join(dir, name))));
      continue;
    }
    const at = join(dir, name);
    try {
      const pkg = JSON.parse(await readFile(join(at, 'package.json'), 'utf8'));
      const licence = pkg.license ?? (Array.isArray(pkg.licenses) ? pkg.licenses.map((l) => l.type).join(' OR ') : undefined);
      out.push({ name: pkg.name ?? name, version: pkg.version, licence });
    } catch {}
    out.push(...(await packages(join(at, 'node_modules'))));
  }
  return out;
}

const all = await packages('node_modules');
const bad = all.filter((p) => !ok(p.licence));
for (const p of bad) console.error(`not allowed: ${p.name}@${p.version} (${p.licence ?? 'no licence'})`);
console.log(`${all.length} packages checked, ${bad.length} not allowed`);
process.exit(bad.length ? 1 : 0);
