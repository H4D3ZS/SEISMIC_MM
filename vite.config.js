import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    open: true,
    proxy: {
      // PHIVOLCS earthquake bulletin — proxied to bypass CORS in dev.
      // In production, run a lightweight reverse proxy (nginx / Cloudflare Worker)
      // that adds Access-Control-Allow-Origin: * to the PHIVOLCS response.
      '/phivolcs-proxy': {
        target:       'https://earthquake.phivolcs.dost.gov.ph',
        changeOrigin: true,
        secure:       false,     // PHIVOLCS uses a self-signed cert
        rewrite:      (path) => path.replace(/^\/phivolcs-proxy/, ''),
      },
    },
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
});
