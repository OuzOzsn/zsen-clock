/**
 * Program dosyasinin bicimi ve tarayici onizlemesindeki dosya islemleri.
 *
 * Uygulama icinde dosyayi Rust yaziyor/okuyor (komutlar.rs: program_disa_aktar
 * / program_ice_aktar) - dogrulamanin asil mercii orasi. Burasi ayni bicimin
 * tarayici tarafindaki karsiligi: `npm run dev` ile Chrome'da calisirken de
 * disa/ice aktarma gercekten dosyayla calissin diye. Bicim degisirse iki
 * tarafi birden guncelle; testler ikisini de sabitliyor
 * (programAktarim.test.ts ve cekirdek/src/program.rs).
 */

import type { Program } from './tipler.ts';

/** Yanlis dosyayi ice aktarmaya calisinca anlasilir hata verebilmek icin. */
export const AKTARIM_TURU = 'zsenclock-program';
export const AKTARIM_SURUMU = 1;

export interface ProgramAktarimi {
  tur: string;
  surum: number;
  program: Program;
}

/** Disa aktarilacak sarmalayici. Kosu dusuruluyor: sablon uykuda gider. */
export function programiSar(program: Program): ProgramAktarimi {
  return {
    tur: AKTARIM_TURU,
    surum: AKTARIM_SURUMU,
    program: { ...program, kosu: null },
  };
}

/** Dosya adi olarak kullanilabilir bir ad uretir. */
export function aktarimDosyaAdi(program: Program): string {
  const govde = program.baslik.trim() || 'Program';
  // Windows'ta dosya adinda yasak olan karakterler.
  return `${govde.replace(/[/\\:*?"<>|]/g, '-')}.program.json`;
}

/**
 * Dosya icerigini programa cevirir. Ice aktarilan program her zaman uykuda
 * gelir; baslangic tarihini kullanici verir. Kimlik cagiran tarafta atanir.
 */
export function programiCoz(metin: string): Program {
  // Not Defteri UTF-8 BOM ile kaydediyor; JSON ayristirici BOM'u bozuk sayar.
  const temiz = metin.replace(/^﻿/, '');

  let ham: unknown;
  try {
    ham = JSON.parse(temiz);
  } catch {
    throw new Error('Bu dosya bir program dosyası değil.');
  }

  const a = ham as Partial<ProgramAktarimi> | null;
  if (!a || typeof a !== 'object' || a.tur !== AKTARIM_TURU || !a.program) {
    throw new Error('Bu dosya bir program dosyası değil.');
  }
  if (typeof a.surum === 'number' && a.surum > AKTARIM_SURUMU) {
    throw new Error(
      'Bu program daha yeni bir sürümle oluşturulmuş. Uygulamayı güncelle.',
    );
  }

  const p = a.program;
  return {
    id: '',
    baslik: typeof p.baslik === 'string' ? p.baslik : 'Program',
    aciklama: typeof p.aciklama === 'string' ? p.aciklama : '',
    kategori: typeof p.kategori === 'string' && p.kategori ? p.kategori : 'genel',
    ogeler: Array.isArray(p.ogeler) ? p.ogeler : [],
    kosu: null,
  };
}

/** Listede iki program ayni adi tasimasin. */
export function benzersizBaslik(baslik: string, mevcut: Program[]): string {
  const govde = baslik.trim() || 'Program';
  let ad = govde;
  let sayi = 2;
  while (mevcut.some((p) => p.baslik === ad)) {
    ad = `${govde} (${sayi})`;
    sayi += 1;
  }
  return ad;
}

// ------------------------------------------------- tarayici dosya islemleri

/**
 * Dosya sectirir ve metnini dondurur. Kullanici vazgecerse null.
 * Yalnizca tarayici onizlemesinde kullaniliyor; uygulama icinde Tauri'nin
 * kendi dosya penceresi aciliyor.
 */
export function dosyaSec(): Promise<string | null> {
  return new Promise((coz) => {
    const girdi = document.createElement('input');
    girdi.type = 'file';
    girdi.accept = 'application/json,.json';
    girdi.onchange = () => {
      const dosya = girdi.files?.[0];
      if (!dosya) {
        coz(null);
        return;
      }
      void dosya.text().then(coz);
    };
    // Kullanici dosya penceresini kapatirsa change hic gelmez; sekmeye
    // donuldugunde cozuyoruz ki "aliniyor" bayragi takili kalmasin.
    girdi.oncancel = () => coz(null);
    girdi.click();
  });
}

/** Metni dosya olarak indirir (tarayici onizlemesi). */
export function dosyaIndir(ad: string, metin: string) {
  const bag = URL.createObjectURL(new Blob([metin], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = bag;
  a.download = ad;
  a.click();
  URL.revokeObjectURL(bag);
}
