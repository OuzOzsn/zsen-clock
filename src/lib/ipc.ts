/**
 * Rust tarafiyla konusma katmani.
 *
 * Uygulama iki ortamda calisiyor:
 *   1. Tauri penceresi icinde  -> gercek `invoke` cagrilari
 *   2. Duz tarayicida (vite dev) -> bellekte tutulan sahte veri
 *
 * Ikincisi gelistirme icin: Windows GUI'yi container'dan acamadigimiz icin
 * arayuzu Chrome'da gelistiriyoruz. Chrome ile WebView2 ayni Chromium motoru
 * oldugundan gordugumuz render son halin aynisi oluyor.
 */

import type { Ayarlar, Etkinlik, Kategori, Program, Tetiklenen } from './tipler.ts';

export const TAURI_ICINDE =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

type Komutlar = {
  // --- veri ---
  etkinlikleri_getir: {
    girdi: void;
    cikti: { etkinlikler: Etkinlik[]; kategoriler: Kategori[]; uyari: string | null };
  };
  etkinlik_kaydet: { girdi: { etkinlik: Etkinlik }; cikti: Etkinlik };
  etkinlik_sil: { girdi: { id: string }; cikti: void };
  /** Coklu silme: tek yazma, tek tazeleme. Silinen sayisini dondurur. */
  etkinlikleri_sil: { girdi: { idler: string[] }; cikti: number };
  olusum_tamamla: { girdi: { id: string; olusum: string; tamamlandi: boolean }; cikti: void };
  /** Tekrarlayan bir etkinligin yalnizca bir gununu atlar. */
  olusum_atla: { girdi: { id: string; gun: string }; cikti: void };
  /**
   * Bir gunu seriden ayirir: tarih istisnalara girer, verilen icerik tek
   * seferlik kopya olarak yazilir, tamamlanma kopyaya tasinir. Tek yazma.
   */
  olusum_ayir: {
    girdi: { id: string; gun: string; etkinlik: Etkinlik };
    cikti: Etkinlik;
  };
  /** Ayirmayi ya da atlamayi geri alir: istisna kalkar, kopya silinir. */
  olusum_birlestir: { girdi: { id: string; gun: string }; cikti: void };

  // --- programlar ---
  programlari_getir: { girdi: void; cikti: Program[] };
  /** Yalnizca tanimi kaydeder; takvime dokunmaz. */
  program_kaydet: { girdi: { program: Program }; cikti: Program };
  /** Silinen etkinlik sayisini dondurur. */
  program_sil: { girdi: { id: string; etkinlikleriDeSil: boolean }; cikti: number };
  /**
   * Programin seri kayitlarini tek yazmada degistirir. Gune ozel kopyalara
   * dokunulmaz; `ayrilacak` id'lerinin yalnizca program bagi kopariliyor.
   */
  program_etkinlikleri_yaz: {
    girdi: { programId: string; etkinlikler: Etkinlik[]; ayrilacak: string[] };
    cikti: number;
  };
  program_disa_aktar: { girdi: { id: string; yol: string }; cikti: void };
  program_ice_aktar: { girdi: { yol: string }; cikti: Program };

  // --- kategoriler ---
  // Not: Rust tarafindaki `eski_ad` / `etkinlikleri_de_sil` alanlari Tauri'nin
  // varsayilan donusumu geregi buradan camelCase gonderiliyor.
  /** `eskiAd` verilirse yeniden adlandirma; etkinlikler de yeni ada tasinir. */
  kategori_kaydet: { girdi: { kategori: Kategori; eskiAd: string | null }; cikti: void };
  /** Silinen etkinlik sayisini dondurur (tasima secildiyse 0). */
  kategori_sil: {
    girdi: { ad: string; etkinlikleriDeSil: boolean };
    cikti: number;
  };

  // --- ayarlar ---
  ayarlari_getir: { girdi: void; cikti: Ayarlar };
  ayarlari_kaydet: { girdi: { ayarlar: Ayarlar }; cikti: void };

  // --- ses ---
  sesleri_listele: { girdi: void; cikti: string[] };
  /**
   * data/sesler/<dosya> dosyasinin ham baytlari.
   * Ozel protokol IPC'sinde ArrayBuffer, postMessage yedeginde number[] gelir;
   * cagiran taraf ikisini de bayta cevirmeli (bkz. ses.ts).
   */
  ses_verisi: { girdi: { dosya: string }; cikti: ArrayBuffer | number[] };
  /** Secilen dosyayi sesler klasorune kopyalar; klasordeki adini dondurur. */
  ses_ekle: { girdi: { kaynak: string }; cikti: string };

  // --- alarm ---
  /** Su an bekleyen (calmis ama kapatilmamis) hatirlatmalar. */
  alarm_kuyrugu: { girdi: void; cikti: Tetiklenen[] };
  alarm_kapat: { girdi: { anahtar: string }; cikti: void };
  alarm_ertele: { girdi: { anahtar: string; dakika: number }; cikti: void };
  alarm_tamamla: { girdi: { anahtar: string }; cikti: void };

  // --- pencere ---
  widget_gorunurluk: { girdi: { gorunur: boolean }; cikti: void };
  widget_boyut_degistir: { girdi: { kip: string }; cikti: void };
  takvimi_ac: { girdi: void; cikti: void };
  veri_klasorunu_ac: { girdi: void; cikti: void };
  /** Yalnizca http/https; sema kontrolu Rust tarafinda. */
  baglanti_ac: { girdi: { url: string }; cikti: void };
  /** Masaustunde kisayol dosyasi gercekten var mi. */
  kisayol_durumu: { girdi: void; cikti: boolean };
  kisayol_ayarla: { girdi: { olsun: boolean }; cikti: void };
};

export async function cagir<K extends keyof Komutlar>(
  komut: K,
  ...arg: Komutlar[K]['girdi'] extends void ? [] : [Komutlar[K]['girdi']]
): Promise<Komutlar[K]['cikti']> {
  if (TAURI_ICINDE) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke(komut, arg[0] as Record<string, unknown> | undefined) as Promise<
      Komutlar[K]['cikti']
    >;
  }
  return sahte(komut, arg[0]) as Promise<Komutlar[K]['cikti']>;
}

/** Rust'tan gelen olaylari dinler. Tarayicida hicbir sey yapmaz. */
export async function dinle<T>(
  olay: string,
  geri: (yuk: T) => void,
): Promise<() => void> {
  if (!TAURI_ICINDE) return () => {};
  const { listen } = await import('@tauri-apps/api/event');
  return listen<T>(olay, (e) => geri(e.payload));
}

// ------------------------------------------------------- tarayici sahtesi

const SAHTE_ANAHTAR = 'zsenclock-sahte-veri-1';

function sahteVeriYukle(): {
  etkinlikler: Etkinlik[];
  kategoriler: Kategori[];
  ayarlar: Ayarlar;
  programlar: Program[];
} {
  const varsayilan = {
    etkinlikler: ornekEtkinlikler(),
    programlar: [ornekProgram()],
    kategoriler: [
      { ad: 'genel', renk: '#c9a227', ikon: 'etiket' },
      { ad: 'ders', renk: '#6aa9d6', ikon: 'kitap' },
      { ad: 'spor', renk: '#7fa356', ikon: 'kosu' },
      { ad: 'kisisel', renk: '#d2775a', ikon: 'kalp' },
    ] as Kategori[],
    ayarlar: varsayilanAyarlar(),
  };
  try {
    const ham = localStorage.getItem(SAHTE_ANAHTAR);
    if (ham) return { ...varsayilan, ...JSON.parse(ham) };
  } catch {
    /* localStorage kapaliysa varsayilanla devam */
  }
  return varsayilan;
}

function sahteVeriYaz(v: unknown) {
  try {
    localStorage.setItem(SAHTE_ANAHTAR, JSON.stringify(v));
  } catch {
    /* onemsiz */
  }
}

async function sahte(komut: string, arg: unknown): Promise<never | unknown> {
  const v = sahteVeriYukle();
  const g = arg as Record<string, unknown> | undefined;

  switch (komut) {
    case 'etkinlikleri_getir':
      return { etkinlikler: v.etkinlikler, kategoriler: v.kategoriler, uyari: null };

    case 'etkinlik_kaydet': {
      const e = g!.etkinlik as Etkinlik;
      const i = v.etkinlikler.findIndex((x) => x.id === e.id);
      if (i >= 0) v.etkinlikler[i] = e;
      else v.etkinlikler.push(e);
      sahteVeriYaz(v);
      return e;
    }

    case 'etkinlik_sil':
      v.etkinlikler = v.etkinlikler.filter((x) => x.id !== g!.id);
      sahteVeriYaz(v);
      return undefined;

    case 'etkinlikleri_sil': {
      const idler = new Set(g!.idler as string[]);
      const onceki = v.etkinlikler.length;
      v.etkinlikler = v.etkinlikler.filter((x) => !idler.has(x.id));
      sahteVeriYaz(v);
      return onceki - v.etkinlikler.length;
    }

    case 'kategori_kaydet': {
      const k = g!.kategori as Kategori;
      const eski = g!.eskiAd as string | null;
      if (eski) {
        const i = v.kategoriler.findIndex((x) => x.ad === eski);
        if (i >= 0) v.kategoriler[i] = k;
        if (eski !== k.ad) {
          for (const e of v.etkinlikler) if (e.kategori === eski) e.kategori = k.ad;
        }
      } else {
        v.kategoriler.push(k);
      }
      sahteVeriYaz(v);
      return undefined;
    }

    case 'kategori_sil': {
      const ad = g!.ad as string;
      v.kategoriler = v.kategoriler.filter((x) => x.ad !== ad);
      if (g!.etkinlikleriDeSil) {
        const onceki = v.etkinlikler.length;
        v.etkinlikler = v.etkinlikler.filter((x) => x.kategori !== ad);
        sahteVeriYaz(v);
        return onceki - v.etkinlikler.length;
      }
      for (const e of v.etkinlikler) if (e.kategori === ad) e.kategori = 'genel';
      sahteVeriYaz(v);
      return 0;
    }

    case 'olusum_tamamla': {
      const e = v.etkinlikler.find((x) => x.id === g!.id);
      if (e) {
        const o = g!.olusum as string;
        e.tamamlananlar = g!.tamamlandi
          ? [...new Set([...e.tamamlananlar, o])]
          : e.tamamlananlar.filter((t) => t !== o);
        sahteVeriYaz(v);
      }
      return undefined;
    }

    case 'olusum_atla': {
      const e = v.etkinlikler.find((x) => x.id === g!.id);
      if (e) {
        e.tekrar.istisnalar = [...new Set([...e.tekrar.istisnalar, g!.gun as string])];
        sahteVeriYaz(v);
      }
      return undefined;
    }

    case 'olusum_ayir': {
      const seri = v.etkinlikler.find((x) => x.id === g!.id);
      const gun = g!.gun as string;
      const kopya = { ...(g!.etkinlik as Etkinlik) };
      if (!seri?.program) return kopya;

      if (!kopya.id) kopya.id = `sahte-${Date.now().toString(36)}`;
      kopya.tekrar = { tip: 'yok', aralik: 1, gunler: [], istisnalar: [] };
      kopya.program = {
        program_id: seri.program.program_id,
        oge_id: seri.program.oge_id,
        gun,
      };

      seri.tekrar.istisnalar = [...new Set([...seri.tekrar.istisnalar, gun])];
      // Tamamlanma kopyaya tasinir; yoksa yapilmis seans sessizce silinirdi.
      const tasinan = seri.tamamlananlar.some((t) => t.slice(0, 10) === gun);
      seri.tamamlananlar = seri.tamamlananlar.filter((t) => t.slice(0, 10) !== gun);
      if (tasinan && !kopya.tamamlananlar.includes(kopya.baslangic)) {
        kopya.tamamlananlar = [...kopya.tamamlananlar, kopya.baslangic];
      }

      v.etkinlikler.push(kopya);
      sahteVeriYaz(v);
      return kopya;
    }

    case 'olusum_birlestir': {
      const seri = v.etkinlikler.find((x) => x.id === g!.id);
      const gun = g!.gun as string;
      if (!seri) return undefined;

      let tamamlanmisti = false;
      if (seri.program) {
        const b = seri.program;
        v.etkinlikler = v.etkinlikler.filter((x) => {
          const esles =
            x.program?.program_id === b.program_id &&
            x.program?.oge_id === b.oge_id &&
            x.program?.gun === gun;
          if (esles && x.tamamlananlar.length > 0) tamamlanmisti = true;
          return !esles;
        });
      }

      seri.tekrar.istisnalar = seri.tekrar.istisnalar.filter((t) => t !== gun);
      if (tamamlanmisti) {
        const an = `${gun}T${seri.baslangic.slice(11)}`;
        seri.tamamlananlar = [...new Set([...seri.tamamlananlar, an])];
      }
      sahteVeriYaz(v);
      return undefined;
    }

    case 'programlari_getir':
      return v.programlar;

    case 'program_kaydet': {
      const p = { ...(g!.program as Program) };
      if (!p.id) p.id = `sahte-${Date.now().toString(36)}`;
      const i = v.programlar.findIndex((x) => x.id === p.id);
      if (i >= 0) v.programlar[i] = p;
      else v.programlar.push(p);
      sahteVeriYaz(v);
      return p;
    }

    case 'program_sil': {
      const id = g!.id as string;
      v.programlar = v.programlar.filter((x) => x.id !== id);
      let silinen = 0;
      if (g!.etkinlikleriDeSil) {
        const onceki = v.etkinlikler.length;
        v.etkinlikler = v.etkinlikler.filter((x) => x.program?.program_id !== id);
        silinen = onceki - v.etkinlikler.length;
      }
      sahteVeriYaz(v);
      return silinen;
    }

    case 'program_etkinlikleri_yaz': {
      const programId = g!.programId as string;
      const yeni = g!.etkinlikler as Etkinlik[];
      const ayrilacak = new Set(g!.ayrilacak as string[]);

      // Yalnizca seri kayitlari gider; gune ozel kopyalar yerinde kalir.
      v.etkinlikler = v.etkinlikler.filter(
        (x) => !(x.program?.program_id === programId && !x.program.gun),
      );
      for (const e of v.etkinlikler) {
        if (ayrilacak.has(e.id)) e.program = null;
      }
      for (const e of yeni) {
        if (!e.id) e.id = `sahte-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        if (!v.kategoriler.some((k) => k.ad === e.kategori)) {
          v.kategoriler.push({ ad: e.kategori, renk: '#9b8ec4', ikon: null });
        }
        v.etkinlikler.push(e);
      }
      sahteVeriYaz(v);
      return yeni.length;
    }

    // Bu iki komut dosya yolu ile calisiyor, tarayicida yol diye bir sey yok.
    // Onizlemede disa/ice aktarma programAktarim.ts uzerinden gercek
    // dosyalarla yapiliyor; buraya dusulduyse bir cagri yeri kacirilmistir.
    case 'program_disa_aktar':
    case 'program_ice_aktar':
      throw new Error('Dosya işlemleri tarayıcıda bu yoldan yapılmıyor.');

    case 'ayarlari_getir':
      return v.ayarlar;

    case 'ayarlari_kaydet':
      v.ayarlar = g!.ayarlar as Ayarlar;
      sahteVeriYaz(v);
      return undefined;

    case 'baglanti_ac':
      // Tarayicida zaten gercek bir <a> var; burasi sessiz kaliyor.
      return undefined;

    case 'kisayol_durumu':
      return false;

    case 'kisayol_ayarla':
      return undefined;

    case 'sesleri_listele':
      return ['dijital.wav', 'yumusak.wav', 'zil.wav'];

    // Tarayicida gercek dosya yok; "Dinle" sessiz kalmasin diye kisa bir bip
    // uretiliyor. Sekli de gercek IPC'nin dondurdugu ham baytlarla ayni.
    case 'ses_verisi':
      return bipWav();

    case 'ses_ekle':
      // Tarayicida dosya sistemi yok; akisi denemek icin ad uretiliyor.
      return String(g!.kaynak).split(/[\/]/).pop() ?? 'ses.wav';


    case 'alarm_kuyrugu': {
      // Tarayicida alarm penceresini gorebilmek icin tek ornek kayit.
      const o = new Date();
      o.setSeconds(0, 0);
      return [
        {
          etkinlik_id: 'ornek-1',
          baslik: 'Haftalık değerlendirme',
          not: 'Gündem maddeleri ve açık işler',
          kategori: 'ders',
          olusum: yerelISO(o),
          bitis: yerelISO(new Date(o.getTime() + 90 * 60000)),
          calma_zamani: yerelISO(o),
          dakika_once: 0,
          ses: null,
          kacirilmis: false,
        },
      ];
    }

    default:
      return undefined;
  }
}

/** 0.4 saniyelik 880 Hz bip; 16-bit mono PCM WAV baytlari. */
function bipWav(): ArrayBuffer {
  const hiz = 44100;
  const ornek = Math.floor(hiz * 0.4);
  const tampon = new ArrayBuffer(44 + ornek * 2);
  const g = new DataView(tampon);
  const metin = (konum: number, s: string) => {
    for (let i = 0; i < s.length; i++) g.setUint8(konum + i, s.charCodeAt(i));
  };
  metin(0, 'RIFF');
  g.setUint32(4, 36 + ornek * 2, true);
  metin(8, 'WAVEfmt ');
  g.setUint32(16, 16, true);
  g.setUint16(20, 1, true);   // PCM
  g.setUint16(22, 1, true);   // mono
  g.setUint32(24, hiz, true);
  g.setUint32(28, hiz * 2, true);
  g.setUint16(32, 2, true);
  g.setUint16(34, 16, true);
  metin(36, 'data');
  g.setUint32(40, ornek * 2, true);
  for (let i = 0; i < ornek; i++) {
    // Sonda kisilen zarf: bip birden kesilince "tik" sesi cikiyor.
    const zarf = Math.min(1, (ornek - i) / (hiz * 0.05));
    g.setInt16(44 + i * 2, Math.sin((2 * Math.PI * 880 * i) / hiz) * 0.3 * zarf * 32767, true);
  }
  return tampon;
}

export function varsayilanAyarlar(): Ayarlar {
  return {
    acilista_baslat: false,
    simge_durumunda_basla: false,
    masaustu_kisayolu: false,
    ilk_kurulum_yapildi: false,
    tema: 'koyu',
    vurgu_rengi: '#c9a227',
    haftanin_ilk_gunu: 1,
    saat24: true,
    varsayilan_sure_dakika: 60,
    varsayilan_hatirlatma_dakika: 10,
    varsayilan_ses: 'zil.wav',
    ses_seviyesi: 0.8,
    ses_tekrari: 3,
    otomatik_kapanma_saniye: 0,
    windows_bildirimi: true,
    varsayilan_erteleme_dakika: 10,
    kacan_tolerans_saat: 12,
    oyunda_araya_girme: true,
    rahatsiz_etme_acik: false,
    rahatsiz_etme_bas: '23:00',
    rahatsiz_etme_son: '08:00',
    widget_gorunur: true,
    widget_ustte: true,
    widget_saydamlik: 1,
    widget_hoverda_saydamlas: false,
    widget_boyut: 'normal',
  };
}

/** Tarayicida bos ekran gormemek icin birkac ornek etkinlik. */
/**
 * Tarayici onizlemesinde "Programlarim" bos gorunmesin diye tek ornek.
 * Uykuda gelir: baslatma akisini kullanicinin kendisi denesin.
 */
function ornekProgram(): Program {
  return {
    id: 'ornek-program',
    baslik: 'Haftalık çalışma düzeni',
    aciklama: 'Hafta içi derin çalışma, cumartesi değerlendirme.',
    kategori: 'ders',
    ogeler: [
      {
        id: 'o1',
        baslik: 'Derin çalışma',
        icerik:
          'Günün tek önemli işi\nKaynak: https://ornek.com/notlar\nTelefon sessizde.',
        gunler: [1, 3, 5],
        saat: '09:00',
        sure_dakika: 90,
        hatirlatmalar: [{ dakika_once: 10 }],
      },
      {
        id: 'o2',
        baslik: 'Okuma',
        icerik: 'Bir bölüm oku, notunu çıkar.',
        gunler: [2, 4],
        saat: '14:00',
        sure_dakika: 60,
        hatirlatmalar: [{ dakika_once: 10 }],
      },
      {
        id: 'o3',
        baslik: 'Haftalık değerlendirme',
        icerik: 'Geçen haftayı gözden geçir, gelecek haftayı planla.',
        gunler: [6],
        saat: '10:00',
        sure_dakika: 120,
        hatirlatmalar: [{ dakika_once: 30 }],
      },
    ],
    kosu: null,
  };
}

function ornekEtkinlikler(): Etkinlik[] {
  const bugun = new Date();
  const g = (gunEkle: number, saat: number, dakika = 0) => {
    const d = new Date(bugun);
    d.setDate(d.getDate() + gunEkle);
    d.setHours(saat, dakika, 0, 0);
    return yerelISO(d);
  };
  const bos = { tip: 'yok' as const, aralik: 1, gunler: [], istisnalar: [] };

  return [
    {
      id: 'ornek-1', baslik: 'Derin çalışma', not: 'Günün tek önemli işi',
      kategori: 'ders', baslangic: g(0, 9), bitis: g(0, 10, 30), tum_gun: false,
      tekrar: { ...bos, tip: 'haftalik', gunler: [1, 3, 5] },
      hatirlatmalar: [{ dakika_once: 10 }, { dakika_once: 0 }],
      renk: null, tamamlananlar: [],
    },
    {
      id: 'ornek-2', baslik: 'Spor', not: '', kategori: 'spor',
      baslangic: g(0, 18), bitis: g(0, 19), tum_gun: false,
      tekrar: { ...bos, tip: 'haftalik', gunler: [2, 4, 6] },
      hatirlatmalar: [{ dakika_once: 30 }], renk: null, tamamlananlar: [],
    },
    {
      // Gelistirirken geri sayimin dolu halini gorebilmek icin: her zaman
      // simdiden ~2 saat sonra. Yalnizca tarayici sahtesinde var.
      id: 'ornek-yakin', baslik: 'Haftalık değerlendirme', not: 'Geçen haftanın gözden geçirmesi',
      kategori: 'ders',
      baslangic: yerelISO(new Date(bugun.getTime() + 2 * 3600_000)),
      bitis: yerelISO(new Date(bugun.getTime() + 3.5 * 3600_000)),
      tum_gun: false, tekrar: bos,
      hatirlatmalar: [{ dakika_once: 15 }], renk: null, tamamlananlar: [],
    },
    {
      id: 'ornek-3', baslik: 'Okuma', not: '', kategori: 'ders',
      baslangic: g(0, 14), bitis: g(0, 15, 30), tum_gun: false,
      tekrar: bos, hatirlatmalar: [{ dakika_once: 0 }], renk: null, tamamlananlar: [],
    },
    {
      id: 'ornek-4', baslik: 'Diş randevusu', not: 'Kimlik almayı unutma',
      kategori: 'kisisel', baslangic: g(2, 11), bitis: g(2, 12), tum_gun: false,
      tekrar: bos, hatirlatmalar: [{ dakika_once: 60 }], renk: null, tamamlananlar: [],
    },
  ];
}

/** Date -> "YYYY-MM-DDTHH:MM:SS" (yerel saat, saat dilimi eki yok). */
export function yerelISO(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(
    d.getMinutes(),
  )}:${p(d.getSeconds())}`;
}

/** "YYYY-MM-DDTHH:MM:SS" -> Date (yerel saat olarak yorumlar). */
export function isoCoz(s: string): Date {
  const [tarih, saat = '00:00:00'] = s.split('T');
  const [y, a, g] = tarih!.split('-').map(Number);
  const [ss, dd, sn = 0] = saat.split(':').map(Number);
  return new Date(y!, a! - 1, g!, ss!, dd!, sn);
}
