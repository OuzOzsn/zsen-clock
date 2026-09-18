<script lang="ts">
  /**
   * Etkinlik ekleme / duzenleme.
   *
   * Tekrarlayan bir etkinlikte duzenleme HER ZAMAN tum seriyi degistirir;
   * yalnizca bir gunu etkileyen tek islem "bu günü atla". Boylece "bu mu,
   * hepsi mi?" sorusu her kaydette sorulmuyor, yalnizca silerken cikiyor -
   * takvim uygulamalarindaki en sik kafa karisikligi bu.
   *
   * PROGRAM ETKINLIKLERI ayri: onlarin ana duzenleyicisi "Programlarım".
   * Burada yapilan degisiklik yalnizca acildigi gune islenir (`olusum_ayir`),
   * cunku o gune ozel bir sey cikmis olabilir. Bu yuzden program serisinde
   * tekrar ve kategori alanlari salt okunur: ozellikle bitis tarihi, buradan
   * degistirilse programin kosu bitisini sessizce kaydirirdi.
   */
  import { onMount, untrack } from 'svelte';
  import { cagir, isoCoz, yerelISO } from '../lib/ipc.ts';
  import { gunAnahtari, haftaGunu, sureMetni } from '../lib/tarih.ts';
  import { AY_UZUN, GUN_KISA, GUN_UZUN, type Etkinlik, type TekrarTipi } from '../lib/tipler.ts';
  import { depo } from '../lib/veri.svelte.ts';
  import Ikon from './Ikon.svelte';

  interface Ozellikler {
    etkinlik: Etkinlik;
    /** Duzenleme tekrarlayan bir etkinligin hangi gununden acildi. */
    olusum?: Date;
    onKapat: () => void;
    /** Program serisinde "Programda düzenle" baglantisi icin. */
    onProgramaGit?: (programId: string) => void;
  }
  let { etkinlik, olusum, onKapat, onProgramaGit }: Ozellikler = $props();

  // Formun kendi kopyasi: iptal edilirse depodaki kayit bozulmasin.
  // untrack bilerek: form acilirken kaydin o anki halini aliyoruz, sonrasinda
  // disaridan gelen degisiklikler kullanicinin yazdiginin uzerine yazmasin.
  let taslak = $state<Etkinlik>(
    untrack(() => structuredClone($state.snapshot(etkinlik))),
  );
  let sesler = $state<string[]>([]);
  let silmeOnayi = $state(false);
  let hata = $state<string | null>(null);

  const yeniMi = $derived(!taslak.id);
  const tekrarliMi = $derived(taslak.tekrar.tip !== 'yok');

  /** Programin tekrar kuralini tasiyan kayit - duzenleme buradan yapilmaz. */
  const programSerisi = $derived(!!taslak.program && !taslak.program.gun);
  /** Zaten bir gune ozel kopya - normal duzenlenir, programa dondurulebilir. */
  const programKopyasi = $derived(!!taslak.program?.gun);
  const bagliProgram = $derived(
    taslak.program
      ? (depo.programlar.find((p) => p.id === taslak.program!.program_id) ?? null)
      : null,
  );
  /** Program serisinde kaydetmek "bu gunu ayir" demek; gun bilinmeliyiz. */
  const gunuDegistirebilir = $derived(programSerisi && !!olusum);

  // datetime-local alanlari saniyesiz calisiyor.
  let baslangicAlani = $state('');
  let bitisAlani = $state('');

  onMount(() => {
    // Program serisinde form acildigi GUNU gosterir: kaydetmek o gunu
    // ayiracak, seri capasini degil. Diger tekrarlarda capa gosterilmeye
    // devam ediyor - orada kaydetmek zaten tum seriyi degistiriyor.
    const temel =
      programSerisi && olusum
        ? `${yerelISO(olusum).slice(0, 10)}${taslak.baslangic.slice(10)}`
        : taslak.baslangic;
    const uzunluk = taslak.bitis
      ? isoCoz(taslak.bitis).getTime() - isoCoz(taslak.baslangic).getTime()
      : 0;
    baslangicAlani = temel.slice(0, 16);
    bitisAlani = (
      uzunluk > 0 ? yerelISO(new Date(isoCoz(temel).getTime() + uzunluk)) : temel
    ).slice(0, 16);
    void cagir('sesleri_listele').then((s) => (sesler = s));
  });

  /** Yazilan ada karsilik gelen kategori - ikonu/rengi onizlemek icin. */
  const secilenKategori = $derived(
    depo.kategoriler.find(
      (k) => k.ad.toLowerCase() === taslak.kategori.trim().toLowerCase(),
    ),
  );

  const sure = $derived.by(() => {
    if (!baslangicAlani || !bitisAlani) return 0;
    const b = isoCoz(baslangicAlani);
    const s = isoCoz(bitisAlani);
    return Math.round((s.getTime() - b.getTime()) / 60000);
  });

  /** Baslangic degisince bitisi ayni sureyi koruyacak sekilde kaydir. */
  function baslangicDegisti(yeniDeger: string) {
    const eskiSure = sure > 0 ? sure : depo.ayarlar.varsayilan_sure_dakika;
    baslangicAlani = yeniDeger;
    const yeniBitis = new Date(isoCoz(yeniDeger).getTime() + eskiSure * 60000);
    bitisAlani = yerelISO(yeniBitis).slice(0, 16);
  }

  /** "23 Eylül 2026, Çarşamba" */
  const gunEtiketi = $derived(
    olusum
      ? `${olusum.getDate()} ${AY_UZUN[olusum.getMonth()]} ${olusum.getFullYear()}, ${GUN_UZUN[haftaGunu(olusum)]}`
      : '',
  );

  /**
   * Program serisinde GUN sabittir - is haftanin o gunune ait. Gunu
   * degistirmek kopyayi baska tarihe koyar ama istisna eski tarihte kalir;
   * ikisi ayrisirdi. Sadece saat degisiyor, tarih olusumdan geliyor.
   */
  function programSaatiDegisti(yeniSaat: string) {
    if (!olusum) return;
    const eskiSure = sure > 0 ? sure : depo.ayarlar.varsayilan_sure_dakika;
    const gun = gunAnahtari(olusum);
    baslangicAlani = `${gun}T${yeniSaat}`;
    bitisAlani = yerelISO(
      new Date(isoCoz(baslangicAlani).getTime() + eskiSure * 60000),
    ).slice(0, 16);
  }

  function programBitisiDegisti(yeniSaat: string) {
    if (!olusum) return;
    bitisAlani = `${gunAnahtari(olusum)}T${yeniSaat}`;
  }

  function gunDegistir(gun: number) {
    const mevcut = taslak.tekrar.gunler;
    taslak.tekrar.gunler = mevcut.includes(gun)
      ? mevcut.filter((g) => g !== gun)
      : [...mevcut, gun].sort((a, b) => a - b);
  }

  function hatirlatmaEkle() {
    taslak.hatirlatmalar = [
      ...taslak.hatirlatmalar,
      { dakika_once: depo.ayarlar.varsayilan_hatirlatma_dakika },
    ];
  }

  function hatirlatmaSil(i: number) {
    taslak.hatirlatmalar = taslak.hatirlatmalar.filter((_, j) => j !== i);
  }

  async function kaydet() {
    hata = null;
    if (!taslak.baslik.trim()) {
      hata = 'Başlık gerekli.';
      return;
    }
    if (sure < 0) {
      hata = 'Bitiş saati başlangıçtan önce olamaz.';
      return;
    }

    taslak.baslik = taslak.baslik.trim();
    taslak.kategori = taslak.kategori.trim() || 'genel';
    taslak.baslangic = `${baslangicAlani}:00`;
    taslak.bitis = sure > 0 ? `${bitisAlani}:00` : null;

    try {
      await depo.kaydet($state.snapshot(taslak));
      onKapat();
    } catch (e) {
      hata = `Kaydedilemedi: ${e}`;
    }
  }

  /** Program serisinde kaydetmek: degisiklik yalnizca acilan gune islenir. */
  async function gunuAyir() {
    hata = null;
    if (!olusum || !taslak.program) return;
    if (!taslak.baslik.trim()) {
      hata = 'Başlık gerekli.';
      return;
    }
    if (sure < 0) {
      hata = 'Bitiş saati başlangıçtan önce olamaz.';
      return;
    }

    // Gunu olusumdan aliyoruz: kopya ile istisna ayni tarihte olmali.
    const gun = gunAnahtari(olusum);
    const kopya: Etkinlik = {
      ...$state.snapshot(taslak),
      id: '',
      baslik: taslak.baslik.trim(),
      baslangic: `${gun}T${baslangicAlani.slice(11)}:00`,
      bitis: sure > 0 ? `${gun}T${bitisAlani.slice(11)}:00` : null,
      // Tamamlanma ve tekrar kuralini Rust tarafi kuruyor: tamamlanmis bir
      // seansi ayirmak onu sessizce tamamlanmamisa cevirmesin.
      tamamlananlar: [],
      olusturuldu: null,
      guncellendi: null,
    };

    try {
      await depo.olusumAyir(taslak.id, olusum, kopya);
      onKapat();
    } catch (e) {
      hata = `Kaydedilemedi: ${e}`;
    }
  }

  /** Gune ozel kopyayi geri programa baglar. */
  async function programaDondur() {
    hata = null;
    const gun = taslak.program?.gun;
    if (!gun) return;
    // Istisnayi tasiyan seri kaydi hangisiyse ona donuyoruz: program
    // guncellendiginde birden fazla donem olusabiliyor.
    const seri = depo.etkinlikler.find(
      (e) =>
        e.program?.program_id === taslak.program!.program_id &&
        e.program?.oge_id === taslak.program!.oge_id &&
        !e.program.gun &&
        e.tekrar.istisnalar.includes(gun),
    );
    if (!seri) {
      hata = 'Bu günün bağlı olduğu program kaydı artık yok.';
      return;
    }
    try {
      await depo.olusumBirlestir(seri.id, gun);
      onKapat();
    } catch (e) {
      hata = `Geri alınamadı: ${e}`;
    }
  }

  async function seriyiSil() {
    await depo.sil(taslak.id);
    onKapat();
  }

  async function bugunuAtla() {
    if (!olusum) return;
    await cagir('olusum_atla', { id: taslak.id, gun: gunAnahtari(olusum) });
    await depo.yukle();
    onKapat();
  }

  function klavye(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onKapat();
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      void (gunuDegistirebilir ? gunuAyir() : kaydet());
    }
  }

  const tekrarSecenekleri: [TekrarTipi, string][] = [
    ['yok', 'Tekrar yok'],
    ['gunluk', 'Her gün'],
    ['haftalik', 'Haftanın belirli günleri'],
    ['aylik', 'Her ay'],
    ['yillik', 'Her yıl'],
  ];
</script>

<svelte:window onkeydown={klavye} />

<div
  class="perde"
  role="button"
  tabindex="-1"
  aria-label="Kapat"
  onclick={onKapat}
  onkeydown={(e) => { if (e.key === 'Enter') onKapat(); }}
></div>

<div class="panel" role="dialog" aria-modal="true" aria-label={yeniMi ? 'Yeni etkinlik' : 'Etkinliği düzenle'}>
  <header>
    <h2>{yeniMi ? 'Yeni etkinlik' : 'Etkinliği düzenle'}</h2>
    <button class="ikon" onclick={onKapat} aria-label="Kapat">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-linecap="round" />
      </svg>
    </button>
  </header>

  <div class="govde">
    {#if taslak.program}
      <div class="program-rozeti">
        <span class="rozet-metin">
          {bagliProgram?.baslik ?? 'Program'}
          {#if programKopyasi}
            · bu güne özel
          {:else}
            · her {GUN_KISA.filter((_, i) => taslak.tekrar.gunler.includes(i)).join(', ')}
          {/if}
        </span>
        {#if bagliProgram && onProgramaGit}
          <button
            type="button"
            class="rozet-baglanti"
            onclick={() => { onKapat(); onProgramaGit(bagliProgram.id); }}
          >
            Programda düzenle
          </button>
        {/if}
      </div>
      {#if gunuDegistirebilir}
        <p class="program-not">
          Buradaki değişiklik yalnızca bu güne işlenir. Programın tamamını
          değiştirmek için Programlarım'ı kullan.
        </p>
      {:else if programSerisi}
        <p class="program-not">
          Bu kayıt programın tekrar kuralını taşıyor; düzenlemesi Programlarım'dan yapılır.
        </p>
      {/if}
    {/if}

    <label class="alan">
      <span class="etiket">Başlık</span>
      <!-- svelte-ignore a11y_autofocus -->
      <input bind:value={taslak.baslik} autofocus placeholder="Etkinlik başlığı" />
    </label>

    {#if gunuDegistirebilir}
      <div class="alan">
        <span class="etiket">Gün</span>
        <p class="salt-okunur">{gunEtiketi}</p>
      </div>
      <div class="ikili">
        <label class="alan">
          <span class="etiket">Başlangıç saati</span>
          <input
            type="time"
            value={baslangicAlani.slice(11)}
            oninput={(e) => programSaatiDegisti(e.currentTarget.value)}
          />
        </label>
        <label class="alan">
          <span class="etiket">Bitiş saati</span>
          <input
            type="time"
            value={bitisAlani.slice(11)}
            oninput={(e) => programBitisiDegisti(e.currentTarget.value)}
          />
        </label>
      </div>
    {:else}
    <div class="ikili">
      <label class="alan">
        <span class="etiket">Başlangıç</span>
        <input
          type="datetime-local"
          value={baslangicAlani}
          oninput={(e) => baslangicDegisti(e.currentTarget.value)}
        />
      </label>
      <label class="alan">
        <span class="etiket">Bitiş</span>
        <input type="datetime-local" bind:value={bitisAlani} />
      </label>
    </div>
    {/if}
    {#if sure > 0}
      <p class="sure-ipucu">{sureMetni(sure)} sürecek</p>
    {/if}

    <label class="alan">
      <span class="etiket">Kategori</span>
      <div class="kategori-alani">
        {#if secilenKategori}
          <span class="kategori-simge" style:color={secilenKategori.renk}>
            {#if secilenKategori.ikon}
              <Ikon ad={secilenKategori.ikon} boyut={14} />
            {:else}
              <span class="kategori-nokta" style:background={secilenKategori.renk}></span>
            {/if}
          </span>
        {/if}
        <input
          readonly={programSerisi}
          bind:value={taslak.kategori}
          list="kategori-listesi"
          placeholder="genel"
          class:simgeli={!!secilenKategori}
        />
      </div>
      <datalist id="kategori-listesi">
        {#each depo.kategoriler as k (k.ad)}<option value={k.ad}></option>{/each}
      </datalist>
    </label>

    <!-- ------------------------------------------------------- tekrar -->
    {#if programSerisi}
      <div class="bolum">
        <span class="etiket">Tekrar</span>
        <p class="salt-okunur">
          Her {GUN_KISA.filter((_, i) => taslak.tekrar.gunler.includes(i)).join(', ')}
          {#if taslak.tekrar.bitis_tarihi}
            · {taslak.tekrar.bitis_tarihi} tarihine kadar
          {:else}
            · süresiz
          {/if}
        </p>
      </div>
    {:else}
    <div class="bolum">
      <span class="etiket">Tekrar</span>
      <select bind:value={taslak.tekrar.tip}>
        {#each tekrarSecenekleri as [deger, etiket] (deger)}
          <option value={deger}>{etiket}</option>
        {/each}
      </select>

      {#if taslak.tekrar.tip === 'haftalik'}
        <div class="gun-secici">
          {#each [1, 2, 3, 4, 5, 6, 7] as g (g)}
            <button
              type="button"
              class="gun-dugme"
              class:secili={taslak.tekrar.gunler.includes(g)}
              onclick={() => gunDegistir(g)}
            >
              {GUN_KISA[g]}
            </button>
          {/each}
        </div>
      {/if}

      {#if tekrarliMi}
        <div class="ikili">
          <label class="alan kucuk">
            <span class="etiket">Kaçta bir</span>
            <input type="number" min="1" max="99" bind:value={taslak.tekrar.aralik} />
          </label>
          <label class="alan kucuk">
            <span class="etiket">Bitiş tarihi (boş = süresiz)</span>
            <input type="date" bind:value={taslak.tekrar.bitis_tarihi} />
          </label>
        </div>
      {/if}
    </div>
    {/if}

    <!-- -------------------------------------------------- hatirlatmalar -->
    <div class="bolum">
      <div class="bolum-ust">
        <span class="etiket">Hatırlatmalar</span>
        <button type="button" class="kucuk-dugme" onclick={hatirlatmaEkle}>+ ekle</button>
      </div>

      {#if taslak.hatirlatmalar.length === 0}
        <p class="bos-not">Hatırlatma yok — bu etkinlik sessizce takvimde durur.</p>
      {/if}

      {#each taslak.hatirlatmalar as h, i (i)}
        <div class="hatirlatma">
          <input
            class="dakika"
            type="number"
            min="-1440"
            max="10080"
            bind:value={h.dakika_once}
            aria-label="Kaç dakika önce"
          />
          <span class="hatirlatma-metin">
            {#if h.dakika_once === 0}
              dakika önce · tam saatinde
            {:else if h.dakika_once > 0}
              dakika önce
            {:else}
              dakika · başladıktan sonra
            {/if}
          </span>
          <select bind:value={h.ses} aria-label="Zil sesi">
            <option value={null}>Varsayılan ses</option>
            {#each sesler as s (s)}<option value={s}>{s}</option>{/each}
          </select>
          <button
            type="button"
            class="ikon kucuk"
            onclick={() => hatirlatmaSil(i)}
            aria-label="Hatırlatmayı kaldır"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-linecap="round" />
            </svg>
          </button>
        </div>
      {/each}

      {#if sesler.length === 0}
        <p class="bos-not">
          Zil sesi eklemek için <code>data/sesler</code> klasörüne mp3 veya wav eklenebilir.
        </p>
      {/if}
    </div>

    <label class="alan">
      <span class="etiket">Not</span>
      <textarea bind:value={taslak.not} rows="2" placeholder="İsteğe bağlı"></textarea>
    </label>

    {#if hata}
      <p class="hata" role="alert">{hata}</p>
    {/if}
  </div>

  <footer>
    {#if !yeniMi}
      <div class="sil-alani">
        {#if !silmeOnayi}
          <button type="button" class="sil" onclick={() => (silmeOnayi = true)}>Sil</button>
        {:else if programSerisi && olusum}
          <span class="onay-metin">Ne silinsin?</span>
          <button type="button" class="sil" onclick={bugunuAtla}>Sadece bu günü</button>
          <span class="onay-not">Programın tamamı Programlarım'dan kaldırılır.</span>
          <button type="button" class="vazgec" onclick={() => (silmeOnayi = false)}>Vazgeç</button>
        {:else if tekrarliMi && olusum}
          <span class="onay-metin">Ne silinsin?</span>
          <button type="button" class="sil" onclick={bugunuAtla}>Sadece bu günü</button>
          <button type="button" class="sil" onclick={seriyiSil}>Tüm tekrarları</button>
          <button type="button" class="vazgec" onclick={() => (silmeOnayi = false)}>Vazgeç</button>
        {:else}
          <span class="onay-metin">Silinsin mi?</span>
          <button type="button" class="sil" onclick={seriyiSil}>Sil</button>
          <button type="button" class="vazgec" onclick={() => (silmeOnayi = false)}>Vazgeç</button>
        {/if}
      </div>
    {/if}

    <div class="ana-eylem">
      {#if programKopyasi}
        <button type="button" class="dugme ikincil" onclick={programaDondur}>
          Programa döndür
        </button>
      {/if}
      <button type="button" class="dugme ikincil" onclick={onKapat}>Vazgeç</button>
      {#if gunuDegistirebilir}
        <button type="button" class="dugme birincil" onclick={gunuAyir}>
          Bu günü değiştir
        </button>
      {:else if !programSerisi}
        <button type="button" class="dugme birincil" onclick={kaydet}>
          {yeniMi ? 'Ekle' : 'Kaydet'}
        </button>
      {/if}
    </div>
  </footer>
</div>

<style>
  .program-rozeti {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--b2);
    padding: 5px var(--b3);
    background: var(--pirinc-sonuk);
    border-left: 2px solid var(--pirinc);
    border-radius: 0 var(--yuvarlak-dugme) var(--yuvarlak-dugme) 0;
  }
  .rozet-metin {
    font-size: 11.5px;
    color: var(--kagit-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rozet-baglanti {
    flex: none;
    font-size: 11.5px;
    color: var(--pirinc);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .program-not {
    margin: calc(-1 * var(--b2)) 0 0;
    font-size: 11px;
    line-height: 1.5;
    color: var(--kagit-3);
  }
  .salt-okunur {
    margin: 0;
    padding: 7px var(--b3);
    background: var(--murekkep);
    border: 1px dashed var(--ayrac);
    border-radius: var(--yuvarlak-dugme);
    font-size: 12.5px;
    color: var(--kagit-3);
  }
  .onay-not { font-size: 11px; color: var(--kagit-3); }

  .kategori-alani { position: relative; display: flex; align-items: center; }
  .kategori-simge {
    position: absolute;
    left: var(--b3);
    display: grid;
    place-items: center;
    pointer-events: none;
  }
  .kategori-nokta { width: 8px; height: 8px; border-radius: 2px; }
  input.simgeli { padding-left: calc(var(--b3) + 20px); }

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
    width: min(520px, calc(100vw - 48px));
    max-height: min(760px, calc(100vh - 48px));
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
    padding: var(--b4) var(--b4) var(--b3);
    border-bottom: 1px solid var(--ayrac);
  }
  h2 { font-size: 14.5px; font-weight: 600; }

  .govde {
    display: grid;
    gap: var(--b4);
    padding: var(--b4);
    overflow-y: auto;
  }

  .alan { display: grid; gap: var(--b1); min-width: 0; }
  .etiket {
    font-size: 11px;
    font-weight: 500;
    color: var(--kagit-3);
  }

  input, select, textarea {
    width: 100%;
    padding: 7px var(--b3);
    background: var(--murekkep);
    border: 1px solid var(--ayrac);
    border-radius: var(--yuvarlak-dugme);
    font: inherit;
    font-size: 13px;
    color: var(--kagit);
    outline: none;
    transition: border-color var(--gecis-hizli);
  }
  input:focus, select:focus, textarea:focus { border-color: var(--pirinc); }
  textarea { resize: vertical; min-height: 44px; }
  /* Takvim/saat secici simgelerini koyu temada gorunur yap */
  input[type='datetime-local'], input[type='date'], input[type='time'] { color-scheme: dark; }

  .ikili {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--b3);
  }

  .sure-ipucu {
    margin-top: calc(var(--b3) * -1 + 2px);
    font-size: 11.5px;
    color: var(--kagit-3);
  }

  .bolum {
    display: grid;
    gap: var(--b2);
    padding: var(--b3);
    border: 1px solid var(--ayrac);
    border-radius: var(--yuvarlak-dugme);
  }
  .bolum-ust {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .kucuk-dugme {
    font-size: 11.5px;
    color: var(--pirinc);
    transition: color var(--gecis-hizli);
  }
  .kucuk-dugme:hover { color: var(--pirinc-parlak); }

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

  .hatirlatma {
    display: grid;
    grid-template-columns: 64px auto 1fr auto;
    align-items: center;
    gap: var(--b2);
  }
  .dakika { text-align: right; }
  .hatirlatma-metin {
    font-size: 11.5px;
    color: var(--kagit-3);
    white-space: nowrap;
  }

  .bos-not {
    font-size: 11.5px;
    color: var(--kagit-3);
    line-height: 1.5;
  }
  code {
    padding: 1px 4px;
    border-radius: 3px;
    background: var(--murekkep);
    font-family: var(--yazi-mono);
    font-size: 11px;
  }

  .hata {
    padding: var(--b2) var(--b3);
    border-left: 2px solid var(--kirmizi);
    background: var(--kirmizi-sonuk);
    font-size: 12px;
    color: var(--kagit);
  }

  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--b3);
    padding: var(--b3) var(--b4);
    border-top: 1px solid var(--ayrac);
  }

  .sil-alani { display: flex; align-items: center; gap: var(--b2); }
  .onay-metin { font-size: 11.5px; color: var(--kagit-2); }
  .sil {
    padding: 5px var(--b2);
    border-radius: var(--yuvarlak-dugme);
    font-size: 12px;
    color: var(--kirmizi);
    transition: background var(--gecis-hizli);
  }
  .sil:hover { background: var(--kirmizi-sonuk); }
  .vazgec {
    padding: 5px var(--b2);
    font-size: 12px;
    color: var(--kagit-3);
  }
  .vazgec:hover { color: var(--kagit-2); }

  .ana-eylem { display: flex; gap: var(--b2); margin-left: auto; }
  .dugme {
    height: 34px;
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
  .birincil:hover { background: var(--pirinc-parlak); }
  .ikincil {
    background: var(--murekkep-3);
    color: var(--kagit-2);
  }
  .ikincil:hover { color: var(--kagit); }

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
  .ikon.kucuk { width: 24px; height: 24px; }
</style>
