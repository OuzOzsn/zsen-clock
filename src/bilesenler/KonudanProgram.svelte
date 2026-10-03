<script lang="ts">
  /**
   * "Konulardan oluştur": konular ve gunun duzeninden bir SIRALI program
   * kurar ve baslatir.
   *
   * Eskiden "çalışma planı" sihirbaziydi ve takvime sonradan duzenlenemeyen
   * tek tek etkinlikler yaziyordu; program ile ne farki oldugu anlasilmiyordu.
   * Artik sonuc siradan bir program: Programlarım'da gorunur, duzenlenir,
   * durdurulur, ilerlemesi izlenir. Hesap konudanProgram.ts'te.
   *
   * Kullanici "Oluştur" demeden hicbir sey yazilmiyor; altta ne uretilecegi
   * (bir tur kac gun, konu dagilimi, bitis) surekli guncelleniyor.
   */
  import { konulariCoz } from '../lib/konular.ts';
  import { konulardanOgeler } from '../lib/konudanProgram.ts';
  import { siraliBitisHesapla } from '../lib/programUret.ts';
  import { gunAnahtari, gunBasi, saatBicim } from '../lib/tarih.ts';
  import { AY_UZUN, GUN_KISA, type Program } from '../lib/tipler.ts';
  import { depo } from '../lib/veri.svelte.ts';
  import { isoCoz } from '../lib/ipc.ts';
  import KategoriSecici from './KategoriSecici.svelte';

  interface Ozellikler {
    onKapat: () => void;
    /** Program kurulup baslatildiktan sonra. */
    onOlusturuldu: (p: Program, ilkGun: Date) => void;
  }
  let { onKapat, onOlusturuldu }: Ozellikler = $props();

  const bugun = gunBasi(new Date());

  let ad = $state('Çalışma programı');
  let kategori = $state('ders');
  let konuMetni = $state('');
  let baslangicAlani = $state(gunAnahtari(bugun));
  let gunler = $state<number[]>([1, 2, 3, 4, 5]);
  let gunlukAdet = $state(2);
  let ilkSaat = $state('09:00');
  let sureDakika = $state(50);
  let molaDakika = $state(10);
  let hatirlatmaVar = $state(true);
  let hatirlatmaDakika = $state(10);
  let turKipi = $state<'tek' | 'tur' | 'sinirsiz'>('sinirsiz');
  let turSayisi = $state(4);

  let calisiyor = $state(false);
  let hata = $state<string | null>(null);

  const konular = $derived(konulariCoz(konuMetni));
  const tur = $derived(
    turKipi === 'tek' ? 1 : turKipi === 'tur' ? Math.max(1, Math.floor(turSayisi)) : null,
  );

  let sayac = 0;
  const kimlik = () => `${Date.now().toString(36)}-${(sayac++).toString(36)}`;

  const sonuc = $derived(
    konulardanOgeler(
      {
        konular,
        gunler,
        baslangic: isoCoz(baslangicAlani),
        gunlukAdet,
        ilkSaat,
        sureDakika,
        molaDakika,
        hatirlatmaDakika: hatirlatmaVar ? hatirlatmaDakika : -1,
      },
      kimlik,
    ),
  );

  const bitis = $derived(
    sonuc.ilkGun ? siraliBitisHesapla(sonuc.ilkGun, sonuc.ogeler, 0, tur) : null,
  );

  /** Bir gunun calisma saatleri - "gunun neye benzeyecegi" ipucu. */
  const ornekGun = $derived.by(() => {
    const [s, d] = ilkSaat.split(':').map(Number);
    const adim = sureDakika + molaDakika;
    return Array.from({ length: Math.max(1, gunlukAdet) }, (_, i) => {
      const t = new Date(2000, 0, 1, s ?? 9, (d ?? 0) + i * adim);
      const bit = new Date(t.getTime() + sureDakika * 60000);
      return `${saatBicim(t)}–${saatBicim(bit)}`;
    });
  });

  const kisaTarih = (d: Date) => `${d.getDate()} ${AY_UZUN[d.getMonth()]!.slice(0, 3)}`;

  function gunDegistir(g: number) {
    gunler = gunler.includes(g) ? gunler.filter((x) => x !== g) : [...gunler, g].sort();
  }

  async function olustur() {
    if (sonuc.ogeler.length === 0 || !sonuc.ilkGun) return;
    hata = null;
    calisiyor = true;
    try {
      const { program } = await depo.programKaydet({
        id: '',
        baslik: ad.trim() || 'Çalışma programı',
        aciklama: '',
        kategori: kategori.trim() || 'genel',
        duzen: 'sirali',
        ogeler: $state.snapshot(sonuc.ogeler),
        kosu: null,
      });
      const { program: calisan } = await depo.programBaslat(
        program,
        sonuc.ilkGun,
        tur === null ? 'suresiz' : 'tur',
        0,
        null,
        { tur, araGun: 0 },
      );
      onOlusturuldu(calisan, sonuc.ilkGun);
      onKapat();
    } catch (e) {
      hata = `Oluşturulamadı: ${e}`;
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

<div class="panel" role="dialog" aria-modal="true" aria-label="Konulardan program oluştur">
  <header>
    <div>
      <h2>Konulardan program oluştur</h2>
      <p class="alt">Konular günlere dönüşümlü dağıtılır; sonuç düzenlenebilir bir program olur.</p>
    </div>
    <button class="ikon" onclick={onKapat} aria-label="Kapat">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-linecap="round" />
      </svg>
    </button>
  </header>

  <div class="govde">
    <label class="alan">
      <span class="etiket">Program adı</span>
      <input bind:value={ad} placeholder="Çalışma programı" />
    </label>

    <div class="alan">
      <span class="etiket">Kategori</span>
      <KategoriSecici bind:deger={kategori} />
    </div>

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
        dönüşümlü dağıtılır, aynı konu üst üste gelmez.
      </span>
    </label>

    <div class="alan">
      <span class="etiket">Çalışma günleri</span>
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
      <span class="ipucu">Seçilmeyen günler dinlenme günü olur.</span>
    </div>

    <div class="bolum">
      <span class="etiket">Günün düzeni</span>
      <div class="dortlu">
        <label class="kucuk-alan">
          <span>İlk çalışma saati</span>
          <input type="time" bind:value={ilkSaat} />
        </label>
        <label class="kucuk-alan">
          <span>Günde kaç çalışma</span>
          <input type="number" min="1" max="12" bind:value={gunlukAdet} />
        </label>
        <label class="kucuk-alan">
          <span>Çalışma süresi (dk)</span>
          <input type="number" min="10" max="240" step="5" bind:value={sureDakika} />
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
      <span>Her çalışma için alarm</span>
      {#if hatirlatmaVar}
        <span class="birimli">
          <input class="sayi" type="number" min="0" max="120" bind:value={hatirlatmaDakika} />
          <span class="birim">dakika önce</span>
        </span>
      {/if}
    </label>

    <div class="ikili">
      <label class="alan">
        <span class="etiket">Başlangıç</span>
        <input type="date" bind:value={baslangicAlani} />
      </label>
      {#if turKipi === 'tur'}
        <label class="alan">
          <span class="etiket">Kaç tur</span>
          <input type="number" min="1" max="520" bind:value={turSayisi} />
        </label>
      {/if}
    </div>

    <div class="alan">
      <span class="etiket">Konular bitince</span>
      <div class="kip-secici">
        {#each [['tek', 'Bir kez'], ['tur', 'Tur sayısı'], ['sinirsiz', 'Baştan al, sınırsız']] as const as [deger, etiket] (deger)}
          <button
            type="button"
            class="kip-dugme"
            class:secili={turKipi === deger}
            onclick={() => (turKipi = deger)}
          >{etiket}</button>
        {/each}
      </div>
    </div>

    {#if hata}
      <p class="hata" role="alert">{hata}</p>
    {/if}
  </div>

  <!-- Onizleme: ne uretilecegi olusturmadan once burada. -->
  <div class="onizleme" class:bos={sonuc.ogeler.length === 0}>
    {#if sonuc.ogeler.length === 0}
      <span class="onizleme-bos">
        {konular.length === 0 ? 'Önce birkaç konu yaz.' : 'En az bir gün seç.'}
      </span>
    {:else}
      <div class="sayilar">
        <span>1 tur: <strong class="zaman">{sonuc.calismaGunu}</strong> çalışma günü</span>
        <span class="ayrac-nokta"></span>
        <span><strong class="zaman">{sonuc.ogeler.length}</strong> çalışma</span>
        {#if sonuc.ilkGun}
          <span class="ayrac-nokta"></span>
          <span>{kisaTarih(sonuc.ilkGun)} – {bitis ? kisaTarih(bitis) : 'sınırsız'}</span>
        {/if}
      </div>
      <div class="dagilim">
        {#each sonuc.dagilim as k (k.ad)}
          <span class="pay"><span class="pay-ad">{k.ad}</span>
            <span class="zaman">{k.adet}</span></span>
        {/each}
      </div>
    {/if}
  </div>

  <footer>
    <button type="button" class="dugme ikincil" onclick={onKapat} disabled={calisiyor}>
      Vazgeç
    </button>
    <button
      type="button"
      class="dugme birincil"
      onclick={olustur}
      disabled={calisiyor || sonuc.ogeler.length === 0}
    >
      {calisiyor ? 'Oluşturuluyor…' : 'Oluştur ve başlat'}
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
    grid-template-rows: auto minmax(0, 1fr) auto auto;
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
  .alt { margin-top: 2px; font-size: 13px; color: var(--kagit-3); }

  .govde { display: grid; gap: var(--b4); padding: var(--b4); overflow-y: auto; }

  .alan { display: grid; gap: var(--b1); min-width: 0; }
  .etiket { font-size: 12px; font-weight: 500; color: var(--kagit-3); }
  .ipucu {
    font-size: 12px;
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
    font-size: 14px;
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
  .kucuk-alan span { font-size: 11.5px; color: var(--kagit-3); }
  .kucuk-alan input { padding: 5px var(--b2); font-size: 13.5px; }

  /* Gunun neye benzeyecegini gosteren kucuk serit. */
  .ornek { display: flex; flex-wrap: wrap; gap: var(--b1); }
  .ornek-blok {
    padding: 2px 7px;
    border-left: 2px solid var(--pirinc);
    border-radius: 3px;
    background: var(--pirinc-sonuk);
    font-size: 12px;
    color: var(--kagit-2);
  }

  .kip-secici { display: flex; gap: 3px; }
  .kip-dugme {
    flex: 1;
    padding: 6px 0;
    border: 1px solid var(--ayrac);
    border-radius: var(--yuvarlak-dugme);
    font-size: 12.5px;
    color: var(--kagit-3);
    transition: all var(--gecis-hizli);
  }
  .kip-dugme:hover { color: var(--kagit-2); border-color: var(--ayrac-guclu); }
  .kip-dugme.secili {
    background: var(--pirinc);
    border-color: var(--pirinc);
    color: var(--pirinc-ustu);
  }

  .gun-secici { display: flex; gap: var(--b1); }
  .gun-dugme {
    flex: 1;
    padding: 6px 0;
    border: 1px solid var(--ayrac);
    border-radius: var(--yuvarlak-dugme);
    font-size: 12.5px;
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
    font-size: 14px;
    cursor: pointer;
  }
  .satir-onay input[type='checkbox'] {
    width: 15px;
    height: 15px;
    accent-color: var(--pirinc);
  }
  .birimli { display: flex; align-items: center; gap: var(--b2); margin-left: auto; }
  .sayi { width: 58px; padding: 4px var(--b2); text-align: right; font-family: var(--yazi-mono); }
  .birim { font-size: 12.5px; color: var(--kagit-3); }

  code {
    padding: 1px 4px;
    border-radius: 3px;
    background: var(--murekkep);
    font-family: var(--yazi-mono);
    font-size: 11.5px;
  }

  .hata {
    padding: var(--b2) var(--b3);
    border-left: 2px solid var(--kirmizi);
    background: var(--kirmizi-sonuk);
    font-size: 13px;
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
  .onizleme-bos { font-size: 13px; color: var(--kagit-3); }

  .sayilar {
    display: flex;
    align-items: center;
    gap: var(--b2);
    font-size: 13.5px;
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
    font-size: 12px;
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
    font-size: 14px;
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
