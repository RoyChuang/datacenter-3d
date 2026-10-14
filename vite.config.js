import { defineConfig } from 'vite';
import path from 'node:path';
import { buildSites, SITES_DIR } from './scripts/build-sites.mjs';

// Compile sites/*/site.yaml -> src/generated on start, and again whenever a site file changes.
// A site with errors fails `vite build` and keeps its last good output in dev.
function sitesPlugin() {
  let isBuild = false;
  return {
    name: 'datacenter-sites',
    configResolved(config) { isBuild = config.command === 'build'; },
    buildStart() {
      if (!buildSites() && isBuild) this.error('site.yaml 驗證失敗，請看上方訊息');
    },
    configureServer(server) {
      server.watcher.add(SITES_DIR);
      server.watcher.on('change', (file) => {
        if (!file.startsWith(SITES_DIR) || !/(site\.yaml|devices\.json)$/.test(file)) return;
        buildSites({ only: path.basename(path.dirname(file)) });
      });
    },
  };
}

export default defineConfig({
  // Relative asset paths so the build works under any GitHub Pages sub-path (/<repo>/)
  base: './',
  plugins: [sitesPlugin()],
});
