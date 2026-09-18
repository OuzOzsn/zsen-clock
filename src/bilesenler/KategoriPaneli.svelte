<script lang="ts">
  /**
   * Kategori yonetimi.
   *
   * Kategoriler eskiden yalnizca etkinlik kaydedilirken kendiliginden olusuyor
   * ve rengi sirayla dagitiliyordu; kullanici ne ad ne renk ne de ikon
   * secebiliyordu. Burasi o eksigi kapatiyor.
   *
   * Silme her zaman iki secenekli: etkinlikler ya "genel"e tasinir ya da
   * kategoriyle birlikte gider. Tek dugmeyle sessizce etkinlik silmek, bir
   * donemlik plani yanlislikla yok etmek demek.
   */
  import { IKON_ADLARI, IKONLAR } from '../lib/ikonlar.ts';
  import type { Kategori } from '../lib/tipler.ts';
  import { depo } from '../lib/veri.svelte.ts';
  import Ikon from './Ikon.svelte';

  interface Ozellikler {
    onKapat: () => void;
  }
  let { onKapat }: Ozellikler = $props();

  /** Hazir renkler; kullanici isterse kendi rengini de secebiliyor. */
  const RENKLER = [
    '#c9a227', '#6aa9d6', '#7fa356', '#d2775a',
    '#9b8ec4', '#5fa89a', '#c98fa8', '#8a8f98',
  ];

  /** Duzenlenen kategori; `eskiAd` null ise yeni ekleniyor demektir. */
  let taslak = $state<Kategori | null>(null);
  let eskiAd = $state<string | null>(null);
  let hata = $state<string | null>(null);
  let calisiyor = $state(false);
  /** Silme onayi bekleyen kategori adi. */
  let silinecek = $state<string | null>(null);

  const etkinlikSayilari = $derived.by(() => {
    const sayac: Record<string, number> = {};
    for (const e of depo.etkinlikler) sayac[e.kategori] = (sayac[e.kategori] ?? 0) + 1;
    return sayac;
  });

  function yeniAc() {
    hata = null;
    silinecek = null;
    eskiAd = null;
    taslak = {
      ad: '',
      renk: RENKLER[depo.kategoriler.length % RENKLER.length]!,
      ikon: 'etiket',
    };
  }

  function duzenleAc(k: Kategori) {
    hata = null;
    silinecek = null;
    eskiAd = k.ad;
    taslak = { ad: k.ad, renk: k.renk, ikon: k.ikon ?? null };
  }

  async function kaydet() {
    if (!taslak || calisiyor) return;
    if (!taslak.ad.trim()) {
      hata = 'Kategori adı boş olamaz.';
      return;
    }
    calisiyor = true;
    hata = null;
    try {
      await depo.kategoriKaydet({ ...taslak, ad: taslak.ad.trim() }, eskiAd);
      taslak = null;
      eskiAd = null;
    } catch (e) {
      hata = `${e}`;
    } finally {
      calisiyor = false;
    }
  }

  async function sil(ad: string, etkinliklerleBirlikte: boolean) {
    if (calisiyor) return;
    calisiyor = true;
    hata = null;
    try {
      await depo.kategoriSil(ad, etkinliklerleBirlikte);
      silinecek = null;
      if (eskiAd === ad) taslak = null;
    } catch (e) {
      hata = `${e}`;
    } finally {
      calisiyor = false;
    }
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape' && !calisiyor) onKapat(); }} />

<div
  class="perde"
  role="button"
  tabindex="-1"
  aria-label="Kapat"
  onclick={() => !calisiyor && onKapat()}
  onkeydown={(e) => { if (e.key === 'Enter') onKapat(); }}
></div>

<div class="panel" role="dialog" aria-modal="true" aria-label="Kategoriler">
  <header>
    <div>
      <h2>Kategoriler</h2>
      <p class="alt">Renk ve ikon — takvimde bu işaretlerle görünür.</p>
    </div>
    <button class="ikon-dugme" onclick={onKapat} aria-label="Kapat">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-linecap="round" />
      </svg>
    </button>
  </header>

  <div class="govde">
    {#if hata}
      <p class="hata" role="alert">{hata}</p>
    {/if}

    <ul class="liste">
      {#each depo.kategoriler as k (k.ad)}
        <li class="satir">
          <span class="nokta" style:background={k.renk}></span>
          <span class="simge" style:color={k.renk}><Ikon ad={k.ikon} boyut={15} /></span>
          <span class="ad">{k.ad}</span>
          <span class="adet">{etkinlikSayilari[k.ad] ?? 0}</span>
          <button class="kucuk" onclick={() => duzenleAc(k)}>Düzenle</button>
          <button
            class="kucuk tehlike"
            onclick={() => { silinecek = silinecek === k.ad ? null : k.ad; taslak = null; }}
          >Sil</button>
        </li>

        {#if silinecek === k.ad}
          <li class="onay">
            <p>
              <strong>{k.ad}</strong> silinecek.
              {#if (etkinlikSayilari[k.ad] ?? 0) > 0}
                Bu kategoride {etkinlikSayilari[k.ad]} etkinlik var — ne olsun?
              {/if}
            </p>
            <div class="onay-dugmeler">
              {#if (etkinlikSayilari[k.ad] ?? 0) > 0}
                <button class="kucuk" disabled={calisiyor} onclick={() => void sil(k.ad, false)}>
                  Etkinlikler kalsın (genel'e taşı)
                </button>
                <button class="kucuk tehlike" disabled={calisiyor} onclick={() => void sil(k.ad, true)}>
                  Etkinlikleri de sil
                </button>
              {:else}
                <button class="kucuk tehlike" disabled={calisiyor} onclick={() => void sil(k.ad, false)}>
                  Sil
                </button>
              {/if}
              <button class="kucuk" onclick={() => (silinecek = null)}>Vazgeç</button>
            </div>
          </li>
        {/if}
      {/each}
    </ul>

    {#if taslak}
      <div class="taslak">
        <span class="baslik">{eskiAd ? `"${eskiAd}" düzenleniyor` : 'Yeni kategori'}</span>

        <label class="alan">
          <span class="etiket">Ad</span>
          <!-- svelte-ignore a11y_autofocus -->
          <input
            bind:value={taslak.ad}
            maxlength="30"
            autofocus
            placeholder="spor"
            onkeydown={(e) => { if (e.key === 'Enter') void kaydet(); }}
          />
        </label>

        <div class="alan">
          <span class="etiket">Renk</span>
          <div class="renkler">
            {#each RENKLER as r (r)}
              <button
                class="renk"
                class:secili={taslak.renk.toLowerCase() === r}
                style:background={r}
                aria-label={r}
                onclick={() => (taslak!.renk = r)}
              ></button>
            {/each}
            <input class="renk-secici" type="color" bind:value={taslak.renk} aria-label="Özel renk" />
          </div>
        </div>

        <div class="alan">
          <span class="etiket">İkon</span>
          <div class="ikonlar">
            <button
              class="ikon-kutu"
              class:secili={!taslak.ikon}
              onclick={() => (taslak!.ikon = null)}
              title="İkon yok"
            >—</button>
            {#each IKON_ADLARI as ad (ad)}
              <button
                class="ikon-kutu"
                class:secili={taslak.ikon === ad}
                style:color={taslak.ikon === ad ? taslak.renk : undefined}
                onclick={() => (taslak!.ikon = ad)}
                title={IKONLAR[ad]!.etiket}
                aria-label={IKONLAR[ad]!.etiket}
              >
                <Ikon {ad} boyut={17} />
              </button>
            {/each}
          </div>
        </div>

        <div class="taslak-dip">
          <button class="kucuk" onclick={() => { taslak = null; eskiAd = null; }}>Vazgeç</button>
          <button class="birincil" disabled={calisiyor} onclick={() => void kaydet()}>
            {calisiyor ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      </div>
    {:else}
      <button class="ekle" onclick={yeniAc}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
        Yeni kategori
      </button>
    {/if}
  </div>
</div>

<style>
  .perde {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    animation: soluk var(--gecis) both;
  }
  @keyframes soluk { from { opacity: 0; } to { opacity: 1; } }

  .panel {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: grid;
    grid-template-rows: auto 1fr;
    width: min(460px, calc(100vw - 48px));
    max-height: calc(100vh - 48px);
    background: var(--murekkep-2);
    border: 1px solid var(--ayrac-guclu);
    border-radius: var(--yuvarlak-panel);
    box-shadow: var(--golge-kabuk);
    animation: gir var(--gecis) both;
  }
  @keyframes gir {
    from { opacity: 0; transform: translate(-50%, calc(-50% + 6px)); }
    to { opacity: 1; transform: translate(-50%, -50%); }
  }

  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: var(--b4) var(--b4) var(--b3);
    border-bottom: 1px solid var(--ayrac);
  }
  h2 { font-size: 14.5px; font-weight: 600; }
  .alt { margin-top: 2px; font-size: 12px; color: var(--kagit-3); }
  .ikon-dugme {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: var(--yuvarlak-dugme);
    color: var(--kagit-3);
    transition: color var(--gecis-hizli), background var(--gecis-hizli);
  }
  .ikon-dugme:hover { color: var(--kagit); background: var(--murekkep-3); }

  .govde { display: grid; gap: var(--b3); padding: var(--b4); overflow-y: auto; align-content: start; }

  .hata {
    padding: var(--b2) var(--b3);
    border-left: 2px solid var(--kirmizi);
    background: var(--kirmizi-sonuk);
    font-size: 11.5px;
    line-height: 1.5;
    color: var(--kagit-2);
  }

  .liste { display: grid; gap: 2px; }
  .satir {
    display: flex;
    align-items: center;
    gap: var(--b2);
    padding: 5px var(--b2);
    border-radius: var(--yuvarlak-dugme);
  }
  .satir:hover { background: var(--murekkep-3); }
  .nokta { width: 9px; height: 9px; border-radius: 2px; flex: none; }
  .simge { display: grid; place-items: center; width: 17px; flex: none; }
  .ad {
    flex: 1;
    min-width: 0;
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .adet {
    font-family: var(--yazi-mono);
    font-size: 11px;
    color: var(--kagit-3);
  }

  .kucuk {
    padding: 3px var(--b2);
    border: 1px solid var(--ayrac);
    border-radius: var(--yuvarlak-dugme);
    font-size: 11.5px;
    color: var(--kagit-2);
    transition: color var(--gecis-hizli), border-color var(--gecis-hizli);
  }
  .kucuk:hover:not(:disabled) { color: var(--kagit); border-color: var(--ayrac-guclu); }
  .kucuk:disabled { opacity: 0.5; cursor: default; }
  .tehlike { color: var(--kirmizi); }
  .tehlike:hover:not(:disabled) { color: var(--kirmizi); border-color: var(--kirmizi); }

  .onay {
    display: grid;
    gap: var(--b2);
    padding: var(--b3);
    border-left: 2px solid var(--kirmizi);
    background: var(--kirmizi-sonuk);
    border-radius: 0 var(--yuvarlak-dugme) var(--yuvarlak-dugme) 0;
    font-size: 12px;
    line-height: 1.5;
    color: var(--kagit-2);
  }
  .onay-dugmeler { display: flex; flex-wrap: wrap; gap: var(--b2); }

  .taslak {
    display: grid;
    gap: var(--b3);
    padding: var(--b3);
    border: 1px solid var(--ayrac);
    border-radius: var(--yuvarlak-panel);
  }
  .baslik { font-size: 12px; font-weight: 500; color: var(--kagit-2); }
  .alan { display: grid; gap: var(--b1); }
  .etiket { font-size: 11px; font-weight: 500; color: var(--kagit-3); }

  input {
    width: 100%;
    padding: 7px var(--b3);
    background: var(--murekkep);
    border: 1px solid var(--ayrac);
    border-radius: var(--yuvarlak-dugme);
    font: inherit;
    font-size: 13px;
    color: var(--kagit);
    outline: none;
  }
  input:focus { border-color: var(--pirinc); }

  .renkler { display: flex; flex-wrap: wrap; gap: var(--b2); align-items: center; }
  .renk {
    width: 20px;
    height: 20px;
    border-radius: 5px;
    border: 2px solid transparent;
    transition: transform var(--gecis-hizli);
  }
  .renk:hover { transform: scale(1.12); }
  .renk.secili { border-color: var(--kagit); }
  .renk-secici {
    width: 28px;
    height: 24px;
    padding: 0;
    background: none;
    border: 1px solid var(--ayrac);
    cursor: pointer;
  }

  .ikonlar {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(30px, 1fr));
    gap: 3px;
    max-height: 168px;
    overflow-y: auto;
    padding: 2px;
  }
  .ikon-kutu {
    display: grid;
    place-items: center;
    height: 30px;
    border: 1px solid transparent;
    border-radius: var(--yuvarlak-dugme);
    font-size: 12px;
    color: var(--kagit-3);
    transition: background var(--gecis-hizli), color var(--gecis-hizli);
  }
  .ikon-kutu:hover { background: var(--murekkep-3); color: var(--kagit); }
  .ikon-kutu.secili { border-color: var(--pirinc); background: var(--pirinc-sonuk); }

  .taslak-dip { display: flex; justify-content: flex-end; gap: var(--b2); }
  .birincil {
    padding: 6px var(--b4);
    background: var(--pirinc);
    border-radius: var(--yuvarlak-dugme);
    font-size: 12.5px;
    font-weight: 500;
    color: var(--pirinc-ustu);
  }
  .birincil:disabled { opacity: 0.6; cursor: default; }

  .ekle {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--b2);
    padding: 8px;
    border: 1px dashed var(--ayrac-guclu);
    border-radius: var(--yuvarlak-dugme);
    font-size: 12.5px;
    color: var(--kagit-2);
    transition: color var(--gecis-hizli), border-color var(--gecis-hizli);
  }
  .ekle:hover { color: var(--kagit); border-color: var(--pirinc); }
</style>
