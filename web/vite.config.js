import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const raiz = import.meta.dirname;

export default defineConfig({
  root: raiz,
  publicDir: resolve(raiz, 'public'),
  // variáveis VITE_SUPABASE_* ficam em .env.local na raiz do repositório (fora do git)
  envDir: resolve(raiz, '..'),
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
  server: { port: 5173 },
});
