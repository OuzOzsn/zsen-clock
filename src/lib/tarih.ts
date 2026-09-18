/**
 * Tarih/saat yardimcilari ve tekrar hesabinin arayuz tarafindaki kopyasi.
 *
 * Neden iki kopya var (burada TS, Rust'ta tekrar.rs)?
 * Zamanlayicinin hicbir pencere acik degilken de calismasi gerekiyor, bu yuzden
 * Rust tarafinda olmak zorunda. Arayuzun ise ay gorunumunu her kaydirmada IPC'ye
 * gitmeden cizebilmesi gerekiyor. Ikisinin sessizce ayrilmasini onlemek icin
 * ortak test vektorleri kullaniliyor: src/lib/tekrar-vektorleri.json - ayni
 * dosyayi hem bu modulun testi (tarih.test.ts) hem cekirdek/tekrar.rs testi
 * (`ortak_vektorler_uyusuyor`) okuyor. Vektore dokunmadan kural degistirmek
 * iki taraftan birini kirar - kasitli olan da budur.
 */

import type { Etkinlik, Olusum } from './tipler.ts';
import { isoCoz } from './ipc.ts';

// ------------------------------------------------------------ temel islemler

export function gunBasi(d: Date): Date {
  const y = new Date(d);
  y.setHours(0, 0, 0, 0);
  return y;
}

export function gunEkle(d: Date, n: number): Date {
  const y = new Date(d);
  y.setDate(y.getDate() + n);
  return y;
}

export function ayEkle(d: Date, n: number): Date {
  const y = new Date(d);
  y.setDate(1);
  y.setMonth(y.getMonth() + n);
  return y;
}

/** 1 = Pazartesi ... 7 = Pazar */
export function haftaGunu(d: Date): number {
  return d.getDay() === 0 ? 7 : d.getDay();
}

/**
 * `baslangic`tan itibaren `gunler` kumesine uyan ilk gun - baslangic gunu
 * dahil. Program baslatmanin cekirdegi: "perşembe başlattım ama program
 * pazartesi+salı" durumunda gelecek pazartesiyi verir, pazartesi
 * baslatildiginda o pazartesiyi verir.
 *
 * Gun kumesi bossa null doner.
 */
export function ilkUyanGun(baslangic: Date, gunler: number[]): Date | null {
  if (gunler.length === 0) return null;
  const kume = new Set(gunler);
  const bas = gunBasi(baslangic);
  for (let i = 0; i < 7; i++) {
    const gun = gunEkle(bas, i);
    if (kume.has(haftaGunu(gun))) return gun;
  }
  return null;
}

export function ayniGun(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** "YYYY-MM-DD" */
export function gunAnahtari(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Gece yarisindan itibaren gecen dakika - zaman izgarasinda konum icin. */
export function gunIciDakika(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

// ----------------------------------------------------------------- bicimleme

export function saatBicim(d: Date, saat24 = true): string {
  return d.toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: !saat24,
  });
}

/**
 * Geri sayimi iki parcaya bolerek dondurur.
 *
 * `saniye` ayri veriliyor cunku widget'ta sonuk gosteriliyor: her saniye
 * degisen rakam goze carpinca asil bilgi olan saat:dakika okunmaz hale
 * geliyordu. Sonuk saniye "canli" hissini koruyor ama dikkati calmiyor.
 */
export function geriSayimParcali(
  hedef: Date,
  simdi: Date = new Date(),
): { ana: string; saniye: string | null } {
  let kalan = Math.floor((hedef.getTime() - simdi.getTime()) / 1000);
  if (kalan < 0) kalan = 0;

  const p = (n: number) => String(n).padStart(2, '0');
  const gun = Math.floor(kalan / 86400);

  // Bir gunden uzunsa saniye anlamsiz: "3g 14s" yeter.
  if (gun >= 1) {
    return { ana: `${gun}g ${Math.floor((kalan % 86400) / 3600)}s`, saniye: null };
  }

  const saat = Math.floor(kalan / 3600);
  const dakika = Math.floor((kalan % 3600) / 60);
  return {
    ana: saat > 0 ? `${p(saat)}:${p(dakika)}` : p(dakika),
    saniye: p(kalan % 60),
  };
}

/** Tek parca metin isteyen yerler icin (tepsi ipucu, bildirim). */
export function geriSayim(hedef: Date, simdi: Date = new Date()): string {
  const { ana, saniye } = geriSayimParcali(hedef, simdi);
  return saniye === null ? ana : `${ana}:${saniye}`;
}

/** "2 saat 15 dakika" gibi insan okuyacak sure metni. */
export function sureMetni(dakika: number): string {
  if (dakika < 60) return `${dakika} dk`;
  const s = Math.floor(dakika / 60);
  const d = dakika % 60;
  return d === 0 ? `${s} saat` : `${s} sa ${d} dk`;
}

// -------------------------------------------------------------------- tekrar

/**
 * `etkinlik`in [bas, son] araligina dusen olusumlarini dondurur.
 * cekirdek/src/tekrar.rs ile ayni kurallari uygular.
 */
export function olusumlar(etkinlik: Etkinlik, bas: Date, son: Date): Date[] {
  const ilk = isoCoz(etkinlik.baslangic);
  const ilkGun = gunBasi(ilk);
  const t = etkinlik.tekrar;

  if (t.tip === 'yok') {
    return ilkGun >= gunBasi(bas) && ilkGun <= gunBasi(son) ? [ilk] : [];
  }

  const aralik = Math.max(1, t.aralik);
  let taramaBas = gunBasi(bas) < ilkGun ? ilkGun : gunBasi(bas);
  let taramaSon = gunBasi(son);
  if (t.bitis_tarihi) {
    const bitis = isoCoz(t.bitis_tarihi);
    if (bitis < taramaSon) taramaSon = gunBasi(bitis);
  }

  const istisnalar = new Set(t.istisnalar);
  const sonuc: Date[] = [];

  for (let gun = new Date(taramaBas); gun <= taramaSon; gun = gunEkle(gun, 1)) {
    if (!uyuyorMu(etkinlik, aralik, ilkGun, gun)) continue;
    if (istisnalar.has(gunAnahtari(gun))) continue;
    const o = new Date(gun);
    o.setHours(ilk.getHours(), ilk.getMinutes(), 0, 0);
    sonuc.push(o);
  }
  return sonuc;
}

function uyuyorMu(etkinlik: Etkinlik, aralik: number, ilk: Date, gun: Date): boolean {
  const t = etkinlik.tekrar;
  const gunFarki = Math.round((gun.getTime() - ilk.getTime()) / 86400000);

  switch (t.tip) {
    case 'gunluk':
      return gunFarki % aralik === 0;

    case 'haftalik': {
      const secili = t.gunler.length ? t.gunler : [haftaGunu(ilk)];
      if (!secili.includes(haftaGunu(gun))) return false;
      if (aralik === 1) return true;
      const haftaFarki = Math.round(
        (pazartesiyeHizala(gun).getTime() - pazartesiyeHizala(ilk).getTime()) / (7 * 86400000),
      );
      return haftaFarki % aralik === 0;
    }

    case 'aylik': {
      // Karsiligi olmayan gun (orn. ayin 31'i) atlanir, kaydirilmaz.
      if (gun.getDate() !== ilk.getDate()) return false;
      const ayFarki =
        (gun.getFullYear() - ilk.getFullYear()) * 12 + (gun.getMonth() - ilk.getMonth());
      return ayFarki >= 0 && ayFarki % aralik === 0;
    }

    case 'yillik': {
      if (gun.getDate() !== ilk.getDate() || gun.getMonth() !== ilk.getMonth()) return false;
      const yilFarki = gun.getFullYear() - ilk.getFullYear();
      return yilFarki >= 0 && yilFarki % aralik === 0;
    }

    default:
      return false;
  }
}

function pazartesiyeHizala(d: Date): Date {
  return gunEkle(gunBasi(d), -(haftaGunu(d) - 1));
}

// --------------------------------------------------------- gorunum yardimi

/**
 * Verilen aralikta gosterilecek tum olusumlari, kategoriye gore renklendirilmis
 * ve zaman sirasina dizilmis olarak dondurur.
 */
export function araliktakiOlusumlar(
  etkinlikler: Etkinlik[],
  bas: Date,
  son: Date,
  kategoriRenkleri: Record<string, string>,
): Olusum[] {
  const liste: Olusum[] = [];

  for (const e of etkinlikler) {
    const sure = e.bitis ? isoCoz(e.bitis).getTime() - isoCoz(e.baslangic).getTime() : 0;
    const tamamlananlar = new Set(e.tamamlananlar);

    for (const baslangic of olusumlar(e, bas, son)) {
      liste.push({
        etkinlik: e,
        baslangic,
        bitis: sure > 0 ? new Date(baslangic.getTime() + sure) : null,
        tamamlandi: tamamlananlar.has(yerelISOsn(baslangic)),
        renk: e.renk ?? kategoriRenkleri[e.kategori] ?? 'var(--kat-8)',
      });
    }
  }

  return liste.sort((a, b) => a.baslangic.getTime() - b.baslangic.getTime());
}

/** tamamlananlar listesiyle karsilastirmak icin saniyeli yerel ISO. */
export function yerelISOsn(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(
    d.getMinutes(),
  )}:${p(d.getSeconds())}`;
}

/** Ay gorunumu icin 6x7 = 42 gunluk izgara (onceki/sonraki ay tasmalari dahil). */
export function ayIzgarasi(ay: Date, haftaninIlkGunu = 1): Date[] {
  const ilkGun = new Date(ay.getFullYear(), ay.getMonth(), 1);
  const kaydir = (haftaGunu(ilkGun) - haftaninIlkGunu + 7) % 7;
  const bas = gunEkle(gunBasi(ilkGun), -kaydir);
  return Array.from({ length: 42 }, (_, i) => gunEkle(bas, i));
}
