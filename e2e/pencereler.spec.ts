/**
 * Alarm ve widget pencereleri, guncelleme uyarisi, eski planlar.
 * Pencereler gercek boyutlarinda aciliyor (alarm 460x300, widget 340x460).
 */
import { expect, test } from '@playwright/test';
import { etkinlik, hazirla, kayitli } from './yardimci.ts';
import type { Tetiklenen } from '../src/lib/tipler.ts';

function alarm(uzer: Partial<Tetiklenen> = {}): Tetiklenen {
  return {
    etkinlik_id: 'e1',
    baslik: 'Matematik',
    not: '',
    kategori: 'ders',
    olusum: '2026-10-05T10:00:00',
    bitis: '2026-10-05T10:40:00',
    calma_zamani: '2026-10-05T10:00:00',
    dakika_once: 0,
    ses: null,
    kacirilmis: false,
    ...uzer,
  };
}

test.describe('alarm penceresi', () => {
  test.use({ viewport: { width: 460, height: 300 } });

  test('uzun notta da dugmeler pencerede gorunur', async ({ page }) => {
    const uzun = Array.from({ length: 40 }, (_, i) => `${i + 1}. satır: çok uzun bir not`).join('\n');
    await hazirla(page, { alarm: [alarm({ not: uzun })] });
    await page.goto('/alarm.html');
    const basla = page.getByRole('button', { name: 'Başlıyorum' });
    await expect(basla).toBeInViewport();
    await expect(page.getByRole('button', { name: /Sonra hatırlat/ })).toBeInViewport();
  });

  test('dugme metinleri: Başlıyorum ve "Sonra hatırlat" secenekleri', async ({ page }) => {
    await hazirla(page, { alarm: [alarm()] });
    await page.goto('/alarm.html');
    await expect(page.getByRole('button', { name: 'Başlıyorum' })).toBeEnabled();
    await expect(page.getByText('Tamamlandı')).toHaveCount(0);
    await page.getByRole('button', { name: /Sonra hatırlat/ }).click();
    for (const m of ['5 dakika sonra', '10 dakika sonra', '30 dakika sonra', '1 saat sonra']) {
      await expect(page.getByRole('menuitem', { name: m, exact: true })).toBeVisible();
    }
  });

  test('isten sonraya kurulan hatirlatmada "Yaptım" yazar', async ({ page }) => {
    await hazirla(page, { alarm: [alarm({ dakika_once: -10 })] });
    await page.goto('/alarm.html');
    await expect(page.getByRole('button', { name: 'Yaptım' })).toBeVisible();
  });
});

test.describe('widget', () => {
  test.use({ viewport: { width: 340, height: 460 } });

  test('suren isin kalan suresini geri sayar', async ({ page }) => {
    await hazirla(page, {
      etkinlikler: [
        etkinlik({
          id: 'e1',
          baslik: 'Derin çalışma',
          baslangic: '2026-10-05T09:40:00',
          bitis: '2026-10-05T10:40:00',
        }),
        etkinlik({ id: 'e2', baslik: 'Okuma', baslangic: '2026-10-05T14:00:00' }),
      ],
    });
    await page.goto('/widget.html');
    // 10:00'da, 10:40'ta biten is: 40 dakika kaldi.
    await expect(page.locator('.sayac.suruyor')).toHaveText(/^40:00$/);
    await expect(page.getByText(/sürüyor · bitiş/)).toBeVisible();
    await expect(page.locator('.sirada-baslik')).toContainText('Derin çalışma');
    await expect(page.getByText(/sonra 14:00 Okuma/)).toBeVisible();
  });

  test('suren is yoksa siradakine geri sayar', async ({ page }) => {
    await hazirla(page, {
      etkinlikler: [etkinlik({ id: 'e2', baslik: 'Okuma', baslangic: '2026-10-05T14:00:00' })],
    });
    await page.goto('/widget.html');
    await expect(page.locator('.sayac:not(.suruyor)')).toHaveText(/^04:00/);
    await expect(page.locator('.sirada-baslik')).toContainText('Okuma');
  });

  test('yeni surum varsa sag ustte mavi noktali indirme simgesi cikar', async ({ page }) => {
    await hazirla(page, { guncelleme: { surum: '9.9.9', kurulu: true } });
    await page.goto('/widget.html');
    const dugme = page.getByRole('button', { name: 'Güncelle' });
    // Denetim acilistan 5 sn sonra.
    await expect(dugme).toBeVisible({ timeout: 10_000 });
    await expect(dugme).toHaveAttribute('title', /v9\.9\.9/);
    await expect(dugme.locator('.bildirim')).toBeVisible();
  });

  test('guncelleme yoksa simge cikmaz', async ({ page }) => {
    await hazirla(page);
    await page.goto('/widget.html');
    await page.waitForTimeout(6_000);
    await expect(page.getByRole('button', { name: 'Güncelle' })).toHaveCount(0);
  });
});

test('ana pencere: yeni surum dugmesi; tasinabilirde "İndir", kuruluda "Güncelle"', async ({ page }) => {
  await hazirla(page, { guncelleme: { surum: '9.9.9', kurulu: false } });
  await page.goto('/index.html');
  await expect(page.getByRole('button', { name: /Yeni sürüm v9\.9\.9 — İndir/ })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole('button', { name: 'Ayarlar' }).click();
  await expect(page.getByRole('button', { name: 'İndirme sayfasını aç' })).toBeVisible();
});

test('ana pencere: kurulu surumde "Güncelle" ve indirme durumu', async ({ page }) => {
  await hazirla(page, { guncelleme: { surum: '9.9.9', kurulu: true } });
  await page.goto('/index.html');
  const dugme = page.getByRole('button', { name: /Yeni sürüm v9\.9\.9 — Güncelle/ });
  await expect(dugme).toBeVisible({ timeout: 10_000 });
  await dugme.click();
  await expect(page.getByText(/İndiriliyor/).first()).toBeVisible();
});

test('eski planlar: listede gorunur ve topluca silinir', async ({ page }) => {
  await hazirla(page, {
    etkinlikler: [0, 1, 2].map((i) =>
      etkinlik({
        id: `plan-abc12-${i}`,
        baslik: `Konu ${i}`,
        kategori: 'Eski plan',
        baslangic: `2026-10-0${6 + i}T09:00:00`,
      }),
    ),
  });
  await page.goto('/index.html');
  await expect(page.getByText('Eski planlar')).toBeVisible();
  await page.getByRole('button', { name: 'Eski plan planını sil' }).click();
  await page.getByRole('button', { name: 'Planı sil' }).click();
  await expect(page.getByText('Eski planlar')).toHaveCount(0);
  expect((await kayitli(page)).etkinlikler).toEqual([]);
});

test('eski plan yoksa "Eski planlar" bolumu gorunmez', async ({ page }) => {
  await hazirla(page);
  await page.goto('/index.html');
  await expect(page.getByRole('button', { name: 'Ayarlar' })).toBeVisible();
  await expect(page.getByText('Eski planlar')).toHaveCount(0);
});
