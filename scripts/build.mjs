// Builds the extension into dist/chrome and dist/firefox: each entry as one self-contained
// script (content scripts can't load modules), the manifest for that browser, and the icons.
// JS and CSS are minified (readable source is this repo; see docs/store-review.md to reproduce).
//   npm run build            both browsers
//   npm run build -- chrome  one
//   npm run build -- beta    the nightly beta ("cyex.tv beta", installs next to the store build) into dist/<browser>-beta
//   CYEX_TV_API=http://localhost:8787 npm run build -- beta   a beta that talks to a local API or the website's mock
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
const args = process.argv.slice(2);
const targets = args.filter((t) => t === 'chrome' || t === 'firefox');
const beta = args.includes('beta');
const api = (process.env.CYEX_TV_API ?? '').replace(/\/+$/, '');
if (api && !beta) throw new Error('CYEX_TV_API is only for beta builds: CYEX_TV_API=... npm run build -- beta');
if (api && !/^(http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?|https:\/\/[a-z0-9.-]+(:\d{1,5})?)$/.test(api)) {
  throw new Error(`CYEX_TV_API must be http://localhost[:port], http://127.0.0.1[:port] or an https origin, not "${api}"`);
}
const version = beta ? `${pkg.version}.${buildNumber()}` : pkg.version;

for (const target of targets.length ? targets : ['chrome', 'firefox']) {
  const out = join(root, 'dist', beta ? `${target}-beta` : target);
  await rm(out, { recursive: true, force: true });
  for (const [name, entry] of Object.entries(ENTRIES)) {
    await build({
      root,
      configFile: false,
      logLevel: 'warn',
      define: { __TARGET__: JSON.stringify(target), __CYEXTV_API__: JSON.stringify(api) },
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
  await writeFile(join(out, 'manifest.json'), `${JSON.stringify(manifest(target, version, { beta, api }), null, 2)}\n`);
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
  console.log(`built dist/${beta ? `${target}-beta` : target} (${version}${api ? `, API ${api}` : ''})`);
}

/** The beta's fourth version part: CYEX_TV_BUILD_NUMBER, else days since 2026/01/01 (one nightly a day). */
function buildNumber() {
  const set = Number(process.env.CYEX_TV_BUILD_NUMBER);
  if (Number.isInteger(set) && set >= 0 && set <= 65535) return set;
  return Math.floor((Date.now() - Date.UTC(2026, 0, 1)) / 86_400_000);
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
