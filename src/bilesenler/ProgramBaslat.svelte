<script lang="ts">
  /**
   * "Programi baslat" kutusu: tarih + sure.
   *
   * Turetilen bitis, ilk olusum ve toplam is sayisi canli gosteriliyor - "4 hafta"
   * ne demek oldugu hicbir zaman surpriz olmasin. Sure her zaman SECILEN
   * TARIHTEN sayiliyor (bkz. programUret.ts/bitisHesapla).
   */
  import { isoCoz, yerelISO } from '../lib/ipc.ts';
  import { gunAnahtari, gunBasi, olusumlar } from '../lib/tarih.ts';
  import { AY_UZUN, type Program, type SureKipi } from '../lib/tipler.ts';
  import { bitisHesapla, ogeyiEtkinligeCevir } from '../lib/programUret.ts';
  import { depo } from '../lib/veri.svelte.ts';

  interface Ozellikler {
    program: Program;
    onKapat: () => void;
    onBasladi: (ilkGun: Date) => void;
  }
  let { program, onKapat, onBasladi }: Ozellikler = $props();

  const bugun = gunBasi(new Date());

  let baslangicAlani = $state(gunAnahtari(bugun));
  let kip = $state<SureKipi>('hafta');
  let hafta = $state(4);
  let bitisAlani = $state(gunAnahtari(new Date(bugun.getTime() + 27 * 86400000)));
  let hata = $state<string | null>(null);
  let calisiyor = $state(false);

  const baslangic = $derived(isoCoz(baslangicAlani));
  const bitis = $derived(
    bitisHesapla(baslangic, kip, hafta, kip === 'tarih' ? isoCoz(bitisAlani) : null),
  );

  /** Onizleme: kosu gercekten kurulmus gibi etkinlikleri uret ve say. */
  const onizleme = $derived.by(() => {
    const kosu = {
      baslangic: gunAnahtari(baslangic),
      bitis: bitis ? gunAnahtari(bitis) : null,
      kip,
      hafta: kip === 'hafta' ? hafta : null,
      baslatildi: yerelISO(new Date()),
    };
    let ilkGun: Date | null = null;
    let is = 0;
    let dakika = 0;

    for (const oge of program.ogeler) {
      const e = ogeyiEtkinligeCevir({ ...program, kosu }, oge, kosu, baslangic);
      if (!e) continue;
      const bas = isoCoz(e.baslangic);
      if (!ilkGun || bas < ilkGun) ilkGun = bas;
      if (bitis) {
        const adet = olusumlar(e, baslangic, bitis).length;
        is += adet;
        dakika += adet * oge.sure_dakika;
      }
    }
    return { ilkGun, is, dakika };
  });

  const kisaTarih = (d: Date) => `${d.getDate()} ${AY_UZUN[d.getMonth()]!.slice(0, 3)}`;

  async function baslat() {
    hata = null;
    if (program.ogeler.length === 0) {
      hata = 'Programda hiç iş yok.';
      return;
    }
    if (!onizleme.ilkGun) {
      hata = 'Bu tarih aralığında hiçbir işin günü gelmiyor.';
      return;
    }
    if (kip === 'tarih' && bitis && bitis < gunBasi(baslangic)) {
      hata = 'Bitiş tarihi başlangıçtan önce olamaz.';
      return;
    }

    calisiyor = true;
    try {
      await depo.programBaslat(
        program,
        baslangic,
        kip,
        hafta,
        kip === 'tarih' ? isoCoz(bitisAlani) : null,
      );
      onBasladi(onizleme.ilkGun);
      onKapat();
    } catch (e) {
      hata = `Başlatılamadı: ${e}`;
    } finally {
      calisiyor = false;
    }
  }

  function klavye(e: KeyboardEvent) {
    if (e.key === 'Escape' && !calisiyor) {
      e.stopPropagation();
      onKapat();
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void baslat();
  }

  const kipler: [SureKipi, string][] = [
    ['hafta', 'Hafta sayısı'],
    ['tarih', 'Bitiş tarihi'],
    ['suresiz', 'Süresiz'],
  ];
</script>

<svelte:window onkeydown={klavye} />

<div
  class="perde"
  role="button"
  tabindex="-1"
  aria-label="Kapat"
  onclick={() => !calisiyor && onKapat()}
  onkeydown={(e) => { if (e.key === 'Enter' && !calisiyor) onKapat(); }}
></div>

<div class="panel" role="dialog" aria-modal="true" aria-label="Programı başlat">
  <header>
    <h2>{program.baslik} — başlat</h2>
    <button class="ikon" onclick={onKapat} aria-label="Kapat">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-linecap="round" />
      </svg>
    </button>
  </header>

  <div class="govde">
    {#if hata}<p class="hata" role="alert">{hata}</p>{/if}

    <label class="alan">
      <span class="etiket">Başlangıç tarihi</span>
      <input type="date" bind:value={baslangicAlani} />
      <span class="ipucu">
        Seçilen gün dahildir: ilk iş, bu tarihten itibaren programdaki
        ilk güne düşer.
      </span>
    </label>

    <div class="alan">
      <span class="etiket">Süre</span>
      <div class="kip-secici">
        {#each kipler as [deger, etiket] (deger)}
          <button
            type="button"
            class="kip-dugme"
            class:secili={kip === deger}
            onclick={() => (kip = deger)}
          >
            {etiket}
          </button>
        {/each}
      </div>
    </div>

    {#if kip === 'hafta'}
      <label class="alan kucuk">
        <span class="etiket">Kaç hafta</span>
        <input type="number" min="1" max="520" bind:value={hafta} />
      </label>
    {:else if kip === 'tarih'}
      <label class="alan kucuk">
        <span class="etiket">Bitiş tarihi (bu gün dahil)</span>
        <input type="date" bind:value={bitisAlani} />
      </label>
    {/if}

    <div class="onizleme">
      {#if onizleme.ilkGun}
        <p class="satir">
          <strong>İlk iş:</strong>
          {kisaTarih(onizleme.ilkGun)}
        </p>
      {:else}
        <p class="satir sonuk">Bu aralıkta hiçbir işin günü gelmiyor.</p>
      {/if}
      <p class="satir">
        <strong>Aralık:</strong>
        {kisaTarih(baslangic)} –
        {#if bitis}{kisaTarih(bitis)}{:else}süresiz{/if}
      </p>
      {#if bitis}
        <p class="satir">
          <strong>Toplam:</strong>
          {onizleme.is} iş · {Math.round((onizleme.dakika / 60) * 10) / 10} saat
        </p>
      {:else}
        <p class="satir sonuk">
          Süresiz program takvimde ileriye doğru sürekli görünür,
          istenildiği zaman durdurulabilir.
        </p>
      {/if}
    </div>
  </div>

  <footer>
    <button class="dugme ikincil" onclick={onKapat} disabled={calisiyor}>Vazgeç</button>
    <button class="dugme birincil" onclick={() => void baslat()} disabled={calisiyor}>
      {calisiyor ? 'Başlatılıyor…' : 'Başlat'}
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
    grid-template-rows: auto 1fr auto;
    width: min(440px, calc(100vw - 48px));
    max-height: min(680px, calc(100vh - 48px));
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
    align-items: center;
    justify-content: space-between;
    gap: var(--b3);
    padding: var(--b4) var(--b5);
    border-bottom: 1px solid var(--ayrac);
  }
  h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--kagit);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ikon {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    flex: none;
    border-radius: var(--yuvarlak-dugme);
    color: var(--kagit-3);
  }
  .ikon:hover { color: var(--kagit); background: var(--murekkep-3); }

  .govde {
    display: grid;
    gap: var(--b4);
    align-content: start;
    padding: var(--b5);
    overflow-y: auto;
  }

  footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--b2);
    padding: var(--b4) var(--b5);
    border-top: 1px solid var(--ayrac);
  }

  .alan { display: grid; gap: 5px; }
  .kucuk { max-width: 200px; }
  .etiket {
    font-size: 10.5px;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--kagit-3);
  }
  .ipucu { font-size: 10.5px; line-height: 1.5; color: var(--kagit-3); }

  input {
    width: 100%;
    padding: 7px var(--b3);
    background: var(--murekkep);
    border: 1px solid var(--ayrac);
    border-radius: var(--yuvarlak-dugme);
    font: inherit;
    font-size: 13px;
    color: var(--kagit);
  }
  input:focus { border-color: var(--pirinc); outline: none; }
  input[type='date'] { color-scheme: dark; }

  .kip-secici { display: flex; gap: 3px; }
  .kip-dugme {
    flex: 1;
    padding: 6px 0;
    border: 1px solid var(--ayrac);
    border-radius: var(--yuvarlak-dugme);
    font-size: 11.5px;
    color: var(--kagit-3);
    transition: color var(--gecis-hizli), border-color var(--gecis-hizli),
      background var(--gecis-hizli);
  }
  .kip-dugme:hover { color: var(--kagit-2); border-color: var(--ayrac-guclu); }
  .kip-dugme.secili {
    background: var(--pirinc);
    border-color: var(--pirinc);
    color: var(--pirinc-ustu);
  }

  .onizleme {
    display: grid;
    gap: 3px;
    padding: var(--b3);
    background: var(--murekkep);
    border: 1px solid var(--ayrac);
    border-radius: var(--yuvarlak-dugme);
  }
  .satir { margin: 0; font-size: 12.5px; line-height: 1.5; color: var(--kagit-2); }
  .satir strong { font-weight: 500; color: var(--kagit-3); }
  .sonuk { font-size: 11.5px; color: var(--kagit-3); }

  .dugme {
    padding: 7px var(--b4);
    border-radius: var(--yuvarlak-dugme);
    font-size: 13px;
    transition: background var(--gecis-hizli), color var(--gecis-hizli);
  }
  .dugme:disabled { opacity: 0.55; cursor: default; }
  .ikincil { color: var(--kagit-2); }
  .ikincil:hover:not(:disabled) { color: var(--kagit); background: var(--murekkep-3); }
  .birincil { background: var(--pirinc); color: var(--pirinc-ustu); font-weight: 500; }
  .birincil:hover:not(:disabled) { background: var(--pirinc-parlak); }

  .hata {
    margin: 0;
    padding: var(--b2) var(--b3);
    border-left: 2px solid var(--kirmizi);
    background: var(--kirmizi-sonuk);
    font-size: 12px;
    color: var(--kirmizi);
  }
</style>
