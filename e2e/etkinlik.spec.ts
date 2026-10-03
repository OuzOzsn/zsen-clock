/**
 * Etkinlik formu: gecmisi sonradan isaretleme ve kategoriler.
 */
import { expect, test } from '@playwright/test';
import { etkinlik, gunHucresi, hazirla, kayitli } from './yardimci.ts';

test('gecmis etkinlik sonradan "yapıldı" ve geri "yapılmadı" isaretlenir', async ({ page }) => {
  await hazirla(page, {
    etkinlikler: [etkinlik({ id: 'e1', baslik: 'Eski iş', baslangic: '2026-10-01T09:00:00' })],
  });
  await page.goto('/index.html');
  await gunHucresi(page, 1).getByRole('button', { name: /Eski iş/ }).click();

  const dugme = page.getByRole('button', { name: /Yapılmadı/ });
  await expect(dugme).toHaveAttribute('aria-pressed', 'false');
  await dugme.click();
  await expect(page.getByRole('button', { name: /Yapıldı/ })).toHaveAttribute('aria-pressed', 'true');
  expect((await kayitli(page)).etkinlikler[0]!.tamamlananlar).toEqual(['2026-10-01T09:00:00']);

  await page.keyboard.press('Escape');
  // Takvimde ustu cizili (tamam sinifi) gorunur.
  await expect(gunHucresi(page, 1).getByRole('button', { name: /Eski iş/ })).toHaveClass(/tamam/);

  await gunHucresi(page, 1).getByRole('button', { name: /Eski iş/ }).click();
  await page.getByRole('button', { name: /Yapıldı/ }).click();
  await expect(page.getByRole('button', { name: /Yapılmadı/ })).toBeVisible();
  expect((await kayitli(page)).etkinlikler[0]!.tamamlananlar).toEqual([]);
});

test('tekrarlayan etkinlikte isaret yalnizca acilan gune islenir', async ({ page }) => {
  await hazirla(page, {
    etkinlikler: [
      etkinlik({
        id: 'e1',
        baslik: 'Her gün',
        baslangic: '2026-10-01T08:00:00',
        tekrar: { tip: 'gunluk', aralik: 1, gunler: [], istisnalar: [] },
      }),
    ],
  });
  await page.goto('/index.html');
  await gunHucresi(page, 2).getByRole('button', { name: /Her gün/ }).click();
  await page.getByRole('button', { name: /Yapılmadı/ }).click();
  await page.keyboard.press('Escape');
  expect((await kayitli(page)).etkinlikler[0]!.tamamlananlar).toEqual(['2026-10-02T08:00:00']);
  await expect(gunHucresi(page, 2).getByRole('button', { name: /Her gün/ })).toHaveClass(/tamam/);
  await expect(gunHucresi(page, 3).getByRole('button', { name: /Her gün/ })).not.toHaveClass(/tamam/);
});

test('kategori: aciklamali kategori olusur, formda butun kategoriler secilebilir', async ({ page }) => {
  await hazirla(page);
  await page.goto('/index.html');

  await page.getByRole('button', { name: 'Yönet' }).click();
  await page.getByRole('button', { name: 'Yeni kategori' }).click();
  await page.getByPlaceholder('spor').fill('Kuantum');
  await page.getByPlaceholder(/Bu kategori ne\?/).fill('Dalga fonksiyonu ve ölçüm problemi.');
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText('Dalga fonksiyonu ve ölçüm problemi.')).toBeVisible();
  await page.keyboard.press('Escape');

  expect((await kayitli(page)).kategoriler.find((k) => k.ad === 'Kuantum')?.aciklama).toBe(
    'Dalga fonksiyonu ve ölçüm problemi.',
  );

  // Yeni etkinlik formu: secicide kendi actigimiz kategori de var.
  const kutu = page.getByPlaceholder('yarın 14:00 toplantı 45dk');
  await kutu.fill('yarın 10:00 deney');
  await kutu.press('Enter');
  await gunHucresi(page, 6).getByRole('button', { name: /deney/ }).click();

  const secici = page.getByRole('radiogroup', { name: 'Kategori' });
  for (const ad of ['genel', 'ders', 'spor', 'Kuantum']) {
    await expect(secici.getByRole('radio', { name: ad })).toBeVisible();
  }
  await secici.getByRole('radio', { name: 'Kuantum' }).click();
  await expect(secici.getByRole('radio', { name: 'Kuantum' })).toHaveAttribute('aria-checked', 'true');
  // Secilen kategorinin aciklamasi formda gorunur.
  await expect(page.getByText('Dalga fonksiyonu ve ölçüm problemi.')).toBeVisible();
  await page.getByRole('button', { name: 'Kaydet' }).click();
  expect((await kayitli(page)).etkinlikler.find((e) => e.baslik === 'deney')?.kategori).toBe('Kuantum');
});
