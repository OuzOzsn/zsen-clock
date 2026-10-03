/**
 * Konu listesi: "Matematik x2" satirlarini cozer ve agirliklara gore
 * serpistirilmis bir sira cikarir. "Konulardan oluştur" bunu kullanir
 * (bkz. konudanProgram.ts).
 *
 * Bu dosya eskiden "çalışma planı" ureticisiydi ve takvime tek tek etkinlik
 * yaziyordu; o is sirali programa devredildi. O planlarin kayitlari
 * `plan-<damga>-<n>` id'siyle takvimde duruyor, topluca silinmeleri
 * planlar.ts'te.
 */

export interface Konu {
  ad: string;
  /** Kac kat daha sik gelecegi. 1 = normal, 2 = iki kati. */
  agirlik: number;
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
