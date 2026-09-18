/**
 * Turkce dogal dil ayristirici.
 *
 * Tek satirlik bir metni etkinlige cevirir:
 *   "yarin 14:00 matematik 45dk"        -> yarin 14:00, 45 dakika
 *   "her pzt car cum 09:00 spor"        -> haftalik tekrar, Pzt/Car/Cum
 *   "hafta ici 07:30 kalk"              -> haftalik tekrar, Pzt-Cum
 *   "15 ekim 10:30 dis randevusu"       -> tek seferlik
 *   "2 gunde bir 20:00 ilac"            -> gunluk tekrar, aralik 2
 *
 * Taninan her parca metinden dusulur; geriye kalan sey basliktir.
 * Hicbir sey taninmazsa metnin tamami baslik olur - kullanici asla veri kaybetmez.
 */

export type TekrarTipi = 'yok' | 'gunluk' | 'haftalik' | 'aylik' | 'yillik';

export interface Tekrar {
  tip: TekrarTipi;
  aralik: number;
  /** 1 = Pazartesi ... 7 = Pazar */
  gunler: number[];
}

export interface Cozum {
  baslik: string;
  baslangic: Date;
  sureDakika: number | null;
  tekrar: Tekrar;
  /** Metinde saat gecmediyse false; arayuz varsayilan saati uygular. */
  saatBelirtildi: boolean;
  /** Kullaniciya "ne anladim" ozeti gostermek icin: taninan parcalar. */
  taninanlar: string[];
}

// ------------------------------------------------------------------ sozluk

const GUN_ADLARI: Record<string, number> = {
  pazartesi: 1, pzt: 1, pts: 1,
  sali: 2, sal: 2,
  carsamba: 3, car: 3, crs: 3,
  persembe: 4, per: 4, prs: 4,
  cuma: 5, cum: 5,
  cumartesi: 6, cmt: 6, cts: 6,
  pazar: 7, paz: 7, par: 7,
};

const AY_ADLARI: Record<string, number> = {
  ocak: 1, subat: 2, mart: 3, nisan: 4, mayis: 5, haziran: 6,
  temmuz: 7, agustos: 8, eylul: 9, ekim: 10, kasim: 11, aralik: 12,
};

/** Gunun bolumlerine karsilik gelen varsayilan saatler. */
const ZAMAN_DILIMLERI: Record<string, number> = {
  sabah: 8, ogle: 12, oglen: 12, aksam: 19, gece: 22, geceyarisi: 0,
};

// ------------------------------------------------------------- yardimcilar

/**
 * Turkce metni karsilastirmaya hazirlar: kucuk harfe cevirir ve aksanlari
 * duzler. Boylece "Çarşamba", "carsamba" ve "ÇARŞAMBA" ayni sozluk anahtarina
 * duser; kullanici Turkce karakter yazmak zorunda kalmaz.
 *
 * ONEMLI: sonuc, girdiyle BIREBIR ayni karakter sayisinda olmali. Eslesmelerin
 * indislerini orijinal metne uyguladigimiz icin kayma olursa baslik yanlis
 * yerden kesilir. Bu yuzden 'İ' ve 'I' toLowerCase'e birakilmadan once elle
 * cevriliyor: bazi ortamlarda 'İ'.toLowerCase() iki karakter ('i' + birlesik
 * nokta) uretiyor.
 */
export function sadelestir(metin: string): string {
  const sade = metin
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/â/g, 'a')
    .replace(/î/g, 'i')
    .replace(/û/g, 'u');

  // Beklenmedik bir locale davranisi indisleri kaydirirsa, kesme islemini
  // bozmaktansa orijinali oldugu gibi kullan (eslesme kacar, veri kaybolmaz).
  return sade.length === metin.length ? sade : metin.toLowerCase();
}

function gunBasi(d: Date): Date {
  const y = new Date(d);
  y.setHours(0, 0, 0, 0);
  return y;
}

function gunEkle(d: Date, n: number): Date {
  const y = new Date(d);
  y.setDate(y.getDate() + n);
  return y;
}

/** 1 = Pazartesi ... 7 = Pazar (JS'in 0=Pazar semasindan cevirir). */
function haftaGunu(d: Date): number {
  return d.getDay() === 0 ? 7 : d.getDay();
}

/** `bugun`den sonraki (bugun dahil degil) ilk `hedefGun`. */
function sonrakiGun(bugun: Date, hedefGun: number): Date {
  const fark = (hedefGun - haftaGunu(bugun) + 7) % 7 || 7;
  return gunEkle(bugun, fark);
}

// --------------------------------------------------------------- ayristir

export function ayristir(girdi: string, simdi: Date = new Date()): Cozum {
  // Kalan metni takip ederken orijinal harfleri koruyoruz (baslik icin),
  // eslesmeleri ise sadelestirilmis kopya uzerinde ariyoruz.
  let kalan = ` ${girdi.trim()} `;
  const taninanlar: string[] = [];

  /** Kalibi kalan metinde arar; bulursa parcayi siler ve eslesmeyi dondurur. */
  const yakala = (kalip: RegExp, etiket?: string): RegExpMatchArray | null => {
    const sade = sadelestir(kalan);
    const m = sade.match(kalip);
    if (!m || m.index === undefined) return null;
    if (sade.length !== kalan.length) return null; // indisler guvenilmez, dokunma
    kalan = kalan.slice(0, m.index) + ' ' + kalan.slice(m.index + m[0].length);
    if (etiket) taninanlar.push(etiket);
    return m;
  };

  const tekrar: Tekrar = { tip: 'yok', aralik: 1, gunler: [] };
  let tarih: Date | null = null;
  let saat: number | null = null;
  let dakika = 0;
  let sureDakika: number | null = null;

  // --- 1) Tekrar kaliplari (once bakilir; "her pazartesi" ifadesindeki gun
  //        adinin tek seferlik tarih sanilmasini onler) ---

  // "hafta ici" / "hafta sonu"
  if (yakala(/\bhafta\s*ici\b/, 'hafta ici')) {
    tekrar.tip = 'haftalik';
    tekrar.gunler = [1, 2, 3, 4, 5];
  } else if (yakala(/\bhafta\s*sonu\b/, 'hafta sonu')) {
    tekrar.tip = 'haftalik';
    tekrar.gunler = [6, 7];
  }

  // "2 gunde bir", "3 haftada bir", "6 ayda bir"
  if (tekrar.tip === 'yok') {
    const m = yakala(/\b(\d+)\s*(gunde|haftada|ayda|yilda)\s*bir\b/);
    if (m) {
      tekrar.aralik = Math.max(1, parseInt(m[1]!, 10));
      tekrar.tip = ({ gunde: 'gunluk', haftada: 'haftalik', ayda: 'aylik', yilda: 'yillik' } as const)[
        m[2] as 'gunde' | 'haftada' | 'ayda' | 'yilda'
      ];
      taninanlar.push(`her ${tekrar.aralik} ${m[2]!.replace('de', '').replace('da', '')}`);
    }
  }

  // "her gun" / "her hafta" / "her ay" / "her yil"
  if (tekrar.tip === 'yok') {
    const m = yakala(/\bher\s*(gun|hafta|ay|yil)\b/);
    if (m) {
      tekrar.tip = ({ gun: 'gunluk', hafta: 'haftalik', ay: 'aylik', yil: 'yillik' } as const)[
        m[1] as 'gun' | 'hafta' | 'ay' | 'yil'
      ];
      taninanlar.push(`her ${m[1]}`);
    }
  }

  // "her pzt car cum" - "her"den sonra gelen ardisik gun adlari
  if (tekrar.tip === 'yok' || (tekrar.tip === 'haftalik' && tekrar.gunler.length === 0)) {
    const gunDesen = Object.keys(GUN_ADLARI).join('|');
    const m = yakala(new RegExp(`\\bher\\s+((?:(?:${gunDesen})[\\s,ve]*)+)`));
    if (m) {
      const bulunan = sadelestir(m[1]!).match(new RegExp(gunDesen, 'g')) ?? [];
      const gunler = [...new Set(bulunan.map((g) => GUN_ADLARI[g]!))].sort((a, b) => a - b);
      if (gunler.length) {
        tekrar.tip = 'haftalik';
        tekrar.gunler = gunler;
        taninanlar.push(`her ${bulunan.join(' ')}`);
      }
    }
  }

  // --- 2) Tarih ---

  if (tekrar.tip === 'yok') {
    if (yakala(/\bbugun\b/, 'bugun')) {
      tarih = gunBasi(simdi);
    } else if (yakala(/\byarin\b/, 'yarin')) {
      tarih = gunEkle(gunBasi(simdi), 1);
    } else if (yakala(/\b(obur\s*gun|ertesi\s*gun)\b/, 'obur gun')) {
      tarih = gunEkle(gunBasi(simdi), 2);
    }

    // "3 gun sonra", "2 hafta sonra"
    if (!tarih) {
      const m = yakala(/\b(\d+)\s*(gun|hafta|ay)\s*sonra\b/);
      if (m) {
        const n = parseInt(m[1]!, 10);
        const carpan = { gun: 1, hafta: 7, ay: 30 }[m[2] as 'gun' | 'hafta' | 'ay'];
        tarih = gunEkle(gunBasi(simdi), n * carpan);
        taninanlar.push(`${n} ${m[2]} sonra`);
      }
    }

    // "15 ekim", "15 ekim 2027"
    if (!tarih) {
      const ayDesen = Object.keys(AY_ADLARI).join('|');
      const m = yakala(new RegExp(`\\b(\\d{1,2})\\s*(${ayDesen})\\s*(\\d{4})?\\b`));
      if (m) {
        const gun = parseInt(m[1]!, 10);
        const ay = AY_ADLARI[m[2]!]!;
        const yil = m[3] ? parseInt(m[3], 10) : simdi.getFullYear();
        tarih = new Date(yil, ay - 1, gun, 0, 0, 0, 0);
        // Yil verilmediyse ve tarih gecmiste kaldiysa gelecek yili kastediyordur.
        if (!m[3] && tarih < gunBasi(simdi)) tarih.setFullYear(yil + 1);
        taninanlar.push(`${gun} ${m[2]}`);
      }
    }

    // "15.10", "15/10", "15.10.2027"
    if (!tarih) {
      const m = yakala(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/);
      if (m) {
        const gun = parseInt(m[1]!, 10);
        const ay = parseInt(m[2]!, 10);
        if (gun >= 1 && gun <= 31 && ay >= 1 && ay <= 12) {
          let yil = m[3] ? parseInt(m[3], 10) : simdi.getFullYear();
          if (yil < 100) yil += 2000;
          tarih = new Date(yil, ay - 1, gun, 0, 0, 0, 0);
          if (!m[3] && tarih < gunBasi(simdi)) tarih.setFullYear(yil + 1);
          taninanlar.push(`${gun}.${ay}`);
        }
      }
    }

    // Tek gun adi: "pazartesi 09:00" -> gelecek pazartesi
    if (!tarih) {
      const gunDesen = Object.keys(GUN_ADLARI).join('|');
      const m = yakala(new RegExp(`\\b(${gunDesen})\\b`));
      if (m) {
        tarih = sonrakiGun(gunBasi(simdi), GUN_ADLARI[m[1]!]!);
        taninanlar.push(m[1]!);
      }
    }
  }

  // --- 3) Sure: "45dk", "1 saat", "1.5 saat", "90 dakika" ---
  {
    const m = yakala(/\b(\d+(?:[.,]\d+)?)\s*(saat|sa|dakika|dk|dak)\b/);
    if (m) {
      const miktar = parseFloat(m[1]!.replace(',', '.'));
      sureDakika = /^(saat|sa)$/.test(m[2]!) ? Math.round(miktar * 60) : Math.round(miktar);
      taninanlar.push(`${sureDakika} dk`);
    }
  }

  // --- 4) Saat: "14:00", "14.30", "sabah 9", "9'da", "saat 14" ---
  {
    // Once acik saat:dakika biciminde ara.
    let m = yakala(/\b(\d{1,2})[:.](\d{2})\b/);
    if (m) {
      saat = parseInt(m[1]!, 10);
      dakika = parseInt(m[2]!, 10);
      taninanlar.push(`${String(saat).padStart(2, '0')}:${m[2]}`);
    } else {
      // "sabah 9", "aksam 8" gibi gun bolumu + sayi
      const dilimDesen = Object.keys(ZAMAN_DILIMLERI).join('|');
      m = yakala(new RegExp(`\\b(${dilimDesen})\\s*(\\d{1,2})?\\b`));
      if (m) {
        const taban = ZAMAN_DILIMLERI[m[1]!]!;
        if (m[2]) {
          const sayi = parseInt(m[2], 10);
          // "aksam 8" -> 20:00, "sabah 8" -> 08:00
          saat = taban >= 12 && sayi < 12 ? sayi + 12 : sayi;
        } else {
          saat = taban;
        }
        taninanlar.push(`${m[1]} ${String(saat).padStart(2, '0')}:00`);
      } else {
        // "saat 14", "14'te", "9da"
        m = yakala(/\b(?:saat\s*)?(\d{1,2})\s*(?:'|’)?\s*(?:te|ta|de|da)\b/);
        if (!m) m = yakala(/\bsaat\s*(\d{1,2})\b/);
        if (m) {
          const sayi = parseInt(m[1]!, 10);
          if (sayi >= 0 && sayi <= 23) {
            saat = sayi;
            taninanlar.push(`${String(saat).padStart(2, '0')}:00`);
          }
        }
      }
    }
  }

  // --- 5) Baslik: geriye kalan her sey ---
  const baslik = kalan
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.\-–:;]+|[\s,.\-–:;]+$/g, '')
    .trim();

  // --- 6) Baslangic anini kur ---
  const saatBelirtildi = saat !== null;
  let baslangic: Date;

  if (tekrar.tip !== 'yok') {
    // Tekrarlayan etkinlik bugunden baslar; ilk olusumu Rust tarafi hesaplar.
    baslangic = gunBasi(simdi);
  } else {
    baslangic = tarih ? new Date(tarih) : gunBasi(simdi);
  }
  baslangic.setHours(saat ?? 9, dakika, 0, 0);

  // Tarih verilmemis + saat bugun icin gecmisse yarina al.
  // ("20:00 film" aksam 8'i gecmisse yarin aksami kastediliyordur.)
  if (!tarih && tekrar.tip === 'yok' && baslangic <= simdi) {
    baslangic = gunEkle(baslangic, 1);
  }

  return { baslik, baslangic, sureDakika, tekrar, saatBelirtildi, taninanlar };
}

/** Cozumu kullaniciya tek satirda ozetler ("ne anladim" ipucu icin). */
export function ozetle(c: Cozum): string {
  const gunAdlari = ['', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
  const ss = c.baslangic.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

  let zaman: string;
  switch (c.tekrar.tip) {
    case 'gunluk':
      zaman = c.tekrar.aralik === 1 ? `Her gün ${ss}` : `${c.tekrar.aralik} günde bir ${ss}`;
      break;
    case 'haftalik':
      zaman = c.tekrar.gunler.length
        ? `Her ${c.tekrar.gunler.map((g) => gunAdlari[g]).join(', ')} ${ss}`
        : `Her hafta ${ss}`;
      break;
    case 'aylik':
      zaman = `Her ay ${ss}`;
      break;
    case 'yillik':
      zaman = `Her yıl ${ss}`;
      break;
    default:
      zaman = `${c.baslangic.toLocaleDateString('tr-TR', {
        day: 'numeric', month: 'long', weekday: 'short',
      })} ${ss}`;
  }

  return c.sureDakika ? `${zaman} · ${c.sureDakika} dk` : zaman;
}
