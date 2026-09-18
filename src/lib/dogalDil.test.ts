// Calistirmak icin:  node --test src/lib/dogalDil.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ayristir, ozetle } from './dogalDil.ts';

// Sabit referans an: 11 Eylul 2026, Cuma, 10:00
const SIMDI = new Date(2026, 8, 11, 10, 0, 0, 0);

const bicim = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes(),
  ).padStart(2, '0')}`;

test('yarin + saat + sure', () => {
  const c = ayristir('yarin 14:00 matematik 45dk', SIMDI);
  assert.equal(c.baslik, 'matematik');
  assert.equal(bicim(c.baslangic), '2026-09-12 14:00');
  assert.equal(c.sureDakika, 45);
  assert.equal(c.tekrar.tip, 'yok');
});

test('haftalik tekrar, kisaltilmis gun adlari', () => {
  const c = ayristir('her pzt car cum 09:00 spor', SIMDI);
  assert.equal(c.baslik, 'spor');
  assert.equal(c.tekrar.tip, 'haftalik');
  assert.deepEqual(c.tekrar.gunler, [1, 3, 5]);
  assert.equal(c.baslangic.getHours(), 9);
});

test('Turkce karakterli gun adlari ve baslik korunur', () => {
  const c = ayristir('her Çarşamba 20:30 İngilizce kursu', SIMDI);
  assert.equal(c.tekrar.tip, 'haftalik');
  assert.deepEqual(c.tekrar.gunler, [3]);
  assert.equal(c.baslik, 'İngilizce kursu');
  assert.equal(c.baslangic.getMinutes(), 30);
});

test('hafta ici', () => {
  const c = ayristir('hafta ici 07:30 kalk', SIMDI);
  assert.equal(c.tekrar.tip, 'haftalik');
  assert.deepEqual(c.tekrar.gunler, [1, 2, 3, 4, 5]);
  assert.equal(c.baslik, 'kalk');
});

test('hafta sonu', () => {
  const c = ayristir('hafta sonu 11:00 kahvalti', SIMDI);
  assert.deepEqual(c.tekrar.gunler, [6, 7]);
});

test('N gunde bir', () => {
  const c = ayristir('2 gunde bir 20:00 ilac', SIMDI);
  assert.equal(c.tekrar.tip, 'gunluk');
  assert.equal(c.tekrar.aralik, 2);
  assert.equal(c.baslik, 'ilac');
});

test('her gun', () => {
  const c = ayristir('her gun 06:45 kosu', SIMDI);
  assert.equal(c.tekrar.tip, 'gunluk');
  assert.equal(c.tekrar.aralik, 1);
});

test('ay adiyla tarih', () => {
  const c = ayristir('15 ekim 10:30 dis randevusu', SIMDI);
  assert.equal(bicim(c.baslangic), '2026-10-15 10:30');
  assert.equal(c.baslik, 'dis randevusu');
});

test('gecmis ay adi gelecek yila tasinir', () => {
  const c = ayristir('3 mart 09:00 vize', SIMDI);
  assert.equal(bicim(c.baslangic), '2027-03-03 09:00');
});

test('noktali tarih', () => {
  const c = ayristir('20.12 18:00 dogum gunu', SIMDI);
  assert.equal(bicim(c.baslangic), '2026-12-20 18:00');
});

test('tek gun adi gelecek haftaya gider', () => {
  // 11 Eylul Cuma -> sonraki Pazartesi 14 Eylul
  const c = ayristir('pazartesi 09:00 toplanti', SIMDI);
  assert.equal(bicim(c.baslangic), '2026-09-14 09:00');
});

test('aksam N saati 24 saate cevirir', () => {
  const c = ayristir('aksam 8 film', SIMDI);
  assert.equal(c.baslangic.getHours(), 20);
  assert.equal(c.baslik, 'film');
});

test('sabah N saati oldugu gibi birakir', () => {
  const c = ayristir('yarin sabah 7 uyan', SIMDI);
  assert.equal(bicim(c.baslangic), '2026-09-12 07:00');
});

test('saat gecmisse yarina alinir', () => {
  // Referans an 10:00; 09:00 gecmis -> yarin
  const c = ayristir('09:00 kahve', SIMDI);
  assert.equal(bicim(c.baslangic), '2026-09-12 09:00');
});

test('bugunun ilerideki saati bugunde kalir', () => {
  const c = ayristir('bugun 23:00 dizi', SIMDI);
  assert.equal(bicim(c.baslangic), '2026-09-11 23:00');
});

test('saat olarak 1 saat suresi', () => {
  const c = ayristir('yarin 13:00 sinav 2 saat', SIMDI);
  assert.equal(c.sureDakika, 120);
  assert.equal(c.baslik, 'sinav');
});

test('ondalikli saat suresi', () => {
  const c = ayristir('yarin 13:00 etut 1.5 saat', SIMDI);
  assert.equal(c.sureDakika, 90);
});

test('N gun sonra', () => {
  const c = ayristir('3 gun sonra 12:00 fatura', SIMDI);
  assert.equal(bicim(c.baslangic), '2026-09-14 12:00');
});

test('hicbir sey taninmazsa tamami baslik olur', () => {
  const c = ayristir('annemi ara', SIMDI);
  assert.equal(c.baslik, 'annemi ara');
  assert.equal(c.saatBelirtildi, false);
  assert.equal(c.tekrar.tip, 'yok');
});

test('bos girdi cokmez', () => {
  const c = ayristir('', SIMDI);
  assert.equal(c.baslik, '');
});

test('ozet metni okunabilir', () => {
  assert.equal(ozetle(ayristir('her pzt car cum 09:00 spor', SIMDI)), 'Her Pzt, Çar, Cum 09:00');
  assert.equal(ozetle(ayristir('yarin 14:00 mat 45dk', SIMDI)), '12 Eylül Cmt 14:00 · 45 dk');
});
