<script lang="ts">
  /**
   * Programin ayrintili analizi ve eylemleri.
   *
   * Dort soruya cevap veriyor: hangi gun ne var, ne kadar tutuyor, ne kadari
   * oldu, nerede programdan saptim. Son soru onemli: ayirma (bir gunu elle
   * degistirme) geri alinabilir olmasaydi, kullanici gunu ayirip kopyayi
   * sildiginde o gun kalici olarak bosalir ve hicbir yerde aciklanmazdi.
   */
  import { cagir, isoCoz, TAURI_ICINDE } from '../lib/ipc.ts';
  import { saatBicim } from '../lib/tarih.ts';
  import { AY_UZUN, GUN_UZUN, type Program } from '../lib/tipler.ts';
  import { programOzeti } from '../lib/programUret.ts';
  import { depo } from '../lib/veri.svelte.ts';
  import {
    aktarimDosyaAdi,
    dosyaIndir,
    programiSar,
  } from '../lib/programAktarim.ts';
  import MetinIcerik from './MetinIcerik.svelte';

  interface Ozellikler {
    program: Program;
    onKapat: () => void;
    onDuzenle: (p: Program) => void;
    onBaslat: (p: Program) => void;
  }
  let { program, onKapat, onDuzenle, onBaslat }: Ozellikler = $props();

  // Depo tazelendiginde bu panel de guncel kalsin.
  const guncel = $derived(depo.programlar.find((p) => p.id === program.id) ?? program);
  const ozet = $derived(programOzeti(guncel, depo.etkinlikler, depo.simdi));

  let acikGun = $state<number | null>(null);
  let silmeOnayi = $state(false);
  let calisiyor = $state(false);
  let hata = $state<string | null>(null);
  let bilgi = $state<string | null>(null);

  const kisaTarih = (d: Date) => `${d.getDate()} ${AY_UZUN[d.getMonth()]!.slice(0, 3)}`;
  const saatler = (dk: number) => Math.round((dk / 60) * 10) / 10;

  const yuzde = $derived(ozet.gecen > 0 ? Math.round((ozet.tamamlanan / ozet.gecen) * 100) : 0);

  async function sar(is: () => Promise<void>, basarili?: string) {
    if (calisiyor) return;
    calisiyor = true;
    hata = null;
    bilgi = null;
    try {
      await is();
      if (basarili) bilgi = basarili;
    } catch (e) {
      hata = `${e}`;
    } finally {
      calisiyor = false;
    }
  }

  const durdur = () =>
    sar(() => depo.programDurdur(guncel), 'Program durduruldu; geçmiş günler takvimde kaldı.');

  const tumuyleSil = () =>
    sar(async () => {
      await depo.programSil(guncel.id, true);
      onKapat();
    });

  const programaDondur = (seriId: string, gun: string) =>
    sar(() => depo.olusumBirlestir(seriId, gun), 'Gün programa döndürüldü.');

  /**
   * Programi tek bir .json dosyasina yazar. Uygulama icinde kullanici nereye
   * kaydedecegini secer (dosyayi Rust yazar); tarayicida tarayicinin indirme
   * klasorune duser.
   */
  async function disaAktar() {
    await sar(async () => {
      const ad = aktarimDosyaAdi(guncel);
      if (!TAURI_ICINDE) {
        dosyaIndir(ad, JSON.stringify(programiSar(guncel), null, 2));
        bilgi = `${ad} indirildi.`;
        return;
      }
      const { save } = await import('@tauri-apps/plugin-dialog');
      const yol = await save({
        defaultPath: ad,
        title: 'Programı nereye kaydedelim?',
        filters: [{ name: 'Program dosyası', extensions: ['json'] }],
      });
      if (!yol) return;
      await cagir('program_disa_aktar', { id: guncel.id, yol });
      bilgi = 'Program dosyaya yazıldı.';
    });
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === 'Escape' && !calisiyor) {
      e.stopPropagation();
      onKapat();
    }
  }}
/>

<div
  class="perde"
  role="button"
  tabindex="-1"
  aria-label="Kapat"
  onclick={() => !calisiyor && onKapat()}
  onkeydown={(e) => { if (e.key === 'Enter' && !calisiyor) onKapat(); }}
></div>

<div class="panel" role="dialog" aria-modal="true" aria-label="Program ayrıntıları">
  <header>
    <div class="basliklar">
      <h2>{guncel.baslik}</h2>
      <span class="durum" class:calisiyor={!!guncel.kosu}>
        {#if guncel.kosu}
          {kisaTarih(isoCoz(guncel.kosu.baslangic))} –
          {guncel.kosu.bitis ? kisaTarih(isoCoz(guncel.kosu.bitis)) : 'süresiz'}
        {:else}
          Uykuda
        {/if}
      </span>
    </div>
    <button class="ikon" onclick={onKapat} aria-label="Kapat">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-linecap="round" />
      </svg>
    </button>
  </header>

  <div class="govde">
    {#if hata}<p class="hata" role="alert">{hata}</p>{/if}
    {#if bilgi}<p class="bilgi" role="status">{bilgi}</p>{/if}

    {#if guncel.aciklama}
      <MetinIcerik metin={guncel.aciklama} />
    {/if}

    <!-- ------------------------------------------------------ sayilar -->
    <div class="sayilar">
      <div class="kutu">
        <span class="deger" data-sayisal>{ozet.haftalikOturum}</span>
        <span class="alt">haftada iş</span>
      </div>
      <div class="kutu">
        <span class="deger" data-sayisal>{saatler(ozet.haftalikDakika)}</span>
        <span class="alt">haftada saat</span>
      </div>
      {#if ozet.toplamOturum !== null}
        <div class="kutu">
          <span class="deger" data-sayisal>{ozet.toplamOturum}</span>
          <span class="alt">toplam iş</span>
        </div>
        <div class="kutu">
          <span class="deger" data-sayisal>{saatler(ozet.toplamDakika ?? 0)}</span>
          <span class="alt">toplam saat</span>
        </div>
      {/if}
    </div>

    {#if guncel.kosu && ozet.gecen > 0}
      <div class="ilerleme">
        <div class="ilerleme-ust">
          <span class="etiket">İlerleme</span>
          <span class="ilerleme-sayi">
            {ozet.tamamlanan} / {ozet.gecen} iş · %{yuzde}
          </span>
        </div>
        <div class="cubuk"><span class="dolu" style:width="{yuzde}%"></span></div>
      </div>
    {/if}

    <!-- --------------------------------------------------- hafta izgarasi -->
    <div class="bolum">
      <span class="etiket">Hangi gün ne var</span>
      {#each ozet.haftalik as g (g.gun)}
        <div class="gun" class:bos={g.ogeler.length === 0}>
          <button
            class="gun-satiri"
            onclick={() => (acikGun = acikGun === g.gun ? null : g.gun)}
            disabled={g.ogeler.length === 0}
          >
            <span class="gun-ad">{GUN_UZUN[g.gun]}</span>
            {#if g.ogeler.length === 0}
              <span class="gun-alt">—</span>
            {:else}
              <span class="gun-alt">
                {g.ogeler.length} iş · {saatler(g.dakika)} saat
              </span>
            {/if}
          </button>

          {#if acikGun === g.gun}
            <div class="gun-icerik">
              {#each g.ogeler as o (o.id)}
                <div class="oge">
                  <div class="oge-ust">
                    <span class="zaman">{o.saat}</span>
                    <span class="oge-ad">{o.baslik}</span>
                    <span class="oge-sure">{o.sure_dakika} dk</span>
                  </div>
                  {#if o.icerik}
                    <MetinIcerik metin={o.icerik} />
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>

    <!-- --------------------------------------------------------- sapmalar -->
    {#if ozet.sapmalar.length > 0}
      <div class="bolum">
        <span class="etiket">Elle değiştirilen günler</span>
        <p class="aciklama">
          Bu günler programdan ayrıldı; program güncellemeleri onlara
          dokunmaz. İstenirse programa geri döndürülebilir.
        </p>
        {#each ozet.sapmalar as s (s.seriId + s.gun)}
          <div class="sapma">
            <div class="sapma-bilgi">
              <span class="sapma-gun zaman">{s.gun}</span>
              <span class="sapma-ad">
                {s.ogeBaslik}
                {#if s.kopya}
                  — {saatBicim(isoCoz(s.kopya.baslangic), depo.ayarlar.saat24)}
                {:else}
                  — atlandı
                {/if}
              </span>
            </div>
            <button
              class="kucuk"
              disabled={calisiyor}
              onclick={() => void programaDondur(s.seriId, s.gun)}
            >
              Programa döndür
            </button>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <footer>
    <div class="sol">
      <button class="dugme ikincil" onclick={() => onDuzenle(guncel)} disabled={calisiyor}>
        Düzenle
      </button>
      <button class="dugme ikincil" onclick={() => void disaAktar()} disabled={calisiyor}>
        Dışa aktar
      </button>
    </div>
    <div class="sag">
      {#if guncel.kosu}
        <button class="dugme ikincil" onclick={() => void durdur()} disabled={calisiyor}>
          Durdur
        </button>
      {/if}
      <button class="dugme tehlike" onclick={() => (silmeOnayi = !silmeOnayi)} disabled={calisiyor}>
        Sil
      </button>
      {#if !guncel.kosu}
        <button class="dugme birincil" onclick={() => onBaslat(guncel)} disabled={calisiyor}>
          Başlat
        </button>
      {/if}
    </div>
  </footer>

  {#if silmeOnayi}
    <div class="onay">
      <p>
        Program tanımı ve takvimdeki <strong>bütün izi</strong> — geçmiş
        işler dahil — silinecek.
        {#if ozet.tamamlanan > 0}<strong>{ozet.tamamlanan} iş tamamlanmış.</strong>{/if}
        Yalnızca ileriyi temizlemek için <em>Durdur</em> yeterlidir.
      </p>
      <div class="onay-dugmeler">
        <button class="kucuk tehlike-metin" disabled={calisiyor} onclick={() => void tumuyleSil()}>
          {calisiyor ? 'Siliniyor…' : 'Tümüyle sil'}
        </button>
        <button class="kucuk" onclick={() => (silmeOnayi = false)}>Vazgeç</button>
      </div>
    </div>
  {/if}
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
    max-height: min(820px, calc(100vh - 48px));
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
    gap: var(--b3);
    padding: var(--b4) var(--b5);
    border-bottom: 1px solid var(--ayrac);
  }
  .basliklar { display: grid; gap: 2px; min-width: 0; }
  h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--kagit);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .durum { font-size: 11px; color: var(--kagit-3); }
  .durum.calisiyor { color: var(--pirinc); }

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

  .etiket {
    font-size: 10.5px;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--kagit-3);
  }
  .aciklama { margin: 0; font-size: 11.5px; line-height: 1.5; color: var(--kagit-3); }

  .sayilar { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--b2); }
  .kutu {
    display: grid;
    gap: 2px;
    padding: var(--b3) var(--b2);
    background: var(--murekkep);
    border: 1px solid var(--ayrac);
    border-radius: var(--yuvarlak-dugme);
    text-align: center;
  }
  .deger { font-size: 18px; font-weight: 600; color: var(--kagit); letter-spacing: -0.02em; }
  .kutu .alt { font-size: 10px; color: var(--kagit-3); }

  .ilerleme { display: grid; gap: 5px; }
  .ilerleme-ust { display: flex; align-items: baseline; justify-content: space-between; }
  .ilerleme-sayi { font-size: 11.5px; color: var(--kagit-2); }
  .cubuk {
    height: 5px;
    background: var(--murekkep);
    border-radius: 999px;
    overflow: hidden;
  }
  .dolu { display: block; height: 100%; background: var(--zeytin); }

  .bolum { display: grid; gap: var(--b2); }

  .gun { display: grid; }
  .gun-satiri {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--b3);
    width: 100%;
    padding: 5px var(--b3);
    border-radius: var(--yuvarlak-dugme);
    text-align: left;
  }
  .gun-satiri:hover:not(:disabled) { background: var(--murekkep-3); }
  .gun-satiri:disabled { cursor: default; }
  .gun.bos { opacity: 0.5; }
  .gun-ad { font-size: 12.5px; color: var(--kagit-2); }
  .gun-alt { font-size: 11px; color: var(--kagit-3); }

  .gun-icerik {
    display: grid;
    gap: var(--b3);
    margin: 2px 0 var(--b2) var(--b3);
    padding: var(--b3);
    border-left: 2px solid var(--ayrac-guclu);
    background: var(--murekkep);
    border-radius: 0 var(--yuvarlak-dugme) var(--yuvarlak-dugme) 0;
  }
  .oge { display: grid; gap: 3px; }
  .oge-ust { display: flex; align-items: baseline; gap: var(--b2); }
  .oge-ust .zaman { font-size: 11px; color: var(--kagit-3); flex: none; }
  .oge-ad { font-size: 12.5px; color: var(--kagit); flex: 1; }
  .oge-sure { font-size: 10.5px; color: var(--kagit-3); flex: none; }

  .sapma {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--b3);
    padding: 4px var(--b3);
    background: var(--murekkep);
    border: 1px solid var(--ayrac);
    border-radius: var(--yuvarlak-dugme);
  }
  .sapma-bilgi { display: grid; min-width: 0; }
  .sapma-gun { font-size: 11px; color: var(--kagit-3); }
  .sapma-ad {
    font-size: 12px;
    color: var(--kagit-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--b2);
    padding: var(--b4) var(--b5);
    border-top: 1px solid var(--ayrac);
  }
  .sol, .sag { display: flex; gap: var(--b2); }

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
  .tehlike { color: var(--kagit-3); }
  .tehlike:hover:not(:disabled) { color: var(--kirmizi); background: var(--kirmizi-sonuk); }

  .onay {
    display: grid;
    gap: var(--b2);
    padding: var(--b3) var(--b5) var(--b4);
    border-top: 1px solid var(--ayrac);
    border-left: 2px solid var(--kirmizi);
    background: var(--kirmizi-sonuk);
    font-size: 11.5px;
    line-height: 1.5;
    color: var(--kagit-2);
  }
  .onay p { margin: 0; }
  .onay-dugmeler { display: flex; gap: var(--b2); }

  .kucuk {
    padding: 3px var(--b2);
    border: 1px solid var(--ayrac);
    border-radius: var(--yuvarlak-dugme);
    font-size: 11.5px;
    color: var(--kagit-2);
    flex: none;
    transition: color var(--gecis-hizli), border-color var(--gecis-hizli);
  }
  .kucuk:hover:not(:disabled) { color: var(--kagit); border-color: var(--ayrac-guclu); }
  .kucuk:disabled { opacity: 0.5; cursor: default; }
  .tehlike-metin { color: var(--kirmizi); }
  .tehlike-metin:hover:not(:disabled) { border-color: var(--kirmizi); }

  .hata {
    margin: 0;
    padding: var(--b2) var(--b3);
    border-left: 2px solid var(--kirmizi);
    background: var(--kirmizi-sonuk);
    font-size: 12px;
    color: var(--kirmizi);
  }
  .bilgi {
    margin: 0;
    padding: var(--b2) var(--b3);
    border-left: 2px solid var(--zeytin);
    font-size: 12px;
    color: var(--kagit-2);
  }
</style>
