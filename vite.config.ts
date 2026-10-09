import { defineConfig } from 'vitest/config';

// Versão exibida em Ajustes: vem do workflow (VERSION_NAME) ou "dev" no computador.
const versao = `${process.env.VERSION_NAME || 'dev'} (${(process.env.GITHUB_SHA || 'local').slice(0, 7)}, ${new Date().toISOString().slice(0, 10)})`;

export default defineConfig({
  base: './',
  define: { __VERSAO__: JSON.stringify(versao) },
  // WebView de Android 7 atualizado é Chrome moderno, mas sem atualização pode ser bem antigo: sintaxe até ES2019.
  build: {
    target: ['es2019', 'chrome74'],
    chunkSizeWarningLimit: 1600,
    // O worker do pdf.js vem como .mjs; no app, o servidor local reconhece melhor .js.
    rollupOptions: { output: { assetFileNames: a => (a.names?.[0] || a.name || '').endsWith('.mjs') ? 'assets/[name]-[hash].js' : 'assets/[name]-[hash][extname]' } },
  },
  test: { include: ['tests/**/*.test.ts'] },
});
