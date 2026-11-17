// Builds the extension into dist/chrome and dist/firefox: each entry as one self-contained
// script (content scripts can't load modules), the manifest for that browser, and the icons.
//   npm run build            both browsers
//   npm run build -- chrome  one
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { manifest } from './manifest.mjs';
import { icons } from './icons.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const ENTRIES = {
  content: 'src/content/index.ts',
  main: 'src/main/index.ts',
  background: 'src/background/index.ts',
  popup: 'src/popup/index.ts',
  options: 'src/options/index.ts',
};
const STATIC = ['src/popup/popup.html', 'src/popup/popup.css', 'src/options/options.html', 'src/options/options.css'];
const targets = process.argv.slice(2).filter((t) => t === 'chrome' || t === 'firefox');

for (const target of targets.length ? targets : ['chrome', 'firefox']) {
  const out = join(root, 'dist', target);
  await rm(out, { recursive: true, force: true });
  for (const [name, entry] of Object.entries(ENTRIES)) {
    await build({
      root,
      configFile: false,
      logLevel: 'warn',
      define: { __TARGET__: JSON.stringify(target) },
      build: {
        outDir: out,
        emptyOutDir: false,
        target: target === 'chrome' ? 'chrome116' : 'firefox128',
        minify: false,
        sourcemap: false,
        lib: { entry: join(root, entry), formats: ['iife'], name: `cyextv_${name}`, fileName: () => `${name}.js` },
      },
    });
  }
  await writeFile(join(out, 'manifest.json'), `${JSON.stringify(manifest(target, pkg.version), null, 2)}\n`);
  await mkdir(join(out, 'icons'), { recursive: true });
  for (const [size, png] of Object.entries(icons())) await writeFile(join(out, 'icons', `${size}.png`), png);
  for (const file of STATIC) await copyFile(join(root, file), join(out, file.split('/').pop()));
  const licence = join(root, 'LICENSE');
  if (existsSync(licence)) await copyFile(licence, join(out, 'LICENSE'));
  console.log(`built dist/${target}`);
}
