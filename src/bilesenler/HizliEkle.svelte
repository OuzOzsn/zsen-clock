<script lang="ts">
  /**
   * Tek satirda etkinlik ekleme.
   *
   * Kullanici "her pzt car cum 09:00 spor" yazar, altinda ne anlasildigini
   * ayni anda gorur. Onay vermeden once ne kaydedilecegini gostermek, bu tur
   * serbest metin girislerinde guvenin tek yolu: yanlis anlasildiginda
   * kullanici daha yazarken fark ediyor.
   */
  import { ayristir, ozetle } from '../lib/dogalDil.ts';
  import { yerelISO } from '../lib/ipc.ts';
  import type { Etkinlik } from '../lib/tipler.ts';
  import { depo } from '../lib/veri.svelte.ts';

  interface Ozellikler {
    /** Kaydedildikten sonra cagrilir; ana pencere o gune gider. */
    onEklendi?: (e: Etkinlik) => void;
  }
  let { onEklendi }: Ozellikler = $props();

  let metin = $state('');
  let alan: HTMLInputElement | undefined = $state();

  const cozum = $derived(metin.trim() ? ayristir(metin, depo.simdi) : null);
  const gecerli = $derived(!!cozum && cozum.baslik.length > 0);

  export function odaklan() {
    alan?.focus();
  }

  async function ekle() {
    if (!cozum || !gecerli) return;

    const sure = cozum.sureDakika ?? depo.ayarlar.varsayilan_sure_dakika;
    const bitis = new Date(cozum.baslangic.getTime() + sure * 60000);

    const yeni: Etkinlik = {
      id: '',
      baslik: cozum.baslik,
      not: '',
      kategori: 'genel',
      baslangic: yerelISO(cozum.baslangic),
      bitis: yerelISO(bitis),
      tum_gun: false,
      tekrar: {
        tip: cozum.tekrar.tip,
        aralik: cozum.tekrar.aralik,
        gunler: cozum.tekrar.gunler,
        istisnalar: [],
      },
      hatirlatmalar: [{ dakika_once: depo.ayarlar.varsayilan_hatirlatma_dakika }],
      renk: null,
      tamamlananlar: [],
    };

    const kayitli = await depo.kaydet(yeni);
    metin = '';
    onEklendi?.(kayitli);
  }

  function klavye(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      void ekle();
    }
    if (e.key === 'Escape') {
      metin = '';
      alan?.blur();
    }
  }
</script>

<div class="sar">
  <div class="alan" class:dolu={!!metin}>
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    </svg>
    <input
      bind:this={alan}
      bind:value={metin}
      onkeydown={klavye}
      placeholder="yarın 14:00 toplantı 45dk"
      aria-label="Hızlı etkinlik ekle"
      spellcheck="false"
    />
  </div>

  {#if cozum}
    <div class="ozet" class:uyari={!gecerli}>
      {#if gecerli}
        <span class="ozet-baslik">{cozum.baslik}</span>
        <span class="ozet-zaman">{ozetle(cozum)}</span>
      {:else}
        Bir başlık da yaz — "{metin.trim()}" sadece zaman bilgisi.
      {/if}
    </div>
  {:else}
    <p class="ipucu">
      Tekrar da yazılabilir — <em>her pzt çar cum 09:00 spor</em>
    </p>
  {/if}
</div>

<style>
  .sar { display: grid; gap: var(--b2); }

  .alan {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: var(--b2);
    padding: 0 var(--b3);
    height: 36px;
    background: var(--murekkep-2);
    border: 1px solid var(--ayrac);
    border-radius: var(--yuvarlak-dugme);
    color: var(--kagit-3);
    transition: border-color var(--gecis-hizli), background var(--gecis-hizli);
  }
  .alan:focus-within {
    border-color: var(--pirinc);
    background: var(--murekkep-3);
    color: var(--pirinc);
  }

  input {
    min-width: 0;
    background: none;
    border: none;
    outline: none;
    font: inherit;
    font-size: 13px;
    color: var(--kagit);
  }
  input::placeholder { color: var(--kagit-3); }

  /* "Ne anladim" ozeti: kaydetmeden once geri bildirim. */
  .ozet {
    display: grid;
    gap: 1px;
    padding: var(--b2) var(--b3);
    border-left: 2px solid var(--pirinc);
    background: var(--pirinc-sonuk);
    font-size: 12px;
  }
  .ozet.uyari {
    border-left-color: var(--kagit-3);
    background: var(--murekkep-2);
    color: var(--kagit-2);
  }
  .ozet-baslik {
    color: var(--kagit);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ozet-zaman { color: var(--kagit-2); }

  .ipucu {
    padding: 0 2px;
    font-size: 11.5px;
    line-height: 1.55;
    color: var(--kagit-3);
  }
  .ipucu em {
    font-style: normal;
    color: var(--kagit-2);
  }
</style>
