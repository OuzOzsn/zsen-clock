<script lang="ts">
  /**
   * Calisma plani sihirbazi.
   *
   * Konulari, gunleri ve saatleri alip takvime toplu kayit uretir. Onemli
   * nokta: kullanici "Takvime ekle" demeden hicbir sey yazilmiyor ve ustte
   * ne uretilecegi (kac gun, kac seans, konu dagilimi) surekli guncelleniyor.
   * Yuzlerce kayit ureten bir islemde onizleme olmadan guven olmaz.
   */
  import { konulariCoz, planUret, type PlanAyari } from '../lib/planUret.ts';
  import { gunBasi, gunEkle, saatBicim } from '../lib/tarih.ts';
  import { GUN_KISA } from '../lib/tipler.ts';
  import { depo } from '../lib/veri.svelte.ts';
  import { isoCoz } from '../lib/ipc.ts';

  interface Ozellikler {
    onKapat: () => void;
    /** Plan eklendikten sonra takvimi o tarihe goturmek icin. */
    onEklendi: (ilkGun: Date) => void;
  }
  let { onKapat, onEklendi }: Ozellikler = $props();

  const bugun = gunBasi(new Date());
  const tarihMetni = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`;

  let ad = $state('Çalışma planı');
  let konuMetni = $state('');
  let baslangic = $state(tarihMetni(gunEkle(bugun, 1)));
  let bitis = $state(tarihMetni(gunEkle(bugun, 30)));
  let gunler = $state<number[]>([1, 2, 3, 4, 5]);
  let seansSayisi = $state(2);
  let ilkSaat = $state('09:00');
  let seansDakika = $state(60);
  let molaDakika = $state(15);
  let hatirlatmaVar = $state(true);
  let hatirlatmaDakika = $state(10);

  let ekleniyor = $state(false);
  let hata = $state<string | null>(null);

  const konular = $derived(konulariCoz(konuMetni));

  const ayar = $derived<PlanAyari>({
    ad: ad.trim() || 'Çalışma planı',
    konular,
    baslangic: isoCoz(baslangic),
    bitis: isoCoz(bitis),
    gunler,
    seansSayisi,
    ilkSaat,
    seansDakika,
    molaDakika,
    hatirlatmaDakika: hatirlatmaVar ? hatirlatmaDakika : -1,
  });

  const sonuc = $derived(konular.length > 0 && gunler.length > 0 ? planUret(ayar) : null);

  /** Ilk gunun seans saatleri - "gunun neye benzeyecegi" ipucu. */
  const ornekGun = $derived.by(() => {
    const [s, d] = ilkSaat.split(':').map(Number);
    const adim = seansDakika + molaDakika;
    return Array.from({ length: seansSayisi }, (_, i) => {
      const t = new Date(2000, 0, 1, s ?? 9, (d ?? 0) + i * adim);
      const bit = new Date(t.getTime() + seansDakika * 60000);
      return `${saatBicim(t)}–${saatBicim(bit)}`;
    });
  });

  function gunDegistir(g: number) {
    gunler = gunler.includes(g) ? gunler.filter((x) => x !== g) : [...gunler, g].sort();
  }

  async function ekle() {
    if (!sonuc || sonuc.etkinlikler.length === 0) return;
    hata = null;
    ekleniyor = true;
    try {
      // Tek tek kaydediyoruz; her kayit diske atomik yaziliyor.
      for (const e of sonuc.etkinlikler) {
        await depo.kaydet(e);
      }
      onEklendi(isoCoz(sonuc.etkinlikler[0]!.baslangic));
      onKapat();
    } catch (e) {
      hata = `Eklenemedi: ${e}`;
    } finally {
      ekleniyor = false;
    }
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape' && !ekleniyor) onKapat(); }} />

<div
  class="perde"
  role="button"
  tabindex="-1"
  aria-label="Kapat"
  onclick={() => !ekleniyor && onKapat()}
  onkeydown={(e) => { if (e.key === 'Enter') onKapat(); }}
></div>

<div class="panel" role="dialog" aria-modal="true" aria-label="Çalışma planı oluştur">
  <header>
    <div>
      <h2>Çalışma planı oluştur</h2>
      <p class="alt">Konular ve saatlerden haftalık bir program üretilir.</p>
    </div>
    <button class="ikon" onclick={onKapat} aria-label="Kapat">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-linecap="round" />
      </svg>
    </button>
  </header>

  <div class="govde">
    <label class="alan">
      <span class="etiket">Plan adı</span>
      <input bind:value={ad} placeholder="Çalışma planı" />
      <span class="ipucu">Kategori olarak da kullanılır, takvimde bu renkle görünür.</span>
    </label>

    <label class="alan">
      <span class="etiket">Konular — her satıra bir tane</span>
      <textarea
        bind:value={konuMetni}
        rows="6"
        spellcheck="false"
        placeholder={'Matematik x2\nTürkçe x2\nTarih\nCoğrafya\nVatandaşlık'}
      ></textarea>
      <span class="ipucu">
        Yanına <code>x2</code> yazılan konu iki kat sık gelir. Sıra
        döngüsel dağıtılır, aynı konu üst üste gelmez.
      </span>
    </label>

    <div class="ikili">
      <label class="alan">
        <span class="etiket">Başlangıç</span>
        <input type="date" bind:value={baslangic} />
      </label>
      <label class="alan">
        <span class="etiket">Bitiş</span>
        <input type="date" bind:value={bitis} />
      </label>
    </div>

    <div class="alan">
      <span class="etiket">Hangi günler</span>
      <div class="gun-secici">
        {#each [1, 2, 3, 4, 5, 6, 7] as g (g)}
          <button
            type="button"
            class="gun-dugme"
            class:secili={gunler.includes(g)}
            onclick={() => gunDegistir(g)}
          >{GUN_KISA[g]}</button>
        {/each}
      </div>
    </div>

    <div class="bolum">
      <span class="etiket">Günün düzeni</span>
      <div class="dortlu">
        <label class="kucuk-alan">
          <span>İlk seans</span>
          <input type="time" bind:value={ilkSaat} />
        </label>
        <label class="kucuk-alan">
          <span>Kaç seans</span>
          <input type="number" min="1" max="12" bind:value={seansSayisi} />
        </label>
        <label class="kucuk-alan">
          <span>Seans (dk)</span>
          <input type="number" min="10" max="240" step="5" bind:value={seansDakika} />
        </label>
        <label class="kucuk-alan">
          <span>Mola (dk)</span>
          <input type="number" min="0" max="120" step="5" bind:value={molaDakika} />
        </label>
      </div>
      <div class="ornek">
        {#each ornekGun as s, i (i)}
          <span class="ornek-blok zaman">{s}</span>
        {/each}
      </div>
    </div>

    <label class="satir-onay">
      <input type="checkbox" bind:checked={hatirlatmaVar} />
      <span>Her seans için alarm</span>
      {#if hatirlatmaVar}
        <span class="birimli">
          <input class="sayi" type="number" min="0" max="120" bind:value={hatirlatmaDakika} />
          <span class="birim">dakika önce</span>
        </span>
      {/if}
    </label>

    {#if hata}
      <p class="hata" role="alert">{hata}</p>
    {/if}
  </div>

  <!-- Onizleme: ne uretilecegi kaydetmeden once burada. -->
  <div class="onizleme" class:bos={!sonuc || sonuc.etkinlikler.length === 0}>
    {#if !sonuc || sonuc.etkinlikler.length === 0}
      <span class="onizleme-bos">
        {konular.length === 0 ? 'Önce birkaç konu yaz.' : 'En az bir gün seç.'}
      </span>
    {:else}
      <div class="sayilar">
        <span><strong class="zaman">{sonuc.etkinlikler.length}</strong> seans</span>
        <span class="ayrac-nokta"></span>
        <span><strong class="zaman">{sonuc.gunSayisi}</strong> gün</span>
        <span class="ayrac-nokta"></span>
        <span>toplam <strong class="zaman">{sonuc.toplamSaat}</strong> saat</span>
      </div>
      <div class="dagilim">
        {#each sonuc.konuDagilimi as k (k.ad)}
          <span class="pay"><span class="pay-ad">{k.ad}</span>
            <span class="zaman">{k.seans}</span></span>
        {/each}
      </div>
    {/if}
  </div>

  <footer>
    <button type="button" class="dugme ikincil" onclick={onKapat} disabled={ekleniyor}>
      Vazgeç
    </button>
    <button
      type="button"
      class="dugme birincil"
      onclick={ekle}
      disabled={ekleniyor || !sonuc || sonuc.etkinlikler.length === 0}
    >
      {ekleniyor ? 'Ekleniyor…' : `Takvime ekle${sonuc ? ` (${sonuc.etkinlikler.length})` : ''}`}
    </button>
  </footer>
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
    grid-template-rows: auto 1fr auto auto;
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
  .alt { margin-top: 2px; font-size: 12px; color: var(--kagit-3); }

  .govde { display: grid; gap: var(--b4); padding: var(--b4); overflow-y: auto; }

  .alan { display: grid; gap: var(--b1); min-width: 0; }
  .etiket { font-size: 11px; font-weight: 500; color: var(--kagit-3); }
  .ipucu {
    font-size: 11px;
    line-height: 1.5;
    color: var(--kagit-3);
  }

  input, textarea {
    width: 100%;
    padding: 7px var(--b3);
    background: var(--murekkep);
    border: 1px solid var(--ayrac);
    border-radius: var(--yuvarlak-dugme);
    font: inherit;
    font-size: 13px;
    color: var(--kagit);
    outline: none;
    color-scheme: dark;
    transition: border-color var(--gecis-hizli);
  }
  input:focus, textarea:focus { border-color: var(--pirinc); }
  textarea { resize: vertical; line-height: 1.6; }

  .ikili { display: grid; grid-template-columns: 1fr 1fr; gap: var(--b3); }

  .bolum {
    display: grid;
    gap: var(--b2);
    padding: var(--b3);
    border: 1px solid var(--ayrac);
    border-radius: var(--yuvarlak-dugme);
  }
  .dortlu { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--b2); }
  .kucuk-alan { display: grid; gap: 2px; min-width: 0; }
  .kucuk-alan span { font-size: 10.5px; color: var(--kagit-3); }
  .kucuk-alan input { padding: 5px var(--b2); font-size: 12.5px; }

  /* Gunun neye benzeyecegini gosteren kucuk serit. */
  .ornek { display: flex; flex-wrap: wrap; gap: var(--b1); }
  .ornek-blok {
    padding: 2px 7px;
    border-left: 2px solid var(--pirinc);
    border-radius: 3px;
    background: var(--pirinc-sonuk);
    font-size: 11px;
    color: var(--kagit-2);
  }

  .gun-secici { display: flex; gap: var(--b1); }
  .gun-dugme {
    flex: 1;
    padding: 6px 0;
    border: 1px solid var(--ayrac);
    border-radius: var(--yuvarlak-dugme);
    font-size: 11.5px;
    color: var(--kagit-3);
    transition: all var(--gecis-hizli);
  }
  .gun-dugme:hover { color: var(--kagit-2); border-color: var(--ayrac-guclu); }
  .gun-dugme.secili {
    background: var(--pirinc);
    border-color: var(--pirinc);
    color: var(--pirinc-ustu);
    font-weight: 600;
  }

  .satir-onay {
    display: flex;
    align-items: center;
    gap: var(--b2);
    font-size: 13px;
    cursor: pointer;
  }
  .satir-onay input[type='checkbox'] {
    width: 15px;
    height: 15px;
    accent-color: var(--pirinc);
  }
  .birimli { display: flex; align-items: center; gap: var(--b2); margin-left: auto; }
  .sayi { width: 58px; padding: 4px var(--b2); text-align: right; font-family: var(--yazi-mono); }
  .birim { font-size: 11.5px; color: var(--kagit-3); }

  code {
    padding: 1px 4px;
    border-radius: 3px;
    background: var(--murekkep);
    font-family: var(--yazi-mono);
    font-size: 10.5px;
  }

  .hata {
    padding: var(--b2) var(--b3);
    border-left: 2px solid var(--kirmizi);
    background: var(--kirmizi-sonuk);
    font-size: 12px;
  }

  /* --- Onizleme seridi --- */
  .onizleme {
    display: grid;
    gap: var(--b2);
    padding: var(--b3) var(--b4);
    border-top: 1px solid var(--ayrac);
    background: var(--murekkep);
  }
  .onizleme.bos { color: var(--kagit-3); }
  .onizleme-bos { font-size: 12px; color: var(--kagit-3); }

  .sayilar {
    display: flex;
    align-items: center;
    gap: var(--b2);
    font-size: 12.5px;
    color: var(--kagit-2);
  }
  .sayilar strong { color: var(--kagit); font-size: 15px; font-weight: 600; }
  .ayrac-nokta {
    width: 2px;
    height: 2px;
    border-radius: 50%;
    background: var(--kagit-3);
  }

  .dagilim { display: flex; flex-wrap: wrap; gap: var(--b1); }
  .pay {
    display: inline-flex;
    align-items: baseline;
    gap: 5px;
    padding: 2px var(--b2);
    border: 1px solid var(--ayrac);
    border-radius: 99px;
    font-size: 11px;
    color: var(--kagit-3);
  }
  .pay-ad { color: var(--kagit-2); }

  footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--b2);
    padding: var(--b3) var(--b4);
    border-top: 1px solid var(--ayrac);
  }
  .dugme {
    height: 34px;
    padding: 0 var(--b4);
    border-radius: var(--yuvarlak-dugme);
    font-size: 13px;
    font-weight: 500;
    transition: background var(--gecis-hizli), color var(--gecis-hizli);
  }
  .birincil { background: var(--pirinc); color: var(--pirinc-ustu); font-weight: 600; }
  .birincil:hover:not(:disabled) { background: var(--pirinc-parlak); }
  .ikincil { background: var(--murekkep-3); color: var(--kagit-2); }
  .ikincil:hover:not(:disabled) { color: var(--kagit); }
  .dugme:disabled { opacity: 0.5; cursor: default; }

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
