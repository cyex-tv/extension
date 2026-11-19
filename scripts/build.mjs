// Builds the extension into dist/chrome and dist/firefox: each entry as one self-contained
// script (content scripts can't load modules), the manifest for that browser, and the icons.
// JS and CSS are minified (readable source is this repo; see docs/store-review.md to reproduce).
//   npm run build            both browsers
//   npm run build -- chrome  one
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, transformWithEsbuild } from 'vite';
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
  onboarding: 'src/onboarding/index.ts',
  theme: 'src/theme/index.ts',
};
const STATIC = ['src/popup/popup.html', 'src/popup/popup.css', 'src/options/options.html', 'src/options/options.css', 'src/onboarding/onboarding.html', 'src/onboarding/onboarding.css'];
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
        minify: 'esbuild', // JS minified; no source maps are written, so none can end up in the zip
        sourcemap: false,
        lib: { entry: join(root, entry), formats: ['iife'], name: `cyextv_${name}`, fileName: () => `${name}.js` },
      },
    });
  }
  await writeFile(join(out, 'manifest.json'), `${JSON.stringify(manifest(target, pkg.version), null, 2)}\n`);
  await mkdir(join(out, 'icons'), { recursive: true });
  for (const [size, png] of Object.entries(icons())) await writeFile(join(out, 'icons', `${size}.png`), png);
  for (const file of STATIC) {
    const name = file.split('/').pop();
    if (name.endsWith('.css')) {
      const { code } = await transformWithEsbuild(await readFile(join(root, file), 'utf8'), file, { loader: 'css', minify: true, sourcemap: false });
      await writeFile(join(out, name), code);
    } else await copyFile(join(root, file), join(out, name));
  }
  const licence = join(root, 'LICENSE');
  if (existsSync(licence)) await copyFile(licence, join(out, 'LICENSE'));
  await verify(out);
  console.log(`built dist/${target}`);
}

/** Fails the build if the output needs a looser CSP or ships a source map. */
async function verify(dir) {
  const files = await readdir(dir);
  const problems = [];
  if (files.some((f) => f.endsWith('.map'))) problems.push('source map file');
  for (const f of files.filter((f) => f.endsWith('.js'))) {
    const code = await readFile(join(dir, f), 'utf8');
    if (/sourceMappingURL/.test(code)) problems.push(`${f}: sourceMappingURL`);
    // Not the re2js prefilter's own `eval(` method: a global call has no `.`, name or `}` before it.
    if (/(?<![.\w$}])eval\s*\(|\(0,\s*eval\)/.test(code)) problems.push(`${f}: eval`);
    if (/new\s+Function\s*\(|\bFunction\s*\(\s*["'`]/.test(code)) problems.push(`${f}: Function constructor`);
  }
  const csp = JSON.stringify(JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8')).content_security_policy ?? '');
  if (/unsafe-eval|unsafe-inline|wasm/.test(csp)) problems.push('manifest CSP is loosened');
  if (problems.length) throw new Error(`dist check failed: ${problems.join('; ')}`);
}
