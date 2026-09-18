<script lang="ts">
  /**
   * Ajanda: siradaki gunlerin duz listesi.
   *
   * Ay izgarasi "ne zaman" sorusuna, ajanda "sirada ne var" sorusuna cevap
   * verir. Uzun bir plani bastan sona okumak icin en rahat gorunum bu.
   */
  import { ayniGun, gunAnahtari, saatBicim, sureMetni } from '../lib/tarih.ts';
  import { AY_UZUN, GUN_UZUN, type Olusum } from '../lib/tipler.ts';
  import { depo } from '../lib/veri.svelte.ts';

  interface Ozellikler {
    olusumlar: Olusum[];
    simdi: Date;
    onOlusumAc: (o: Olusum) => void;
    onTamamla: (o: Olusum) => void;
  }
  let { olusumlar, simdi, onOlusumAc, onTamamla }: Ozellikler = $props();

  /** Gune gore gruplanmis, zaman sirasinda. */
  const gruplar = $derived.by(() => {
    const harita = new Map<string, { gun: Date; kayitlar: Olusum[] }>();
    for (const o of olusumlar) {
      const a = gunAnahtari(o.baslangic);
      const g = harita.get(a);
      if (g) g.kayitlar.push(o);
      else harita.set(a, { gun: new Date(o.baslangic), kayitlar: [o] });
    }
    return [...harita.values()];
  });
</script>

{#if gruplar.length === 0}
  <div class="bos">
    <p class="bos-baslik">Bu aralıkta kayıt yok</p>
    <p class="bos-alt">Sol paneldeki hızlı ekleme kutusundan eklenebilir.</p>
  </div>
{:else}
  <div class="ajanda">
    {#each gruplar as grup (grup.gun.getTime())}
      {@const bugun = ayniGun(grup.gun, simdi)}
      <section class="grup">
        <!-- Takvim yapragi: buyuk gun rakami burada yerinde duruyor. -->
        <header class="gun-basligi" class:bugun>
          <span class="gun-no zaman">{grup.gun.getDate()}</span>
          <span class="gun-yazi">
            <span class="gun-adi">
              {GUN_UZUN[grup.gun.getDay() === 0 ? 7 : grup.gun.getDay()]}
            </span>
            <span class="ay-adi">
              {AY_UZUN[grup.gun.getMonth()]}
              {#if grup.gun.getFullYear() !== simdi.getFullYear()}
                <span class="zaman">{grup.gun.getFullYear()}</span>
              {/if}
            </span>
          </span>
          {#if bugun}<span class="rozet">bugün</span>{/if}
        </header>

        <div class="kayitlar">
          {#each grup.kayitlar as o (o.etkinlik.id + o.baslangic.getTime())}
            <div
              class="satir"
              class:tamam={o.tamamlandi}
              class:gecmis={!o.tamamlandi && o.baslangic < simdi}
            >
              <button
                class="kutu"
                style:--renk={o.renk}
                onclick={() => onTamamla(o)}
                aria-label={o.tamamlandi ? 'Tamamlandı işaretini kaldır' : 'Tamamlandı işaretle'}
              >
                {#if o.tamamlandi}
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path d="M2.5 6.3l2.4 2.4 4.6-5" stroke="currentColor" stroke-width="1.8"
                      stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                {/if}
              </button>

              <button class="icerik" onclick={() => onOlusumAc(o)}>
                <span class="saat zaman">{saatBicim(o.baslangic, depo.ayarlar.saat24)}</span>
                <span class="baslik">{o.etkinlik.baslik}</span>
                <span class="ek">
                  {#if o.bitis}
                    {sureMetni(Math.round((o.bitis.getTime() - o.baslangic.getTime()) / 60000))}
                  {/if}
                  {#if o.etkinlik.tekrar.tip !== 'yok'}
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none"
                      aria-label="tekrarlıyor">
                      <path d="M2 5a3.4 3.4 0 015.8-2.2L9.5 4M10 7a3.4 3.4 0 01-5.8 2.2L2.5 8"
                        stroke="currentColor" stroke-width="1.2" stroke-linecap="round"
                        stroke-linejoin="round" />
                      <path d="M9.5 1.6V4H7.2M2.5 10.4V8h2.3" stroke="currentColor"
                        stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                  {/if}
                </span>
              </button>
            </div>
          {/each}
        </div>
      </section>
    {/each}
  </div>
{/if}

<style>
  .ajanda {
    height: 100%;
    overflow-y: auto;
    padding: var(--b4) var(--b5) var(--b7);
  }

  .grup + .grup { margin-top: var(--b5); }

  .gun-basligi {
    display: flex;
    align-items: baseline;
    gap: var(--b3);
    padding-bottom: var(--b2);
    border-bottom: 1px solid var(--ayrac);
  }
  .gun-no {
    font-size: 28px;
    font-weight: 600;
    line-height: 1;
    letter-spacing: -0.03em;
    color: var(--kagit);
  }
  .gun-basligi.bugun .gun-no { color: var(--kirmizi); }

  .gun-yazi { display: grid; gap: 0; }
  .gun-adi { font-size: 12.5px; font-weight: 500; color: var(--kagit-2); }
  .ay-adi { font-size: 11.5px; color: var(--kagit-3); }

  .rozet {
    margin-left: auto;
    align-self: center;
    padding: 2px 8px;
    border-radius: 99px;
    background: var(--kirmizi-sonuk);
    color: var(--kirmizi);
    font-size: 10.5px;
    font-weight: 500;
  }

  .kayitlar { padding-top: var(--b2); }

  .satir {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: var(--b3);
    padding: 3px 0;
  }

  .kutu {
    display: grid;
    place-items: center;
    width: 16px;
    height: 16px;
    border: 1.5px solid var(--renk);
    border-radius: 3px;
    color: var(--murekkep);
    transition: background var(--gecis-hizli);
  }
  .satir.tamam .kutu { background: var(--zeytin); border-color: var(--zeytin); }

  .icerik {
    display: grid;
    grid-template-columns: 52px 1fr auto;
    align-items: center;
    gap: var(--b3);
    min-width: 0;
    padding: 5px var(--b2);
    border-radius: var(--yuvarlak-dugme);
    text-align: left;
    transition: background var(--gecis-hizli);
  }
  .icerik:hover { background: var(--murekkep-2); }

  .saat { font-size: 12px; color: var(--kagit-2); }
  .baslik {
    font-size: 13.5px;
    color: var(--kagit);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ek {
    display: flex;
    align-items: center;
    gap: var(--b2);
    font-size: 11.5px;
    color: var(--kagit-3);
  }

  .satir.gecmis .saat,
  .satir.gecmis .baslik { color: var(--kagit-2); }
  .satir.tamam .baslik {
    color: var(--kagit-3);
    text-decoration: line-through;
  }
  .satir.tamam .saat { color: var(--kagit-3); }

  .bos {
    display: grid;
    align-content: center;
    justify-items: center;
    gap: var(--b2);
    height: 100%;
    text-align: center;
  }
  .bos-baslik { font-size: 15px; color: var(--kagit-2); }
  .bos-alt { font-size: 12.5px; color: var(--kagit-3); }
</style>
