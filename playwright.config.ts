import { defineConfig } from '@playwright/test';

/**
 * Arayuz testleri (e2e/). Uygulama tarayicida, sahte veriyle (src/lib/ipc.ts
 * "tarayici sahtesi") calisiyor; Rust yok. Rust tarafi cargo testleriyle,
 * saf mantik node testleriyle sinaniyor - hepsini scripts/onay.sh kosturur.
 *
 * Saat dilimi ve tarih sabit: testler "bugun"e bagli kalmasin.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5174',
    timezoneId: 'Europe/Istanbul',
    locale: 'tr-TR',
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    // Gelistirme sunucusu 5173'te calisiyor olabilir; carpismasin.
    command: 'npx vite --port 5174 --strictPort',
    url: 'http://localhost:5174/index.html',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
