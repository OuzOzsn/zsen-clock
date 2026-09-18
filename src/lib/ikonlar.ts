/**
 * Kategori ikonlari.
 *
 * Neden hazir bir ikon paketi (lucide, feather...) kurulmadi: uygulama
 * cevrimdisi calisir ve exe kucuk kalmali; bir paketin tamami birkac yuz ikon
 * getirip 40 KB ekliyor, burada 36 tanesi yetiyor. Ustelik hepsi ayni cizim
 * diliyle (24x24 kutu, 2 birim cizgi, yuvarlak uc) elle yazildigi icin yan
 * yana geldiklerinde tek bir set gibi duruyorlar.
 *
 * Her ikon yalnizca <path> govdesi; renk `currentColor`'dan gelir, boylece
 * kategori rengi tek yerden verilebiliyor.
 */

export interface IkonTanimi {
  /** Ayarlarda ve secicide gorunen ad. */
  etiket: string;
  /** 24x24 viewBox icin path/sekil govdesi. */
  govde: string;
}

export const IKONLAR: Record<string, IkonTanimi> = {
  // --- genel ---
  etiket: {
    etiket: 'Etiket',
    govde: '<path d="M3 11.5V4a1 1 0 0 1 1-1h7.5L21 12.5 12.5 21 3 11.5Z"/><circle cx="7.5" cy="7.5" r="1.4"/>',
  },
  yildiz: {
    etiket: 'Yıldız',
    govde: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9L12 3.5Z"/>',
  },
  bayrak: {
    etiket: 'Bayrak',
    govde: '<path d="M5 21V4"/><path d="M5 4.5h11l-2 3.5 2 3.5H5"/>',
  },
  hedef: {
    etiket: 'Hedef',
    govde: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
  },
  ampul: {
    etiket: 'Fikir',
    govde: '<path d="M9 17h6"/><path d="M10 20h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.4.3.5.7.5 1.1h6c0-.4.1-.8.5-1.1A6 6 0 0 0 12 3Z"/>',
  },
  kalp: {
    etiket: 'Kalp',
    govde: '<path d="M12 20s-7-4.4-7-9.5A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7 2.5C19 15.6 12 20 12 20Z"/>',
  },

  // --- calisma ---
  kitap: {
    etiket: 'Kitap',
    govde: '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v15H5.5A1.5 1.5 0 0 0 4 19.5V4.5Z"/><path d="M4 19.5A1.5 1.5 0 0 1 5.5 18H19v3H5.5A1.5 1.5 0 0 1 4 19.5Z"/>',
  },
  kalem: {
    etiket: 'Kalem',
    govde: '<path d="M4 20h4L20 8l-4-4L4 16v4Z"/><path d="m14.5 5.5 4 4"/>',
  },
  not: {
    etiket: 'Not defteri',
    govde: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  },
  matematik: {
    etiket: 'Matematik',
    govde: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 13h2M14 13h2M8 17h2M14 17h2"/>',
  },
  deney: {
    etiket: 'Deney',
    govde: '<path d="M10 3v6L4.8 17.6A2 2 0 0 0 6.5 21h11a2 2 0 0 0 1.7-3.4L14 9V3"/><path d="M9 3h6M8 14h8"/>',
  },
  dunya: {
    etiket: 'Dünya',
    govde: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.2 2.4 3.3 5.3 3.3 8.5S14.2 18.1 12 20.5c-2.2-2.4-3.3-5.3-3.3-8.5S9.8 5.9 12 3.5Z"/>',
  },
  dil: {
    etiket: 'Dil',
    govde: '<path d="M3 6h10M8 4v2c0 4.5-2 7.5-5 9"/><path d="M5.5 11.5c1.5 2.5 3.5 4 6.5 5"/><path d="m13 20 4-10 4 10"/><path d="M14.5 16.5h5"/>',
  },
  mezuniyet: {
    etiket: 'Okul',
    govde: '<path d="M12 4 2.5 9 12 14l9.5-5L12 4Z"/><path d="M6.5 11v5c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5v-5"/>',
  },
  kod: {
    etiket: 'Kod',
    govde: '<path d="m9 8-5 4 5 4M15 8l5 4-5 4"/>',
  },
  bilgisayar: {
    etiket: 'Bilgisayar',
    govde: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  },
  is: {
    etiket: 'İş',
    govde: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 12h18"/>',
  },

  // --- spor ve saglik ---
  kosu: {
    etiket: 'Koşu',
    govde: '<circle cx="15" cy="4.5" r="1.8"/><path d="m8 21 2.5-5.5L8 12l1-5 3.5 3 3 1"/><path d="m9 7-3.5 1.5M12.5 9.5 15 13l2.5 2"/>',
  },
  halter: {
    etiket: 'Ağırlık',
    govde: '<path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10"/>',
  },
  bisiklet: {
    etiket: 'Bisiklet',
    govde: '<circle cx="5.5" cy="17" r="3.5"/><circle cx="18.5" cy="17" r="3.5"/><path d="M5.5 17 10 8h5l3.5 9M9 8h4M14 8l-4 9"/>',
  },
  futbol: {
    etiket: 'Top',
    govde: '<circle cx="12" cy="12" r="8.5"/><path d="m12 7.5 3.8 2.8-1.5 4.5h-4.6L8.2 10.3 12 7.5Z"/>',
  },
  yoga: {
    etiket: 'Yoga',
    govde: '<circle cx="12" cy="4.5" r="1.8"/><path d="M12 8v5M12 13l-4 6M12 13l4 6M6 10h12"/>',
  },
  yuzme: {
    etiket: 'Yüzme',
    govde: '<circle cx="15" cy="7" r="1.8"/><path d="m5 12 4-2.5 3 2 3-2"/><path d="M3 17c1.5 0 1.5 1.5 3 1.5S7.5 17 9 17s1.5 1.5 3 1.5S13.5 17 15 17s1.5 1.5 3 1.5S19.5 17 21 17"/>',
  },
  uyku: {
    etiket: 'Uyku',
    govde: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z"/>',
  },
  saglik: {
    etiket: 'Sağlık',
    govde: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M9 6V4h6v2M12 10v5M9.5 12.5h5"/>',
  },
  ilac: {
    etiket: 'İlaç',
    govde: '<rect x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="m9.5 9.5 5 5"/>',
  },

  // --- gunluk ---
  ev: {
    etiket: 'Ev',
    govde: '<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9.5Z"/><path d="M9.5 21v-6h5v6"/>',
  },
  aile: {
    etiket: 'Aile',
    govde: '<circle cx="9" cy="8" r="3"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9" r="2.2"/><path d="M15 20a4.5 4.5 0 0 1 5.5-4.4"/>',
  },
  yemek: {
    etiket: 'Yemek',
    govde: '<path d="M6 3v8a2 2 0 0 0 4 0V3M8 11v10"/><path d="M17 3c-1.5 1.5-2 3.5-2 6s1 3 2 3 2-.5 2-3 -.5-4.5-2-6Z"/><path d="M17 12v9"/>',
  },
  kahve: {
    etiket: 'Kahve',
    govde: '<path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Z"/><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17"/><path d="M8 3v2M12 3v2"/>',
  },
  su: {
    etiket: 'Su',
    govde: '<path d="M12 3.5c3.5 4.5 5.5 7.5 5.5 10a5.5 5.5 0 0 1-11 0c0-2.5 2-5.5 5.5-10Z"/>',
  },
  alisveris: {
    etiket: 'Alışveriş',
    govde: '<path d="M5 7h14l-1.2 12.1a1 1 0 0 1-1 .9H7.2a1 1 0 0 1-1-.9L5 7Z"/><path d="M9 10V6a3 3 0 0 1 6 0v4"/>',
  },
  para: {
    etiket: 'Para',
    govde: '<circle cx="12" cy="12" r="8.5"/><path d="M14.5 9.5c-.6-.9-1.5-1.3-2.5-1.3-1.4 0-2.5.8-2.5 2s1.1 1.8 2.5 2 2.5.8 2.5 2-1.1 2-2.5 2c-1 0-1.9-.4-2.5-1.3M12 6.5v11"/>',
  },
  araba: {
    etiket: 'Araba',
    govde: '<path d="M4 16v-3.5L6 8h12l2 4.5V16"/><path d="M4 16h16v2.5h-3V16M7 18.5V16H4"/><circle cx="7.5" cy="16" r="0.6"/><circle cx="16.5" cy="16" r="0.6"/>',
  },
  ucak: {
    etiket: 'Seyahat',
    govde: '<path d="M10 3.5a1.5 1.5 0 0 1 3 0V9l8 4.5v2l-8-2.2V18l2.5 2v1.5L11.5 20 7.5 21.5V20l2.5-2v-5.2L2 15v-2L10 9V3.5Z"/>',
  },
  muzik: {
    etiket: 'Müzik',
    govde: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  },
  film: {
    etiket: 'Film',
    govde: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M7 5v4M17 5v4M7 19v-4M17 19v-4M3 15h18"/>',
  },
  oyun: {
    etiket: 'Oyun',
    govde: '<rect x="2.5" y="7.5" width="19" height="9" rx="4.5"/><path d="M7 10v4M5 12h4M16 11.5h.01M18 13.5h.01"/>',
  },
  pati: {
    etiket: 'Evcil hayvan',
    govde: '<circle cx="7" cy="9" r="1.8"/><circle cx="12" cy="7" r="1.8"/><circle cx="17" cy="9" r="1.8"/><path d="M12 12c-2.8 0-5 2-5 4.5S9 20 12 20s5-1 5-3.5S14.8 12 12 12Z"/>',
  },
  telefon: {
    etiket: 'Telefon',
    govde: '<path d="M7 3.5h10a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H7a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 7 3.5Z"/><path d="M10.5 17.5h3"/>',
  },
  saat: {
    etiket: 'Saat',
    govde: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  },
};

export type IkonAdi = keyof typeof IKONLAR;

/** Secicide gosterilecek sira; `Object.keys` sirasi zaten dogru gruplanmis. */
export const IKON_ADLARI = Object.keys(IKONLAR);

export function ikonVarMi(ad: string | null | undefined): boolean {
  return !!ad && ad in IKONLAR;
}
