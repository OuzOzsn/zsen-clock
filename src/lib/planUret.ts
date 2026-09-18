/**
 * Calisma plani uretici.
 *
 * Tasarim karari: uretilen etkinlikler TEKRARLAYAN degil, tek tek somut
 * kayitlar. Sebebi basit - bir calisma planinda her gun ayni konu islenmiyor;
 * konular donusumlu geliyor. "Her pazartesi 09:00 matematik" tek bir tekrar
 * kuraliyla ifade edilebilir ama "pazartesi matematik, sali turkce, carsamba
 * matematik" edilemez. Somut kayit uretmek hem dogru hem de kullanicinin tek
 * bir gunu serbestce degistirmesine izin veriyor.
 *
 * Uretilen kayitlarin id'si `plan-<damga>-<n>` bicimindedir; boylece bir plan
 * topluca silinebiliyor.
 */

import type { Etkinlik } from './tipler.ts';
import { yerelISO } from './ipc.ts';
import { gunBasi, gunEkle, haftaGunu } from './tarih.ts';

export interface Konu {
  ad: string;
  /** Kac kat daha sik gelecegi. 1 = normal, 2 = iki kati. */
  agirlik: number;
}

export interface PlanAyari {
  /** Plan adi; kategori olarak da kullanilir. */
  ad: string;
  konular: Konu[];
  baslangic: Date;
  bitis: Date;
  /** 1 = Pazartesi ... 7 = Pazar */
  gunler: number[];
  /** Gunde kac seans. */
  seansSayisi: number;
  /** Ilk seansin saati, "HH:MM". */
  ilkSaat: string;
  /** Bir seansin dakikasi. */
  seansDakika: number;
  /** Seanslar arasi mola (dakika). */
  molaDakika: number;
  /** Kac dakika once hatirlatilsin. */
  hatirlatmaDakika: number;
}

export interface PlanSonucu {
  etkinlikler: Etkinlik[];
  /** Konu basina toplam seans - kullaniciya dengeyi gostermek icin. */
  konuDagilimi: { ad: string; seans: number }[];
  gunSayisi: number;
  toplamSaat: number;
}

/**
 * Agirliklara gore donusumlu bir konu sirasi uretir.
 *
 * Ayni konuyu ust uste yigmamak icin listeyi tekrarlayarak degil, serpistirerek
 * kuruyoruz: agirligi 2 olan konu "A A B" degil "A B A" sirasina giriyor.
 */
export function konuSirasi(konular: Konu[]): string[] {
  const toplam = konular.reduce((t, k) => t + Math.max(1, k.agirlik), 0);
  if (toplam === 0) return [];

  // Her konuya bir "borc" sayaci: her adimda borcu en buyuk olan seciliyor.
  const durum = konular.map((k) => ({ ad: k.ad, pay: Math.max(1, k.agirlik), borc: 0 }));
  const sira: string[] = [];

  for (let i = 0; i < toplam; i++) {
    for (const d of durum) d.borc += d.pay;
    const secilen = durum.reduce((en, d) => (d.borc > en.borc ? d : en));
    secilen.borc -= toplam;
    sira.push(secilen.ad);
  }
  return sira;
}

export function planUret(ayar: PlanAyari): PlanSonucu {
  const sira = konuSirasi(ayar.konular);
  const etkinlikler: Etkinlik[] = [];
  const sayac = new Map<string, number>();
  const damga = Date.now().toString(36);

  const [saat, dakika] = ayar.ilkSaat.split(':').map(Number);
  const adim = ayar.seansDakika + ayar.molaDakika;

  let sonraki = 0;
  let gunSayisi = 0;

  for (
    let gun = gunBasi(ayar.baslangic);
    gun <= gunBasi(ayar.bitis) && sira.length > 0;
    gun = gunEkle(gun, 1)
  ) {
    if (!ayar.gunler.includes(haftaGunu(gun))) continue;
    gunSayisi++;

    for (let s = 0; s < ayar.seansSayisi; s++) {
      const konu = sira[sonraki % sira.length]!;
      sonraki++;
      sayac.set(konu, (sayac.get(konu) ?? 0) + 1);

      const bas = new Date(gun);
      bas.setHours(saat ?? 9, (dakika ?? 0) + s * adim, 0, 0);
      const son = new Date(bas.getTime() + ayar.seansDakika * 60000);

      etkinlikler.push({
        id: `plan-${damga}-${etkinlikler.length}`,
        baslik: konu,
        not: '',
        kategori: ayar.ad,
        baslangic: yerelISO(bas),
        bitis: yerelISO(son),
        tum_gun: false,
        tekrar: { tip: 'yok', aralik: 1, gunler: [], istisnalar: [] },
        hatirlatmalar:
          ayar.hatirlatmaDakika >= 0 ? [{ dakika_once: ayar.hatirlatmaDakika }] : [],
        renk: null,
        tamamlananlar: [],
      });
    }
  }

  return {
    etkinlikler,
    konuDagilimi: ayar.konular.map((k) => ({ ad: k.ad, seans: sayac.get(k.ad) ?? 0 })),
    gunSayisi,
    toplamSaat: Math.round((etkinlikler.length * ayar.seansDakika) / 60),
  };
}

/**
 * "Matematik x2" gibi satirlari {ad, agirlik} olarak cozer.
 * Agirlik yazilmadiysa 1 kabul edilir.
 */
export function konulariCoz(metin: string): Konu[] {
  return metin
    .split('\n')
    .map((satir) => satir.trim())
    .filter(Boolean)
    .map((satir) => {
      const m = satir.match(/^(.*?)\s*[x×*]\s*(\d+)$/i);
      return m
        ? { ad: m[1]!.trim(), agirlik: Math.min(9, Math.max(1, parseInt(m[2]!, 10))) }
        : { ad: satir, agirlik: 1 };
    })
    .filter((k) => k.ad.length > 0);
}
