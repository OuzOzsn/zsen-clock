// node --test src/lib/konudanProgram.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { konulardanOgeler, type KonuAyari } from './konudanProgram.ts';
import { ogeyiEtkinligeCevir, siraliYerlesim } from './programUret.ts';
import { gunAnahtari, gunEkle, olusumlar } from './tarih.ts';
import type { Program } from './tipler.ts';

const CUMARTESI = new Date(2026, 8, 19);
const PAZARTESI = new Date(2026, 8, 21);

function ayar(uzer: Partial<KonuAyari> = {}): KonuAyari {
  return {
    konular: [{ ad: 'Mat', agirlik: 2 }, { ad: 'Fiz', agirlik: 1 }, { ad: 'Kim', agirlik: 1 }],
    gunler: [1, 2, 3, 4, 5],
    baslangic: CUMARTESI,
    gunlukAdet: 2,
    ilkSaat: '09:00',
    sureDakika: 50,
    molaDakika: 10,
    hatirlatmaDakika: 10,
    ...uzer,
  };
}

let n = 0;
const kimlik = () => `o${++n}`;

/** Uretilen ogeleri gercek bir sirali program gibi takvime dok. */
function takvim(sonuc: ReturnType<typeof konulardanOgeler>, gun: number): string[] {
  const p: Program = {
    id: 'p', baslik: 'x', aciklama: '', kategori: 'ders', duzen: 'sirali',
    ogeler: sonuc.ogeler,
    kosu: { baslangic: gunAnahtari(sonuc.ilkGun!), bitis: null, kip: 'suresiz', baslatildi: '' },
  };
  const son = gunEkle(sonuc.ilkGun!, gun - 1);
  const liste: [number, string][] = [];
  for (const o of p.ogeler) {
    const e = ogeyiEtkinligeCevir(p, o, p.kosu!, sonuc.ilkGun!)!;
    for (const an of olusumlar(e, sonuc.ilkGun!, son)) {
      liste.push([an.getTime(), `${gunAnahtari(an)} ${e.baslangic.slice(11, 16)} ${o.baslik}`]);
    }
  }
  return liste.sort((a, b) => a[0] - b[0]).map(([, m]) => m);
}

test('hafta sonu baslatilsa da ilk is pazartesi', () => {
  const s = konulardanOgeler(ayar(), kimlik);
  assert.equal(gunAnahtari(s.ilkGun!), gunAnahtari(PAZARTESI));
});

test('gunde iki calisma, molali saatlerle', () => {
  const s = konulardanOgeler(ayar(), kimlik);
  const g = takvim(s, 1);
  assert.equal(g.length, 2);
  assert.match(g[0]!, /09:00/);
  assert.match(g[1]!, /10:00/);
});

test('hafta ici secilince hafta sonu bos kalir ve tur haftaya hizalanir', () => {
  const s = konulardanOgeler(ayar(), kimlik);
  assert.equal(s.turGunu, 7);
  assert.equal(s.calismaGunu, 5);
  assert.equal(siraliYerlesim(s.ogeler, 0).uzunluk, 7);
  const g = takvim(s, 14);
  // 2 hafta x 5 gun x 2 calisma
  assert.equal(g.length, 20);
  assert.ok(g.every((m) => !m.startsWith('2026-09-26') && !m.startsWith('2026-09-27')));
  assert.ok(g.some((m) => m.startsWith('2026-09-28')), 'ikinci hafta pazartesi devam etmeli');
});

test('agirlikli konu daha sik gelir', () => {
  const s = konulardanOgeler(ayar({ gunler: [1, 2, 3, 4, 5, 6, 7] }), kimlik);
  const d = Object.fromEntries(s.dagilim.map((x) => [x.ad, x.adet]));
  assert.equal(d.Mat, 2);
  assert.equal(d.Fiz, 1);
  assert.equal(s.turGunu, 2);
});

test('konu ya da gun yoksa bos', () => {
  assert.equal(konulardanOgeler(ayar({ konular: [] }), kimlik).ogeler.length, 0);
  assert.equal(konulardanOgeler(ayar({ gunler: [] }), kimlik).ogeler.length, 0);
});
