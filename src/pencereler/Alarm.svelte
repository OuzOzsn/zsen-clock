<script lang="ts">
  /**
   * Alarm penceresi.
   *
   * Ekranin ortasinda, odakli ve her zaman ustte acilir. Isi tek bir soruyu
   * sormak: "bu simdi mi, sonra mi?" Bu yuzden iki gercek dugme var -
   * Tamamlandi ve Ertele. Kapatmak ucuncu siradadir ve sag ustte durur.
   *
   * Ayni anda birden fazla hatirlatma calabilir (orn. PC uykudan uyandiginda),
   * o yuzden pencere bir kuyruk gosterir: ustte kacinci oldugu yazar.
   */
  import { onMount } from 'svelte';
  import { cagir, dinle, isoCoz, TAURI_ICINDE } from '../lib/ipc.ts';
  import { saatBicim, sureMetni } from '../lib/tarih.ts';
  import { sesCal, type CalanSes } from '../lib/ses.ts';
  import type { Tetiklenen } from '../lib/tipler.ts';
  import { depo } from '../lib/veri.svelte.ts';
  import MetinIcerik from '../bilesenler/MetinIcerik.svelte';

  let kuyruk = $state<Tetiklenen[]>([]);
  let ertelemeAcik = $state(false);
  let otomatikKalan = $state<number | null>(null);
  let ses: CalanSes | null = null;
  /** Ses calmadiysa kullanici en azindan sebebini gorsun. */
  let sesHatasi = $state<string | null>(null);

  const suanki = $derived(kuyruk[0] ?? null);
  const olusumZamani = $derived(suanki ? isoCoz(suanki.olusum) : null);
  const bitisZamani = $derived(suanki?.bitis ? isoCoz(suanki.bitis) : null);
  const kategoriRengi = $derived(
    (suanki && depo.kategoriRenkleri[suanki.kategori]) || 'var(--kat-8)',
  );
  const ertelemeSecenekleri = [5, 10, 15, 30, 60];

  function anahtar(t: Tetiklenen): string {
    return `${t.etkinlik_id}@${t.olusum}#${t.dakika_once}`;
  }

  onMount(() => {
    void depo.yukle();
    void yenile();
    const temizle = dinle<null>('alarm-guncellendi', () => void yenile());
    const tusZamani = setTimeout(() => (tuslarAcik = true), TUS_BEKLEME_MS);
    return () => {
      clearTimeout(tusZamani);
      void temizle.then((f) => f());
      sesiDurdur();
    };
  });

  async function yenile() {
    kuyruk = await cagir('alarm_kuyrugu');
    if (kuyruk.length > 0) {
      void sesiCal();
      otomatikGeriSayimiKur();
    }
  }

  // --- ses ---------------------------------------------------------------

  async function sesiCal() {
    if (!suanki || !TAURI_ICINDE) return;
    const dosya = suanki.ses || depo.ayarlar.varsayilan_ses;
    if (!dosya) return;

    sesiDurdur();
    sesHatasi = null;
    try {
      ses = await sesCal(dosya, depo.ayarlar.ses_seviyesi, depo.ayarlar.ses_tekrari);
    } catch (e) {
      // Ses calmasa da alarm penceresi duruyor; ama sessizce yutmuyoruz,
      // yoksa kullanici neden ses gelmedigini hic ogrenemiyor.
      ses = null;
      sesHatasi = `Zil sesi çalınamadı (${dosya})`;
      console.error('[alarm] ses hatasi:', e);
    }
  }

  function sesiDurdur() {
    ses?.durdur();
    ses = null;
  }

  // --- otomatik kapanma ---------------------------------------------------

  let otomatikSayac: number | undefined;

  function otomatikGeriSayimiKur() {
    clearInterval(otomatikSayac);
    const sn = depo.ayarlar.otomatik_kapanma_saniye;
    if (!sn) {
      otomatikKalan = null;
      return;
    }
    otomatikKalan = sn;
    otomatikSayac = window.setInterval(() => {
      if (otomatikKalan === null) return;
      otomatikKalan -= 1;
      if (otomatikKalan <= 0) {
        clearInterval(otomatikSayac);
        void kapat();
      }
    }, 1000);
  }

  function otomatigiIptalEt() {
    clearInterval(otomatikSayac);
    otomatikKalan = null;
  }

  // --- eylemler -----------------------------------------------------------

  async function sonrakine(islem: () => Promise<void>) {
    sesiDurdur();
    otomatigiIptalEt();
    ertelemeAcik = false;
    await islem();
    kuyruk = kuyruk.slice(1);
    if (kuyruk.length > 0) {
      void sesiCal();
      otomatikGeriSayimiKur();
    }
  }

  const kapat = () =>
    sonrakine(async () => {
      if (suanki) await cagir('alarm_kapat', { anahtar: anahtar(suanki) });
    });

  const tamamla = () =>
    sonrakine(async () => {
      if (suanki) await cagir('alarm_tamamla', { anahtar: anahtar(suanki) });
    });

  const ertele = (dakika: number) =>
    sonrakine(async () => {
      if (suanki) await cagir('alarm_ertele', { anahtar: anahtar(suanki), dakika });
    });

  /**
   * Odak calma korumasi.
   *
   * Alarm penceresi kendiliginden acilip odagi aliyor. Kullanici o sirada
   * baska bir yerde yaziyorsa, parmagindaki bir sonraki tusa basma bu pencereye
   * dusuyor. Bu yuzden:
   *   - Enter "Tamamlandi"ya bagli DEGIL; tamamlamak bilincli bir tiklama ister.
   *   - Pencere acildiktan sonraki kisa sure boyunca hicbir tus islenmez.
   * Escape guvenli: alarmi kapatir ama hatirlatma "gecikmis" olarak kalir.
   */
  const TUS_BEKLEME_MS = 700;
  let tuslarAcik = $state(false);

  function klavye(e: KeyboardEvent) {
    if (!tuslarAcik) return;
    if (e.key === 'Escape') void kapat();
  }
</script>

<svelte:window onkeydown={klavye} />

<div class="kabuk" style:--kategori={kategoriRengi}>
  {#if suanki}
    <!-- Sol kenardaki ince serit kategorinin rengi: alarm hangi tur ise ait,
         takvimdeki rengiyle ayni. -->
    <span class="serit" aria-hidden="true"></span>
    <header>
      <div class="etiket" class:gecmis={suanki.kacirilmis}>
        <span class="nokta"></span>
        {#if suanki.kacirilmis}
          Saati geçti
        {:else if suanki.dakika_once > 0}
          {suanki.dakika_once} dakika sonra başlıyor
        {:else}
          Şimdi
        {/if}
      </div>
      <div class="sag">
        {#if kuyruk.length > 1}
          <span class="kuyruk-sayisi">1 / {kuyruk.length}</span>
        {/if}
        <button class="ikon" onclick={kapat} title="Kapat — hatırlatma gecikmiş olarak kalır (Esc)" aria-label="Kapat">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-linecap="round" />
          </svg>
        </button>
      </div>
    </header>

    <main>
      <h1>{suanki.baslik}</h1>
      {#if suanki.not}
        <div class="not"><MetinIcerik metin={suanki.not} /></div>
      {/if}
      {#if sesHatasi}
        <p class="ses-hatasi">{sesHatasi} — Ayarlar'dan başka bir ses seçebilirsin.</p>
      {/if}
      {#if olusumZamani}
        <p class="saat">
          <span class="zaman">{saatBicim(olusumZamani, depo.ayarlar.saat24)}</span>
          {#if bitisZamani}
            <span class="tire">–</span>
            <span class="zaman">{saatBicim(bitisZamani, depo.ayarlar.saat24)}</span>
            <span class="nokta-ayrac"></span>
            <span>{sureMetni(
              Math.round((bitisZamani.getTime() - olusumZamani.getTime()) / 60000),
            )}</span>
          {/if}
        </p>
      {/if}
    </main>

    <footer>
      <div class="ertele-sar">
        <button
          class="dugme ikincil"
          onclick={() => {
            otomatigiIptalEt();
            ertelemeAcik = !ertelemeAcik;
          }}
          aria-expanded={ertelemeAcik}
        >
          Ertele
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <path d="M2 4l3 3 3-3" stroke="currentColor" stroke-width="1.4"
              stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        {#if ertelemeAcik}
          <div class="menu" role="menu">
            {#each ertelemeSecenekleri as dk (dk)}
              <button role="menuitem" onclick={() => ertele(dk)}>
                {dk} dakika
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <button class="dugme birincil" onclick={tamamla} disabled={!tuslarAcik}>
        Tamamlandı
        {#if otomatikKalan !== null}
          <span class="oto zaman">{otomatikKalan}</span>
        {/if}
      </button>
    </footer>
  {:else}
    <div class="bos">Bekleyen hatırlatma yok.</div>
  {/if}
</div>

<style>
  .kabuk {
    position: relative;
    display: grid;
    grid-template-rows: auto 1fr auto;
    height: 100vh;
    background: var(--murekkep);
    border: 1px solid var(--ayrac-guclu);
    border-radius: var(--yuvarlak-kabuk);
    overflow: hidden;
  }

  .serit {
    position: absolute;
    inset: 0 auto 0 0;
    width: 3px;
    background: var(--kategori);
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--b3) var(--b3) var(--b3) var(--b5);
  }

  /* Kirmizi bu uygulamada yalnizca "simdi" ve "gecikmis" demek. Alarm
     penceresi tam olarak o an oldugu icin burada kullaniliyor. */
  .etiket {
    display: flex;
    align-items: center;
    gap: var(--b2);
    font-size: 12px;
    font-weight: 500;
    color: var(--kirmizi);
  }
  .nokta {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--kirmizi);
  }
  /* Calan alarmda nabiz: dikkat cekmesi gereken tek hareket bu. */
  .etiket:not(.gecmis) .nokta { animation: nabiz 1.8s ease-in-out infinite; }
  @keyframes nabiz {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.35; transform: scale(0.82); }
  }

  .sag { display: flex; align-items: center; gap: var(--b2); }
  .kuyruk-sayisi {
    font-size: 11px;
    color: var(--kagit-3);
    font-variant-numeric: tabular-nums;
  }
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

  main {
    display: grid;
    align-content: center;
    gap: var(--b2);
    padding: 0 var(--b5);
  }
  h1 {
    font-size: 26px;
    font-weight: 600;
    line-height: 1.2;
    letter-spacing: -0.02em;
    color: var(--kagit);
  }
  .not {
    max-width: 48ch;
  }
  .saat {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: var(--b1);
    font-size: 13px;
    color: var(--kagit-3);
  }
  .ses-hatasi {
    margin-top: var(--b1);
    font-size: 11.5px;
    color: var(--kirmizi);
  }
  .tire { opacity: 0.6; }
  .nokta-ayrac {
    width: 2px;
    height: 2px;
    border-radius: 50%;
    background: currentColor;
  }

  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--b3);
    padding: var(--b4) var(--b5);
    border-top: 1px solid var(--ayrac);
  }

  .dugme {
    display: inline-flex;
    align-items: center;
    gap: var(--b2);
    height: 38px;
    padding: 0 var(--b4);
    border-radius: var(--yuvarlak-dugme);
    font-size: 13px;
    font-weight: 500;
    transition: background var(--gecis-hizli), color var(--gecis-hizli);
  }
  .birincil {
    background: var(--pirinc);
    color: var(--pirinc-ustu);
    font-weight: 600;
  }
  .birincil:hover:not(:disabled) { background: var(--pirinc-parlak); }
  .dugme:disabled { opacity: 0.55; cursor: default; }
  .ikincil {
    background: var(--murekkep-2);
    color: var(--kagit-2);
    border: 1px solid var(--ayrac);
  }
  .ikincil:hover { background: var(--murekkep-3); color: var(--kagit); }

  .oto {
    min-width: 18px;
    padding: 1px 5px;
    border-radius: 99px;
    background: rgba(0, 0, 0, 0.22);
    font-size: 11px;
    text-align: center;
  }

  /* --- Erteleme menusu --- */
  .ertele-sar { position: relative; }
  .menu {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 0;
    min-width: 132px;
    padding: var(--b1);
    background: var(--murekkep-2);
    border: 1px solid var(--ayrac-guclu);
    border-radius: var(--yuvarlak-panel);
    box-shadow: var(--golge-panel);
    animation: gir var(--gecis) both;
  }
  @keyframes gir {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: none; }
  }
  .menu button {
    display: block;
    width: 100%;
    padding: 7px var(--b3);
    border-radius: var(--yuvarlak-dugme);
    text-align: left;
    font-size: 13px;
    color: var(--kagit-2);
  }
  .menu button:hover { background: var(--murekkep-3); color: var(--kagit); }

  .bos {
    display: grid;
    place-content: center;
    height: 100%;
    font-size: 13px;
    color: var(--kagit-3);
  }
</style>
