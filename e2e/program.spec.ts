/**
 * Programlar: secim ekrani, haftalik, sirali (dinlenme, ayni gun, tur),
 * konulardan olusturma, ayrintilardan is duzenleme/silme.
 */
import { expect, test, type Page } from '@playwright/test';
import { gunHucresi, hazirla, kayitli } from './yardimci.ts';

async function yeniProgramSecimi(page: Page) {
  await page.getByRole('button', { name: 'Program oluştur' }).click();
  return page.getByRole('dialog', { name: 'Yeni program' });
}

/** Duzenleyicide bir is ekler; form acik gelir. */
async function isEkle(page: Page, ad: string, saat = '09:00') {
  const panel = page.getByRole('dialog', { name: 'Program düzenle' });
  await panel.getByRole('button', { name: '+ İş ekle' }).click();
  await panel.getByLabel('Ne yapılacak').fill(ad);
  await panel.getByLabel('Saat', { exact: true }).fill(saat);
  return panel;
}

test('yeni program: aciklamali iki secenek cikar', async ({ page }) => {
  await hazirla(page);
  await page.goto('/index.html');
  const secim = await yeniProgramSecimi(page);
  await expect(secim.getByRole('button', { name: /Kendim oluşturayım/ })).toBeVisible();
  await expect(secim.getByRole('button', { name: /Konulardan oluştur/ })).toBeVisible();
  await expect(secim.getByText(/Düzeni kafanda belli olan işler için/)).toBeVisible();
  await expect(secim.getByText(/çok konuyu dengeli dağıtmak için/)).toBeVisible();
});

test('haftalik program: kaydet, baslat, takvimde dogru gunlerde; Ay gorunumu kalir', async ({ page }) => {
  await hazirla(page);
  await page.goto('/index.html');
  await (await yeniProgramSecimi(page)).getByRole('button', { name: /Kendim oluşturayım/ }).click();

  const panel = page.getByRole('dialog', { name: 'Program düzenle' });
  await panel.getByPlaceholder('Haftalık çalışma düzeni').fill('Spor düzeni');
  await isEkle(page, 'Koşu', '07:00');
  // Varsayilan Pzt; Cuma'yi da ekle.
  await panel.getByRole('button', { name: 'Cum', exact: true }).click();
  await panel.getByRole('button', { name: 'Kaydet' }).click();

  const baslat = page.getByRole('dialog', { name: 'Programı başlat' });
  await baslat.getByLabel('Başlangıç tarihi').fill('2026-10-05');
  await baslat.getByRole('button', { name: 'Başlat', exact: true }).click();
  await expect(baslat).toBeHidden();

  await expect(page.getByRole('button', { name: 'Ay', exact: true })).toHaveClass(/etkin/);
  for (const g of [5, 9, 12, 16]) await expect(gunHucresi(page, g).getByText('Koşu')).toBeVisible();
  for (const g of [6, 7, 8]) await expect(gunHucresi(page, g).getByText('Koşu')).toHaveCount(0);
});

test('sirali program: dinlenme gunu, ayni gun ve "bir kez" dogru dizilir', async ({ page }) => {
  await hazirla(page);
  await page.goto('/index.html');
  await (await yeniProgramSecimi(page)).getByRole('button', { name: /Kendim oluşturayım/ }).click();

  const panel = page.getByRole('dialog', { name: 'Program düzenle' });
  await panel.getByPlaceholder('Haftalık çalışma düzeni').fill('Proje');
  await panel.getByRole('button', { name: /Sıralı/ }).click();

  await isEkle(page, 'Analiz');
  await panel.getByLabel('Sonra dinlenme (gün)').fill('1'); // 2. gun bos
  await isEkle(page, 'Tasarım');
  await isEkle(page, 'Sunum', '14:00');
  await panel.getByLabel('Önceki işle aynı gün').check(); // Tasarim ile ayni gun

  // Liste gun numaralarini dogru gosteriyor.
  await expect(panel.getByRole('button', { name: /1\. gün.*Analiz/ })).toBeVisible();
  await expect(panel.getByText('Dinlenme', { exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: /3\. gün.*Tasarım/ })).toBeVisible();
  await expect(panel.getByRole('button', { name: /3\. gün.*Sunum/ })).toBeVisible();
  await panel.getByRole('button', { name: 'Kaydet' }).click();

  const baslat = page.getByRole('dialog', { name: 'Programı başlat' });
  await baslat.getByLabel('Başlangıç tarihi').fill('2026-10-05');
  await baslat.getByRole('button', { name: 'Bir kez yap' }).click();
  await baslat.getByRole('button', { name: 'Başlat', exact: true }).click();
  await expect(baslat).toBeHidden();

  await expect(gunHucresi(page, 5).getByText('Analiz')).toBeVisible();
  await expect(gunHucresi(page, 6).getByRole('button')).toHaveCount(0);
  await expect(gunHucresi(page, 7).getByText('Tasarım')).toBeVisible();
  await expect(gunHucresi(page, 7).getByText('Sunum')).toBeVisible();
  // "Bir kez": tekrar etmiyor.
  for (const g of [8, 9, 10, 11]) await expect(gunHucresi(page, g).getByRole('button')).toHaveCount(0);

  const p = (await kayitli(page)).programlar[0]!;
  expect(p.duzen).toBe('sirali');
  expect(p.kosu?.tur).toBe(1);
  expect(p.kosu?.bitis).toBe('2026-10-07');
});

test('sirali program: sinirsiz tekrar ve turlar arasi bekleme', async ({ page }) => {
  await hazirla(page);
  await page.goto('/index.html');
  await (await yeniProgramSecimi(page)).getByRole('button', { name: /Kendim oluşturayım/ }).click();
  const panel = page.getByRole('dialog', { name: 'Program düzenle' });
  await panel.getByPlaceholder('Haftalık çalışma düzeni').fill('Döngü');
  await panel.getByRole('button', { name: /Sıralı/ }).click();
  await isEkle(page, 'A');
  await isEkle(page, 'B');
  await panel.getByRole('button', { name: 'Kaydet' }).click();

  const baslat = page.getByRole('dialog', { name: 'Programı başlat' });
  await baslat.getByLabel('Başlangıç tarihi').fill('2026-10-05');
  await baslat.getByRole('button', { name: 'Sınırsız tekrar' }).click();
  await baslat.getByLabel('Turlar arası bekleme (gün)').fill('2');
  await baslat.getByRole('button', { name: 'Başlat', exact: true }).click();
  await expect(baslat).toBeHidden();

  // A B _ _ A B _ _ ...
  await expect(gunHucresi(page, 5).getByText('A', { exact: true })).toBeVisible();
  await expect(gunHucresi(page, 6).getByText('B', { exact: true })).toBeVisible();
  await expect(gunHucresi(page, 7).getByRole('button')).toHaveCount(0);
  await expect(gunHucresi(page, 8).getByRole('button')).toHaveCount(0);
  await expect(gunHucresi(page, 9).getByText('A', { exact: true })).toBeVisible();
  await expect(gunHucresi(page, 29).getByText('A', { exact: true })).toBeVisible();
});

test('konulardan olustur: hafta ici, gunde 2 calisma; program olusur ve baslar', async ({ page }) => {
  await hazirla(page);
  await page.goto('/index.html');
  await (await yeniProgramSecimi(page)).getByRole('button', { name: /Konulardan oluştur/ }).click();

  const sih = page.getByRole('dialog', { name: 'Konulardan program oluştur' });
  await sih.getByLabel('Program adı').fill('Sınav hazırlığı');
  await sih.getByLabel(/Konular/).fill('Matematik x2\nFizik\nKimya');
  await sih.getByLabel('Günde kaç çalışma').fill('2');
  await sih.getByLabel('İlk çalışma saati').fill('09:00');
  await sih.getByLabel('Çalışma süresi (dk)').fill('50');
  await sih.getByLabel('Mola (dk)').fill('10');
  await sih.getByLabel('Başlangıç').fill('2026-10-05');
  await expect(sih.getByText(/1 tur:/)).toBeVisible();
  await sih.getByRole('button', { name: 'Oluştur ve başlat' }).click();
  await expect(sih).toBeHidden();

  // Ayrintilar acilir, program listede.
  await expect(page.getByRole('dialog', { name: 'Program ayrıntıları' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /Sınav hazırlığı/ })).toBeVisible();

  // Hafta ici her gun 2 calisma, 09:00 ve 10:00; hafta sonu bos.
  const pzt = gunHucresi(page, 5);
  await expect(pzt.getByRole('button')).toHaveCount(2);
  await expect(pzt.getByText('09:00')).toBeVisible();
  await expect(pzt.getByText('10:00')).toBeVisible();
  for (const g of [6, 7, 8, 9, 12]) await expect(gunHucresi(page, g).getByRole('button')).toHaveCount(2);
  for (const g of [10, 11]) await expect(gunHucresi(page, g).getByRole('button')).toHaveCount(0);

  const p = (await kayitli(page)).programlar[0]!;
  expect(p.duzen).toBe('sirali');
  expect(p.kosu).toBeTruthy();
  const mat = p.ogeler.filter((o) => o.baslik === 'Matematik').length;
  const fiz = p.ogeler.filter((o) => o.baslik === 'Fizik').length;
  expect(mat).toBeGreaterThan(fiz);
});

test('ayrintilar: is tiklaninca duzenle ve sil; silince takvimden de kalkar', async ({ page }) => {
  await hazirla(page);
  await page.goto('/index.html');
  await (await yeniProgramSecimi(page)).getByRole('button', { name: /Kendim oluşturayım/ }).click();
  const panel = page.getByRole('dialog', { name: 'Program düzenle' });
  await panel.getByPlaceholder('Haftalık çalışma düzeni').fill('İki iş');
  await panel.getByRole('button', { name: /Sıralı/ }).click();
  await isEkle(page, 'Birinci');
  await isEkle(page, 'İkinci');
  await panel.getByRole('button', { name: 'Kaydet' }).click();
  const baslat = page.getByRole('dialog', { name: 'Programı başlat' });
  await baslat.getByLabel('Başlangıç tarihi').fill('2026-10-05');
  await baslat.getByRole('button', { name: 'Başlat', exact: true }).click();
  await expect(gunHucresi(page, 6).getByText('İkinci')).toBeVisible();

  await page.getByRole('button', { name: /İki iş/ }).click();
  const detay = page.getByRole('dialog', { name: 'Program ayrıntıları' });
  await detay.getByRole('button', { name: /2\. gün/ }).click();

  // Duzenle: duzenleyici o is acik halde gelir.
  await detay.getByRole('button', { name: 'Düzenle', exact: true }).first().click();
  const duz = page.getByRole('dialog', { name: 'Program düzenle' });
  await expect(duz.getByLabel('Ne yapılacak')).toHaveValue('İkinci');
  await duz.getByRole('button', { name: 'Vazgeç' }).click();

  await page.getByRole('button', { name: /İki iş/ }).click();
  await detay.getByRole('button', { name: /2\. gün/ }).click();
  await detay.getByRole('button', { name: 'Sil', exact: true }).first().click();
  await detay.getByRole('button', { name: 'Çıkar' }).click();
  await expect(detay.getByRole('button', { name: /2\. gün/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(gunHucresi(page, 6).getByText('İkinci')).toHaveCount(0);
  expect((await kayitli(page)).programlar[0]!.ogeler.map((o) => o.baslik)).toEqual(['Birinci']);
});
