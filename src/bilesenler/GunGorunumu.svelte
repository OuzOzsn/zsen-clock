<script lang="ts">
  /**
   * Gun ve hafta gorunumu - ikisi de ayni zaman izgarasi, tek fark sutun sayisi.
   *
   * Kirmizi yatay cizgi "simdi"yi gosterir; tasarim dilinde kirmizi zaten
   * yalnizca bu anlama geliyor, bu yuzden ayrica etiket gerekmiyor.
   *
   * Etkinlikler suruklenerek tasinir, alt kenarindan cekilerek uzatilir.
   * Tekrarlayan etkinliklerde yalnizca SAAT degisir, gun degismez: "her pzt
   * car cum" olan bir etkinligi sali sutununa birakmak ne anlama geldigi
   * belirsiz olurdu. Saat degisikligi tum tekrarlara islenir.
   */
  import { untrack } from 'svelte';
  import { ayniGun, gunEkle, gunIciDakika, saatBicim } from '../lib/tarih.ts';
  import { isoCoz, yerelISO } from '../lib/ipc.ts';
  import { AY_UZUN, GUN_KISA, type Olusum } from '../lib/tipler.ts';
  import { depo } from '../lib/veri.svelte.ts';

  interface Ozellikler {
    bas: Date;
    gunSayisi: number;
    simdi: Date;
    olusumlar: Olusum[];
    onOlusumAc: (o: Olusum) => void;
    onBosAlan: (an: Date) => void;
  }
  let { bas, gunSayisi, simdi, olusumlar, onOlusumAc, onBosAlan }: Ozellikler = $props();

  /** Bir saatin piksel yuksekligi. 15 dakikalik farklar ayirt edilebilsin diye 52. */
  const SAAT_YUKSEKLIGI = 52;
  const TOPLAM = SAAT_YUKSEKLIGI * 24;
  /** Surukleme bu kadar dakikaya yuvarlanir. */
  const ADIM_DK = 15;
  /** Bu esigin altindaki hareket tiklama sayilir, surukleme degil. */
  const SURUKLEME_ESIGI_PX = 4;
  /** Blogun alt kenarinda uzatma icin ayrilan bant. */
  const UZATMA_BANDI_PX = 7;

  const gunler = $derived(Array.from({ length: gunSayisi }, (_, i) => gunEkle(bas, i)));
  const saatler = Array.from({ length: 24 }, (_, i) => i);

  let izgara: HTMLDivElement | undefined = $state();
  let ic: HTMLDivElement | undefined = $state();

  // Gorunum acildiginda (ve baska bir gune gecildiginde) ilgili saate kaydir.
  // `simdi` bilerek untrack icinde: saniyede bir degistigi icin izlenirse
  // efekt her saniye calisip kullanicinin kaydirmasini geri aliyor.
  $effect(() => {
    void bas;
    const el = izgara;
    if (!el) return;
    untrack(() => {
      const hedef = ayniGun(simdi, bas) ? gunIciDakika(simdi) - 120 : 7 * 60;
      el.scrollTop = Math.max(0, (hedef / 60) * SAAT_YUKSEKLIGI);
    });
  });

  // ----------------------------------------------------------- surukleme

  type Surukleme = {
    olusum: Olusum;
    mod: 'tasi' | 'uzat';
    basX: number;
    basY: number;
    dakika: number; // yuvarlanmis saat farki
    gun: number; // yuvarlanmis gun farki (yalnizca tasima, tekrarsizsa)
    hareket: boolean; // esik asildi mi
  };

  let surukleme = $state<Surukleme | null>(null);

  function surukleBasla(e: PointerEvent, o: Olusum, blokYukseklik: number) {
    if (e.button !== 0) return;
    const hedef = e.currentTarget as HTMLElement;
    const yerel = e.clientY - hedef.getBoundingClientRect().top;
    // Alt kenardan tutulduysa uzatma, degilse tasima.
    const mod: Surukleme['mod'] =
      o.bitis && blokYukseklik - yerel <= UZATMA_BANDI_PX ? 'uzat' : 'tasi';

    hedef.setPointerCapture(e.pointerId);
    surukleme = { olusum: o, mod, basX: e.clientX, basY: e.clientY, dakika: 0, gun: 0, hareket: false };
  }

  function surukleHareket(e: PointerEvent) {
    const s = surukleme;
    if (!s) return;

    const dy = e.clientY - s.basY;
    const dx = e.clientX - s.basX;
    if (!s.hareket && Math.hypot(dx, dy) < SURUKLEME_ESIGI_PX) return;
    s.hareket = true;

    const hamDakika = (dy / SAAT_YUKSEKLIGI) * 60;
    s.dakika = Math.round(hamDakika / ADIM_DK) * ADIM_DK;

    // Gun degisimi yalnizca tasimada, yalnizca tekrarsiz etkinlikte ve
    // yalnizca hafta gorunumunde anlamli.
    // Programa bagli bir kopya baska gune tasinirsa `program.gun` ile
    // gercek tarihi ayrisir; sapma listesi ve "programa döndür" bozulur.
    if (
      s.mod === 'tasi' &&
      gunSayisi > 1 &&
      s.olusum.etkinlik.tekrar.tip === 'yok' &&
      !s.olusum.etkinlik.program &&
      ic
    ) {
      const sutunGenisligi = (ic.clientWidth - 52) / gunSayisi;
      s.gun = Math.round(dx / sutunGenisligi);
    }
  }

  async function surukleBitir(e: PointerEvent) {
    const s = surukleme;
    surukleme = null;
    if (!s) return;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);

    // Hic kipirdamadiysa bu bir tiklama: formu ac.
    if (!s.hareket || (s.dakika === 0 && s.gun === 0)) {
      onOlusumAc(s.olusum);
      return;
    }
    await kaydet(s);
  }

  async function kaydet(s: Surukleme) {
    const e = structuredClone($state.snapshot(s.olusum.etkinlik));
    const sure =
      s.olusum.bitis ? s.olusum.bitis.getTime() - s.olusum.baslangic.getTime() : 0;

    // Program serisinde surukleme yalnizca o gunu degistirir. Seri kaydinin
    // baslangicini kaydirmak programin tamamini - gecmis haftalar dahil -
    // oynatirdi; oysa "bugun bir saat geç başlayacağım" tek gune ait bir soz.
    if (e.program && !e.program.gun) {
      const yeniBas = new Date(s.olusum.baslangic);
      let yeniSure = sure;
      if (s.mod === 'uzat') {
        yeniSure = Math.max(ADIM_DK, sure / 60000 + s.dakika) * 60000;
      } else {
        yeniBas.setMinutes(yeniBas.getMinutes() + s.dakika);
      }
      await depo.olusumAyir(e.id, s.olusum.baslangic, {
        ...e,
        id: '',
        baslangic: yerelISO(yeniBas),
        bitis: yeniSure > 0 ? yerelISO(new Date(yeniBas.getTime() + yeniSure)) : null,
        tamamlananlar: [],
        olusturuldu: null,
        guncellendi: null,
      });
      return;
    }

    if (s.mod === 'uzat') {
      // Sure en az bir adim kalsin, negatife dusmesin.
      const yeniSure = Math.max(ADIM_DK, sure / 60000 + s.dakika);
      const bitis = new Date(s.olusum.baslangic.getTime() + yeniSure * 60000);
      e.bitis = yerelISO(bitis);
    } else {
      // Etkinligin kendi baslangicini kaydiriyoruz (tekrar capasi da bu).
      const eski = isoCoz(e.baslangic);
      const yeni = new Date(eski);
      yeni.setMinutes(yeni.getMinutes() + s.dakika);
      if (s.gun !== 0) yeni.setDate(yeni.getDate() + s.gun);
      e.baslangic = yerelISO(yeni);
      if (sure > 0) e.bitis = yerelISO(new Date(yeni.getTime() + sure));
    }

    await depo.kaydet(e);
  }

  /** Suruklenen blogun onizleme kaymasi (piksel). */
  function kayma(o: Olusum): { ust: number; boy: number; sutun: number } {
    const s = surukleme;
    if (!s || !s.hareket || s.olusum.etkinlik.id !== o.etkinlik.id) {
      return { ust: 0, boy: 0, sutun: 0 };
    }
    if (s.olusum.baslangic.getTime() !== o.baslangic.getTime()) {
      return { ust: 0, boy: 0, sutun: 0 };
    }
    const px = (s.dakika / 60) * SAAT_YUKSEKLIGI;
    return s.mod === 'uzat'
      ? { ust: 0, boy: px, sutun: 0 }
      : { ust: px, boy: 0, sutun: s.gun };
  }

  // --------------------------------------------------------------- yerlesim

  /**
   * Ayni gundeki cakisan etkinlikleri yan yana yerlestirir.
   * Zamana gore siralanmis kayitlar uzerinde gezilir, cakisan her grup kendi
   * icinde esit sutunlara bolunur.
   */
  function yerlesim(gun: Date) {
    const gunun = olusumlar
      .filter((o) => ayniGun(o.baslangic, gun))
      .sort((a, b) => a.baslangic.getTime() - b.baslangic.getTime());

    type Yerlesmis = { o: Olusum; ust: number; boy: number; sutun: number; toplam: number };
    const sonuc: Yerlesmis[] = [];
    let grup: Olusum[] = [];
    let grupSonu = -1;

    const grubuBitir = () => {
      grup.forEach((o, i) => {
        const bitis = o.bitis ?? new Date(o.baslangic.getTime() + 30 * 60000);
        const basDk = gunIciDakika(o.baslangic);
        const sonDk = Math.min(1440, basDk + (bitis.getTime() - o.baslangic.getTime()) / 60000);
        sonuc.push({
          o,
          ust: (basDk / 60) * SAAT_YUKSEKLIGI,
          boy: Math.max(20, ((sonDk - basDk) / 60) * SAAT_YUKSEKLIGI),
          sutun: i,
          toplam: grup.length,
        });
      });
      grup = [];
      grupSonu = -1;
    };

    for (const o of gunun) {
      const basDk = gunIciDakika(o.baslangic);
      const bitis = o.bitis ?? new Date(o.baslangic.getTime() + 30 * 60000);
      const sonDk = basDk + (bitis.getTime() - o.baslangic.getTime()) / 60000;
      if (grup.length > 0 && basDk >= grupSonu) grubuBitir();
      grup.push(o);
      grupSonu = Math.max(grupSonu, sonDk);
    }
    if (grup.length > 0) grubuBitir();

    return sonuc;
  }

  /** Bos alana tiklayinca o saate yeni etkinlik. 15 dakikaya yuvarlanir. */
  function bosaTikla(gun: Date, e: MouseEvent) {
    if (surukleme) return;
    const hedef = e.currentTarget as HTMLElement;
    const y = e.clientY - hedef.getBoundingClientRect().top;
    const dakika = Math.round(((y / SAAT_YUKSEKLIGI) * 60) / ADIM_DK) * ADIM_DK;
    const an = new Date(gun);
    an.setHours(0, Math.min(1425, Math.max(0, dakika)), 0, 0);
    onBosAlan(an);
  }

  const simdiUst = $derived((gunIciDakika(simdi) / 60) * SAAT_YUKSEKLIGI);

  /** Surukleme sirasinda ustte gosterilen canli saat. */
  const surukIpucu = $derived.by(() => {
    const s = surukleme;
    if (!s || !s.hareket) return null;
    if (s.mod === 'uzat') {
      const sure =
        (s.olusum.bitis!.getTime() - s.olusum.baslangic.getTime()) / 60000 + s.dakika;
      return `${Math.max(ADIM_DK, Math.round(sure))} dk`;
    }
    const yeni = new Date(s.olusum.baslangic.getTime() + s.dakika * 60000);
    if (s.gun !== 0) yeni.setDate(yeni.getDate() + s.gun);
    return `${saatBicim(yeni, depo.ayarlar.saat24)}${
      s.gun !== 0 ? ` · ${GUN_KISA[yeni.getDay() === 0 ? 7 : yeni.getDay()]}` : ''
    }`;
  });
</script>

<div class="sar">
  <!-- Gun basliklari, kaydirma sirasinda sabit kalir -->
  <div class="basliklar" style:--sutun={gunSayisi}>
    <div class="kose"></div>
    {#each gunler as g (g.getTime())}
      {@const bugun = ayniGun(g, simdi)}
      <div class="gun-basligi" class:bugun>
        <span class="gun-adi">{GUN_KISA[g.getDay() === 0 ? 7 : g.getDay()]}</span>
        <span class="gun-no zaman">{g.getDate()}</span>
        {#if gunSayisi === 1}
          <span class="ay-adi">{AY_UZUN[g.getMonth()]}</span>
        {/if}
      </div>
    {/each}
  </div>

  <div class="izgara" bind:this={izgara}>
    <div class="ic" bind:this={ic} style:height="{TOPLAM}px" style:--sutun={gunSayisi}>
      <!-- Saat sutunu -->
      <div class="saatler">
        {#each saatler as s (s)}
          <div class="saat-etiketi zaman" style:top="{s * SAAT_YUKSEKLIGI}px">
            {String(s).padStart(2, '0')}:00
          </div>
        {/each}
      </div>

      <!-- Gun sutunlari -->
      {#each gunler as g, gi (g.getTime())}
        <div
          class="sutun"
          style:grid-column={gi + 2}
          onclick={(e) => bosaTikla(g, e)}
          onkeydown={(e) => { if (e.key === 'Enter') onBosAlan(g); }}
          role="button"
          tabindex="-1"
          aria-label="{g.toLocaleDateString('tr-TR', { dateStyle: 'long' })} — boş alana tıklayarak etkinlik ekle"
        >
          {#each saatler as s (s)}
            <div class="saat-cizgisi" style:top="{s * SAAT_YUKSEKLIGI}px"></div>
          {/each}

          {#each yerlesim(g) as y (y.o.etkinlik.id + y.o.baslangic.getTime())}
            {@const k = kayma(y.o)}
            {@const suruklenen = k.ust !== 0 || k.boy !== 0 || k.sutun !== 0}
            <div
              class="blok"
              class:tamam={y.o.tamamlandi}
              class:gecmis={!y.o.tamamlandi && y.o.baslangic < simdi}
              class:kisa={y.boy + k.boy < 34}
              class:suruklenen
              style:--renk={y.o.renk}
              style:top="{y.ust + k.ust}px"
              style:height="{Math.max(18, y.boy + k.boy) - 2}px"
              style:left="calc({(y.sutun / y.toplam) * 100}% + 2px + {k.sutun * 100}%)"
              style:width="calc({100 / y.toplam}% - 4px)"
              role="button"
              tabindex="0"
              aria-label="{y.o.etkinlik.baslik} — sürükleyerek saatini değiştir"
              onpointerdown={(e) => surukleBasla(e, y.o, y.boy)}
              onpointermove={surukleHareket}
              onpointerup={surukleBitir}
              onpointercancel={() => (surukleme = null)}
              onkeydown={(e) => { if (e.key === 'Enter') onOlusumAc(y.o); }}
              onclick={(e) => e.stopPropagation()}
            >
              <span class="blok-baslik">{y.o.etkinlik.baslik}</span>
              {#if y.boy + k.boy >= 34}
                <span class="blok-saat zaman">
                  {saatBicim(y.o.baslangic, depo.ayarlar.saat24)}
                </span>
              {/if}
              {#if y.o.bitis}
                <span class="uzatma-tutamagi" aria-hidden="true"></span>
              {/if}
            </div>
          {/each}

          {#if ayniGun(g, simdi)}
            <div class="simdi" style:top="{simdiUst}px" aria-label="şu an"></div>
          {/if}
        </div>
      {/each}
    </div>
  </div>

  {#if surukIpucu}
    <div class="suruk-ipucu zaman">{surukIpucu}</div>
  {/if}
</div>

<style>
  .sar {
    position: relative;
    display: grid;
    grid-template-rows: auto 1fr;
    height: 100%;
    min-height: 0;
  }

  .basliklar {
    display: grid;
    grid-template-columns: 52px repeat(var(--sutun), 1fr);
    border-bottom: 1px solid var(--ayrac);
  }
  .kose { border-right: 1px solid var(--ayrac); }

  .gun-basligi {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: var(--b2) var(--b3);
    border-right: 1px solid var(--ayrac);
  }
  .gun-basligi:last-child { border-right: none; }
  .gun-adi { font-size: 11px; font-weight: 500; color: var(--kagit-3); }
  .gun-no {
    font-size: 15px;
    font-weight: 600;
    color: var(--kagit);
    letter-spacing: -0.02em;
  }
  .ay-adi { font-size: 11.5px; color: var(--kagit-3); }
  .gun-basligi.bugun .gun-no,
  .gun-basligi.bugun .gun-adi { color: var(--kirmizi); }

  .izgara { overflow-y: auto; min-height: 0; }
  .ic {
    position: relative;
    display: grid;
    grid-template-columns: 52px repeat(var(--sutun), 1fr);
  }

  .saatler {
    position: relative;
    grid-column: 1;
    border-right: 1px solid var(--ayrac);
  }
  .saat-etiketi {
    position: absolute;
    right: var(--b2);
    transform: translateY(-50%);
    font-size: 10.5px;
    color: var(--kagit-3);
  }
  .saat-etiketi:first-child { transform: none; }

  .sutun {
    position: relative;
    border-right: 1px solid var(--ayrac);
    cursor: crosshair;
  }
  .sutun:last-child { border-right: none; }

  .saat-cizgisi {
    position: absolute;
    left: 0;
    right: 0;
    border-top: 1px solid var(--ayrac);
  }

  .blok {
    position: absolute;
    display: grid;
    align-content: start;
    gap: 1px;
    padding: 3px var(--b2);
    border-left: 2px solid var(--renk);
    border-radius: 3px;
    background: color-mix(in srgb, var(--renk) 17%, var(--murekkep));
    text-align: left;
    overflow: hidden;
    cursor: grab;
    touch-action: none; /* dokunmatikte kaydirma yerine surukleme */
    transition: background var(--gecis-hizli);
  }
  .blok:hover { background: color-mix(in srgb, var(--renk) 27%, var(--murekkep)); }
  .blok.suruklenen {
    cursor: grabbing;
    z-index: 3;
    box-shadow: var(--golge-panel);
    background: color-mix(in srgb, var(--renk) 34%, var(--murekkep));
    transition: none; /* surukleme aninda gecikme olmasin */
  }

  .blok-baslik {
    font-size: 11.5px;
    font-weight: 500;
    color: var(--kagit);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    pointer-events: none;
  }
  .blok-saat { font-size: 10.5px; color: var(--kagit-2); pointer-events: none; }

  /* Alt kenardaki uzatma bandi: imleci degistirir, blogun kendisi tasinir. */
  .uzatma-tutamagi {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 7px;
    cursor: ns-resize;
  }

  .blok.kisa { align-content: center; padding-block: 0; }
  .blok.gecmis { opacity: 0.7; }
  .blok.tamam {
    border-left-color: var(--zeytin);
    background: var(--zeytin-sonuk);
  }
  .blok.tamam .blok-baslik {
    color: var(--kagit-3);
    text-decoration: line-through;
  }

  .simdi {
    position: absolute;
    left: 0;
    right: 0;
    height: 1px;
    background: var(--kirmizi);
    pointer-events: none;
    z-index: 2;
  }
  .simdi::before {
    content: '';
    position: absolute;
    left: -3px;
    top: -2.5px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--kirmizi);
  }

  /* Surukleme sirasinda yeni saati soyleyen kucuk etiket. Blogun ustunde
     degil sabit bir yerde duruyor: blok parmagin altinda kaliyor. */
  .suruk-ipucu {
    position: absolute;
    top: var(--b3);
    left: 50%;
    transform: translateX(-50%);
    padding: 5px var(--b3);
    background: var(--pirinc);
    color: var(--pirinc-ustu);
    border-radius: var(--yuvarlak-dugme);
    font-size: 12px;
    font-weight: 600;
    box-shadow: var(--golge-panel);
    pointer-events: none;
    z-index: 5;
  }
</style>
