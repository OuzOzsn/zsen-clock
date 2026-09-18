// node --test src/lib/programUret.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  bitisHesapla,
  ogeyiEtkinligeCevir,
  programDurdur,
  programOzeti,
  programUret,
  saatCoz,
} from './programUret.ts';
import { gunAnahtari, gunEkle, olusumlar } from './tarih.ts';
import type { Etkinlik, Program, ProgramKosusu, ProgramOgesi, SureKipi } from './tipler.ts';

// Sabit referans an: 18 Eylul 2026, Cuma, 10:00
const SIMDI = new Date(2026, 8, 18, 10, 0, 0, 0);

const PAZARTESI = new Date(2026, 8, 21); // 21 Eylul 2026 Pazartesi
const PERSEMBE = new Date(2026, 8, 17); // 17 Eylul 2026 Persembe

function oge(uzer: Partial<ProgramOgesi> = {}): ProgramOgesi {
  return {
    id: 'o1',
    baslik: 'Matematik',
    icerik: '',
    gunler: [1, 2],
    saat: '09:00',
    sure_dakika: 60,
    hatirlatmalar: [],
    ...uzer,
  };
}

function kosu(uzer: Partial<ProgramKosusu> = {}): ProgramKosusu {
  return {
    baslangic: gunAnahtari(PAZARTESI),
    bitis: null,
    kip: 'suresiz',
    hafta: null,
    baslatildi: '2026-09-18T10:00:00',
    ...uzer,
  };
}

function ayar(uzer: Partial<Program> = {}): Program {
  return {
    id: 'p1',
    baslik: 'Haftalık düzen',
    aciklama: '',
    kategori: 'ders',
    ogeler: [oge()],
    kosu: kosu(),
    ...uzer,
  };
}

/** Uretilen kaydi gercekten takvime yazilmis gibi kimliklendirir. */
function kimlikle(e: Etkinlik, id: string): Etkinlik {
  return { ...e, id };
}

function gunleri(e: Etkinlik, bas: Date, son: Date): string[] {
  return olusumlar(e, bas, son).map(gunAnahtari);
}

// ------------------------------------------------------------- baslangic

test('pazartesi baslayan program o pazartesiyi sayar', () => {
  const p = ayar();
  const e = ogeyiEtkinligeCevir(p, p.ogeler[0]!, p.kosu!, PAZARTESI);
  assert.ok(e, 'etkinlik uretilmeli');
  assert.equal(e.baslangic, '2026-09-21T09:00:00');
});

test('persembe baslayan program gelecek pazartesiden baslar', () => {
  const p = ayar({ kosu: kosu({ baslangic: gunAnahtari(PERSEMBE) }) });
  const e = ogeyiEtkinligeCevir(p, p.ogeler[0]!, p.kosu!, PERSEMBE);
  assert.ok(e);
  // Program Pzt+Sal; 17 Eylul Persembe'den sonraki ilk uyan gun 21 Eylul Pzt.
  assert.equal(e.baslangic, '2026-09-21T09:00:00');
});

test('capa gununde olusum olmasa bile ilk olusum dogru cikar', () => {
  // Capa Persembe'ye kurulsaydi bile tekrar motoru dogru calisirdi; burada
  // capanin gercek ilk olusuma oturduguna bakiyoruz.
  const p = ayar({ kosu: kosu({ baslangic: gunAnahtari(PERSEMBE) }) });
  const e = kimlikle(ogeyiEtkinligeCevir(p, p.ogeler[0]!, p.kosu!, PERSEMBE)!, 'e1');
  const liste = gunleri(e, PERSEMBE, gunEkle(PERSEMBE, 14));
  assert.deepEqual(liste, ['2026-09-21', '2026-09-22', '2026-09-28', '2026-09-29']);
});

test('gunu olmayan oge etkinlik uretmez', () => {
  const p = ayar({ ogeler: [oge({ gunler: [] })] });
  assert.equal(ogeyiEtkinligeCevir(p, p.ogeler[0]!, p.kosu!, PAZARTESI), null);
});

// ------------------------------------------------------------------ sure

test('dort hafta her gun icin tam dort olusum verir', () => {
  // Pencere hangi gunden acilirsa acilsin her hafta gunu tam N kez geciyor.
  for (let kaydir = 0; kaydir < 7; kaydir++) {
    const bas = gunEkle(PAZARTESI, kaydir);
    const bitis = bitisHesapla(bas, 'hafta', 4, null);
    assert.ok(bitis);
    const p = ayar({
      kosu: kosu({ baslangic: gunAnahtari(bas), bitis: gunAnahtari(bitis), kip: 'hafta', hafta: 4 }),
      ogeler: [oge({ gunler: [1, 5] })],
    });
    const e = kimlikle(ogeyiEtkinligeCevir(p, p.ogeler[0]!, p.kosu!, bas)!, 'e1');
    const liste = gunleri(e, bas, bitis);
    assert.equal(liste.length, 8, `${kaydir}. gunden baslayinca 2 gun x 4 hafta = 8 olmali`);
  }
});

test('bitis tarihi dahil', () => {
  const bitis = bitisHesapla(PAZARTESI, 'hafta', 1, null);
  assert.equal(gunAnahtari(bitis!), '2026-09-27', 'bir hafta = baslangic + 6 gun');

  const p = ayar({
    kosu: kosu({ bitis: '2026-09-22', kip: 'tarih' }),
    ogeler: [oge({ gunler: [1, 2] })],
  });
  const e = kimlikle(ogeyiEtkinligeCevir(p, p.ogeler[0]!, p.kosu!, PAZARTESI)!, 'e1');
  const liste = gunleri(e, PAZARTESI, gunEkle(PAZARTESI, 20));
  assert.deepEqual(liste, ['2026-09-21', '2026-09-22'], 'bitis gunu dahil olmali');
});

test('suresiz programda bitis tarihi yazilmaz', () => {
  assert.equal(bitisHesapla(PAZARTESI, 'suresiz', 4, new Date(2026, 9, 1)), null);
  const p = ayar();
  const e = ogeyiEtkinligeCevir(p, p.ogeler[0]!, p.kosu!, PAZARTESI)!;
  assert.equal(e.tekrar.bitis_tarihi, null);
});

test('saat cozumu bozuk girdide varsayilana doner', () => {
  assert.deepEqual(saatCoz('07:30'), [7, 30]);
  assert.deepEqual(saatCoz('7:05'), [7, 5]);
  assert.deepEqual(saatCoz('abc'), [9, 0]);
});

// ---------------------------------------------------------------- uretim

test('uykudaki program hicbir sey uretmez', () => {
  const s = programUret(ayar({ kosu: null }), [], SIMDI);
  assert.equal(s.yazilacak.length, 0);
});

test('gun degismeden guncelleme yeni etkinlik uretmez', () => {
  const p = ayar();
  const eski = kimlikle(ogeyiEtkinligeCevir(p, p.ogeler[0]!, p.kosu!, PAZARTESI)!, 'e1');

  // Iki hafta sonra, yalnizca baslik ve icerik degistirilmis.
  const sonra = new Date(2026, 9, 5, 10, 0, 0, 0); // 5 Ekim 2026 Pazartesi
  const yeni = ayar({ ogeler: [oge({ baslik: 'Matematik II', icerik: 'yeni not' })] });
  const s = programUret(yeni, [eski], sonra);

  assert.equal(s.yazilacak.length, 1);
  assert.equal(s.yazilacak[0]!.id, 'e1', 'kayit yerinde degismeli');
  assert.equal(s.yazilacak[0]!.baslik, 'Matematik II');
  assert.equal(s.yazilacak[0]!.not, 'yeni not');
  assert.equal(s.ozet.guncellenen, 1);
  assert.equal(s.ozet.dondurulan, 0);
  assert.equal(s.ozet.acilan, 0);
});

test('gun degisince gecmis dondurulur yeni donem acilir', () => {
  const p = ayar();
  const eski = kimlikle(ogeyiEtkinligeCevir(p, p.ogeler[0]!, p.kosu!, PAZARTESI)!, 'e1');

  const sonra = new Date(2026, 9, 5, 10, 0, 0, 0); // 5 Ekim Pazartesi
  const yeni = ayar({ ogeler: [oge({ gunler: [3, 4] })] }); // Pzt+Sal -> Car+Per
  const s = programUret(yeni, [eski], sonra);

  assert.equal(s.yazilacak.length, 2, 'donmus donem + yeni donem');
  const donmus = s.yazilacak.find((e) => e.id === 'e1')!;
  assert.equal(donmus.tekrar.bitis_tarihi, '2026-10-04', 'eski kayit dune kapanmali');
  assert.deepEqual(donmus.tekrar.gunler, [1, 2], 'gecmis eski kurali korumali');

  const acilan = s.yazilacak.find((e) => e.id !== 'e1')!;
  assert.deepEqual(acilan.tekrar.gunler, [3, 4]);
  assert.equal(acilan.baslangic, '2026-10-07T09:00:00', '5 Ekim Pzt sonrasi ilk Carsamba');
  assert.equal(s.ozet.dondurulan, 1);
  assert.equal(s.ozet.acilan, 1);
});

test('saat degisince de gecmis dondurulur', () => {
  // Tamamlananlar tam ani tutuyor; saat kayarsa gecmis tamamlamalar oksuz
  // kalirdi. Bu yuzden saat degisikligi de gecmisi degistirmis sayiliyor.
  const p = ayar();
  const eski = kimlikle(ogeyiEtkinligeCevir(p, p.ogeler[0]!, p.kosu!, PAZARTESI)!, 'e1');
  const sonra = new Date(2026, 9, 5, 10, 0, 0, 0);
  const s = programUret(ayar({ ogeler: [oge({ saat: '11:00' })] }), [eski], sonra);

  assert.equal(s.ozet.dondurulan, 1);
  assert.equal(s.ozet.acilan, 1);
});

test('program baslamadan once gun degistirmek donem acmaz', () => {
  // Kosu 21 Eylul'de basliyor, bugun 18 Eylul: dondurulacak gecmis yok.
  const p = ayar();
  const eski = kimlikle(ogeyiEtkinligeCevir(p, p.ogeler[0]!, p.kosu!, PAZARTESI)!, 'e1');
  const s = programUret(ayar({ ogeler: [oge({ gunler: [5] })] }), [eski], SIMDI);

  assert.equal(s.yazilacak.length, 1);
  assert.equal(s.yazilacak[0]!.id, 'e1');
  assert.equal(s.ozet.dondurulan, 0);
});

test('ayni gun iki kez guncelleme fazladan kayit birakmaz', () => {
  const p = ayar();
  const eski = kimlikle(ogeyiEtkinligeCevir(p, p.ogeler[0]!, p.kosu!, PAZARTESI)!, 'e1');
  const sonra = new Date(2026, 9, 5, 10, 0, 0, 0);

  const birinci = programUret(ayar({ ogeler: [oge({ gunler: [3, 4] })] }), [eski], sonra);
  const arada = birinci.yazilacak.map((e, i) => (e.id ? e : kimlikle(e, `e${i + 2}`)));
  assert.equal(arada.length, 2);

  // Ikinci kez, gunler yine degisiyor. Donmus donem korunmali, canli olan
  // yerine yenisi acilmali - toplam yine 2.
  const ikinci = programUret(ayar({ ogeler: [oge({ gunler: [5] })] }), arada, sonra);
  assert.equal(ikinci.yazilacak.length, 2, `beklenmedik: ${ikinci.yazilacak.length} kayit`);
  assert.equal(ikinci.ozet.dondurulan, 0, 'yeni donemin gecmisi yok, dondurulmemeli');
  assert.equal(ikinci.ozet.guncellenen, 1, 'gecmisi olmayan donem yerinde degismeli');
  assert.equal(ikinci.ozet.acilan, 0);

  // Ve bos kabuk kalmamali: her kayit gercekten olusum uretmeli.
  const ufuk = new Date(2026, 10, 30);
  for (const e of ikinci.yazilacak) {
    assert.ok(
      gunleri(e, new Date(2026, 8, 1), ufuk).length > 0,
      `bos kabuk: ${JSON.stringify(e.tekrar)}`,
    );
  }
});

test('istisnalar ve tamamlananlar yeniden uretimde tasinir', () => {
  const p = ayar();
  const eski = kimlikle(ogeyiEtkinligeCevir(p, p.ogeler[0]!, p.kosu!, PAZARTESI)!, 'e1');
  eski.tekrar.istisnalar = ['2026-09-28'];
  eski.tamamlananlar = ['2026-09-21T09:00:00'];

  const sonra = new Date(2026, 9, 5, 10, 0, 0, 0);
  const s = programUret(ayar({ ogeler: [oge({ baslik: 'Yeni ad' })] }), [eski], sonra);

  assert.equal(s.yazilacak.length, 1);
  assert.deepEqual(s.yazilacak[0]!.tekrar.istisnalar, ['2026-09-28']);
  assert.deepEqual(s.yazilacak[0]!.tamamlananlar, ['2026-09-21T09:00:00']);
});

test('gelecekteki ayrik gun programdan dusunce baglantisi kopar ama silinmez', () => {
  const p = ayar();
  const seri = kimlikle(ogeyiEtkinligeCevir(p, p.ogeler[0]!, p.kosu!, PAZARTESI)!, 'e1');
  seri.tekrar.istisnalar = ['2026-10-13']; // gelecek bir Sali

  const kopya: Etkinlik = {
    ...seri,
    id: 'k1',
    baslangic: '2026-10-13T15:00:00',
    bitis: '2026-10-13T16:00:00',
    tekrar: { tip: 'yok', aralik: 1, gunler: [], istisnalar: [] },
    program: { program_id: 'p1', oge_id: 'o1', gun: '2026-10-13' },
  };

  const sonra = new Date(2026, 9, 5, 10, 0, 0, 0);
  // Sali programdan cikariliyor; 13 Ekim Sali artik kapsam disi.
  const s = programUret(ayar({ ogeler: [oge({ gunler: [1] })] }), [seri, kopya], sonra);

  assert.deepEqual(s.ayrilacak, ['k1'], 'kopya silinmemeli, yalnizca bagi kopmali');
  assert.equal(s.ozet.ayrilan, 1);
});

test('kapsamda kalan gelecek kopya ayrilmaz', () => {
  const p = ayar();
  const seri = kimlikle(ogeyiEtkinligeCevir(p, p.ogeler[0]!, p.kosu!, PAZARTESI)!, 'e1');
  const kopya: Etkinlik = {
    ...seri,
    id: 'k1',
    baslangic: '2026-10-12T15:00:00',
    tekrar: { tip: 'yok', aralik: 1, gunler: [], istisnalar: [] },
    program: { program_id: 'p1', oge_id: 'o1', gun: '2026-10-12' }, // Pazartesi
  };
  const sonra = new Date(2026, 9, 5, 10, 0, 0, 0);
  const s = programUret(ayar(), [seri, kopya], sonra);
  assert.deepEqual(s.ayrilacak, []);
});

test('gecmis kopyaya hic dokunulmaz', () => {
  const p = ayar();
  const seri = kimlikle(ogeyiEtkinligeCevir(p, p.ogeler[0]!, p.kosu!, PAZARTESI)!, 'e1');
  const kopya: Etkinlik = {
    ...seri,
    id: 'k1',
    baslangic: '2026-09-22T15:00:00',
    tekrar: { tip: 'yok', aralik: 1, gunler: [], istisnalar: [] },
    program: { program_id: 'p1', oge_id: 'o1', gun: '2026-09-22' },
  };
  const sonra = new Date(2026, 9, 5, 10, 0, 0, 0);
  // Sali tamamen programdan cikariliyor ama 22 Eylul gecmiste kaldi.
  const s = programUret(ayar({ ogeler: [oge({ gunler: [1] })] }), [seri, kopya], sonra);
  assert.deepEqual(s.ayrilacak, [], 'gecmis kopya tarihtir, bagli kalmali');
});

test('gecmisi olmayan ogenin kaydi silinir', () => {
  const p = ayar();
  const eski = kimlikle(ogeyiEtkinligeCevir(p, p.ogeler[0]!, p.kosu!, PAZARTESI)!, 'e1');
  // Program henuz baslamadi (bugun 18 Eylul), oge tamamen cikariliyor.
  const s = programUret(ayar({ ogeler: [] }), [eski], SIMDI);
  assert.equal(s.yazilacak.length, 0);
  assert.equal(s.ozet.silinen, 1);
});

test('gecmisi olan oge cikarilinca silinmez dondurulur', () => {
  const p = ayar();
  const eski = kimlikle(ogeyiEtkinligeCevir(p, p.ogeler[0]!, p.kosu!, PAZARTESI)!, 'e1');
  const sonra = new Date(2026, 9, 5, 10, 0, 0, 0);
  const s = programUret(ayar({ ogeler: [] }), [eski], sonra);

  assert.equal(s.yazilacak.length, 1, 'gecmis seanslar takvimde kalmali');
  assert.equal(s.yazilacak[0]!.tekrar.bitis_tarihi, '2026-10-04');
  assert.equal(s.ozet.dondurulan, 1);
});

test('baska programin kayitlarina dokunulmaz', () => {
  const p = ayar();
  const benim = kimlikle(ogeyiEtkinligeCevir(p, p.ogeler[0]!, p.kosu!, PAZARTESI)!, 'e1');
  const yabanci: Etkinlik = {
    ...benim,
    id: 'x1',
    program: { program_id: 'p2', oge_id: 'o9', gun: null },
  };
  const elle: Etkinlik = { ...benim, id: 'x2', program: null };

  const s = programUret(p, [benim, yabanci, elle], SIMDI);
  assert.deepEqual(
    s.yazilacak.map((e) => e.id),
    ['e1'],
  );
});

// --------------------------------------------------------------- durdurma

test('durdurunca gecmis kalir gelecek silinir', () => {
  const p = ayar();
  const seri = kimlikle(ogeyiEtkinligeCevir(p, p.ogeler[0]!, p.kosu!, PAZARTESI)!, 'e1');
  const gecmisKopya: Etkinlik = {
    ...seri,
    id: 'k-gecmis',
    tekrar: { tip: 'yok', aralik: 1, gunler: [], istisnalar: [] },
    program: { program_id: 'p1', oge_id: 'o1', gun: '2026-09-22' },
  };
  const gelecekKopya: Etkinlik = { ...gecmisKopya, id: 'k-gelecek' };
  gelecekKopya.program = { program_id: 'p1', oge_id: 'o1', gun: '2026-10-13' };

  const sonra = new Date(2026, 9, 5, 10, 0, 0, 0);
  const s = programDurdur(p, [seri, gecmisKopya, gelecekKopya], sonra);

  assert.equal(s.yazilacak.length, 1);
  assert.equal(s.yazilacak[0]!.tekrar.bitis_tarihi, '2026-10-04');
  assert.deepEqual(s.silinecek, ['k-gelecek'], 'gecmis kopya kalmali');
});

test('hic calismamis program durdurulunca iz birakmaz', () => {
  const p = ayar();
  const seri = kimlikle(ogeyiEtkinligeCevir(p, p.ogeler[0]!, p.kosu!, PAZARTESI)!, 'e1');
  // Bugun 18 Eylul, program 21 Eylul'de baslayacakti.
  const s = programDurdur(p, [seri], SIMDI);
  assert.equal(s.yazilacak.length, 0);
});

// ------------------------------------------------------------------ ozet

test('ozet haftalik izgarayi ve toplamlari verir', () => {
  const p = ayar({
    ogeler: [oge({ gunler: [1, 3], sure_dakika: 90 }), oge({ id: 'o2', gunler: [6], sure_dakika: 120 })],
    kosu: kosu({ bitis: '2026-10-18', kip: 'hafta', hafta: 4 }),
  });
  const seriler = p.ogeler.map((o, i) =>
    kimlikle(ogeyiEtkinligeCevir(p, o, p.kosu!, PAZARTESI)!, `e${i + 1}`),
  );

  const o = programOzeti(p, seriler, SIMDI);
  assert.equal(o.haftalikOturum, 3);
  assert.equal(o.haftalikDakika, 90 * 2 + 120);
  assert.equal(o.toplamOturum, 12, '3 oturum x 4 hafta');
  assert.equal(o.toplamDakika, (90 * 2 + 120) * 4);
  assert.deepEqual(
    o.haftalik[0]!.ogeler.map((x) => x.id),
    ['o1'],
  );
  assert.equal(o.haftalik[4]!.ogeler.length, 0, 'Cuma bos olmali');
});

test('ozet ilerlemeyi ve sapmalari raporlar', () => {
  const p = ayar({ ogeler: [oge({ gunler: [1] })] });
  const seri = kimlikle(ogeyiEtkinligeCevir(p, p.ogeler[0]!, p.kosu!, PAZARTESI)!, 'e1');
  seri.tamamlananlar = ['2026-09-21T09:00:00'];
  seri.tekrar.istisnalar = ['2026-09-28'];

  const kopya: Etkinlik = {
    ...seri,
    id: 'k1',
    baslangic: '2026-09-28T15:00:00',
    tamamlananlar: [],
    tekrar: { tip: 'yok', aralik: 1, gunler: [], istisnalar: [] },
    program: { program_id: 'p1', oge_id: 'o1', gun: '2026-09-28' },
  };

  const sonra = new Date(2026, 9, 5, 10, 0, 0, 0); // 5 Ekim Pazartesi
  const o = programOzeti(p, [seri, kopya], sonra);

  // 21 Eylul (seri), 28 Eylul (kopya), 5 Ekim (seri) = 3 oturum gecti.
  assert.equal(o.gecen, 3);
  assert.equal(o.tamamlanan, 1);
  assert.equal(o.sapmalar.length, 1);
  assert.equal(o.sapmalar[0]!.gun, '2026-09-28');
  assert.equal(o.sapmalar[0]!.seriId, 'e1');
  assert.equal(o.sapmalar[0]!.kopya?.id, 'k1');
});

test('kopyasi olmayan istisna ciplak atlama olarak raporlanir', () => {
  const p = ayar({ ogeler: [oge({ gunler: [1] })] });
  const seri = kimlikle(ogeyiEtkinligeCevir(p, p.ogeler[0]!, p.kosu!, PAZARTESI)!, 'e1');
  seri.tekrar.istisnalar = ['2026-09-28'];

  const o = programOzeti(p, [seri], new Date(2026, 9, 5, 10, 0, 0, 0));
  assert.equal(o.sapmalar.length, 1);
  assert.equal(o.sapmalar[0]!.kopya, null);
});

test('uykudaki programin ozeti yalnizca haftalik izgaradir', () => {
  const o = programOzeti(ayar({ kosu: null }), [], SIMDI);
  assert.equal(o.haftalikOturum, 2);
  assert.equal(o.toplamOturum, null);
  assert.equal(o.gecen, 0);
  assert.deepEqual(o.sapmalar, []);
});

// Tip kontrolu icin: SureKipi degerlerinin hepsi bitisHesapla'da ele aliniyor.
const kipler: SureKipi[] = ['hafta', 'tarih', 'suresiz'];
test('her sure kipi bir sonuc verir', () => {
  for (const k of kipler) {
    const b = bitisHesapla(PAZARTESI, k, 2, new Date(2026, 9, 1));
    assert.ok(b === null || b instanceof Date, `${k} icin gecersiz sonuc`);
  }
});
