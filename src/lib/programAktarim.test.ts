// node --test src/lib/programAktarim.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  AKTARIM_TURU,
  aktarimDosyaAdi,
  benzersizBaslik,
  programiCoz,
  programiSar,
} from './programAktarim.ts';
import type { Program } from './tipler.ts';

function ayar(uzer: Partial<Program> = {}): Program {
  return {
    id: 'p1',
    baslik: 'Haftalık düzen',
    aciklama: 'Hafta içi konu çalışması.',
    kategori: 'ders',
    ogeler: [
      {
        id: 'o1',
        baslik: 'Matematik',
        icerik: 'Soru bankası\nhttps://ornek.com',
        gunler: [1, 3, 5],
        saat: '09:00',
        sure_dakika: 90,
        hatirlatmalar: [{ dakika_once: 10 }],
      },
    ],
    kosu: {
      baslangic: '2026-09-21',
      bitis: '2026-10-18',
      kip: 'hafta',
      hafta: 4,
      baslatildi: '2026-09-18T10:00:00',
    },
    ...uzer,
  };
}

test('sarmalayici tur ve surum tasir', () => {
  const s = programiSar(ayar());
  assert.equal(s.tur, AKTARIM_TURU);
  assert.equal(s.surum, 1);
  assert.equal(s.program.baslik, 'Haftalık düzen');
});

test('disa aktarilan program uykuda gider', () => {
  // Karsi tarafin takvimi bizim baslangic tarihimizle dolmasin.
  assert.notEqual(ayar().kosu, null, 'fixture calisan bir program olmali');
  assert.equal(programiSar(ayar()).program.kosu, null);
});

test('gidis donus icerigi korur', () => {
  const geri = programiCoz(JSON.stringify(programiSar(ayar())));
  assert.equal(geri.baslik, 'Haftalık düzen');
  assert.equal(geri.aciklama, 'Hafta içi konu çalışması.');
  assert.equal(geri.kategori, 'ders');
  assert.equal(geri.ogeler.length, 1);
  assert.deepEqual(geri.ogeler[0]!.gunler, [1, 3, 5]);
  assert.match(geri.ogeler[0]!.icerik, /ornek\.com/);
});

test('ice aktarilan program uykuda ve kimliksiz gelir', () => {
  const geri = programiCoz(JSON.stringify(programiSar(ayar())));
  assert.equal(geri.kosu, null, 'kosu dusurulmeli');
  assert.equal(geri.id, '', 'kimlik cagiran tarafta atanir');
});

test('kosu iceren dosya bile uykuda ice aktarilir', () => {
  // Elle duzenlenmis ya da eski surumden gelen dosya kosu tasiyabilir.
  const ham = JSON.stringify({
    tur: AKTARIM_TURU,
    surum: 1,
    program: { ...ayar(), kosu: { baslangic: '2026-01-01', kip: 'suresiz', baslatildi: 'x' } },
  });
  assert.equal(programiCoz(ham).kosu, null);
});

test('BOM ile kaydedilmis dosya okunur', () => {
  // Not Defteri UTF-8 BOM ekliyor; JSON ayristirici onu bozuk sayardi.
  const geri = programiCoz('﻿' + JSON.stringify(programiSar(ayar())));
  assert.equal(geri.baslik, 'Haftalık düzen');
});

test('yabanci dosya anlasilir hata verir', () => {
  assert.throws(() => programiCoz('merhaba'), /program dosyası değil/);
  assert.throws(() => programiCoz('{}'), /program dosyası değil/);
  assert.throws(
    () => programiCoz(JSON.stringify({ tur: 'baska-uygulama', surum: 1, program: ayar() })),
    /program dosyası değil/,
  );
});

test('daha yeni surum reddedilir', () => {
  const ham = JSON.stringify({ tur: AKTARIM_TURU, surum: 99, program: ayar() });
  assert.throws(() => programiCoz(ham), /Uygulamayı güncelle/);
});

test('eksik alanlar varsayilana duser', () => {
  const ham = JSON.stringify({
    tur: AKTARIM_TURU,
    surum: 1,
    program: { baslik: 'Sade' },
  });
  const geri = programiCoz(ham);
  assert.equal(geri.baslik, 'Sade');
  assert.equal(geri.kategori, 'genel');
  assert.equal(geri.aciklama, '');
  assert.deepEqual(geri.ogeler, []);
});

test('dosya adi yasak karakterleri temizler', () => {
  assert.equal(aktarimDosyaAdi(ayar()), 'Haftalık düzen.program.json');
  assert.equal(
    aktarimDosyaAdi(ayar({ baslik: 'A/B:C*D?' })),
    'A-B-C-D-.program.json',
  );
  assert.equal(aktarimDosyaAdi(ayar({ baslik: '   ' })), 'Program.program.json');
});

test('ayni baslik listede tekillestirilir', () => {
  const mevcut = [ayar({ baslik: 'Haftalık düzen' }), ayar({ baslik: 'Haftalık düzen (2)' })];
  assert.equal(benzersizBaslik('Haftalık düzen', mevcut), 'Haftalık düzen (3)');
  assert.equal(benzersizBaslik('Başka', mevcut), 'Başka');
  assert.equal(benzersizBaslik('  ', []), 'Program');
});
