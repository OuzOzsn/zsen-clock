/**
 * Paylasilan uygulama durumu (Svelte 5 runes).
 *
 * Her pencere (ana, widget, alarm) kendi webview'inde calisir, yani her birinin
 * kendi kopyasi olur. Tek gercek kaynak diskteki JSON; Rust bir degisiklik
 * yazdiginda "veri-degisti" olayini yayinlar ve acik pencereler tazelenir.
 */

import { cagir, dinle, yerelISO } from './ipc.ts';
import type { Ayarlar, Etkinlik, Kategori, Olusum, Program, SureKipi } from './tipler.ts';
import { varsayilanAyarlar } from './ipc.ts';
import { araliktakiOlusumlar, gunAnahtari, gunBasi, gunEkle } from './tarih.ts';
// Saf hesaplar; asagidaki metotlar bunlari sarip IPC'ye tasiyor.
import {
  bitisHesapla,
  programDurdur as durdurmayiHesapla,
  programUret as uretimiHesapla,
} from './programUret.ts';

class Depo {
  etkinlikler = $state<Etkinlik[]>([]);
  kategoriler = $state<Kategori[]>([]);
  programlar = $state<Program[]>([]);
  ayarlar = $state<Ayarlar>(varsayilanAyarlar());
  /** Dosya okunamadiysa kullaniciya gosterilecek uyari. */
  uyari = $state<string | null>(null);
  yuklendi = $state(false);

  /** Saniyede bir ilerleyen "simdi" - geri sayimlar buna baglanir. */
  simdi = $state(new Date());

  kategoriRenkleri = $derived(
    Object.fromEntries(this.kategoriler.map((k) => [k.ad, k.renk])),
  );

  async yukle() {
    const [veri, ayarlar, programlar] = await Promise.all([
      cagir('etkinlikleri_getir'),
      cagir('ayarlari_getir'),
      cagir('programlari_getir'),
    ]);
    this.etkinlikler = veri.etkinlikler;
    this.kategoriler = veri.kategoriler;
    this.programlar = programlar ?? [];
    this.uyari = veri.uyari;
    this.ayarlar = ayarlar;
    this.yuklendi = true;
    temayiUygula(ayarlar);
  }

  /** Rust'tan gelen degisiklik bildirimlerini dinlemeye basla. */
  async dinlemeyeBasla() {
    await dinle<null>('veri-degisti', () => void this.yukle());
    await dinle<Ayarlar>('ayarlar-degisti', (a) => {
      this.ayarlar = a;
      temayiUygula(a);
    });
  }

  /** Verilen gune ait olusumlar, zaman sirasinda. */
  gununOlusumlari(gun: Date): Olusum[] {
    return araliktakiOlusumlar(
      this.etkinlikler,
      gunBasi(gun),
      gunBasi(gun),
      this.kategoriRenkleri,
    );
  }

  araliktakiler(bas: Date, son: Date): Olusum[] {
    return araliktakiOlusumlar(this.etkinlikler, bas, son, this.kategoriRenkleri);
  }

  /** Bugunden itibaren siradaki ilk tamamlanmamis olusum. */
  siradaki(): Olusum | null {
    const simdi = this.simdi;
    const liste = this.araliktakiler(gunBasi(simdi), gunEkle(gunBasi(simdi), 60));
    return liste.find((o) => !o.tamamlandi && o.baslangic > simdi) ?? null;
  }

  async tamamla(o: Olusum, tamamlandi: boolean) {
    await cagir('olusum_tamamla', {
      id: o.etkinlik.id,
      olusum: yerelISO(o.baslangic),
      tamamlandi,
    });
    // Yereli hemen guncelle: kullanici tikladiktan sonra beklemesin.
    const e = this.etkinlikler.find((x) => x.id === o.etkinlik.id);
    if (e) {
      const anahtar = yerelISO(o.baslangic);
      e.tamamlananlar = tamamlandi
        ? [...new Set([...e.tamamlananlar, anahtar])]
        : e.tamamlananlar.filter((t) => t !== anahtar);
    }
  }

  async kaydet(e: Etkinlik) {
    const kayitli = await cagir('etkinlik_kaydet', { etkinlik: e });
    const i = this.etkinlikler.findIndex((x) => x.id === kayitli.id);
    if (i >= 0) this.etkinlikler[i] = kayitli;
    else this.etkinlikler.push(kayitli);
    return kayitli;
  }

  async sil(id: string) {
    await cagir('etkinlik_sil', { id });
    this.etkinlikler = this.etkinlikler.filter((x) => x.id !== id);
  }

  /** Toplu silme - plan silmek gibi islerde tek cagri. Silineni dondurur. */
  async topluSil(idler: string[]) {
    if (idler.length === 0) return 0;
    const silinen = await cagir('etkinlikleri_sil', { idler });
    const kume = new Set(idler);
    this.etkinlikler = this.etkinlikler.filter((x) => !kume.has(x.id));
    return silinen;
  }

  async kategoriKaydet(kategori: Kategori, eskiAd: string | null = null) {
    await cagir('kategori_kaydet', { kategori, eskiAd });
    // Yeniden adlandirma etkinlikleri de dokundugu icin tam tazeleme.
    await this.yukle();
  }

  async kategoriSil(ad: string, etkinlikleriDeSil: boolean) {
    const silinen = await cagir('kategori_sil', { ad, etkinlikleriDeSil });
    await this.yukle();
    return silinen;
  }

  // ------------------------------------------------------------- programlar

  /**
   * Program tanimini kaydeder ve calisan bir programsa takvimi yeniden uretir.
   * Uretim ozetini dondurur ki arayuz "3 gun donduruldu" diyebilsin.
   */
  async programKaydet(program: Program) {
    const kayitli = await cagir('program_kaydet', { program });
    const i = this.programlar.findIndex((x) => x.id === kayitli.id);
    if (i >= 0) this.programlar[i] = kayitli;
    else this.programlar.push(kayitli);

    const ozet = kayitli.kosu ? await this.programUygula(kayitli) : null;
    await this.yukle();
    return { program: kayitli, ozet };
  }

  /** Takvimi programin son haline esitler. Yalnizca seri kayitlara dokunur. */
  async programUygula(program: Program) {
    const { yazilacak, ayrilacak, ozet } = uretimiHesapla(
      program,
      this.etkinlikler,
      new Date(),
    );
    await cagir('program_etkinlikleri_yaz', {
      programId: program.id,
      etkinlikler: yazilacak,
      ayrilacak,
    });
    return ozet;
  }

  /** Programi verilen tarihten baslatir ve takvime isler. */
  async programBaslat(
    program: Program,
    baslangic: Date,
    kip: SureKipi,
    hafta: number,
    bitisTarihi: Date | null,
  ) {
    const bitis = bitisHesapla(baslangic, kip, hafta, bitisTarihi);
    const calisan: Program = {
      ...program,
      kosu: {
        baslangic: gunAnahtari(baslangic),
        bitis: bitis ? gunAnahtari(bitis) : null,
        kip,
        hafta: kip === 'hafta' ? hafta : null,
        baslatildi: yerelISO(new Date()),
      },
    };
    return this.programKaydet(calisan);
  }

  /**
   * Programi durdurur: gecmis kalir, gelecek silinir.
   *
   * Uc adim ayri ayri yaziliyor (kopya silme, seri kayitlari kapatma, tanimi
   * uykuya alma). Durdurma nadir bir islem; tek komuta indirmeye degmiyor.
   */
  async programDurdur(program: Program) {
    const { yazilacak, silinecek } = durdurmayiHesapla(program, this.etkinlikler, new Date());
    if (silinecek.length > 0) await cagir('etkinlikleri_sil', { idler: silinecek });
    await cagir('program_etkinlikleri_yaz', {
      programId: program.id,
      etkinlikler: yazilacak,
      ayrilacak: [],
    });
    await cagir('program_kaydet', { program: { ...program, kosu: null } });
    await this.yukle();
  }

  /** Program tanimini siler; istege bagli olarak takvimdeki izini de. */
  async programSil(id: string, etkinlikleriDeSil: boolean) {
    const silinen = await cagir('program_sil', { id, etkinlikleriDeSil });
    await this.yukle();
    return silinen;
  }

  /** Bir gunu seriden ayirir: degisiklik yalnizca o gunde kalir. */
  async olusumAyir(seriId: string, gun: Date, etkinlik: Etkinlik) {
    const kopya = await cagir('olusum_ayir', {
      id: seriId,
      gun: gunAnahtari(gun),
      etkinlik,
    });
    await this.yukle();
    return kopya;
  }

  /** Ayirmayi ya da atlamayi geri alir. */
  async olusumBirlestir(seriId: string, gun: string) {
    await cagir('olusum_birlestir', { id: seriId, gun });
    await this.yukle();
  }

  async ayarKaydet(yeni: Partial<Ayarlar>) {
    this.ayarlar = { ...this.ayarlar, ...yeni };
    temayiUygula(this.ayarlar);
    await cagir('ayarlari_kaydet', { ayarlar: this.ayarlar });
  }
}

export const depo = new Depo();

/** Tema ve vurgu rengini kok elemana uygular. */
export function temayiUygula(a: Ayarlar) {
  const kok = document.documentElement;
  const koyu =
    a.tema === 'koyu' ||
    (a.tema === 'sistem' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  kok.setAttribute('data-tema', koyu ? 'koyu' : 'acik');

  if (!a.vurgu_rengi) return;

  // Vurgu rengi tek bir degisken degil, dort tanesi: ana renk, hover icin
  // acigi, arka plan tonu icin sonugu ve uzerine yazilan metin. Eskiden
  // yalnizca ana renk degistiriliyordu; sonucta geri sayim renk degistiriyor
  // ama dugmeler ve secili gun eski renginde kaliyordu - kullaniciya
  // "ayar kaydedilmedi" gibi gorunuyordu.
  kok.style.setProperty('--pirinc', a.vurgu_rengi);
  kok.style.setProperty(
    '--pirinc-parlak',
    `color-mix(in srgb, ${a.vurgu_rengi} 82%, ${koyu ? '#ffffff' : '#000000'})`,
  );
  kok.style.setProperty(
    '--pirinc-sonuk',
    `color-mix(in srgb, ${a.vurgu_rengi} 15%, transparent)`,
  );
  // Dugme zemini kullanicinin sectigi renk; uzerindeki yazi okunabilsin diye
  // acik renkte koyu, koyu renkte acik metin kullaniyoruz.
  kok.style.setProperty('--pirinc-ustu', acikMi(a.vurgu_rengi) ? '#14130f' : '#fffdf5');
}

/** Rengin algilanan parlakligi (WCAG goreli luminans yaklasimi). */
function acikMi(renk: string): boolean {
  const m = renk.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return true; // cozemedigimiz renkte koyu metin daha guvenli
  const n = parseInt(m[1]!, 16);
  const kanal = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const o = v / 255;
    return o <= 0.04045 ? o / 12.92 : ((o + 0.055) / 1.055) ** 2.4;
  });
  const luminans = 0.2126 * kanal[0]! + 0.7152 * kanal[1]! + 0.0722 * kanal[2]!;
  return luminans > 0.42;
}

/**
 * `depo.simdi`yi canli tutar. Dakika degisimlerinde tam saniyede tetiklensin
 * diye bir sonraki saniye sinirina hizalanir; boylece geri sayim "01" atlamaz.
 */
export function saatiBaslat(): () => void {
  let zamanlayici: number;
  const tik = () => {
    depo.simdi = new Date();
    zamanlayici = window.setTimeout(tik, 1000 - (Date.now() % 1000));
  };
  zamanlayici = window.setTimeout(tik, 1000 - (Date.now() % 1000));
  return () => clearTimeout(zamanlayici);
}
