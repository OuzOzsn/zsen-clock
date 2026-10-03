/**
 * "Konulardan oluştur": konular ve günün düzeninden SIRALI bir program kurar.
 *
 * Eskiden ayri bir "çalışma planı" vardi; takvime tek tek, sonradan
 * duzenlenemeyen etkinlikler yaziyordu. Sirali program her gune farkli is
 * koyabildigi icin artik ayni sonuc bir programla elde ediliyor: duzenlenir,
 * durdurulur, ilerlemesi izlenir.
 *
 * Bir TUR, konu sirasinin (agirliklarla serpistirilmis, bkz. konuSirasi) bir
 * kez tamamlanmasi. Gun icindeki ikinci ve sonraki calismalar `ayni_gun`,
 * secilmeyen hafta gunleri o gunun son isine `dinlenme_gun` olarak yaziliyor.
 * Hafta gunu secildiyse tur, baslangic gununun hafta gunune geri donene kadar
 * uzatiliyor (7'nin kati); yoksa ikinci turda "hafta ici" kayardi.
 */

import { konuSirasi, type Konu } from './konular.ts';
import { gunBasi, gunEkle, haftaGunu } from './tarih.ts';
import type { ProgramOgesi } from './tipler.ts';

export interface KonuAyari {
  konular: Konu[];
  /** 1 = Pazartesi ... 7 = Pazar. Bos ise hicbir sey uretilmez. */
  gunler: number[];
  /** Kosunun istenen baslangic gunu; secili bir hafta gunune ilerletilir. */
  baslangic: Date;
  gunlukAdet: number;
  /** "HH:MM" */
  ilkSaat: string;
  sureDakika: number;
  molaDakika: number;
  /** -1 = alarm yok */
  hatirlatmaDakika: number;
}

export interface KonuSonucu {
  ogeler: ProgramOgesi[];
  /** Ilk calisma gunu - kosu buradan baslar. */
  ilkGun: Date | null;
  /** Bir turun takvim gunu (dinlenmeler dahil). */
  turGunu: number;
  /** Bir turdaki calisma gunu. */
  calismaGunu: number;
  /** Bir turda konu basina calisma sayisi. */
  dagilim: { ad: string; adet: number }[];
}

const GUN_MS = 86_400_000;
const fark = (a: Date, b: Date) => Math.round((gunBasi(a).getTime() - gunBasi(b).getTime()) / GUN_MS);

function sonrakiCalismaGunu(gun: Date, gunler: Set<number>): Date {
  let g = gunEkle(gunBasi(gun), 1);
  for (let i = 0; i < 7 && !gunler.has(haftaGunu(g)); i++) g = gunEkle(g, 1);
  return g;
}

function saatEkle(saat: string, dakika: number): string {
  const [s, d] = saat.split(':').map(Number);
  const t = ((s ?? 9) * 60 + (d ?? 0) + dakika) % (24 * 60);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

export function konulardanOgeler(a: KonuAyari, kimlik: () => string): KonuSonucu {
  const bos: KonuSonucu = { ogeler: [], ilkGun: null, turGunu: 0, calismaGunu: 0, dagilim: [] };
  const sira = konuSirasi(a.konular);
  const gunler = new Set(a.gunler.filter((g) => g >= 1 && g <= 7));
  const adet = Math.max(1, Math.floor(a.gunlukAdet));
  if (sira.length === 0 || gunler.size === 0) return bos;

  let gun = gunBasi(a.baslangic);
  if (!gunler.has(haftaGunu(gun))) gun = sonrakiCalismaGunu(gun, gunler);
  const ilkGun = gun;
  const haftaHizali = gunler.size < 7;

  const ogeler: ProgramOgesi[] = [];
  const sayac = new Map<string, number>();
  let k = 0;
  let calismaGunu = 0;
  let turGunu = 0;

  // Sinir: 7 konu x gunde 1 calisma bile bir yildan cok surmez; kotu girdide
  // sonsuz donguye girmeyelim.
  for (let guvenlik = 0; guvenlik < 1000; guvenlik++) {
    calismaGunu++;
    for (let s = 0; s < adet; s++) {
      const konu = sira[k % sira.length]!;
      k++;
      sayac.set(konu, (sayac.get(konu) ?? 0) + 1);
      ogeler.push({
        id: kimlik(),
        baslik: konu,
        icerik: '',
        gunler: [],
        saat: saatEkle(a.ilkSaat, s * (a.sureDakika + a.molaDakika)),
        sure_dakika: a.sureDakika,
        hatirlatmalar: a.hatirlatmaDakika >= 0 ? [{ dakika_once: a.hatirlatmaDakika }] : [],
        ayni_gun: s > 0,
      });
    }

    const sonraki = sonrakiCalismaGunu(gun, gunler);
    const bitti = k >= sira.length && (!haftaHizali || fark(sonraki, ilkGun) % 7 === 0);
    const bosGun = fark(sonraki, gun) - 1;
    if (bosGun > 0) ogeler[ogeler.length - 1]!.dinlenme_gun = bosGun;
    if (bitti) {
      turGunu = fark(sonraki, ilkGun);
      break;
    }
    gun = sonraki;
  }

  return {
    ogeler,
    ilkGun,
    turGunu,
    calismaGunu,
    dagilim: a.konular.map((x) => ({ ad: x.ad, adet: sayac.get(x.ad) ?? 0 })),
  };
}
