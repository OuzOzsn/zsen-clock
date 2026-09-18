// node --test src/lib/planUret.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { konulariCoz, konuSirasi, planUret, type PlanAyari } from './planUret.ts';

test('konu satirlari agirlikla cozulur', () => {
  const k = konulariCoz('Matematik x2\nTürkçe\n  Tarih × 3  \n\nCoğrafya*2');
  assert.deepEqual(k, [
    { ad: 'Matematik', agirlik: 2 },
    { ad: 'Türkçe', agirlik: 1 },
    { ad: 'Tarih', agirlik: 3 },
    { ad: 'Coğrafya', agirlik: 2 },
  ]);
});

test('bos satirlar atlanir', () => {
  assert.deepEqual(konulariCoz('\n\n  \n'), []);
});

test('esit agirlikta sira donusumlu', () => {
  const s = konuSirasi([
    { ad: 'A', agirlik: 1 },
    { ad: 'B', agirlik: 1 },
  ]);
  assert.equal(s.length, 2);
  assert.deepEqual([...new Set(s)].sort(), ['A', 'B']);
});

test('agirlikli konu daha sik gelir ama yigilmaz', () => {
  const s = konuSirasi([
    { ad: 'A', agirlik: 2 },
    { ad: 'B', agirlik: 1 },
  ]);
  assert.equal(s.length, 3);
  assert.equal(s.filter((x) => x === 'A').length, 2);
  assert.equal(s.filter((x) => x === 'B').length, 1);
  // Ayni konu ust uste iki kez gelmemeli
  assert.notEqual(s[0], s[1], `yigilma var: ${s.join(',')}`);
});

function ayar(uzer: Partial<PlanAyari> = {}): PlanAyari {
  return {
    ad: 'Haftalık düzen',
    konular: [
      { ad: 'Matematik', agirlik: 2 },
      { ad: 'Türkçe', agirlik: 1 },
    ],
    baslangic: new Date(2026, 8, 14), // Pazartesi
    bitis: new Date(2026, 8, 20), // Pazar
    gunler: [1, 3, 5], // Pzt, Çar, Cum
    seansSayisi: 2,
    ilkSaat: '09:00',
    seansDakika: 60,
    molaDakika: 15,
    hatirlatmaDakika: 10,
    ...uzer,
  };
}

test('dogru gun ve seans sayisi uretir', () => {
  const s = planUret(ayar());
  assert.equal(s.gunSayisi, 3); // 14, 16, 18 Eylul
  assert.equal(s.etkinlikler.length, 6); // 3 gun x 2 seans
  assert.equal(s.toplamSaat, 6);
});

test('seanslar mola kadar araliklа dizilir', () => {
  const s = planUret(ayar());
  const ilkGun = s.etkinlikler.slice(0, 2);
  assert.match(ilkGun[0]!.baslangic, /2026-09-14T09:00:00/);
  // 09:00 + 60 dk seans + 15 dk mola = 10:15
  assert.match(ilkGun[1]!.baslangic, /2026-09-14T10:15:00/);
});

test('agirlik dagilima yansir', () => {
  const s = planUret(ayar());
  const mat = s.konuDagilimi.find((k) => k.ad === 'Matematik')!.seans;
  const tur = s.konuDagilimi.find((k) => k.ad === 'Türkçe')!.seans;
  assert.equal(mat + tur, 6);
  assert.ok(mat > tur, `matematik daha sik olmali: ${mat} vs ${tur}`);
});

test('uretilen kayitlar ayni plan onekini tasir', () => {
  const s = planUret(ayar());
  const onek = s.etkinlikler[0]!.id.split('-').slice(0, 2).join('-');
  assert.ok(s.etkinlikler.every((e) => e.id.startsWith(onek)));
});

test('hatirlatma ayari uygulanir', () => {
  const s = planUret(ayar({ hatirlatmaDakika: 5 }));
  assert.deepEqual(s.etkinlikler[0]!.hatirlatmalar, [{ dakika_once: 5 }]);
});

test('hatirlatma istenmezse bos kalir', () => {
  const s = planUret(ayar({ hatirlatmaDakika: -1 }));
  assert.deepEqual(s.etkinlikler[0]!.hatirlatmalar, []);
});

test('konu yoksa hicbir sey uretmez', () => {
  const s = planUret(ayar({ konular: [] }));
  assert.equal(s.etkinlikler.length, 0);
});

test('bitis baslangictan onceyse bos doner', () => {
  const s = planUret(ayar({ bitis: new Date(2026, 8, 1) }));
  assert.equal(s.etkinlikler.length, 0);
});

test('plan kategorisi ada esit', () => {
  const s = planUret(ayar({ ad: 'Sınav hazırlık' }));
  assert.ok(s.etkinlikler.every((e) => e.kategori === 'Sınav hazırlık'));
});
