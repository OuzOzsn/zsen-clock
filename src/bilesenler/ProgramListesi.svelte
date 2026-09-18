<script lang="ts">
  /**
   * Sol paneldeki "Programlarım" bolumu.
   *
   * Program, sihirbazla uretilen plandan farkli olarak kalici bir kayit:
   * kenarda uyur, istenen tarihte baslatilir. Bu yuzden liste etkinliklerden
   * geri cikarilmiyor (bkz. planlar.ts), dogrudan depodan geliyor.
   */
  import { AY_UZUN, GUN_KISA, type Program } from '../lib/tipler.ts';
  import { cagir, isoCoz, TAURI_ICINDE } from '../lib/ipc.ts';
  import { benzersizBaslik, dosyaSec, programiCoz } from '../lib/programAktarim.ts';
  import { depo } from '../lib/veri.svelte.ts';

  interface Ozellikler {
    onYeni: () => void;
    onDetay: (p: Program) => void;
  }
  let { onYeni, onDetay }: Ozellikler = $props();

  let hata = $state<string | null>(null);
  let aliniyor = $state(false);

  /**
   * Kullaniciya dosya sectirir ve programi alir; gelen program uykuda baslar.
   * Uygulama icinde dosyayi Rust okuyup dogruluyor, tarayicida ayni isi
   * programAktarim.ts yapiyor - iki ortamda da gercek bir dosya seciliyor.
   */
  async function iceAktar() {
    if (aliniyor) return;
    hata = null;
    aliniyor = true;
    try {
      if (TAURI_ICINDE) {
        const { open } = await import('@tauri-apps/plugin-dialog');
        const yol = await open({
          multiple: false,
          title: 'İçe aktarılacak program dosyası',
          filters: [{ name: 'Program dosyası', extensions: ['json'] }],
        });
        if (typeof yol !== 'string') return;
        onDetay(await cagir('program_ice_aktar', { yol }));
      } else {
        const metin = await dosyaSec();
        if (metin === null) return;
        const cozulen = programiCoz(metin);
        cozulen.baslik = benzersizBaslik(cozulen.baslik, depo.programlar);
        onDetay(await cagir('program_kaydet', { program: cozulen }));
      }
      await depo.yukle();
    } catch (e) {
      hata = e instanceof Error ? e.message : `${e}`;
    } finally {
      aliniyor = false;
    }
  }

  const programlar = $derived(
    [...depo.programlar].sort((a, b) => {
      // Calisanlar ustte: kullanici genelde onlarla ugrasiyor.
      if (!!a.kosu !== !!b.kosu) return a.kosu ? -1 : 1;
      return a.baslik.localeCompare(b.baslik, 'tr');
    }),
  );

  const kisaTarih = (d: Date) => `${d.getDate()} ${AY_UZUN[d.getMonth()]!.slice(0, 3)}`;

  function altSatir(p: Program): string {
    const gunler = [...new Set(p.ogeler.flatMap((o) => o.gunler))].sort((a, b) => a - b);
    const gunMetni = gunler.length > 0 ? gunler.map((g) => GUN_KISA[g]).join(' ') : 'gün yok';
    if (!p.kosu) return `${gunMetni} · uykuda`;
    const bas = kisaTarih(isoCoz(p.kosu.baslangic));
    const son = p.kosu.bitis ? kisaTarih(isoCoz(p.kosu.bitis)) : 'süresiz';
    return `${gunMetni} · ${bas} – ${son}`;
  }
</script>

<div class="programlar">
  <div class="baslik-satiri">
    <span class="panel-baslik">Programlarım</span>
    <div class="dugmeler">
      <button
        class="metin-dugme"
        onclick={() => void iceAktar()}
        disabled={aliniyor}
        title="Program dosyasından içe aktar"
      >
        {aliniyor ? 'Alınıyor…' : 'İçe aktar'}
      </button>
      <button class="ekle-dugme" onclick={onYeni} aria-label="Program oluştur" title="Yeni program">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" stroke-linecap="round" />
        </svg>
      </button>
    </div>
  </div>

  {#if hata}<p class="hata" role="alert">{hata}</p>{/if}

  {#if programlar.length === 0}
    <p class="bos">Henüz program yok. Haftalık bir düzen oluşturup istenen
      tarihte başlatılabilir.</p>
  {:else}
    {#each programlar as p (p.id)}
      <button class="program" onclick={() => onDetay(p)} title="Ayrıntılar">
        <span class="durum" class:calisiyor={!!p.kosu} aria-hidden="true"></span>
        <span class="bilgi">
          <span class="ad">{p.baslik}</span>
          <span class="alt">{altSatir(p)}</span>
        </span>
      </button>
    {/each}
  {/if}
</div>

<style>
  .programlar { display: grid; gap: 2px; align-self: start; }

  .baslik-satiri {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 var(--b2) var(--b1);
  }
  .panel-baslik {
    font-size: 10.5px;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--kagit-3);
  }
  .ekle-dugme {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: var(--yuvarlak-dugme);
    color: var(--kagit-3);
    transition: color var(--gecis-hizli), background var(--gecis-hizli);
  }
  .ekle-dugme:hover:not(:disabled) { color: var(--kagit); background: var(--murekkep-2); }
  .ekle-dugme:disabled { opacity: 0.5; cursor: default; }
  .dugmeler { display: flex; align-items: center; gap: 2px; }
  .metin-dugme {
    padding: 2px var(--b2);
    border-radius: var(--yuvarlak-dugme);
    font-size: 11px;
    color: var(--kagit-3);
    transition: color var(--gecis-hizli), background var(--gecis-hizli);
  }
  .metin-dugme:hover:not(:disabled) { color: var(--kagit); background: var(--murekkep-2); }
  .metin-dugme:disabled { opacity: 0.5; cursor: default; }

  .hata {
    margin: 0;
    padding: var(--b2);
    font-size: 11px;
    line-height: 1.4;
    color: var(--kirmizi);
  }

  .bos {
    margin: 0;
    padding: 0 var(--b2) var(--b1);
    font-size: 11px;
    line-height: 1.5;
    color: var(--kagit-3);
  }

  .program {
    display: flex;
    align-items: center;
    gap: var(--b2);
    width: 100%;
    padding: 4px var(--b2);
    border-radius: var(--yuvarlak-dugme);
    text-align: left;
  }
  .program:hover { background: var(--murekkep-2); }

  /* Dolu nokta = calisiyor, bos halka = uykuda. Metinsiz ayrim yeterli,
     satirda zaten "uykuda" ya da tarih araligi yaziyor. */
  .durum {
    width: 7px;
    height: 7px;
    flex: none;
    border-radius: 50%;
    border: 1px solid var(--kagit-3);
  }
  .durum.calisiyor { background: var(--pirinc); border-color: var(--pirinc); }

  .bilgi { display: grid; min-width: 0; flex: 1; }
  .ad {
    font-size: 12.5px;
    color: var(--kagit-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .alt {
    font-size: 10.5px;
    color: var(--kagit-3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
