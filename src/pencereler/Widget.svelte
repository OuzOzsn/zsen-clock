<script lang="ts">
  /**
   * Masaustune sabitlenen widget.
   *
   * Tasarim karari: burasi OKUNMAZ, GOZ UCUYLA BAKILIR. Bu yuzden ekranda tek
   * bir buyuk sey var - siradaki seye kalan sure. Gerisi sessiz duruyor.
   * Bugunun listesinde kirmizi "simdi" cizgisi gecmisi gelecekten ayiriyor;
   * boylece nerede oldugunu okumadan, bakarak anliyorsun.
   */
  import { onMount } from 'svelte';
  import { depo, saatiBaslat } from '../lib/veri.svelte.ts';
  import { geriSayimParcali, gunBasi, gunEkle, saatBicim, sureMetni } from '../lib/tarih.ts';
  import { AY_UZUN, GUN_UZUN, type Olusum } from '../lib/tipler.ts';
  import { cagir, TAURI_ICINDE } from '../lib/ipc.ts';

  onMount(() => {
    const durdur = saatiBaslat();
    void depo.yukle();
    void depo.dinlemeyeBasla();
    return durdur;
  });

  const simdi = $derived(depo.simdi);
  const bugun = $derived(gunBasi(simdi));
  const gununler = $derived(depo.yuklendi ? depo.gununOlusumlari(bugun) : []);

  /** Henuz saati gelmemis ilk is - geri sayim buna kurulur. */
  const siradaki = $derived(gununler.find((o) => !o.tamamlandi && o.baslangic > simdi) ?? null);
  /** Saati gecmis ama tamamlanmamis isler. Bunlar "bitti" sayilmaz. */
  const geciken = $derived(
    gununler.filter((o) => !o.tamamlandi && o.baslangic <= simdi).length,
  );
  const bekleyen = $derived(gununler.filter((o) => !o.tamamlandi).length);

  /** "Simdi" cizgisinin listede kacinci sirada duracagi. */
  const simdiIndeksi = $derived(gununler.findIndex((o) => o.baslangic > simdi));

  const kompakt = $derived(depo.ayarlar.widget_boyut === 'kompakt');

  /**
   * Bugun yapilacak bir sey kalmadiginda widget bos bir kutuya donusuyordu.
   * O bosluga yarinin ilk maddeleri giriyor - aksam saatlerinde "yarin ne var"
   * sorusu, "bugun ne kaldi" sorusundan daha faydali.
   */
  const YARIN_AZAMI = 4;
  const yarininlar = $derived(
    depo.yuklendi && !siradaki
      ? depo.gununOlusumlari(gunEkle(bugun, 1)).slice(0, YARIN_AZAMI)
      : [],
  );

  let fareUzerinde = $state(false);

  /**
   * Widget'in saydamligi. Iki ayar birlesiyor:
   *  - widget_saydamlik: genel seviye
   *  - widget_hoverda_saydamlas: fare uzerindeyken altindakini gorebilmek icin
   *    daha da saydamlasir. Kapaliyken fare uzerine gelince TAM opak olur ki
   *    okurken ve tiklarken net gorunsun.
   */
  const saydamlik = $derived.by(() => {
    const taban = depo.ayarlar.widget_saydamlik;
    if (!fareUzerinde) return taban;
    return depo.ayarlar.widget_hoverda_saydamlas ? Math.min(taban, 0.35) : 1;
  });

  async function kapat() {
    if (TAURI_ICINDE) await cagir('widget_gorunurluk', { gorunur: false });
  }

  async function takvimiAc() {
    if (TAURI_ICINDE) await cagir('takvimi_ac');
  }

  /**
   * Kompakt <-> normal gecisi. Pencerenin kendisi de kuculup buyuyor.
   *
   * Yerel durumu HEMEN guncelliyoruz. Eskiden yalnizca Rust'a haber verilip
   * geri gelecek "ayarlar-degisti" olayi bekleniyordu; olay gelmediginde
   * dugme kendini "normal" saniyor ve her basista yine "kompakt" gonderiyordu -
   * yani bir kez kuculup bir daha buyumuyordu. Arayuz durumu bir gidis-donus
   * cevabina bagli olmamali.
   */
  async function kipDegistir() {
    const yeni = kompakt ? 'normal' : 'kompakt';
    depo.ayarlar = { ...depo.ayarlar, widget_boyut: yeni };
    if (TAURI_ICINDE) await cagir('widget_boyut_degistir', { kip: yeni });
    else void depo.ayarKaydet({ widget_boyut: yeni });
  }

  function isaretle(o: Olusum) {
    void depo.tamamla(o, !o.tamamlandi);
  }
</script>

<div
  class="kabuk"
  class:kompakt
  style:opacity={saydamlik}
  onmouseenter={() => (fareUzerinde = true)}
  onmouseleave={() => (fareUzerinde = false)}
  role="presentation"
>
  <!-- Baslik: takvim yapragi. Suruklemek icin buradan tutuluyor. -->
  <header data-tauri-drag-region>
    <!-- Tarih burada baglam, kahraman degil: geri sayimla yarismasin diye
         sessiz tutuluyor. Buyuk gun rakami ana takvim penceresinde. -->
    <div class="tarih" data-tauri-drag-region>
      {#if kompakt}
        <!-- Kompakt kipte dikey yer altin degerinde: tek satir. -->
        <span class="tam-tarih">
          {GUN_UZUN[simdi.getDay() === 0 ? 7 : simdi.getDay()]},
          <span class="zaman">{simdi.getDate()}</span>
          {AY_UZUN[simdi.getMonth()]}
        </span>
      {:else}
        <span class="gun-adi">{GUN_UZUN[simdi.getDay() === 0 ? 7 : simdi.getDay()]}</span>
        <span class="tam-tarih">
          <span class="zaman">{simdi.getDate()}</span>
          {AY_UZUN[simdi.getMonth()]}
        </span>
      {/if}
    </div>
    <div class="baslik-eylem">
      <button
        class="ikon"
        onclick={kipDegistir}
        title={kompakt ? 'Büyüt — günün listesini göster' : 'Küçült — oyun oynarken yolda olmasın'}
        aria-label={kompakt ? 'Büyüt' : 'Küçült'}
      >
        {#if kompakt}
          <!-- disa donuk oklar: buyut -->
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M9.5 2.5H13.5V6.5M6.5 13.5H2.5V9.5M13.5 2.5L9.5 6.5M2.5 13.5L6.5 9.5"
              stroke="currentColor" stroke-width="1.4" stroke-linecap="round"
              stroke-linejoin="round" />
          </svg>
        {:else}
          <!-- ice donuk oklar: kucult -->
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M13 3L9.5 6.5M9.5 6.5V3M9.5 6.5H13M3 13L6.5 9.5M6.5 9.5V13M6.5 9.5H3"
              stroke="currentColor" stroke-width="1.4" stroke-linecap="round"
              stroke-linejoin="round" />
          </svg>
        {/if}
      </button>

      <button class="ikon" onclick={takvimiAc} title="Takvimi aç — etkinlik ekle ve düzenle"
        aria-label="Takvimi aç">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor"
            stroke-width="1.3" />
          <path d="M2 6.5h12M5.5 2v2.4M10.5 2v2.4" stroke="currentColor" stroke-width="1.3"
            stroke-linecap="round" />
          <path d="M5 9.5h2M5 11.5h4.5" stroke="currentColor" stroke-width="1.3"
            stroke-linecap="round" />
        </svg>
      </button>

      <button class="ikon gizle" onclick={kapat}
        title="Tepsiye gizle — uygulama kapanmaz, alarmlar çalmaya devam eder"
        aria-label="Tepsiye gizle">
        <!-- asagi inen ok + taban cizgisi: "tepsiye in" -->
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8 2.5v7M5 7l3 3 3-3M3 13h10" stroke="currentColor" stroke-width="1.4"
            stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    </div>
  </header>

  <!-- Kahraman: siradaki seye kalan sure -->
  <section class="sirada" class:bos={!siradaki} data-tauri-drag-region>
    {#if siradaki}
      {@const sayac = geriSayimParcali(siradaki.baslangic, simdi)}
      <div class="sayac zaman">
        {sayac.ana}{#if sayac.saniye}<span class="saniye">:{sayac.saniye}</span>{/if}
      </div>
      <div class="sirada-baslik" title={siradaki.etkinlik.baslik}>
        {siradaki.etkinlik.baslik}
      </div>
      <div class="sirada-alt">
        <span class="zaman">{saatBicim(siradaki.baslangic, depo.ayarlar.saat24)}</span>
        {#if siradaki.bitis}
          <span class="nokta"></span>
          <span>{sureMetni(
            Math.round((siradaki.bitis.getTime() - siradaki.baslangic.getTime()) / 60000),
          )}</span>
        {/if}
      </div>
    {:else if geciken > 0}
      <!-- Kirmizi burada dogru renk: bunlar gecikmis isler. -->
      <div class="sayac-bos gecikti zaman">{geciken}</div>
      <div class="sirada-baslik gecikti-metin">işin saati geçti</div>
      <div class="sirada-alt tek">Listeden işaretlenebilir ya da ertelenebilir</div>
    {:else}
      <div class="sayac-bos">
        {gununler.length === 0 ? 'Bugün boş' : 'Bugünlük bitti'}
      </div>
      <div class="sirada-alt tek">
        {gununler.length === 0
          ? 'Takvime bir şey eklemek için takvimi aç'
          : `${gununler.length} işin hepsi tamam`}
      </div>
    {/if}
  </section>

  <!-- Bugunun listesi. Kirmizi cizgi gecmisi gelecekten ayirir. -->
  <!-- Gun tamamen bossa ustteki bolum zaten soyluyor; burada tekrarlamiyoruz. -->
  <section class="liste">
    {#if gununler.length > 0}
      {#each gununler as o, i (o.etkinlik.id + o.baslangic.getTime())}
        {#if i === simdiIndeksi}
          <div class="simdi-cizgi" aria-label="şu an">
            <span class="simdi-saat zaman">{saatBicim(simdi, depo.ayarlar.saat24)}</span>
          </div>
        {/if}
        <button
          class="satir"
          class:tamam={o.tamamlandi}
          class:gecmis={!o.tamamlandi && o.baslangic <= simdi}
          onclick={() => isaretle(o)}
          title={o.tamamlandi ? 'Tamamlandı işaretini kaldır' : 'Tamamlandı olarak işaretle'}
        >
          <span class="kutu" style:--renk={o.renk}>
            {#if o.tamamlandi}
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M2.5 6.3l2.4 2.4 4.6-5" stroke="currentColor" stroke-width="1.8"
                  stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            {/if}
          </span>
          <span class="satir-saat zaman">{saatBicim(o.baslangic, depo.ayarlar.saat24)}</span>
          <span class="satir-baslik">{o.etkinlik.baslik}</span>
        </button>
      {/each}
      {#if simdiIndeksi === -1}
        <div class="simdi-cizgi son" aria-label="şu an">
          <span class="simdi-saat zaman">{saatBicim(simdi, depo.ayarlar.saat24)}</span>
        </div>
      {/if}
    {/if}

    {#if yarininlar.length > 0}
      <div class="yarin-basligi">Yarın</div>
      {#each yarininlar as o (o.etkinlik.id + o.baslangic.getTime())}
        <div class="satir yarin">
          <span class="kutu bos" style:--renk={o.renk}></span>
          <span class="satir-saat zaman">{saatBicim(o.baslangic, depo.ayarlar.saat24)}</span>
          <span class="satir-baslik">{o.etkinlik.baslik}</span>
        </div>
      {/each}
    {/if}
  </section>

  <footer data-tauri-drag-region>
    <span>
      {#if gununler.length === 0}
        Bugün kayıt yok
      {:else if bekleyen === 0}
        {gununler.length} işin hepsi tamam
      {:else}
        {gununler.length - bekleyen}/{gununler.length} tamam
      {/if}
    </span>
    <span class="zaman">{saatBicim(simdi, depo.ayarlar.saat24)}</span>
  </footer>
</div>

<style>
  .kabuk {
    display: grid;
    transition: opacity var(--gecis);
    grid-template-rows: auto auto 1fr auto;
    height: 100vh;
    background: var(--murekkep);
    border: 1px solid var(--ayrac);
    border-radius: var(--yuvarlak-kabuk);
    overflow: hidden;
  }

  /* ---------------------------------------------------------------
     Surukleme alani
     ---------------------------------------------------------------
     `data-tauri-drag-region` yalnizca TIKLANAN elemanin kendisinde
     varsa calisiyor. Once yalnizca <header>'da vardi; kullanici tarih
     yazisina basinca olay yaziya gidiyor ve pencere hic suruklenmiyordu -
     geriye birkac piksellik bosluk kaliyordu.
     Cozum: metinlerde pointer-events kapali, boylece olay altlarindaki
     surukleme bolgesine dusuyor. Dugmeler ve liste satirlari haric
     tutuldu; onlar tiklanabilir kalmali. */
  header *,
  .sirada *,
  footer * { pointer-events: none; }

  /* Dugmeler tiklanabilir kalmali */
  .baslik-eylem,
  .baslik-eylem * { pointer-events: auto; }

  /* --- Baslik: takvim yapragi --- */
  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: var(--b4) var(--b4) var(--b3);
    border-bottom: 1px solid var(--ayrac);
  }

  .tarih { display: grid; gap: 1px; }
  .gun-adi {
    font-size: 11px;
    font-weight: 500;
    color: var(--kagit-3);
    line-height: 1.2;
  }
  .tam-tarih {
    font-size: 15px;
    font-weight: 500;
    color: var(--kagit-2);
    line-height: 1.2;
  }

  /* Dugmeler bilerek daha parlak: kullanici bunlari bulamadigini soyledi.
     Onceki ton (--kagit-3) koyu zeminde neredeyse gorunmuyordu. */
  .baslik-eylem { display: flex; gap: 1px; flex: none; }
  .ikon {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: var(--yuvarlak-dugme);
    color: var(--kagit-2);
    transition: color var(--gecis-hizli), background var(--gecis-hizli);
  }
  .ikon:hover { color: var(--kagit); background: var(--murekkep-3); }
  .ikon.gizle:hover { color: var(--kirmizi); background: var(--kirmizi-sonuk); }

  /* --- Kahraman: geri sayim --- */
  .sirada {
    padding: var(--b4) var(--b4) var(--b3);
    border-bottom: 1px solid var(--ayrac);
  }
  /* Ekrandaki tek buyuk sey. Widget goz ucuyla bakilmak icin var. */
  .sayac {
    font-size: 40px;
    font-weight: 500;
    line-height: 1;
    letter-spacing: -0.03em;
    color: var(--pirinc);
  }
  .saniye { color: var(--pirinc); opacity: 0.45; }

  .sayac-bos {
    font-size: 19px;
    font-weight: 500;
    line-height: 1.2;
    color: var(--kagit-2);
  }
  .sayac-bos.gecikti {
    font-size: 34px;
    font-weight: 500;
    line-height: 1;
    letter-spacing: -0.02em;
    color: var(--kirmizi);
  }
  .gecikti-metin { color: var(--kagit-2); font-weight: 400; }
  .sirada-baslik {
    margin-top: var(--b2);
    font-size: 13px;
    font-weight: 500;
    color: var(--kagit);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sirada-alt {
    display: flex;
    align-items: center;
    gap: var(--b2);
    margin-top: 2px;
    font-size: 12px;
    color: var(--kagit-3);
  }
  .sirada-alt.tek { margin-top: var(--b2); }
  .nokta {
    width: 2px;
    height: 2px;
    border-radius: 50%;
    background: currentColor;
  }

  /* --- Bugunun listesi --- */
  .liste {
    overflow-y: auto;
    padding: var(--b2) 0;
  }
  .satir {
    display: grid;
    grid-template-columns: 18px auto 1fr;
    align-items: center;
    gap: var(--b2);
    width: 100%;
    padding: 7px var(--b4);
    text-align: left;
    transition: background var(--gecis-hizli);
  }
  .satir:hover { background: var(--murekkep-2); }

  .kutu {
    display: grid;
    place-items: center;
    width: 15px;
    height: 15px;
    border: 1.5px solid var(--renk);
    border-radius: 3px;
    color: var(--murekkep);
  }
  .satir.tamam .kutu { background: var(--zeytin); border-color: var(--zeytin); }

  .satir-saat {
    font-size: 12px;
    color: var(--kagit-2);
  }
  .satir-baslik {
    font-size: 13px;
    color: var(--kagit);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .satir.gecmis .satir-saat,
  .satir.gecmis .satir-baslik { color: var(--kagit-3); }

  .satir.tamam .satir-baslik {
    color: var(--kagit-3);
    text-decoration: line-through;
    text-decoration-color: var(--kagit-3);
  }
  .satir.tamam .satir-saat { color: var(--kagit-3); }

  /* Yarin onizlemesi: bugunun listesinden acikca ayrilsin diye ayrac ve
     daha sonuk renkler. Tiklanabilir degil - bilgi amacli. */
  .yarin-basligi {
    margin: var(--b3) var(--b4) var(--b1);
    padding-top: var(--b2);
    border-top: 1px solid var(--ayrac);
    font-size: 10.5px;
    font-weight: 500;
    color: var(--kagit-3);
  }
  .satir.yarin { cursor: default; }
  .satir.yarin:hover { background: none; }
  .satir.yarin .satir-saat,
  .satir.yarin .satir-baslik { color: var(--kagit-3); }
  .kutu.bos { border-style: dashed; opacity: 0.6; }

  /* Kirmizi "simdi" cizgisi: listede gecmisi gelecekten ayirir.
     Kirmizi bu uygulamada yalnizca bu is icin kullaniliyor. */
  .simdi-cizgi {
    position: relative;
    display: flex;
    align-items: center;
    height: 1px;
    margin: 5px var(--b4) 5px 0;
    background: var(--kirmizi);
    padding-left: var(--b4);
  }
  .simdi-cizgi::before {
    content: '';
    position: absolute;
    left: var(--b4);
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--kirmizi);
  }
  .simdi-saat {
    margin-left: auto;
    padding-left: var(--b2);
    font-size: 10px;
    font-weight: 500;
    color: var(--kirmizi);
    background: var(--murekkep);
  }

  /* --- Alt bilgi --- */
  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--b2) var(--b4);
    border-top: 1px solid var(--ayrac);
    font-size: 11px;
    color: var(--kagit-3);
  }

  /* --- Kompakt kip ---
     Oyun oynarken ekranin kosesinde durabilecek kadar kucuk. Yalnizca
     "sirada ne var ve ne kadar kaldi" kaliyor; liste, alt bilgi ve ayirici
     cizgiler gidiyor. Pencere de bu kipte 272x132'ye oturuyor. */
  .kabuk.kompakt { grid-template-rows: auto 1fr; }
  .kabuk.kompakt .liste,
  .kabuk.kompakt footer { display: none; }

  .kabuk.kompakt header {
    align-items: center;
    padding: 6px 6px 4px var(--b3);
    border-bottom: none;
  }
  .kabuk.kompakt .tam-tarih { font-size: 11.5px; color: var(--kagit-3); font-weight: 400; }

  .kabuk.kompakt .sirada { padding: 0 var(--b3) var(--b3); border-bottom: none; }
  .kabuk.kompakt .sayac { font-size: 30px; }
  .kabuk.kompakt .sayac-bos { font-size: 15px; }
  .kabuk.kompakt .sayac-bos.gecikti { font-size: 26px; }
  .kabuk.kompakt .sirada-baslik { margin-top: 3px; font-size: 12px; }
  .kabuk.kompakt .sirada-alt { font-size: 11px; }
  /* Kompakt kipte ikinci satir aciklamasi yer kaplamasin */
  .kabuk.kompakt .sirada-alt.tek { display: none; }
</style>
