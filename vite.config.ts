import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'node:path';

const kok = import.meta.dirname;

// Tauri uygulamasi uc ayri pencereden olusuyor; her biri kendi HTML girisine sahip.
// Boylece kapali pencerenin JS'i hic yuklenmez -> bellek kazanci.
export default defineConfig({
  plugins: [svelte({ configFile: resolve(kok, 'svelte.config.js') })],
  root: resolve(kok, 'src'),
  publicDir: resolve(kok, 'public'),
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: '0.0.0.0', // WSL/Docker icinden Windows tarayicisina erisim icin
  },
  build: {
    outDir: resolve(kok, 'dist'),
    emptyOutDir: true,
    target: 'chrome120', // WebView2 evergreen
    rollupOptions: {
      input: {
        ana: resolve(kok, 'src/index.html'),
        widget: resolve(kok, 'src/widget.html'),
        alarm: resolve(kok, 'src/alarm.html'),
      },
    },
  },
});
