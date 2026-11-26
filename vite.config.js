import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const raiz = import.meta.dirname;

export default defineConfig({
  root: raiz,
  publicDir: resolve(raiz, 'public'),
  build: {
    outDir: resolve(raiz, 'dist'),
    emptyOutDir: true,
    sourcemap: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: {
        portal: resolve(raiz, 'index.html'),
        custos: resolve(raiz, 'custos.html'),
      },
    },
  },
  server: {
    port: 5173,
    // em desenvolvimento a API roda em http://localhost:3000 (npm run dev sobe os dois)
    proxy: { '/api': 'http://localhost:3000' },
  },
});
