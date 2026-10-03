/**
 * Acilis, hizli ekleme, ayarlar dugmesi ve gorunum kurallari.
 */
import { expect, test } from '@playwright/test';
import { gunHucresi, hazirla, kayitli } from './yardimci.ts';

test('ilk acilista karsilama cikar, gecilince bir daha cikmaz', async ({ page }) => {
  await hazirla(page, { kurulumYapildi: false });
  await page.goto('/index.html');
  const gec = page.getByRole('button', { name: 'Şimdilik geç' });
  await expect(gec).toBeEnabled();
  await gec.click();
  await expect(gec).toBeHidden();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Ayarlar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Şimdilik geç' })).toHaveCount(0);
});

test('hizli ekleme: "yarın 14:00 toplantı 45dk" takvime girer', async ({ page }) => {
  await hazirla(page);
  await page.goto('/index.html');
  const kutu = page.getByPlaceholder('yarın 14:00 toplantı 45dk');
  await kutu.fill('yarın 14:00 toplantı 45dk');
  await kutu.press('Enter');
  await expect(gunHucresi(page, 6).getByText('toplantı')).toBeVisible();
  const v = await kayitli(page);
  const e = v.etkinlikler.find((x) => x.baslik === 'toplantı');
  expect(e?.baslangic).toBe('2026-10-06T14:00:00');
  expect(e?.bitis).toBe('2026-10-06T14:45:00');
});

test('hizli ekleme: tekrar kurali ("her pzt çar cum 09:00 spor")', async ({ page }) => {
  await hazirla(page);
  await page.goto('/index.html');
  const kutu = page.getByPlaceholder('yarın 14:00 toplantı 45dk');
  await kutu.fill('her pzt çar cum 09:00 spor');
  await kutu.press('Enter');
  for (const g of [5, 7, 9, 12]) await expect(gunHucresi(page, g).getByText('spor')).toBeVisible();
  await expect(gunHucresi(page, 6).getByText('spor')).toHaveCount(0);
});

test('ayarlar: sag ustteki cark ayarlari acar, guncelleme bolumu var', async ({ page }) => {
  await hazirla(page);
  await page.goto('/index.html');
  const cark = page.getByRole('button', { name: 'Ayarlar' });
  await expect(cark).toHaveAttribute('title', /Ayarlar/);
  await cark.click();
  await expect(page.getByRole('heading', { name: 'Güncelleme' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Güncellemeleri denetle' })).toBeVisible();
});

test('eski "Çalışma planı oluştur" dugmesi yok', async ({ page }) => {
  await hazirla(page);
  await page.goto('/index.html');
  await expect(page.getByText('Çalışma planı oluştur')).toHaveCount(0);
});
