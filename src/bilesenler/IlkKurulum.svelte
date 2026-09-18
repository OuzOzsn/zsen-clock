<script lang="ts">
  /**
   * Ilk calistirma karsilamasi.
   *
   * Yalnizca bir kez, `ayarlar.ilk_kurulum_yapildi` false iken cikar. Iki soru
   * soruyor cunku ikisi de kullanicinin bilgisayarinda kalici iz birakiyor
   * (masaustune dosya, kayit defterine satir) - sessizce yapilmasi dogru olmaz.
   *
   * Ikisi de sonradan Ayarlar'dan degistirilebiliyor; burada verdigin cevap
   * kalici bir taahhut degil, sadece baslangic tercihi.
   */
  import { onMount } from 'svelte';
  import { cagir } from '../lib/ipc.ts';
  import { depo } from '../lib/veri.svelte.ts';

  interface Ozellikler {
    onBitti: () => void;
  }
  let { onBitti }: Ozellikler = $props();

  // Kurulum dosyasi zaten kisayol koymus olabilir; kutuyu gercek duruma
  // gore isaretliyoruz ki "evet" demek ikinci bir kisayol olusturmasin ve
  // "hayir" demek kurulumun koydugunu kaldirsin.
  let kisayol = $state(true);
  let acilista = $state(true);
  let kaydediliyor = $state(false);
  let hata = $state<string | null>(null);

  /**
   * Tiklama korumasi.
   *
   * Bu panel uygulama acilirken kendiliginden geliyor ve cogu zaman farenin
   * tam altinda beliriyor. Masaustundeki kisayola CIFT tiklayan biri icin
   * ikinci tiklama dogrudan buraya dusuyor ve panel goruilmeden kapaniyor -
   * olcerek dogruladik. Bu yuzden kisa bir sure hicbir dugme calismiyor.
   */
  const TIK_BEKLEME_MS = 600;
  let dugmelerAcik = $state(false);

  onMount(() => {
    const z = setTimeout(() => (dugmelerAcik = true), TIK_BEKLEME_MS);
    void cagir('kisayol_durumu').then((v) => (kisayol = v));
    return () => clearTimeout(z);
  });

  async function tamam() {
    if (!dugmelerAcik || kaydediliyor) return;
    kaydediliyor = true;
    hata = null;
    try {
      await cagir('kisayol_ayarla', { olsun: kisayol });
      await depo.ayarKaydet({
        masaustu_kisayolu: kisayol,
        acilista_baslat: acilista,
        ilk_kurulum_yapildi: true,
      });
      onBitti();
    } catch (e) {
      hata = `Ayarlanamadı: ${e}. Ayarlar'dan tekrar deneyebilirsin.`;
      kaydediliyor = false;
    }
  }

  /** Atlarken de "bir daha sorma" işaretleniyor, yoksa her açılışta çıkar. */
  async function atla() {
    if (!dugmelerAcik || kaydediliyor) return;
    kaydediliyor = true;
    await depo.ayarKaydet({ ilk_kurulum_yapildi: true });
    onBitti();
  }
</script>

<div class="perde"></div>

<div class="panel" role="dialog" aria-modal="true" aria-label="Hoş geldin">
  <div class="ust">
    <h2>Başlarken</h2>
    <p class="alt">
      İki ayar — ikisi de sonradan Ayarlar'dan değiştirilebilir.
    </p>
  </div>

  <div class="secenekler">
    <label class="secenek">
      <input type="checkbox" bind:checked={kisayol} />
      <span>
        <span class="ad">Masaüstü kısayolu oluştur</span>
        <span class="aciklama">
          Uygulama klasörden aranmak yerine masaüstünden açılır.
        </span>
      </span>
    </label>

    <label class="secenek">
      <input type="checkbox" bind:checked={acilista} />
      <span>
        <span class="ad">Bilgisayar açılınca başlat</span>
        <span class="aciklama">
          Alarmların çalabilmesi için uygulamanın açık olması gerekiyor. Tepside
          sessizce bekler.
        </span>
      </span>
    </label>
  </div>

  {#if hata}
    <p class="hata" role="alert">{hata}</p>
  {/if}

  <footer>
    <button class="dugme ikincil" onclick={atla} disabled={!dugmelerAcik || kaydediliyor}>
      Şimdilik geç
    </button>
    <button class="dugme birincil" onclick={tamam} disabled={!dugmelerAcik || kaydediliyor}>
      {kaydediliyor ? 'Ayarlanıyor…' : 'Tamam'}
    </button>
  </footer>
</div>

<style>
  .perde {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.62);
    animation: soluk var(--gecis) both;
  }
  @keyframes soluk { from { opacity: 0; } to { opacity: 1; } }

  .panel {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: grid;
    gap: var(--b5);
    width: min(430px, calc(100vw - 48px));
    padding: var(--b6) var(--b5) var(--b5);
    background: var(--murekkep-2);
    border: 1px solid var(--ayrac-guclu);
    border-radius: var(--yuvarlak-panel);
    box-shadow: var(--golge-kabuk);
    animation: gir 240ms cubic-bezier(0.2, 0.7, 0.3, 1) both;
  }
  @keyframes gir {
    from { opacity: 0; transform: translate(-50%, calc(-50% + 8px)); }
    to { opacity: 1; transform: translate(-50%, -50%); }
  }

  .ust { display: grid; gap: var(--b2); }
  h2 {
    font-size: 21px;
    font-weight: 600;
    letter-spacing: -0.02em;
  }
  .alt {
    font-size: 13px;
    line-height: 1.55;
    color: var(--kagit-2);
    max-width: 42ch;
  }

  .secenekler { display: grid; gap: var(--b3); }
  .secenek {
    display: flex;
    align-items: flex-start;
    gap: var(--b3);
    padding: var(--b3);
    border: 1px solid var(--ayrac);
    border-radius: var(--yuvarlak-dugme);
    cursor: pointer;
    transition: border-color var(--gecis-hizli), background var(--gecis-hizli);
  }
  .secenek:hover { border-color: var(--ayrac-guclu); background: var(--murekkep-3); }
  .secenek:has(input:checked) { border-color: var(--pirinc); background: var(--pirinc-sonuk); }

  input[type='checkbox'] {
    flex: none;
    width: 16px;
    height: 16px;
    margin-top: 1px;
    accent-color: var(--pirinc);
  }

  .ad { display: block; font-size: 13.5px; font-weight: 500; color: var(--kagit); }
  .aciklama {
    display: block;
    margin-top: 2px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--kagit-3);
  }

  .hata {
    padding: var(--b2) var(--b3);
    border-left: 2px solid var(--kirmizi);
    background: var(--kirmizi-sonuk);
    font-size: 12px;
  }

  footer { display: flex; justify-content: flex-end; gap: var(--b2); }
  .dugme {
    height: 36px;
    padding: 0 var(--b5);
    border-radius: var(--yuvarlak-dugme);
    font-size: 13px;
    font-weight: 500;
    transition: background var(--gecis-hizli), color var(--gecis-hizli);
  }
  .birincil { background: var(--pirinc); color: var(--pirinc-ustu); font-weight: 600; }
  .birincil:hover:not(:disabled) { background: var(--pirinc-parlak); }
  .ikincil { color: var(--kagit-3); }
  .ikincil:hover:not(:disabled) { color: var(--kagit-2); }
  .dugme:disabled { opacity: 0.55; cursor: default; }
</style>
