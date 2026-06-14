import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    open: true,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
    proxy: {
      '/phivolcs-proxy': {
        target:       'https://earthquake.phivolcs.dost.gov.ph',
        changeOrigin: true,
        secure:       false,
        rewrite:      (path) => path.replace(/^\/phivolcs-proxy/, ''),
      },
      '/ollama-proxy': {
        target:       'http://localhost:11434',
        changeOrigin: true,
        secure:       false,
        rewrite:      (path) => path.replace(/^\/ollama-proxy/, ''),
        ws: true,
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
