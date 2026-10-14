// Compile every sites/<id>/site.yaml into src/generated/<id>/*.json.
// CLI:  node scripts/build-sites.mjs [siteId]     (exit code 1 if any site has errors)
// Also used by the Vite plugin in vite.config.js (runs on start and whenever a site file changes).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { compileSite } from './site-compiler.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SITES_DIR = path.join(ROOT, 'sites');
const OUT_DIR = path.join(ROOT, 'src', 'generated');

export function buildSites({ only, log = console.log } = {}) {
  let ok = true;
  const ids = fs.readdirSync(SITES_DIR).filter((id) => fs.existsSync(path.join(SITES_DIR, id, 'site.yaml')));
  for (const id of ids) {
    if (only && id !== only) continue;
    const dir = path.join(SITES_DIR, id);
    let result;
    try {
      const site = parse(fs.readFileSync(path.join(dir, 'site.yaml'), 'utf8'));
      if (site.id !== id) throw new Error(`site.yaml 的 id "${site.id}" 和資料夾名稱 "${id}" 不同`);
      const devicesFile = path.join(dir, 'devices.json');
      const devices = fs.existsSync(devicesFile) ? JSON.parse(fs.readFileSync(devicesFile, 'utf8')) : undefined;
      result = compileSite(site, { devices });
    } catch (err) {
      result = { errors: [err.message], warnings: [], stats: {} };
    }

    log(`\n[site] ${id}  ${Object.entries(result.stats).map(([k, v]) => `${k}:${v}`).join('  ')}`);
    for (const w of result.warnings) log(`  ⚠ ${w}`);
    for (const e of result.errors) log(`  ✖ ${e}`);
    if (result.errors.length) { ok = false; continue; }

    // Overwrite in place (never leave the folder empty — the dev server may reload mid-write),
    // then drop files that are no longer produced.
    const out = path.join(OUT_DIR, id);
    fs.mkdirSync(out, { recursive: true });
    const names = new Set(Object.keys(result.files).map((n) => `${n}.json`));
    for (const [name, data] of Object.entries(result.files)) {
      const file = path.join(out, `${name}.json`);
      const text = JSON.stringify(data, null, 2) + '\n';
      if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text) fs.writeFileSync(file, text);
    }
    for (const f of fs.readdirSync(out)) if (!names.has(f)) fs.rmSync(path.join(out, f));
    log(`  ✔ 已輸出 src/generated/${id}/`);
  }
  return ok;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(buildSites({ only: process.argv[2] }) ? 0 : 1);
}
