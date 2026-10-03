<script lang="ts">
  /**
   * Kategori secici: butun kategoriler tiklanabilir cip olarak dizilir.
   *
   * Once <datalist> vardi. WebView2 onerileri kutudaki metne gore suzuyor;
   * kutuda zaten "ders" yazdigi icin listede yalnizca "ders" cikiyordu ve
   * kullanici kendi actigi kategorileri hic goremiyordu. Yeni bir ad da
   * yazilabilsin diye sondaki kutu duruyor.
   */
  import { depo } from '../lib/veri.svelte.ts';
  import Ikon from './Ikon.svelte';
  import MetinIcerik from './MetinIcerik.svelte';

  interface Ozellikler {
    deger: string;
    salt?: boolean;
  }
  let { deger = $bindable(), salt = false }: Ozellikler = $props();

  const secili = (ad: string) => ad.toLowerCase() === deger.trim().toLowerCase();
  const listede = $derived(depo.kategoriler.some((k) => secili(k.ad)));
  /** Secili kategorinin aciklamasi - formu acan kisi ne oldugunu gorsun. */
  const aciklama = $derived(depo.kategoriler.find((k) => secili(k.ad))?.aciklama ?? '');
</script>

<div class="secici" role="radiogroup" aria-label="Kategori">
  {#each depo.kategoriler as k (k.ad)}
    <button
      type="button"
      class="cip"
      class:secili={secili(k.ad)}
      style:--renk={k.renk}
      role="radio"
      aria-checked={secili(k.ad)}
      disabled={salt && !secili(k.ad)}
      title={k.aciklama || undefined}
      onclick={() => (deger = k.ad)}
    >
      {#if k.ikon}
        <span class="simge"><Ikon ad={k.ikon} boyut={13} /></span>
      {:else}
        <span class="nokta"></span>
      {/if}
      {k.ad}
    </button>
  {/each}
  {#if !salt}
    <input
      class="yeni"
      class:secili={!listede && deger.trim() !== ''}
      placeholder="+ yeni kategori"
      value={listede ? '' : deger}
      oninput={(e) => (deger = e.currentTarget.value)}
    />
  {/if}
</div>
{#if aciklama}
  <div class="aciklama"><MetinIcerik metin={aciklama} /></div>
{/if}

<style>
  .secici { display: flex; flex-wrap: wrap; gap: 5px; }
  .aciklama {
    margin-top: 6px;
    padding: 6px 10px;
    border-left: 2px solid var(--ayrac-guclu);
    background: var(--murekkep);
    border-radius: 0 var(--yuvarlak-dugme) var(--yuvarlak-dugme) 0;
  }
  .cip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border: 1px solid var(--ayrac);
    border-radius: 99px;
    font-size: 13px;
    color: var(--kagit-2);
    transition: border-color var(--gecis-hizli), background var(--gecis-hizli),
      color var(--gecis-hizli);
  }
  .cip:hover:not(:disabled) { border-color: var(--renk); color: var(--kagit); }
  .cip.secili {
    border-color: var(--renk);
    background: color-mix(in srgb, var(--renk) 18%, transparent);
    color: var(--kagit);
  }
  .cip:disabled { opacity: 0.4; cursor: default; }
  .simge { display: grid; color: var(--renk); }
  .nokta { width: 8px; height: 8px; border-radius: 50%; background: var(--renk); }
  .yeni {
    width: 130px;
    padding: 4px 10px;
    background: transparent;
    border: 1px dashed var(--ayrac-guclu);
    border-radius: 99px;
    font: inherit;
    font-size: 13px;
    color: var(--kagit);
  }
  .yeni:focus, .yeni.secili { border-style: solid; border-color: var(--pirinc); outline: none; }
</style>
