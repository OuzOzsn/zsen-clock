// node --test src/lib/tarih.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { gunAnahtari, haftaGunu, ilkUyanGun, olusumlar } from './tarih.ts';
import { yerelISO } from './ipc.ts';
import type { Etkinlik, Tekrar, TekrarTipi } from './tipler.ts';

// Sabit referans an: 18 Eylul 2026, Cuma
const CUMA = new Date(2026, 8, 18);

interface Vaka {
  ad: string;
  baslangic: string;
  tekrar?: Partial<Tekrar>;
  bas: string;
  son: string;
  beklenen: string[];
}

const vektorler: { vakalar: Vaka[] } = JSON.parse(
  readFileSync(fileURLToPath(new URL('./tekrar-vektorleri.json', import.meta.url)), 'utf8'),
);

/** "2026-09-15 09:00" -> yerel Date */
function zaman(s: string): Date {
  const [g, sa] = s.split(' ');
  const [y, a, gn] = g!.split('-').map(Number);
  const [h, d] = sa!.split(':').map(Number);
  return new Date(y!, a! - 1, gn!, h!, d!, 0, 0);
}

function gun(s: string): Date {
  const [y, a, g] = s.split('-').map(Number);
  return new Date(y!, a! - 1, g!, 0, 0, 0, 0);
}

function etkinlik(v: Vaka): Etkinlik {
  const t = v.tekrar ?? {};
  return {
    id: 't1',
    baslik: 'test',
    not: '',
    kategori: 'genel',
    baslangic: yerelISO(zaman(v.baslangic)),
    bitis: null,
    tum_gun: false,
    tekrar: {
      tip: (t.tip ?? 'yok') as TekrarTipi,
      aralik: t.aralik ?? 1,
      gunler: t.gunler ?? [],
      bitis_tarihi: t.bitis_tarihi ?? null,
      istisnalar: t.istisnalar ?? [],
    },
    hatirlatmalar: [],
    renk: null,
    tamamlananlar: [],
  };
}

/**
 * Arayuz kopyasi (tarih.ts) ile zamanlayici kopyasi (cekirdek/tekrar.rs) ayni
 * vektor dosyasini okuyor. Bu test o dosyanin TS yarisi; Rust yarisi
 * tekrar.rs icindeki `ortak_vektorler_uyusuyor`. Ikisi birden gecmeden iki
 * motorun ayrismadigindan emin olamayiz.
 */
test('ortak tekrar vektorleri arayuz motoruyla uyusuyor', () => {
  assert.ok(vektorler.vakalar.length > 0, 'vektor dosyasi bos');
  for (const v of vektorler.vakalar) {
    const cikan = olusumlar(etkinlik(v), gun(v.bas), gun(v.son)).map(yerelISO);
    assert.deepEqual(cikan, v.beklenen, `vaka: ${v.ad}`);
  }
});

// --------------------------------------------------------------- yardimcilar

test('hafta gunu pazartesiden sayilir', () => {
  assert.equal(haftaGunu(new Date(2026, 8, 21)), 1, 'pazartesi 1 olmali');
  assert.equal(haftaGunu(new Date(2026, 8, 27)), 7, 'pazar 7 olmali');
});

test('ilk uyan gun baslangic gununu de sayar', () => {
  // 18 Eylul Cuma; kume Cuma iceriyorsa o gunun kendisi donmeli.
  assert.equal(gunAnahtari(ilkUyanGun(CUMA, [5])!), '2026-09-18');
  // Pzt+Sal kumesinde Cuma'dan sonraki ilk gun 21 Eylul Pazartesi.
  assert.equal(gunAnahtari(ilkUyanGun(CUMA, [1, 2])!), '2026-09-21');
  // Sirasiz kume de dogru sonucu vermeli.
  assert.equal(gunAnahtari(ilkUyanGun(CUMA, [2, 1])!), '2026-09-21');
});

test('ilk uyan gun bos kumede null doner', () => {
  assert.equal(ilkUyanGun(CUMA, []), null);
});

test('ilk uyan gun en fazla bir hafta ileri bakar', () => {
  // Her hafta gunu icin sonuc baslangictan en fazla 6 gun sonra olmali.
  for (let g = 1; g <= 7; g++) {
    const bulunan = ilkUyanGun(CUMA, [g]);
    assert.ok(bulunan, `${g}. gun bulunamadi`);
    const fark = Math.round((bulunan.getTime() - CUMA.getTime()) / 86400000);
    assert.ok(fark >= 0 && fark <= 6, `${g}. gun icin fark ${fark}`);
    assert.equal(haftaGunu(bulunan), g);
  }
});
