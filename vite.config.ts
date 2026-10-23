import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

/**
 * Emits the service worker (sw/sw.js) with this build's id, plus the list of every built JS/CSS file it caches
 * on install. A new id per build makes phones reinstall the worker after a deploy and drop the old caches.
 */
function serviceWorker(): Plugin {
  return {
    name: 'service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle)
        .filter((f) => /\.(js|css)$/.test(f))
        .map((f) => `/${f}`)
        .sort();
      const id = createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 12);
      const sw = readFileSync(fileURLToPath(new URL('./sw/sw.js', import.meta.url)), 'utf8').replace('__BUILD_ID__', id);
      this.emitFile({ type: 'asset', fileName: 'precache-manifest.json', source: JSON.stringify(files) });
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: sw });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), serviceWorker()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
