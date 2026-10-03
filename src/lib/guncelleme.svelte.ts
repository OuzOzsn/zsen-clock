/**
 * Uygulama ici guncelleme.
 *
 * Acilista GitHub'daki son release'in latest.json'una bakiliyor (adres
 * tauri.conf.json'da). Yeni surum varsa yalnizca haber veriliyor; indirip
 * kurmak kullanicinin "Güncelle" tiklamasiyla oluyor. Kurulum dosyasi imzali:
 * imza tutmazsa eklenti kurmayi reddediyor.
 *
 * Tasinabilir exe guncellenmiyor - kurulum dosyasi programi baska bir
 * klasore kurar ve veri exe'nin yanindaki data\ klasorunde kalirdi. Orada
 * release sayfasi aciliyor, kullanici yeni exe'yi kendisi indiriyor.
 */
import { cagir, TAURI_ICINDE } from './ipc.ts';

export const RELEASE_SAYFASI = 'https://github.com/OuzOzsn/zsen-clock/releases/latest';

type Durum = 'bilinmiyor' | 'bakiliyor' | 'guncel' | 'var' | 'indiriliyor' | 'hata';

class Guncelleme {
  durum = $state<Durum>('bilinmiyor');
  /** Yeni surumun numarasi, ornegin "0.1.2". */
  yeniSurum = $state<string | null>(null);
  notlar = $state<string>('');
  /** 0-100; boyut bilinmiyorsa null. */
  ilerleme = $state<number | null>(null);
  hata = $state<string | null>(null);
  kurulu = $state(false);

  // check() sonucu: indirmek icin ayni nesne lazim.
  #bulunan: { downloadAndInstall: (cb?: (o: OlayTipi) => void) => Promise<void> } | null = null;

  async denetle() {
    if (this.durum === 'bakiliyor' || this.durum === 'indiriliyor') return;
    if (!TAURI_ICINDE) {
      // Tarayici onizlemesi: testler (e2e/) "yeni surum var" durumunu buradan
      // kuruyor. Gercek uygulamada bu dal hic calismaz.
      try {
        const test = localStorage.getItem('zsenclock-sahte-guncelleme');
        if (test) {
          const { surum, kurulu } = JSON.parse(test) as { surum: string; kurulu: boolean };
          this.yeniSurum = surum;
          this.kurulu = kurulu;
          this.durum = 'var';
        }
      } catch {
        /* yok say */
      }
      return;
    }
    this.durum = 'bakiliyor';
    this.hata = null;
    try {
      this.kurulu = await cagir('kurulu_mu');
      const { check } = await import('@tauri-apps/plugin-updater');
      const g = await check();
      if (g) {
        this.#bulunan = g;
        this.yeniSurum = g.version;
        this.notlar = g.body ?? '';
        this.durum = 'var';
      } else {
        this.durum = 'guncel';
      }
    } catch (e) {
      // Internet yoksa ya da release'de latest.json yoksa buraya dusuyor;
      // acilista kullaniciyi bununla rahatsiz etmiyoruz, Ayarlar'da gorunuyor.
      this.hata = `${e}`;
      this.durum = 'hata';
    }
  }

  /** Indirir ve kurar. Windows'ta kurulum sirasinda uygulama kapanip yeniden acilir. */
  async kur() {
    if (!TAURI_ICINDE) {
      this.durum = 'indiriliyor';
      return;
    }
    if (!this.kurulu) {
      await cagir('baglanti_ac', { url: RELEASE_SAYFASI });
      return;
    }
    if (!this.#bulunan || this.durum === 'indiriliyor') return;
    this.durum = 'indiriliyor';
    this.ilerleme = null;
    let toplam = 0;
    let inen = 0;
    try {
      await this.#bulunan.downloadAndInstall((o) => {
        if (o.event === 'Started') {
          toplam = o.data.contentLength ?? 0;
        } else if (o.event === 'Progress') {
          inen += o.data.chunkLength;
          this.ilerleme = toplam > 0 ? Math.min(100, Math.round((inen / toplam) * 100)) : null;
        }
      });
    } catch (e) {
      this.hata = `${e}`;
      this.durum = 'hata';
    }
  }
}

type OlayTipi =
  | { event: 'Started'; data: { contentLength?: number } }
  | { event: 'Progress'; data: { chunkLength: number } }
  | { event: 'Finished' };

export const guncelleme = new Guncelleme();
