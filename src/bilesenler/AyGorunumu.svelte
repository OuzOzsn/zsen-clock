<script lang="ts">
  /**
   * Ay izgarasi: 6 satir x 7 sutun.
   *
   * Izgara bilerek KARE - yuvarlak koseler yok. Tasarim dilinde yuvarlaklik
   * "tiklanabilir" demek; takvim izgarasi bir cetvel, kagit uzerindeki cizgiler.
   * Bugun kirmizi ile isaretli: takvim yapragindaki gibi.
   */
  import { ayIzgarasi, ayniGun, gunAnahtari, saatBicim } from '../lib/tarih.ts';
  import { GUN_KISA, type Olusum } from '../lib/tipler.ts';
  import { depo } from '../lib/veri.svelte.ts';

  interface Ozellikler {
    ay: Date;
    secili: Date;
    simdi: Date;
    olusumlar: Olusum[];
    onGunSec: (g: Date) => void;
    onGunAc: (g: Date) => void;
    onOlusumAc: (o: Olusum) => void;
  }

  let { ay, secili, simdi, olusumlar, onGunSec, onGunAc, onOlusumAc }: Ozellikler = $props();

  const ilkGun = $derived(depo.ayarlar.haftanin_ilk_gunu || 1);
  const gunler = $derived(ayIzgarasi(ay, ilkGun));

  /** Basliktaki gun adlari, haftanin ilk gunu ayarina gore donduruluyor. */
  const basliklar = $derived(
    Array.from({ length: 7 }, (_, i) => GUN_KISA[((ilkGun - 1 + i) % 7) + 1]),
  );

  /** Gun anahtarina gore gruplanmis olusumlar - her hucre kendi listesini alir. */
  const gunlere_gore = $derived.by(() => {
    const harita = new Map<string, Olusum[]>();
    for (const o of olusumlar) {
      const a = gunAnahtari(o.baslangic);
      const mevcut = harita.get(a);
      if (mevcut) mevcut.push(o);
      else harita.set(a, [o]);
    }
    return harita;
  });

  /** Hucreye sigan etkinlik sayisi. Fazlasi "+N daha" olarak toplanir. */
  const AZAMI = 3;

  function ayinIcinde(g: Date): boolean {
    return g.getMonth() === ay.getMonth() && g.getFullYear() === ay.getFullYear();
  }
</script>

<div class="izgara" role="grid" aria-label="Ay görünümü">
  <div class="basliklar" role="row">
    {#each basliklar as b, i (i)}
      <div class="baslik" role="columnheader">{b}</div>
    {/each}
  </div>

  <div class="hucreler">
    {#each gunler as g (g.getTime())}
      {@const anahtar = gunAnahtari(g)}
      {@const gunun = gunlere_gore.get(anahtar) ?? []}
      {@const bugun = ayniGun(g, simdi)}
      <div
        class="hucre"
        class:disar={!ayinIcinde(g)}
        class:secili={ayniGun(g, secili)}
        role="gridcell"
        tabindex="0"
        aria-label={g.toLocaleDateString('tr-TR', { dateStyle: 'long' })}
        onclick={() => onGunSec(g)}
        ondblclick={() => onGunAc(g)}
        onkeydown={(e) => {
          if (e.key === 'Enter') onGunAc(g);
          if (e.key === ' ') { e.preventDefault(); onGunSec(g); }
        }}
      >
        <div class="gun-no zaman" class:bugun>{g.getDate()}</div>

        <div class="olusumlar">
          {#each gunun.slice(0, AZAMI) as o (o.etkinlik.id + o.baslangic.getTime())}
            <button
              class="cip"
              class:tamam={o.tamamlandi}
              class:gecmis={!o.tamamlandi && o.baslangic < simdi}
              style:--renk={o.renk}
              onclick={(e) => { e.stopPropagation(); onOlusumAc(o); }}
              title={`${saatBicim(o.baslangic, depo.ayarlar.saat24)} ${o.etkinlik.baslik}`}
            >
              <span class="cip-renk"></span>
              <span class="cip-saat zaman">{saatBicim(o.baslangic, depo.ayarlar.saat24)}</span>
              <span class="cip-baslik">{o.etkinlik.baslik}</span>
            </button>
          {/each}

          {#if gunun.length > AZAMI}
            <button
              class="daha"
              onclick={(e) => { e.stopPropagation(); onGunAc(g); }}
            >
              +{gunun.length - AZAMI} daha
            </button>
          {/if}
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .izgara {
    display: grid;
    grid-template-rows: auto 1fr;
    height: 100%;
    min-height: 0;
  }

  .basliklar {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    border-bottom: 1px solid var(--ayrac);
  }
  .baslik {
    padding: var(--b2) var(--b3);
    font-size: 11px;
    font-weight: 500;
    color: var(--kagit-3);
  }

  .hucreler {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    grid-auto-rows: 1fr;
    min-height: 0;
  }

  .hucre {
    display: grid;
    grid-template-rows: auto 1fr;
    gap: 3px;
    min-width: 0;
    min-height: 0;
    padding: var(--b2) 5px;
    border-right: 1px solid var(--ayrac);
    border-bottom: 1px solid var(--ayrac);
    overflow: hidden;
    transition: background var(--gecis-hizli);
  }
  .hucre:nth-child(7n) { border-right: none; }
  .hucre:hover { background: var(--murekkep-2); }
  .hucre.secili { background: var(--pirinc-sonuk); }
  .hucre.disar .gun-no { color: var(--kagit-3); opacity: 0.55; }
  .hucre.disar .cip { opacity: 0.55; }

  .gun-no {
    padding-left: 3px;
    font-size: 12px;
    font-weight: 500;
    color: var(--kagit-2);
    line-height: 1.4;
  }
  /* Bugun kirmizi: takvim yapraginda da bugun kirmizidir. */
  .gun-no.bugun {
    display: inline-grid;
    place-items: center;
    justify-self: start;
    min-width: 21px;
    height: 21px;
    padding: 0 5px;
    border-radius: 99px;
    background: var(--kirmizi);
    color: #fff;
    font-weight: 600;
  }

  .olusumlar {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-height: 0;
    overflow: hidden;
  }

  .cip {
    display: grid;
    grid-template-columns: 3px auto 1fr;
    align-items: center;
    gap: 5px;
    width: 100%;
    padding: 2px 4px;
    border-radius: 3px;
    text-align: left;
    transition: background var(--gecis-hizli);
  }
  .cip:hover { background: var(--murekkep-3); }
  .cip-renk {
    width: 3px;
    height: 11px;
    border-radius: 2px;
    background: var(--renk);
  }
  .cip-saat {
    font-size: 10px;
    color: var(--kagit-3);
  }
  .cip-baslik {
    font-size: 11.5px;
    color: var(--kagit);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cip.gecmis .cip-baslik { color: var(--kagit-2); }
  .cip.tamam .cip-baslik {
    color: var(--kagit-3);
    text-decoration: line-through;
  }
  .cip.tamam .cip-renk { background: var(--zeytin); }

  .daha {
    padding: 1px 4px 1px 11px;
    font-size: 10.5px;
    color: var(--kagit-3);
    text-align: left;
  }
  .daha:hover { color: var(--kagit); }
</style>
