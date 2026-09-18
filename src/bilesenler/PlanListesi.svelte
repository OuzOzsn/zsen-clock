<script lang="ts">
  /**
   * Sihirbazla uretilmis planlar ve "planı sil".
   *
   * Bir plan yuzlerce somut kayit uretiyor; onlari tek tek silmek isle degil
   * inatla bitiyordu. Plan kaydi diye ayri bir sey tutulmadigi icin liste
   * etkinlik id'lerinden cikariliyor (bkz. planlar.ts), yani daha once
   * uretilmis planlar da burada gorunuyor.
   */
  import { planlariCikar, type PlanOzeti } from '../lib/planlar.ts';
  import { AY_UZUN } from '../lib/tipler.ts';
  import { depo } from '../lib/veri.svelte.ts';

  const planlar = $derived(planlariCikar(depo.etkinlikler));

  let onayBekleyen = $state<string | null>(null);
  let siliniyor = $state<string | null>(null);
  let hata = $state<string | null>(null);

  const kisaTarih = (d: Date) => `${d.getDate()} ${AY_UZUN[d.getMonth()]!.slice(0, 3)}`;

  function aralik(p: PlanOzeti): string {
    return p.bas.getTime() === p.son.getTime()
      ? kisaTarih(p.bas)
      : `${kisaTarih(p.bas)} – ${kisaTarih(p.son)}`;
  }

  async function sil(p: PlanOzeti) {
    if (siliniyor) return;
    siliniyor = p.damga;
    hata = null;
    try {
      await depo.topluSil(p.idler);
      onayBekleyen = null;
    } catch (e) {
      hata = `Plan silinemedi — ${e}`;
    } finally {
      siliniyor = null;
    }
  }
</script>

{#if planlar.length > 0}
  <div class="planlar">
    <span class="panel-baslik">Planlar</span>

    {#if hata}<p class="hata" role="alert">{hata}</p>{/if}

    {#each planlar as p (p.damga)}
      <div class="plan">
        <div class="bilgi">
          <span class="ad">{p.ad}</span>
          <span class="alt">{aralik(p)} · {p.idler.length} seans</span>
        </div>
        <button
          class="sil"
          aria-label="{p.ad} planını sil"
          title="Planı tümüyle sil"
          onclick={() => (onayBekleyen = onayBekleyen === p.damga ? null : p.damga)}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5M6.8 7v4M9.2 7v4"
              stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>

      {#if onayBekleyen === p.damga}
        <div class="onay">
          <p>
            {p.idler.length} seansın tümü silinecek.
            {#if p.tamamlanan > 0}<strong>{p.tamamlanan} tanesi tamamlanmış.</strong>{/if}
          </p>
          <div class="onay-dugmeler">
            <button class="kucuk tehlike" disabled={siliniyor === p.damga} onclick={() => void sil(p)}>
              {siliniyor === p.damga ? 'Siliniyor…' : 'Planı sil'}
            </button>
            <button class="kucuk" onclick={() => (onayBekleyen = null)}>Vazgeç</button>
          </div>
        </div>
      {/if}
    {/each}
  </div>
{/if}

<style>
  .planlar { display: grid; gap: 2px; align-self: start; }
  .panel-baslik {
    padding: 0 var(--b2) var(--b1);
    font-size: 10.5px;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--kagit-3);
  }

  .plan {
    display: flex;
    align-items: center;
    gap: var(--b2);
    padding: 4px var(--b2);
    border-radius: var(--yuvarlak-dugme);
  }
  .plan:hover { background: var(--murekkep-2); }

  .bilgi { display: grid; min-width: 0; flex: 1; }
  .ad {
    font-size: 12.5px;
    color: var(--kagit-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .alt { font-size: 10.5px; color: var(--kagit-3); }

  .sil {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    flex: none;
    border-radius: var(--yuvarlak-dugme);
    color: var(--kagit-3);
    opacity: 0;
    transition: color var(--gecis-hizli), opacity var(--gecis-hizli);
  }
  /* Silme dugmesi yalnizca satirin uzerindeyken ciksin: yan panelde surekli
     duran bir cop kutusu, kazara tiklanmayi davet ediyor. */
  .plan:hover .sil, .sil:focus-visible { opacity: 1; }
  .sil:hover { color: var(--kirmizi); }

  .onay {
    display: grid;
    gap: var(--b2);
    margin: 2px 0 var(--b2);
    padding: var(--b2) var(--b3);
    border-left: 2px solid var(--kirmizi);
    background: var(--kirmizi-sonuk);
    border-radius: 0 var(--yuvarlak-dugme) var(--yuvarlak-dugme) 0;
    font-size: 11.5px;
    line-height: 1.5;
    color: var(--kagit-2);
  }
  .onay-dugmeler { display: flex; gap: var(--b2); }
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
  .tehlike:hover:not(:disabled) { border-color: var(--kirmizi); }

  .hata {
    padding: var(--b2);
    font-size: 11px;
    line-height: 1.4;
    color: var(--kirmizi);
  }
</style>
