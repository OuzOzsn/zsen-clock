/**
 * Program sablonunu takvim etkinliklerine cevirir.
 *
 * Bir oge = BIR tekrarli etkinlik (`tekrar.tip = 'haftalik'`). Somut etkinlik
 * uretmiyoruz; planUret.ts'in tersi karar. Orada konular gunden gune DONDUGU
 * icin tek bir tekrar kurali yetmiyordu, burada her ogenin icerigi haftadan
 * haftaya sabit. Kazanci buyuk: "suresiz" program bedava geliyor ve
 * zamanlayicinin (cekirdek/zamanlayici.rs) programdan haberi olmasi
 * gerekmiyor - zaten tekrar kurallarini isliyor.
 *
 * Uretim neden Rust'ta degil? Her zaman kullanici tetikli; hicbir zaman
 * basssiz calismiyor. TS'te kalinca tekrar.rs/tarih.ts tarzi ikinci bir kopya
 * dogmuyor ve tarayici onizlemesi de calisiyor.
 *
 * Iki kural bu dosyanin tamamini sekillendiriyor:
 *
 *   1. Yeniden uretim HER ZAMAN `kosu.baslangic`i temel alir, turetilmis
 *      capayi degil. Yoksa ogeye sonradan gun eklenince ilk olusum yanlis
 *      haftaya kayar.
 *   2. GECMIS DONDURULUR. Tekrar kurali tum zamanda degerlendirildigi icin
 *      calisan bir programin gunlerini degistirmek gecen ayin takvimini de
 *      degistirir ve tamamlanma kayitlarini oksuz birakirdi. Gecmisi degistiren
 *      her duzenlemede eski kayit dune kapatilir, bugunden yeni bir donem
 *      acilir (Google Takvim'in "bu ve sonraki etkinlikler"i).
 *
 * Bilinen sinirlama: "programi bir haftaligina duraklat" bu modelde ancak oge
 * basina 7 istisna ile anlatilabilir.
 */

import { isoCoz, yerelISO } from './ipc.ts';
import { gunAnahtari, gunBasi, gunEkle, haftaGunu, ilkUyanGun, olusumlar } from './tarih.ts';
import type {
  Etkinlik,
  Program,
  ProgramKosusu,
  ProgramOgesi,
  SureKipi,
} from './tipler.ts';

// ------------------------------------------------------------------ sure

/**
 * Kosunun bitis gunu (bu gun dahil). Suresizde null.
 *
 * "N hafta" SECILEN TARIHTEN sayilir, ilk olusumdan degil: 7N gunluk bir
 * pencerede her hafta gunu tam N kez geciyor, pencere hangi gunden acilirsa
 * acilsin. Boylece "4 hafta" diyen kullanici her ogeden tam 4 seans aliyor.
 * Ilk olusumdan sayilsaydi Pzt+Cum programini Carsamba baslatan kisi 4 Cuma
 * ama 5 Pazartesi gorurdu.
 */
export function bitisHesapla(
  baslangic: Date,
  kip: SureKipi,
  hafta: number,
  tarih: Date | null,
): Date | null {
  if (kip === 'suresiz') return null;
  if (kip === 'tarih') return tarih ? gunBasi(tarih) : null;
  const n = Math.max(1, Math.floor(hafta));
  return gunEkle(gunBasi(baslangic), n * 7 - 1);
}

/** "HH:MM" -> [saat, dakika]. Bozuk girdide 09:00. */
export function saatCoz(saat: string): [number, number] {
  const m = /^(\d{1,2}):(\d{2})$/.exec(saat.trim());
  if (!m) return [9, 0];
  const s = Math.min(23, Math.max(0, Number(m[1])));
  const d = Math.min(59, Math.max(0, Number(m[2])));
  return [s, d];
}

// ------------------------------------------------------------- oge -> etkinlik

/**
 * Bir ogeyi, `capaGunu`ndan itibaren ilk uyan gune oturtulmus tekrarli bir
 * etkinlige cevirir. Oge hicbir gune isaretli degilse ya da ilk olusum
 * kosunun bitisini asiyorsa null doner.
 *
 * Capa aslinda gerekli degil - tekrar motoru `aralik === 1` haftalikta gun
 * kumesine bakiyor, capa hangi gune kurulursa kurulsun. Yine de gercek ilk
 * olusuma oturtuyoruz: EtkinlikFormu bu alani `datetime-local` olarak
 * gosteriyor, olusum olmayan bir tarih orada hata gibi okunur.
 */
export function ogeyiEtkinligeCevir(
  program: Program,
  oge: ProgramOgesi,
  kosu: ProgramKosusu,
  capaGunu: Date,
): Etkinlik | null {
  const gunler = [...new Set(oge.gunler)].filter((g) => g >= 1 && g <= 7).sort((a, b) => a - b);
  const ilkGun = ilkUyanGun(capaGunu, gunler);
  if (!ilkGun) return null;

  const bitisGunu = kosu.bitis ? isoCoz(kosu.bitis) : null;
  if (bitisGunu && ilkGun > bitisGunu) return null;

  const [saat, dakika] = saatCoz(oge.saat);
  const baslangic = new Date(ilkGun);
  baslangic.setHours(saat, dakika, 0, 0);
  const bitis =
    oge.sure_dakika > 0 ? new Date(baslangic.getTime() + oge.sure_dakika * 60_000) : null;

  return {
    id: '',
    baslik: oge.baslik,
    // Icerik etkinligin notuna yaziliyor: alarm penceresi programi cozmek
    // zorunda kalmasin (Tetiklenen.not dogrudan buradan kopyalaniyor).
    not: oge.icerik,
    kategori: program.kategori,
    baslangic: yerelISO(baslangic),
    bitis: bitis ? yerelISO(bitis) : null,
    tum_gun: false,
    tekrar: {
      tip: 'haftalik',
      aralik: 1,
      gunler,
      bitis_tarihi: kosu.bitis ?? null,
      istisnalar: [],
    },
    hatirlatmalar: oge.hatirlatmalar.map((h) => ({ ...h })),
    renk: null,
    tamamlananlar: [],
    program: { program_id: program.id, oge_id: oge.id, gun: null },
  };
}

// --------------------------------------------------------------- uretim

export interface UretimOzeti {
  /** Yerinde guncellenen kayit sayisi. */
  guncellenen: number;
  /** Gecmisi degistigi icin dune kapatilan kayit sayisi. */
  dondurulan: number;
  /** Bugunden itibaren acilan yeni donem sayisi. */
  acilan: number;
  /** Gecmisi olmadigi icin tamamen silinen kayit sayisi. */
  silinen: number;
  /** Program kapsaminin disina dustugu icin bagi koparilan kopya sayisi. */
  ayrilan: number;
}

export interface UretimSonucu {
  /** Programin yeni seri kayitlari - donmus donemler dahil. */
  yazilacak: Etkinlik[];
  /** Bagi koparilacak (silinmeyecek) gune ozel kopyalarin id'leri. */
  ayrilacak: string[];
  ozet: UretimOzeti;
}

function seriMi(e: Etkinlik, programId: string): boolean {
  return e.program?.program_id === programId && !e.program.gun;
}

function kopyaMi(e: Etkinlik, programId: string): boolean {
  return e.program?.program_id === programId && !!e.program.gun;
}

/** Kaydin tekrar kurali bugune ya da sonrasina uzaniyor mu? */
function canliMi(e: Etkinlik, bugunG: Date): boolean {
  const b = e.tekrar.bitis_tarihi;
  return !b || isoCoz(b) >= bugunG;
}

function saatAnahtari(e: Etkinlik): string {
  return e.baslangic.slice(11, 16);
}

/** [bas, son] araligindaki olusumlarin gun anahtarlari - istisnalar yok sayilir. */
function gunlerKumesi(e: Etkinlik, bas: Date, son: Date): string {
  if (son < bas) return '';
  const kuralsiz: Etkinlik = { ...e, tekrar: { ...e.tekrar, istisnalar: [] } };
  return olusumlar(kuralsiz, bas, son).map(gunAnahtari).join(',');
}

function pencereyeKirp(tarihler: string[], bas: string, son: string | null): string[] {
  return tarihler.filter((t) => t >= bas && (!son || t <= son));
}

/**
 * Calisan bir programin takvimdeki seri kayitlarini yeniden uretir.
 *
 * `mevcut` tum etkinlik listesi olabilir; ilgisiz kayitlar elenir.
 * Sonuc `program_etkinlikleri_yaz` komutuna oldugu gibi verilir.
 */
export function programUret(
  program: Program,
  mevcut: Etkinlik[],
  bugun: Date,
): UretimSonucu {
  const ozet: UretimOzeti = {
    guncellenen: 0,
    dondurulan: 0,
    acilan: 0,
    silinen: 0,
    ayrilan: 0,
  };
  const kosu = program.kosu;
  if (!kosu) return { yazilacak: [], ayrilacak: [], ozet };

  const bugunG = gunBasi(bugun);
  const dun = gunEkle(bugunG, -1);
  const basG = isoCoz(kosu.baslangic);
  const basAnahtar = gunAnahtari(basG);
  const bitisAnahtar = kosu.bitis ?? null;

  const seriler = mevcut.filter((e) => seriMi(e, program.id));
  const kopyalar = mevcut.filter((e) => kopyaMi(e, program.id));

  const yazilacak: Etkinlik[] = [];
  const islenmis = new Set<string>();

  for (const oge of program.ogeler) {
    const ogeSerileri = seriler.filter((e) => e.program!.oge_id === oge.id);
    for (const e of ogeSerileri) islenmis.add(e.id);

    // Donmus donemler oldugu gibi tasinir: onlar artik tarihtir.
    yazilacak.push(...ogeSerileri.filter((e) => !canliMi(e, bugunG)));

    const canli = ogeSerileri.find((e) => canliMi(e, bugunG));
    // Bugunden itibaren acilacak bir donemin capasi. Program henuz
    // baslamadiysa secilen tarih, basladiysa bugun: gecmise sonradan seans
    // eklenemez (kural 2).
    const bugundenCapa = basG > bugunG ? basG : bugunG;

    if (!canli) {
      // Yeni eklenen oge ya da onceki donemi kapanmis oge.
      const yeniAday = ogeyiEtkinligeCevir(program, oge, kosu, bugundenCapa);
      if (yeniAday) {
        yazilacak.push(yeniAday);
        ozet.acilan += 1;
      }
      continue;
    }

    const gecmis = basG <= dun ? gunlerKumesi(canli, basG, dun) : '';

    if (gecmis === '') {
      // Bu donemin hic gecmisi yok - ya program henuz baslamadi, ya da bu
      // zaten bugun/ileride acilmis bir sonraki donem. Donduracak bir sey
      // olmadigi icin kaydi yerinde degistiriyoruz; yoksa her guncellemede
      // hicbir sey uretmeyen bos bir kabuk birikirdi.
      const yenilenmis = ogeyiEtkinligeCevir(program, oge, kosu, bugundenCapa);
      if (!yenilenmis) {
        ozet.silinen += 1;
        continue;
      }
      yazilacak.push(devral(yenilenmis, canli, basAnahtar, bitisAnahtar));
      ozet.guncellenen += 1;
      continue;
    }

    const aday = ogeyiEtkinligeCevir(program, oge, kosu, basG);

    if (!aday) {
      // Oge artik hicbir gune isaretli degil (ya da pencere disinda kaldi),
      // ama gecmisi var: silmek yerine dune kapatiyoruz.
      yazilacak.push(dondur(canli, dun));
      ozet.dondurulan += 1;
      continue;
    }

    const gecmisDegisti =
      gecmis !== gunlerKumesi(aday, basG, dun) ||
      // Saat degisirse gecmis olusumlarin ani kayar ve `tamamlananlar`
      // hicbir olusuma denk gelmez olur - yani gecmis degismis sayilir.
      saatAnahtari(canli) !== saatAnahtari(aday);

    if (!gecmisDegisti) {
      // Yaygin hal: icerik/baslik/not duzenlendi. Kaydi yerinde degistir,
      // kullanici izlerini koru.
      yazilacak.push(devral(aday, canli, basAnahtar, bitisAnahtar));
      ozet.guncellenen += 1;
      continue;
    }

    // Gecmis degisiyor: eski kaydi dune kapat, bugunden yeni donem ac.
    yazilacak.push(dondur(canli, dun));
    ozet.dondurulan += 1;

    const yeniDonem = ogeyiEtkinligeCevir(program, oge, kosu, bugunG);
    if (yeniDonem) {
      const dunAnahtar = gunAnahtari(dun);
      yazilacak.push({
        ...yeniDonem,
        tekrar: {
          ...yeniDonem.tekrar,
          // Gelecege ait istisnalar (ayrilmis gunler) yeni doneme tasinir.
          istisnalar: pencereyeKirp(
            canli.tekrar.istisnalar.filter((t) => t > dunAnahtar),
            basAnahtar,
            bitisAnahtar,
          ),
        },
        tamamlananlar: pencereyeKirp(
          canli.tamamlananlar.filter((t) => t.slice(0, 10) > dunAnahtar),
          basAnahtar,
          bitisAnahtar,
        ),
      });
      ozet.acilan += 1;
    }
  }

  // Programdan tamamen cikarilmis ogelerin kayitlari.
  for (const e of seriler) {
    if (islenmis.has(e.id)) continue;
    if (!canliMi(e, bugunG)) {
      yazilacak.push(e);
      continue;
    }
    if (basG <= dun && gunlerKumesi(e, basG, dun) !== '') {
      yazilacak.push(dondur(e, dun));
      ozet.dondurulan += 1;
    } else {
      ozet.silinen += 1;
    }
  }

  // Programin artik kapsamadigi bir gune dusen GELECEK kopyalar: silmiyoruz,
  // elle yazilmis icerik kaybolmasin. Yalnizca bagi kopariyoruz; kayit
  // siradan bir kullanici etkinligi olarak takvimde kaliyor.
  const ayrilacak: string[] = [];
  for (const kopya of kopyalar) {
    const gunMetni = kopya.program!.gun!;
    const gun = isoCoz(gunMetni);
    if (gun <= bugunG) continue; // gecmis tarihtir, dokunma
    const oge = program.ogeler.find((o) => o.id === kopya.program!.oge_id);
    const kapsamda =
      !!oge &&
      oge.gunler.includes(haftaGunu(gun)) &&
      gunMetni >= basAnahtar &&
      (!bitisAnahtar || gunMetni <= bitisAnahtar);
    if (!kapsamda) {
      ayrilacak.push(kopya.id);
      ozet.ayrilan += 1;
    }
  }

  return { yazilacak, ayrilacak, ozet };
}

/**
 * Yeni uretilmis kaydi mevcut kaydin yerine gecirir: kimlik, istisnalar,
 * tamamlanmalar ve olusturulma zamani devralinir. Bunlar kullanicinin kendi
 * izleri; kural degisse de kaybolmamali.
 */
function devral(
  yeni: Etkinlik,
  eski: Etkinlik,
  basAnahtar: string,
  bitisAnahtar: string | null,
): Etkinlik {
  return {
    ...yeni,
    id: eski.id,
    tekrar: {
      ...yeni.tekrar,
      istisnalar: pencereyeKirp(eski.tekrar.istisnalar, basAnahtar, bitisAnahtar),
    },
    tamamlananlar: pencereyeKirp(eski.tamamlananlar, basAnahtar, bitisAnahtar),
    olusturuldu: eski.olusturuldu ?? null,
  };
}

/** Kaydi verilen gune kapatir; zaten daha erken bitiyorsa dokunmaz. */
function dondur(e: Etkinlik, son: Date): Etkinlik {
  const sonAnahtar = gunAnahtari(son);
  const mevcut = e.tekrar.bitis_tarihi;
  const yeni = mevcut && mevcut < sonAnahtar ? mevcut : sonAnahtar;
  return {
    ...e,
    tekrar: {
      ...e.tekrar,
      bitis_tarihi: yeni,
      istisnalar: e.tekrar.istisnalar.filter((t) => t <= yeni),
    },
  };
}

// --------------------------------------------------------------- durdurma

export interface DurdurmaSonucu {
  /** Dune kapatilmis seri kayitlari. */
  yazilacak: Etkinlik[];
  /** Silinecek kayit id'leri: gelecekteki kopyalar. */
  silinecek: string[];
}

/**
 * Programi durdurur: gecmis kalir, gelecek silinir.
 *
 * Canli seri kayitlari dune kapatilir - boylece gecmis seanslar, tamamlanmalar
 * ve elle duzenlenmis gunler oldugu gibi kalir. Hic gecmisi olmayan kayit
 * (program bugun/ileride baslatilmisti) tamamen dusurulur.
 */
export function programDurdur(
  program: Program,
  mevcut: Etkinlik[],
  bugun: Date,
): DurdurmaSonucu {
  const bugunG = gunBasi(bugun);
  const dun = gunEkle(bugunG, -1);
  const basG = program.kosu ? isoCoz(program.kosu.baslangic) : bugunG;

  const yazilacak: Etkinlik[] = [];
  for (const e of mevcut.filter((x) => seriMi(x, program.id))) {
    if (!canliMi(e, bugunG)) {
      yazilacak.push(e);
      continue;
    }
    if (basG <= dun && gunlerKumesi(e, basG, dun) !== '') {
      yazilacak.push(dondur(e, dun));
    }
  }

  const silinecek = mevcut
    .filter((e) => kopyaMi(e, program.id) && e.program!.gun! > gunAnahtari(bugunG))
    .map((e) => e.id);

  return { yazilacak, silinecek };
}

// ------------------------------------------------------------------ ozet

export interface GunOzeti {
  /** 1 = Pazartesi ... 7 = Pazar */
  gun: number;
  ogeler: ProgramOgesi[];
  dakika: number;
}

export interface Sapma {
  /** "YYYY-MM-DD" */
  gun: string;
  /** Istisnayi tasiyan seri kaydinin id'si - geri birlestirmek icin gerekli. */
  seriId: string;
  ogeBaslik: string;
  /** Elle duzenlenmis kopya; null ise "yalnizca bu gunu atla" denmis. */
  kopya: Etkinlik | null;
}

export interface ProgramOzeti {
  haftalik: GunOzeti[];
  haftalikOturum: number;
  haftalikDakika: number;
  /** Kosu boyunca toplam oturum; suresizde null. */
  toplamOturum: number | null;
  toplamDakika: number | null;
  /** Bugune kadar gelmis olmasi gereken oturum sayisi. */
  gecen: number;
  tamamlanan: number;
  sapmalar: Sapma[];
}

/**
 * Detay modalinin ihtiyaci olan her sey. Suresiz kosuda ilerleme penceresi
 * [baslangic, bugun] ile sinirlanir - yoksa "yuzde kac" sorusunun cevabi yok.
 */
export function programOzeti(
  program: Program,
  mevcut: Etkinlik[],
  bugun: Date,
): ProgramOzeti {
  const haftalik: GunOzeti[] = [];
  for (let g = 1; g <= 7; g++) {
    const ogeler = program.ogeler
      .filter((o) => o.gunler.includes(g))
      .sort((a, b) => a.saat.localeCompare(b.saat));
    haftalik.push({
      gun: g,
      ogeler,
      dakika: ogeler.reduce((t, o) => t + o.sure_dakika, 0),
    });
  }

  const haftalikOturum = haftalik.reduce((t, g) => t + g.ogeler.length, 0);
  const haftalikDakika = haftalik.reduce((t, g) => t + g.dakika, 0);

  const bos: ProgramOzeti = {
    haftalik,
    haftalikOturum,
    haftalikDakika,
    toplamOturum: null,
    toplamDakika: null,
    gecen: 0,
    tamamlanan: 0,
    sapmalar: [],
  };
  const kosu = program.kosu;
  if (!kosu) return bos;

  const bugunG = gunBasi(bugun);
  const basG = isoCoz(kosu.baslangic);
  const bitisG = kosu.bitis ? isoCoz(kosu.bitis) : null;

  const seriler = mevcut.filter((e) => seriMi(e, program.id));
  const kopyalar = mevcut.filter((e) => kopyaMi(e, program.id));

  // Kopyalar da programin bir parcasi: sayimlarda onlar da var.
  const sayilacak = [...seriler, ...kopyalar];

  let toplamOturum: number | null = null;
  let toplamDakika: number | null = null;
  if (bitisG) {
    toplamOturum = 0;
    toplamDakika = 0;
    for (const e of sayilacak) {
      const adet = olusumlar(e, basG, bitisG).length;
      toplamOturum += adet;
      toplamDakika += adet * sureDakika(e);
    }
  }

  const gecenSon = bitisG && bitisG < bugunG ? bitisG : bugunG;
  let gecen = 0;
  let tamamlanan = 0;
  for (const e of sayilacak) {
    const liste = olusumlar(e, basG, gecenSon);
    gecen += liste.length;
    const kume = new Set(e.tamamlananlar.map((t) => t.slice(0, 16)));
    tamamlanan += liste.filter((o) => kume.has(yerelISO(o).slice(0, 16))).length;
  }

  // Sapmalar: hem elle duzenlenmis gunler hem "yalnizca bu gunu atla"lar.
  // Ikisi de ayni dugmeyle ("Programa döndür") geri alinabiliyor.
  const sapmalar: Sapma[] = [];
  for (const seri of seriler) {
    const ogeId = seri.program!.oge_id;
    const oge = program.ogeler.find((o) => o.id === ogeId);
    for (const gun of seri.tekrar.istisnalar) {
      const kopya =
        kopyalar.find((k) => k.program!.oge_id === ogeId && k.program!.gun === gun) ?? null;
      sapmalar.push({
        gun,
        seriId: seri.id,
        ogeBaslik: oge?.baslik ?? seri.baslik,
        kopya,
      });
    }
  }
  sapmalar.sort((a, b) => a.gun.localeCompare(b.gun));

  return {
    haftalik,
    haftalikOturum,
    haftalikDakika,
    toplamOturum,
    toplamDakika,
    gecen,
    tamamlanan,
    sapmalar,
  };
}

function sureDakika(e: Etkinlik): number {
  if (!e.bitis) return 0;
  return Math.max(0, Math.round((isoCoz(e.bitis).getTime() - isoCoz(e.baslangic).getTime()) / 60_000));
}
