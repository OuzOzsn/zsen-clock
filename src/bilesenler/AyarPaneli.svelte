<script lang="ts">
  /**
   * Ayarlar.
   *
   * Her degisiklik aninda kaydedilir - "Kaydet" dugmesi yok. Sebep: ayarlarin
   * cogu gorsel (tema, saydamlik, widget boyutu) ve kullanici sonucu hemen
   * gormek istiyor; ara bir onay adimi yalnizca gecikme yaratirdi.
   */
  import { onMount } from 'svelte';
  import { cagir, TAURI_ICINDE } from '../lib/ipc.ts';
  import { sesCal, type CalanSes } from '../lib/ses.ts';
  import type { Ayarlar } from '../lib/tipler.ts';
  import { depo } from '../lib/veri.svelte.ts';

  interface Ozellikler {
    onKapat: () => void;
  }
  let { onKapat }: Ozellikler = $props();

  let sesler = $state<string[]>([]);
  /** Ayardaki degere degil, diskteki gercege bakiyoruz: kullanici kisayolu
      elle silmis olabilir ve kutucuk yalan soylememeli. */
  let kisayolVar = $state(false);
  let calan: CalanSes | null = null;
  /** Dinleme basarisiz olursa kullaniciya soyleniyor; sessizce yutmuyoruz. */
  let sesHatasi = $state<string | null>(null);

  const a = $derived(depo.ayarlar);

  onMount(() => {
    void cagir('sesleri_listele').then((s) => (sesler = s));
    void cagir('kisayol_durumu').then((v) => (kisayolVar = v));
    return () => calan?.durdur();
  });

  async function kisayolDegistir(olsun: boolean) {
    kisayolVar = olsun; // iyimser: kullanici beklemesin
    try {
      await cagir('kisayol_ayarla', { olsun });
    } catch {
      kisayolVar = await cagir('kisayol_durumu'); // basarisizsa gercege don
    }
  }

  function ayarla<K extends keyof Ayarlar>(anahtar: K, deger: Ayarlar[K]) {
    void depo.ayarKaydet({ [anahtar]: deger } as Partial<Ayarlar>);
  }

  /**
   * Kullanicinin secitigi dosyayi sesler klasorune kopyalar, listeyi tazeler
   * ve yeni sesi secip bir kez caldirir - eklendigini duymak en iyi geri
   * bildirim.
   */
  async function sesEkle() {
    sesHatasi = null;
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const secim = await open({
        title: 'Zil sesi seç',
        multiple: false,
        directory: false,
        filters: [{ name: 'Ses dosyası', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'flac'] }],
      });
      if (typeof secim !== 'string') return; // vazgecildi

      const ad = await cagir('ses_ekle', { kaynak: secim });
      sesler = await cagir('sesleri_listele');
      ayarla('varsayilan_ses', ad);
      await dinle(ad);
    } catch (e) {
      sesHatasi = `Ses eklenemedi — ${e}`;
    }
  }

  /** Secilen sesi on dinleme. */
  async function dinle(dosya: string) {
    if (!dosya) return;
    sesHatasi = null;
    calan?.durdur();
    try {
      calan = await sesCal(dosya, a.ses_seviyesi, 1);
    } catch (e) {
      calan = null;
      sesHatasi = `${dosya} çalınamadı — ${e}`;
    }
  }

  const temalar: [Ayarlar['tema'], string][] = [
    ['koyu', 'Koyu'],
    ['acik', 'Açık'],
    ['sistem', 'Sistem'],
  ];
  const boyutlar: [Ayarlar['widget_boyut'], string][] = [
    ['kompakt', 'Kompakt'],
    ['normal', 'Normal'],
    ['genis', 'Geniş'],
  ];
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') onKapat(); }} />

<div
  class="perde"
  role="button"
  tabindex="-1"
  aria-label="Kapat"
  onclick={onKapat}
  onkeydown={(e) => { if (e.key === 'Enter') onKapat(); }}
></div>

<div class="panel" role="dialog" aria-modal="true" aria-label="Ayarlar">
  <header>
    <div>
      <h2>Ayarlar</h2>
      <!-- Kullanici "kaydet dugmesi yok" diye tereddut etti; otomatik kaydin
           gorunur olmasi gerekiyor. -->
      <p class="alt">Değişiklikler anında kaydedilir</p>
    </div>
    <button class="ikon" onclick={onKapat} aria-label="Kapat">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-linecap="round" />
      </svg>
    </button>
  </header>

  <div class="govde">
    <!-- ------------------------------------------------------- baslangic -->
    <section>
      <h3>Başlangıç</h3>

      <label class="satir">
        <input
          type="checkbox"
          checked={a.acilista_baslat}
          onchange={(e) => ayarla('acilista_baslat', e.currentTarget.checked)}
        />
        <span>
          <span class="ad">Windows açılışında başlat</span>
          <span class="aciklama">Bilgisayar her açıldığında uygulama da açılır.</span>
        </span>
      </label>

      <label class="satir">
        <input
          type="checkbox"
          checked={a.simge_durumunda_basla}
          onchange={(e) => ayarla('simge_durumunda_basla', e.currentTarget.checked)}
        />
        <span>
          <span class="ad">Simge durumunda başla</span>
          <span class="aciklama">Takvim penceresi açılmaz, yalnızca tepsi ve widget.</span>
        </span>
      </label>

      <label class="satir">
        <input
          type="checkbox"
          checked={kisayolVar}
          onchange={(e) => kisayolDegistir(e.currentTarget.checked)}
        />
        <span>
          <span class="ad">Masaüstünde kısayol olsun</span>
          <span class="aciklama">
            Kaldırıldığında yalnızca kısayol silinir; uygulama yerinde kalır.
          </span>
        </span>
      </label>
    </section>

    <!-- ---------------------------------------------------------- gorunum -->
    <section>
      <h3>Görünüm</h3>

      <div class="satir">
        <span class="ad">Tema</span>
        <div class="secenekler">
          {#each temalar as [deger, etiket] (deger)}
            <button
              class="secenek"
              class:etkin={a.tema === deger}
              onclick={() => ayarla('tema', deger)}
            >{etiket}</button>
          {/each}
        </div>
      </div>

      <div class="satir">
        <span class="ad">Vurgu rengi</span>
        <input
          class="renk"
          type="color"
          value={a.vurgu_rengi}
          oninput={(e) => ayarla('vurgu_rengi', e.currentTarget.value)}
          aria-label="Vurgu rengi"
        />
      </div>

      <div class="satir">
        <span class="ad">Haftanın ilk günü</span>
        <select
          value={a.haftanin_ilk_gunu}
          onchange={(e) => ayarla('haftanin_ilk_gunu', Number(e.currentTarget.value))}
        >
          <option value={1}>Pazartesi</option>
          <option value={7}>Pazar</option>
        </select>
      </div>

      <label class="satir">
        <input
          type="checkbox"
          checked={a.saat24}
          onchange={(e) => ayarla('saat24', e.currentTarget.checked)}
        />
        <span class="ad">24 saatlik gösterim</span>
      </label>
    </section>

    <!-- ----------------------------------------------------------- widget -->
    <section>
      <h3>Widget</h3>

      <label class="satir">
        <input
          type="checkbox"
          checked={a.widget_ustte}
          onchange={(e) => ayarla('widget_ustte', e.currentTarget.checked)}
        />
        <span>
          <span class="ad">Her zaman üstte</span>
          <span class="aciklama">Diğer pencerelerin arkasında kaybolmaz.</span>
        </span>
      </label>

      <div class="satir">
        <span class="ad">Boyut</span>
        <div class="secenekler">
          {#each boyutlar as [deger, etiket] (deger)}
            <button
              class="secenek"
              class:etkin={a.widget_boyut === deger}
              onclick={() => ayarla('widget_boyut', deger)}
            >{etiket}</button>
          {/each}
        </div>
      </div>

      <div class="satir">
        <span class="ad">Saydamlık <span class="deger zaman">%{Math.round(a.widget_saydamlik * 100)}</span></span>
        <input
          type="range"
          min="0.2"
          max="1"
          step="0.05"
          value={a.widget_saydamlik}
          oninput={(e) => ayarla('widget_saydamlik', Number(e.currentTarget.value))}
        />
      </div>

      <label class="satir">
        <input
          type="checkbox"
          checked={a.widget_hoverda_saydamlas}
          onchange={(e) => ayarla('widget_hoverda_saydamlas', e.currentTarget.checked)}
        />
        <span>
          <span class="ad">Fare üzerine gelince saydamlaş</span>
          <span class="aciklama">Altındaki pencereyi görmek için.</span>
        </span>
      </label>
    </section>

    <!-- ------------------------------------------------------------ alarm -->
    <section>
      <h3>Alarm</h3>

      <div class="satir">
        <span class="ad">Varsayılan zil sesi</span>
        <div class="ses-secim">
          <select
            value={a.varsayilan_ses}
            onchange={(e) => ayarla('varsayilan_ses', e.currentTarget.value)}
          >
            <option value="">Ses yok (sessiz)</option>
            {#each sesler as s (s)}<option value={s}>{s}</option>{/each}
          </select>
          <button
            class="dinle"
            onclick={() => dinle(a.varsayilan_ses)}
            disabled={!a.varsayilan_ses}
            aria-label="Sesi dinle"
          >Dinle</button>
          <button
            class="dinle"
            onclick={() => void sesEkle()}
            disabled={!TAURI_ICINDE}
            title="Ses dosyası ekle (mp3, wav, ogg, m4a, flac)"
          >Ekle…</button>
        </div>
      </div>

      <p class="ipucu">
        Eklenen dosya <code>data/sesler</code> klasörüne kopyalanır; uygulama
        oradaki seslere bir daha dokunmaz. Silmek için dosyayı klasörden
        kaldırmak yeterli.
      </p>

      {#if sesHatasi}
        <p class="ses-hatasi" role="alert">{sesHatasi}</p>
      {/if}

      <div class="satir">
        <span class="ad">Ses seviyesi <span class="deger zaman">%{Math.round(a.ses_seviyesi * 100)}</span></span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={a.ses_seviyesi}
          oninput={(e) => ayarla('ses_seviyesi', Number(e.currentTarget.value))}
        />
      </div>

      <div class="satir">
        <span class="ad">Kaç kez çalsın</span>
        <input
          class="sayi"
          type="number"
          min="1"
          max="20"
          value={a.ses_tekrari}
          onchange={(e) => ayarla('ses_tekrari', Number(e.currentTarget.value))}
        />
      </div>

      <div class="satir">
        <span class="ad">Varsayılan erteleme</span>
        <div class="birimli">
          <input
            class="sayi"
            type="number"
            min="1"
            max="600"
            value={a.varsayilan_erteleme_dakika}
            onchange={(e) => ayarla('varsayilan_erteleme_dakika', Number(e.currentTarget.value))}
          />
          <span class="birim">dakika</span>
        </div>
      </div>

      <label class="satir">
        <input
          type="checkbox"
          checked={a.windows_bildirimi}
          onchange={(e) => ayarla('windows_bildirimi', e.currentTarget.checked)}
        />
        <span class="ad">Windows bildirimi de göster</span>
      </label>
    </section>

    <!-- ------------------------------------------------- rahatsiz etmeyin -->
    <section>
      <h3>Rahatsız etmeyin</h3>

      <label class="satir">
        <input
          type="checkbox"
          checked={a.oyunda_araya_girme}
          onchange={(e) => ayarla('oyunda_araya_girme', e.currentTarget.checked)}
        />
        <span class="metin">
          <span class="ad">Oyun oynarken araya girme</span>
          <span class="aciklama">
            Tam ekran bir oyun ya da sunum varken alarm yine açılır ve çalar,
            ama odağı çalmaz ve oyunun üstüne binmez — görev çubuğunda bekler.
          </span>
        </span>
      </label>

      <label class="satir">
        <input
          type="checkbox"
          checked={a.rahatsiz_etme_acik}
          onchange={(e) => ayarla('rahatsiz_etme_acik', e.currentTarget.checked)}
        />
        <span>
          <span class="ad">Belirli saatlerde sessiz</span>
          <span class="aciklama">
            Bu aralıkta alarm penceresi açılmaz ve ses çalmaz. Hatırlatmalar
            kaybolmaz — widget'ta "gecikmiş" olarak görünür.
          </span>
        </span>
      </label>

      {#if a.rahatsiz_etme_acik}
        <div class="satir">
          <span class="ad">Saat aralığı</span>
          <div class="birimli">
            <input
              type="time"
              value={a.rahatsiz_etme_bas}
              onchange={(e) => ayarla('rahatsiz_etme_bas', e.currentTarget.value)}
            />
            <span class="birim">–</span>
            <input
              type="time"
              value={a.rahatsiz_etme_son}
              onchange={(e) => ayarla('rahatsiz_etme_son', e.currentTarget.value)}
            />
          </div>
        </div>
      {/if}

      <div class="satir">
        <span class="ad">Kaçırılan hatırlatmaları göster</span>
        <div class="birimli">
          <input
            class="sayi"
            type="number"
            min="0"
            max="168"
            value={a.kacan_tolerans_saat}
            onchange={(e) => ayarla('kacan_tolerans_saat', Number(e.currentTarget.value))}
          />
          <span class="birim">saate kadar geriye dönük</span>
        </div>
      </div>
    </section>

    <!-- -------------------------------------------------- yeni etkinlikler -->
    <section>
      <h3>Yeni etkinlikler için varsayılan</h3>

      <div class="satir">
        <span class="ad">Süre</span>
        <div class="birimli">
          <input
            class="sayi"
            type="number"
            min="5"
            max="1440"
            step="5"
            value={a.varsayilan_sure_dakika}
            onchange={(e) => ayarla('varsayilan_sure_dakika', Number(e.currentTarget.value))}
          />
          <span class="birim">dakika</span>
        </div>
      </div>

      <div class="satir">
        <span class="ad">Hatırlatma</span>
        <div class="birimli">
          <input
            class="sayi"
            type="number"
            min="0"
            max="10080"
            value={a.varsayilan_hatirlatma_dakika}
            onchange={(e) => ayarla('varsayilan_hatirlatma_dakika', Number(e.currentTarget.value))}
          />
          <span class="birim">dakika önce</span>
        </div>
      </div>
    </section>

    <!-- ------------------------------------------------------------- veri -->
    <section>
      <h3>Veri</h3>
      <p class="aciklama duz">
        Takvimin <code>data\etkinlikler.json</code> dosyasında düz metin olarak
        duruyor. Her kayıtta otomatik yedek alınır, son 20 tanesi
        <code>data\yedekler</code> içinde saklanır.
      </p>
      <button class="dugme" onclick={() => void cagir('veri_klasorunu_ac')}>
        Veri klasörünü aç
      </button>
    </section>
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
    width: min(560px, calc(100vw - 48px));
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
  .alt { margin-top: 2px; font-size: 11.5px; color: var(--kagit-3); }

  .govde { overflow-y: auto; padding: var(--b2) var(--b4) var(--b5); }

  section { padding: var(--b4) 0; }
  section + section { border-top: 1px solid var(--ayrac); }
  h3 {
    margin-bottom: var(--b3);
    font-size: 12px;
    font-weight: 600;
    color: var(--kagit-2);
  }

  .satir {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--b4);
    padding: var(--b2) 0;
  }
  .satir:has(input[type='checkbox']) {
    justify-content: flex-start;
    cursor: pointer;
  }

  .ad {
    display: block;
    font-size: 13px;
    color: var(--kagit);
  }
  .aciklama {
    display: block;
    margin-top: 1px;
    font-size: 11.5px;
    line-height: 1.5;
    color: var(--kagit-3);
    max-width: 46ch;
  }
  .aciklama.duz { margin-bottom: var(--b3); }
  .deger { color: var(--kagit-3); font-weight: 400; }

  code {
    padding: 1px 4px;
    border-radius: 3px;
    background: var(--murekkep);
    font-family: var(--yazi-mono);
    font-size: 11px;
  }

  input[type='checkbox'] {
    flex: none;
    width: 15px;
    height: 15px;
    margin-top: 2px;
    accent-color: var(--pirinc);
  }

  select, input[type='number'], input[type='time'] {
    padding: 5px var(--b2);
    background: var(--murekkep);
    border: 1px solid var(--ayrac);
    border-radius: var(--yuvarlak-dugme);
    font: inherit;
    font-size: 12.5px;
    color: var(--kagit);
    outline: none;
    color-scheme: dark;
  }
  select:focus, input:focus { border-color: var(--pirinc); }
  .sayi { width: 64px; text-align: right; font-family: var(--yazi-mono); }

  input[type='range'] {
    width: 168px;
    accent-color: var(--pirinc);
  }
  .renk {
    width: 42px;
    height: 26px;
    padding: 2px;
    background: var(--murekkep);
    border: 1px solid var(--ayrac);
    border-radius: var(--yuvarlak-dugme);
    cursor: pointer;
  }

  .secenekler { display: flex; gap: 2px; }
  .secenek {
    padding: 5px var(--b3);
    border: 1px solid var(--ayrac);
    border-radius: var(--yuvarlak-dugme);
    font-size: 12px;
    color: var(--kagit-3);
    transition: all var(--gecis-hizli);
  }
  .secenek:hover { color: var(--kagit-2); }
  .secenek.etkin {
    background: var(--pirinc);
    border-color: var(--pirinc);
    color: var(--pirinc-ustu);
    font-weight: 500;
  }

  .birimli { display: flex; align-items: center; gap: var(--b2); }
  .birim { font-size: 11.5px; color: var(--kagit-3); }

  .ses-secim { display: flex; align-items: center; gap: var(--b2); }
  .dinle {
    padding: 5px var(--b3);
    border: 1px solid var(--ayrac);
    border-radius: var(--yuvarlak-dugme);
    font-size: 12px;
    color: var(--kagit-2);
    transition: all var(--gecis-hizli);
  }
  .dinle:hover:not(:disabled) { color: var(--kagit); border-color: var(--ayrac-guclu); }
  .dinle:disabled { opacity: 0.4; cursor: default; }

  .ipucu {
    padding: 0 var(--b3) var(--b2);
    font-size: 11.5px;
    line-height: 1.6;
    color: var(--kagit-3);
  }
  .ipucu code {
    padding: 1px 4px;
    border-radius: 3px;
    background: var(--murekkep-3);
    font-family: var(--yazi-mono);
    font-size: 11px;
  }

  .ses-hatasi {
    padding: var(--b2) var(--b3);
    border-left: 2px solid var(--kirmizi);
    background: var(--kirmizi-sonuk);
    font-size: 11.5px;
    line-height: 1.5;
    color: var(--kagit-2);
  }

  .dugme {
    padding: 7px var(--b4);
    background: var(--murekkep-3);
    border-radius: var(--yuvarlak-dugme);
    font-size: 12.5px;
    color: var(--kagit-2);
    transition: color var(--gecis-hizli);
  }
  .dugme:hover { color: var(--kagit); }

  .ikon {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: var(--yuvarlak-dugme);
    color: var(--kagit-3);
    transition: color var(--gecis-hizli), background var(--gecis-hizli);
  }
  .ikon:hover { color: var(--kagit); background: var(--murekkep-3); }
</style>
