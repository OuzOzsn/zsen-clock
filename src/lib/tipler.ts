/**
 * Rust tarafindaki model.rs / ayarlar.rs yapilarinin TypeScript karsiligi.
 * Alan adlari JSON'da gorunen adlarla birebir ayni olmali.
 */

export type TekrarTipi = 'yok' | 'gunluk' | 'haftalik' | 'aylik' | 'yillik';

export interface Tekrar {
  tip: TekrarTipi;
  aralik: number;
  /** 1 = Pazartesi ... 7 = Pazar */
  gunler: number[];
  /** "YYYY-MM-DD" */
  bitis_tarihi?: string | null;
  /** ["YYYY-MM-DD", ...] */
  istisnalar: string[];
}

export interface Hatirlatma {
  /** 0 = tam saatinde, 10 = 10 dakika once, -5 = 5 dakika sonra */
  dakika_once: number;
  /** data/sesler/ altindaki dosya adi; bos ise varsayilan ses */
  ses?: string | null;
}

/**
 * Etkinligi ureten programa bag. `gun` yalnizca "bu gune ozel" kopyalarda
 * dolu; bos olan kayit programin tekrar kuralini tasiyan seri kaydidir.
 */
export interface ProgramBagi {
  program_id: string;
  oge_id: string;
  /** "YYYY-MM-DD" */
  gun?: string | null;
}

export interface Etkinlik {
  id: string;
  baslik: string;
  not: string;
  kategori: string;
  /** "YYYY-MM-DDTHH:MM:SS" - yerel saat, saat dilimi eki yok */
  baslangic: string;
  bitis?: string | null;
  tum_gun: boolean;
  tekrar: Tekrar;
  hatirlatmalar: Hatirlatma[];
  renk?: string | null;
  tamamlananlar: string[];
  /** Elle olusturulan etkinliklerde yok. */
  program?: ProgramBagi | null;
  olusturuldu?: string | null;
  guncellendi?: string | null;
}

export interface Kategori {
  ad: string;
  renk: string;
  /** ikonlar.ts icindeki ad; bos ise yalnizca renk noktasi gosterilir. */
  ikon?: string | null;
}

/** Takvimde gosterilen tek bir tekrar ornegi. Diskte tutulmaz, hesaplanir. */
export interface Olusum {
  etkinlik: Etkinlik;
  /** Bu ornegin baslangic ani */
  baslangic: Date;
  bitis: Date | null;
  tamamlandi: boolean;
  renk: string;
}

// ------------------------------------------------------------------ Program

/** Sureyi kullanicinin hangi biciminde verdigi; `bitis` her durumda yazilir. */
export type SureKipi = 'hafta' | 'tarih' | 'suresiz';

export interface ProgramOgesi {
  id: string;
  baslik: string;
  /** Duz metin; baglantilar gosterimde taninir, markdown yok. */
  icerik: string;
  /** 1 = Pazartesi ... 7 = Pazar */
  gunler: number[];
  /** "HH:MM" */
  saat: string;
  sure_dakika: number;
  hatirlatmalar: Hatirlatma[];
}

export interface ProgramKosusu {
  /** "YYYY-MM-DD" - kullanicinin sectigi gun. Uretim hep bunu temel alir. */
  baslangic: string;
  /** "YYYY-MM-DD"; bos = suresiz. */
  bitis?: string | null;
  kip: SureKipi;
  hafta?: number | null;
  /** "YYYY-MM-DDTHH:MM:SS" */
  baslatildi: string;
}

export interface Program {
  id: string;
  baslik: string;
  aciklama: string;
  /** Uretilen etkinliklerin kategorisi; takvimdeki rengi buradan gelir. */
  kategori: string;
  ogeler: ProgramOgesi[];
  /** Bos = uykuda, takvime islenmis degil. */
  kosu?: ProgramKosusu | null;
  olusturuldu?: string | null;
  guncellendi?: string | null;
}

export interface Ayarlar {
  acilista_baslat: boolean;
  simge_durumunda_basla: boolean;
  masaustu_kisayolu: boolean;
  ilk_kurulum_yapildi: boolean;
  tema: 'koyu' | 'acik' | 'sistem';
  vurgu_rengi: string;
  haftanin_ilk_gunu: number;
  saat24: boolean;

  varsayilan_sure_dakika: number;
  varsayilan_hatirlatma_dakika: number;
  varsayilan_ses: string;

  ses_seviyesi: number;
  ses_tekrari: number;
  otomatik_kapanma_saniye: number;
  windows_bildirimi: boolean;
  varsayilan_erteleme_dakika: number;
  kacan_tolerans_saat: number;

  /** Tam ekran oyun/sunum varken alarm odağı çalmasın, üstte durmasın. */
  oyunda_araya_girme: boolean;

  rahatsiz_etme_acik: boolean;
  rahatsiz_etme_bas: string;
  rahatsiz_etme_son: string;

  widget_gorunur: boolean;
  widget_ustte: boolean;
  widget_saydamlik: number;
  widget_hoverda_saydamlas: boolean;
  widget_boyut: 'kompakt' | 'normal' | 'genis';
  widget_x?: number | null;
  widget_y?: number | null;
  widget_genislik?: number | null;
  widget_yukseklik?: number | null;
}

/** Alarm penceresine gonderilen yuk. */
export interface Tetiklenen {
  etkinlik_id: string;
  baslik: string;
  not: string;
  kategori: string;
  olusum: string;
  bitis?: string | null;
  calma_zamani: string;
  dakika_once: number;
  ses?: string | null;
  kacirilmis: boolean;
}

export const GUN_KISA = ['', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'] as const;
export const GUN_UZUN = [
  '', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar',
] as const;
export const AY_UZUN = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
] as const;
