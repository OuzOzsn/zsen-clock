/**
 * Zil sesi calma.
 *
 * Ses dosyalari Rust'tan ham bayt olarak geliyor (veri klasoru tasinabilir
 * oldugu icin asset protokolu kapsamini onceden tanimlamak mumkun degil).
 * Baytlari Blob URL'ine cevirip <audio> ile caliyoruz.
 *
 * Uc tuzak:
 *  - tauri.conf.json'daki CSP'de `media-src` icinde `blob:` OLMAK ZORUNDA,
 *    yoksa Chromium URL'i sessizce engelliyor.
 *  - Blob'a MIME tipi verilmezse taryici dosyayi cozmeyi reddedebiliyor.
 *  - CSP'de `connect-src` icinde `ipc: http://ipc.localhost` OLMAK ZORUNDA.
 *    Yoksa Tauri'nin ozel protokol IPC'si (fetch) engelleniyor ve sessizce
 *    postMessage yedegine dusuyor. JSON komutlari yedekte de calistigi icin
 *    uygulamanin geri kalani normal gorunuyor; bozulan tek sey HAM BAYT
 *    donduren bu komut oluyor - baytlar sayi dizisine cevrilip geliyor.
 */

import { cagir } from './ipc.ts';

const MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  flac: 'audio/flac',
};

function mimeTipi(dosya: string): string {
  const uzanti = dosya.split('.').pop()?.toLowerCase() ?? '';
  return MIME[uzanti] ?? 'audio/mpeg';
}

/**
 * IPC'den gelen ham veriyi bayta cevirir.
 *
 * Sekil, Tauri'nin hangi IPC yolunu kullandigina gore degisiyor:
 *   ozel protokol -> ArrayBuffer
 *   postMessage yedegi -> number[]
 * Sayi dizisi dogrudan Blob'a verilirse baytlar degil "82,73,70,..." METNI
 * yaziliyor; <audio> de haklı olarak "no supported source" diyor. Iki sekli de
 * kabul etmek, CSP ayari bozulsa bile sesin calmasini garantiliyor.
 */
function baytlar(veri: unknown): Uint8Array<ArrayBuffer> {
  if (veri instanceof ArrayBuffer) return new Uint8Array(veri);
  if (ArrayBuffer.isView(veri)) {
    // Kopya: goruntunun tamponu SharedArrayBuffer olabilir, Blob kabul etmiyor.
    const kopya = new Uint8Array(veri.byteLength);
    kopya.set(new Uint8Array(veri.buffer as ArrayBuffer, veri.byteOffset, veri.byteLength));
    return kopya;
  }
  if (Array.isArray(veri)) return Uint8Array.from(veri as number[]);
  throw new Error(`ses verisi tanınmadı (${Object.prototype.toString.call(veri)})`);
}

/** Calan sesi ve URL'ini birlikte tutar; durdururken ikisi de birakilmali. */
export interface CalanSes {
  durdur: () => void;
}

/**
 * `dosya`yi calar ve durdurma islevi dondurur.
 * Hata olursa FIRLATIR - cagiran taraf kullaniciya soylemekten sorumlu.
 * Sessizce yutmak, "dinle'ye basiyorum hicbir sey olmuyor" demek.
 */
export async function sesCal(
  dosya: string,
  seviye: number,
  tekrar = 1,
): Promise<CalanSes> {
  const bayt = baytlar(await cagir('ses_verisi', { dosya }));
  if (bayt.byteLength === 0) throw new Error(`${dosya} boş`);
  const url = URL.createObjectURL(new Blob([bayt], { type: mimeTipi(dosya) }));

  const ses = new Audio(url);
  ses.volume = Math.min(1, Math.max(0, seviye));

  let kalan = Math.max(1, tekrar);
  ses.addEventListener('ended', () => {
    if (--kalan > 0) {
      void ses.play().catch(() => {});
    } else {
      URL.revokeObjectURL(url);
    }
  });

  try {
    await ses.play();
  } catch (e) {
    URL.revokeObjectURL(url);
    throw new Error(`ses çalınamadı: ${e}`);
  }

  return {
    durdur() {
      ses.pause();
      URL.revokeObjectURL(url);
    },
  };
}
