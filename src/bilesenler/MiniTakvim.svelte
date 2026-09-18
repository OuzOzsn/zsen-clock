<script lang="ts">
  /**
   * Yan paneldeki kucuk takvim. Isi gezinmek, icerik gostermek degil - bu
   * yuzden etkinlikler burada baslik olarak degil, gunun altindaki kucuk bir
   * nokta olarak gorunuyor: "o gun bir sey var mi" sorusuna cevap veriyor.
   */
  import { ayEkle, ayIzgarasi, ayniGun, gunAnahtari } from '../lib/tarih.ts';
  import { AY_UZUN, GUN_KISA, type Olusum } from '../lib/tipler.ts';
  import { depo } from '../lib/veri.svelte.ts';

  interface Ozellikler {
    secili: Date;
    simdi: Date;
    /** Nokta gosterebilmek icin gorunur araliktaki olusumlar. */
    olusumlar: Olusum[];
    onSec: (g: Date) => void;
  }
  let { secili, simdi, olusumlar, onSec }: Ozellikler = $props();

  // Gosterilen ay bilerek yerel durum DEGIL: secili gunden turetiliyor.
  // Boylece mini takvim ile ana gorunum hicbir zaman birbirinden ayrilmiyor;
  // oklar da secimi tasiyor, ayri bir "goruntulenen ay" kavrami olusmuyor.
  const gosterilenAy = $derived(new Date(secili.getFullYear(), secili.getMonth(), 1));

  const ilkGun = $derived(depo.ayarlar.haftanin_ilk_gunu || 1);
  const gunler = $derived(ayIzgarasi(gosterilenAy, ilkGun));
  const basliklar = $derived(
    Array.from({ length: 7 }, (_, i) => GUN_KISA[((ilkGun - 1 + i) % 7) + 1] ?? ''),
  );

  const doluGunler = $derived(new Set(olusumlar.map((o) => gunAnahtari(o.baslangic))));
</script>

<div class="mini">
  <div class="ust">
    <span class="ay-adi">
      {AY_UZUN[gosterilenAy.getMonth()]}
      <span class="yil zaman">{gosterilenAy.getFullYear()}</span>
    </span>
    <div class="ok-grup">
      <button
        class="ok"
        onclick={() => onSec(ayEkle(secili, -1))}
        aria-label="Önceki ay"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M7.5 2.5L4 6l3.5 3.5" stroke="currentColor" stroke-width="1.4"
            stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      <button
        class="ok"
        onclick={() => onSec(ayEkle(secili, 1))}
        aria-label="Sonraki ay"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M4.5 2.5L8 6l-3.5 3.5" stroke="currentColor" stroke-width="1.4"
            stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    </div>
  </div>

  <div class="izgara">
    <!-- Iki harf sart: tek harfle Pzt/Per/Paz ucu de "P" oluyor. -->
    {#each basliklar as b, i (i)}
      <div class="basharf">{b.slice(0, 2)}</div>
    {/each}

    {#each gunler as g (g.getTime())}
      <button
        class="gun zaman"
        class:disar={g.getMonth() !== gosterilenAy.getMonth()}
        class:bugun={ayniGun(g, simdi)}
        class:secili={ayniGun(g, secili)}
        class:dolu={doluGunler.has(gunAnahtari(g))}
        onclick={() => onSec(g)}
        aria-label={g.toLocaleDateString('tr-TR', { dateStyle: 'long' })}
      >
        {g.getDate()}
      </button>
    {/each}
  </div>
</div>

<style>
  .mini { display: grid; gap: var(--b2); }

  .ust {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .ay-adi {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--kagit);
  }
  .yil { color: var(--kagit-3); font-weight: 400; }

  .ok-grup { display: flex; gap: 1px; }
  .ok {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: var(--yuvarlak-dugme);
    color: var(--kagit-3);
    transition: color var(--gecis-hizli), background var(--gecis-hizli);
  }
  .ok:hover { color: var(--kagit); background: var(--murekkep-3); }

  .izgara {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 1px;
  }

  .basharf {
    padding-bottom: 2px;
    font-size: 10px;
    color: var(--kagit-3);
    text-align: center;
  }

  .gun {
    position: relative;
    display: grid;
    place-items: center;
    height: 24px;
    border-radius: var(--yuvarlak-dugme);
    font-size: 11.5px;
    color: var(--kagit-2);
    transition: background var(--gecis-hizli), color var(--gecis-hizli);
  }
  .gun:hover { background: var(--murekkep-3); color: var(--kagit); }
  .gun.disar { color: var(--kagit-3); opacity: 0.5; }

  /* Etkinlik olan gunlerin altinda kucuk nokta. */
  .gun.dolu::after {
    content: '';
    position: absolute;
    bottom: 2px;
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: var(--kagit-3);
  }

  .gun.secili {
    background: var(--pirinc);
    color: var(--pirinc-ustu);
    font-weight: 600;
  }
  .gun.secili.dolu::after { background: var(--pirinc-ustu); opacity: 0.6; }

  .gun.bugun { color: var(--kirmizi); font-weight: 600; }
  .gun.bugun.secili { color: var(--pirinc-ustu); }
</style>
