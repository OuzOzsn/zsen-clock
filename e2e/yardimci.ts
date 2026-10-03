/**
 * Testlerin ortak kurulumu: sahte veriyi sayfa acilmadan localStorage'a yazar,
 * saati sabitler. Anahtarlar src/lib/ipc.ts ve guncelleme.svelte.ts ile ayni.
 */
import type { Page } from '@playwright/test';
import { varsayilanAyarlar } from '../src/lib/ipc.ts';
import type { Etkinlik, Kategori, Program, Tetiklenen } from '../src/lib/tipler.ts';

/** Testlerin "simdi"si: 5 Ekim 2026 Pazartesi 10:00. */
export const SIMDI = new Date(2026, 9, 5, 10, 0, 0);

export const KATEGORILER: Kategori[] = [
  { ad: 'genel', renk: '#c9a227', ikon: 'etiket' },
  { ad: 'ders', renk: '#6aa9d6', ikon: 'kitap' },
  { ad: 'spor', renk: '#7fa356', ikon: 'kosu' },
];

export interface Tohum {
  etkinlikler?: Etkinlik[];
  programlar?: Program[];
  kategoriler?: Kategori[];
  /** false ise ilk acilis karsilama ekrani gorunur. */
  kurulumYapildi?: boolean;
  alarm?: Tetiklenen[];
  guncelleme?: { surum: string; kurulu: boolean };
}

export async function hazirla(page: Page, t: Tohum = {}) {
  await page.clock.setFixedTime(SIMDI);
  const veri = {
    etkinlikler: t.etkinlikler ?? [],
    programlar: t.programlar ?? [],
    kategoriler: t.kategoriler ?? KATEGORILER,
    ayarlar: { ...varsayilanAyarlar(), ilk_kurulum_yapildi: t.kurulumYapildi ?? true },
  };
  await page.addInitScript(
    ([v, alarm, gunc]) => {
      // Yalnizca ilk yuklemede tohumla: sayfa yenilenince kayitlar kalsin.
      if (sessionStorage.getItem('tohumlandi')) return;
      sessionStorage.setItem('tohumlandi', '1');
      localStorage.clear();
      localStorage.setItem('zsenclock-sahte-veri-1', v);
      if (alarm) localStorage.setItem('zsenclock-sahte-alarm', alarm);
      if (gunc) localStorage.setItem('zsenclock-sahte-guncelleme', gunc);
    },
    [
      JSON.stringify(veri),
      t.alarm ? JSON.stringify(t.alarm) : '',
      t.guncelleme ? JSON.stringify(t.guncelleme) : '',
    ] as const,
  );
}

/** Uygulamanin sahte "diskine" ne yazildigi. */
export async function kayitli(page: Page): Promise<{
  etkinlikler: Etkinlik[];
  programlar: Program[];
  kategoriler: Kategori[];
}> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('zsenclock-sahte-veri-1') ?? '{}'));
}

const bos = { tip: 'yok' as const, aralik: 1, gunler: [] as number[], istisnalar: [] as string[] };

export function etkinlik(uzer: Partial<Etkinlik> & { id: string; baslangic: string }): Etkinlik {
  return {
    baslik: 'Etkinlik',
    not: '',
    kategori: 'genel',
    bitis: null,
    tum_gun: false,
    tekrar: { ...bos },
    hatirlatmalar: [],
    renk: null,
    tamamlananlar: [],
    ...uzer,
  };
}

/** Ay gorunumunde bir gunun hucresi (aria-label "5 Ekim 2026"). Kenardaki
 *  mini takvimde ayni adla dugmeler de var; o yuzden izgaraya daraltiliyor. */
export function gunHucresi(page: Page, gun: number) {
  return page
    .getByRole('grid', { name: 'Ay görünümü' })
    .getByRole('gridcell', { name: new RegExp(`^${gun} Ekim 2026$`) });
}
