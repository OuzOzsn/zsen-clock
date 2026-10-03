<script lang="ts">
  /**
   * Programin ana duzenleyicisi. Kullanicinin butun programi degistirebildigi
   * tek yer burasi; takvimden yapilan duzenlemeler yalnizca o gune ait kalir.
   *
   * Yerlesim IS ONCELIKLI: duz bir is listesi var, gunler her isin kendi
   * icinde seciliyor. Once gun basliklari altinda dizilmisti ve cok gunlu bir
   * is "Pazartesi'nin icinde Carsamba seciyorum" gibi okunuyordu - kullanici
   * hakli olarak takildi. Bir is birden fazla gune isaretlenebilmeli
   * ("her pzt car cum matematik" uc kez yazilmasin), o yuzden gun secici
   * kaldirilamazdi; kaldirilmasi gereken sey gun basliklariydi.
   *
   * "Pazartesi ne var" sorusu asagidaki salt okunur haftalik ozette
   * cevaplaniyor.
   */
  import { untrack } from 'svelte';
  import { GUN_KISA, GUN_UZUN, type Program, type ProgramOgesi } from '../lib/tipler.ts';
  import { depo } from '../lib/veri.svelte.ts';
  import KategoriSecici from './KategoriSecici.svelte';
  import { siraliYerlesim, type UretimOzeti } from '../lib/programUret.ts';

  interface Ozellikler {
    program: Program;
    onKapat: () => void;
    onKaydedildi?: (p: Program, ozet: UretimOzeti | null) => void;
    /** Acilista acik gelecek is. */
    acikOgeId?: string | null;
  }
  let { program, onKapat, onKaydedildi, acikOgeId = null }: Ozellikler = $props();

  // Formun kendi kopyasi: iptal edilirse depodaki kayit bozulmasin.
  let taslak = $state<Program>(
    untrack(() => structuredClone($state.snapshot(program))),
  );
  let acikOge = $state<string | null>(untrack(() => acikOgeId));
  let hata = $state<string | null>(null);
  let calisiyor = $state(false);

  const yeniMi = $derived(!taslak.id);
  /**
   * Sirali duzende isler gunlerden bagimsiz: listedeki sirayla her gune bir
   * tane. "10 gorev gun gun" haftaya sigmiyordu; haftalik duzende bunu
   * yapmak icin ayni programi parca parca kurmak gerekiyordu.
   */
  const sirali = $derived(taslak.duzen === 'sirali');
  const isSayisi = $derived(
    sirali ? taslak.ogeler.length : taslak.ogeler.reduce((t, o) => t + o.gunler.length, 0),
  );
  const haftalikDakika = $derived(
    taslak.ogeler.reduce((t, o) => t + o.sure_dakika * (sirali ? 1 : o.gunler.length), 0),
  );

  function duzenSec(duzen: 'haftalik' | 'sirali') {
    if (taslak.kosu) return;
    taslak.duzen = duzen;
    // Sirali duzende gun secilmiyor; haftaliga donuste gunsuz is kalmasin.
    if (duzen === 'haftalik') {
      for (const o of taslak.ogeler) if (o.gunler.length === 0) o.gunler = [1];
    }
  }

  /** Sirali duzende her isin kacinci gune dustugu (dinlenmeler dahil). */
  const yerlesim = $derived(siraliYerlesim(taslak.ogeler, 0));

  function dinlenmeAyarla(oge: ProgramOgesi, gun: number) {
    oge.dinlenme_gun = Math.max(0, Math.min(365, Math.floor(gun || 0)));
  }

  /** "+ Dinlenme günü": son isin ardina bir bos gun ekler. */
  function dinlenmeEkle() {
    const son = taslak.ogeler.at(-1);
    if (son) dinlenmeAyarla(son, (son.dinlenme_gun ?? 0) + 1);
  }

  /** Sirali duzende isin yerini bir yukari/asagi kaydirir. */
  function tasi(id: string, yon: -1 | 1) {
    const i = taslak.ogeler.findIndex((o) => o.id === id);
    const j = i + yon;
    if (i < 0 || j < 0 || j >= taslak.ogeler.length) return;
    const yeni = [...taslak.ogeler];
    [yeni[i], yeni[j]] = [yeni[j]!, yeni[i]!];
    taslak.ogeler = yeni;
  }


  function yeniKimlik(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  }

  /** Listeleme sirasi: haftalikta once en erken gun, sonra saat; siralida liste sirasi. */
  const gosterilen = $derived(
    sirali ? taslak.ogeler : [...taslak.ogeler].sort((a, b) => {
      const ag = Math.min(...(a.gunler.length ? a.gunler : [8]));
      const bg = Math.min(...(b.gunler.length ? b.gunler : [8]));
      return ag - bg || a.saat.localeCompare(b.saat);
    }),
  );

  /** Salt okunur haftalik ozet: "Pazartesi ne var" sorusunun cevabi. */
  const haftalik = $derived(
    [1, 2, 3, 4, 5, 6, 7].map((gun) => ({
      gun,
      ogeler: taslak.ogeler
        .filter((o) => o.gunler.includes(gun))
        .sort((a, b) => a.saat.localeCompare(b.saat)),
    })),
  );

  function ogeEkle() {
    const oge: ProgramOgesi = {
      id: yeniKimlik(),
      baslik: '',
      icerik: '',
      gunler: sirali ? [] : [1],
      // Sirali iste saat cogu zaman bir oncekiyle ayni: yeniden yazdirmayalim.
      saat: sirali ? (taslak.ogeler.at(-1)?.saat ?? '09:00') : '09:00',
      sure_dakika: depo.ayarlar.varsayilan_sure_dakika,
      hatirlatmalar: [{ dakika_once: depo.ayarlar.varsayilan_hatirlatma_dakika }],
    };
    taslak.ogeler.push(oge);
    acikOge = oge.id;
  }

  function ogeSil(id: string) {
    taslak.ogeler = taslak.ogeler.filter((o) => o.id !== id);
    if (acikOge === id) acikOge = null;
  }

  function gunDegistir(oge: ProgramOgesi, gun: number) {
    if (oge.gunler.includes(gun)) {
      // Son gunu de kaldirirsa oge hicbir yerde gorunmez olurdu.
      if (oge.gunler.length === 1) return;
      oge.gunler = oge.gunler.filter((g) => g !== gun);
    } else {
      oge.gunler = [...oge.gunler, gun].sort((a, b) => a - b);
    }
  }

  function hatirlatmaDakika(oge: ProgramOgesi): number {
    return oge.hatirlatmalar[0]?.dakika_once ?? 0;
  }

  function hatirlatmaAyarla(oge: ProgramOgesi, acik: boolean, dakika: number) {
    oge.hatirlatmalar = acik ? [{ dakika_once: Math.max(0, dakika) }] : [];
  }

  function bitisSaati(oge: ProgramOgesi): string {
    const m = /^(\d{1,2}):(\d{2})$/.exec(oge.saat);
    if (!m) return '';
    const toplam = Number(m[1]) * 60 + Number(m[2]) + oge.sure_dakika;
    const s = Math.floor(toplam / 60) % 24;
    const d = toplam % 60;
    return `${String(s).padStart(2, '0')}:${String(d).padStart(2, '0')}`;
  }

  async function kaydet() {
    hata = null;
    if (!taslak.baslik.trim()) {
      hata = 'Program başlığı gerekli.';
      return;
    }
    const bossuz = taslak.ogeler.filter((o) => o.baslik.trim() || o.icerik.trim());
    if (bossuz.length === 0) {
      hata = 'En az bir iş eklenmeli.';
      return;
    }
    for (const o of bossuz) {
      if (!o.baslik.trim()) {
        hata = 'Her işin bir başlığı olmalı.';
        acikOge = o.id;
        return;
      }
    }

    taslak.baslik = taslak.baslik.trim();
    taslak.kategori = taslak.kategori.trim() || 'genel';
    taslak.ogeler = bossuz.map((o) => ({ ...o, baslik: o.baslik.trim() }));

    calisiyor = true;
    try {
      const { program: kayitli, ozet } = await depo.programKaydet(
        $state.snapshot(taslak),
      );
      onKaydedildi?.(kayitli, ozet);
      onKapat();
    } catch (e) {
      hata = `Kaydedilemedi: ${e}`;
    } finally {
      calisiyor = false;
    }
  }

  function klavye(e: KeyboardEvent) {
    if (e.key === 'Escape' && !calisiyor) {
      e.stopPropagation();
      onKapat();
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void kaydet();
  }
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

<div class="panel" role="dialog" aria-modal="true" aria-label="Program düzenle">
  <header>
    <h2>{yeniMi ? 'Yeni program' : 'Programı düzenle'}</h2>
    <button class="ikon" onclick={onKapat} aria-label="Kapat">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-linecap="round" />
      </svg>
    </button>
  </header>

  <div class="govde">
    {#if hata}<p class="hata" role="alert">{hata}</p>{/if}

    {#if taslak.kosu}
      <p class="uyari">
        Bu program çalışıyor. Kaydedilince takvim güncellenir; geçmiş
        günler olduğu gibi kalır, elle düzenlenen günlere dokunulmaz.
      </p>
    {/if}

    <label class="alan">
      <span class="etiket">Başlık</span>
      <input bind:value={taslak.baslik} placeholder="Haftalık çalışma düzeni" />
    </label>

    <label class="alan">
      <span class="etiket">Açıklama</span>
      <textarea rows="2" bind:value={taslak.aciklama} placeholder="İsteğe bağlı"></textarea>
    </label>

    <div class="alan">
      <span class="etiket">Düzen</span>
      <div class="kip-secici">
        <button
          type="button"
          class="kip-dugme"
          class:secili={!sirali}
          disabled={!!taslak.kosu}
          onclick={() => duzenSec('haftalik')}
        >
          Haftalık — işler haftanın günlerine bağlı
        </button>
        <button
          type="button"
          class="kip-dugme"
          class:secili={sirali}
          disabled={!!taslak.kosu}
          onclick={() => duzenSec('sirali')}
        >
          Sıralı — her gün listeden bir sonraki iş
        </button>
      </div>
      <span class="ipucu">
        {#if taslak.kosu}
          Çalışan programın düzeni değiştirilemez; önce durdurulmalı.
        {:else if sirali}
          1. iş başlangıç gününe, 2. iş ertesi güne düşer… Liste bitince ne
          olacağı (bir kez, birkaç tur, sınırsız, aradaki bekleme) başlatırken
          seçilir.
        {:else}
          Her iş seçilen hafta günlerinde tekrarlanır.
        {/if}
      </span>
    </div>

    <div class="alan">
      <span class="etiket">Kategori</span>
      <KategoriSecici bind:deger={taslak.kategori} />
    </div>

    <div class="bolum">
      <div class="bolum-basligi">
        <span class="etiket">İşler</span>
        <span class="sayac">
          {isSayisi} iş{#if sirali} · {yerlesim.uzunluk} gün{/if} · {sirali ? 'tur başına' : 'haftada'}
          {Math.round((haftalikDakika / 60) * 10) / 10} saat
        </span>
      </div>

      {#each gosterilen as oge, i (oge.id)}
        <div class="oge" class:acik={acikOge === oge.id}>
          <!-- Silme dugmesi satirda duruyor: yalnizca acik formda olunca
               kapali bir isi kaldirmanin yolu gorunmuyordu. -->
          <div class="oge-satiri">
            <button
              class="oge-ac"
              onclick={() => (acikOge = acikOge === oge.id ? null : oge.id)}
            >
              {#if sirali}<span class="oge-sira zaman">{(yerlesim.ofset.get(oge.id) ?? i) + 1}. gün</span>{/if}
              <span class="oge-saat zaman">{oge.saat}–{bitisSaati(oge)}</span>
              <span class="oge-ad">{oge.baslik || 'Adsız iş'}</span>
              <span class="oge-gunler">
                {#if sirali}
                  <!-- siralida gun yok, sira solda yaziyor -->
                {:else if oge.gunler.length === 0}
                  gün seçilmedi
                {:else}
                  {oge.gunler.map((g) => GUN_KISA[g]).join(' ')}
                {/if}
              </span>
            </button>
            {#if sirali}
              <button
                class="oge-kaldir oge-tasi"
                onclick={() => tasi(oge.id, -1)}
                disabled={i === 0}
                aria-label="Bir gün öne al"
                title="Bir gün öne al"
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M4 10l4-4 4 4" stroke="currentColor" stroke-width="1.4"
                    stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </button>
              <button
                class="oge-kaldir oge-tasi"
                onclick={() => tasi(oge.id, 1)}
                disabled={i === gosterilen.length - 1}
                aria-label="Bir gün sonraya al"
                title="Bir gün sonraya al"
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.4"
                    stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </button>
            {/if}
            <button
              class="oge-kaldir"
              onclick={() => ogeSil(oge.id)}
              aria-label="{oge.baslik || 'Adsız iş'} işini kaldır"
              title="Bu işi kaldır"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-linecap="round" />
              </svg>
            </button>
          </div>

            {#if acikOge === oge.id}
            <div class="oge-form">
              <label class="alan">
                <span class="etiket">Ne yapılacak</span>
                <input bind:value={oge.baslik} placeholder="İşin adı" />
              </label>

              <div class="ikili">
                <label class="alan kucuk">
                  <span class="etiket">Saat</span>
                  <input type="time" bind:value={oge.saat} />
                </label>
                <label class="alan kucuk">
                  <span class="etiket">Süre (dk)</span>
                  <input type="number" min="0" max="1440" step="5" bind:value={oge.sure_dakika} />
                </label>
                {#if sirali}
                  <label class="alan kucuk">
                    <span class="etiket">Sonra dinlenme (gün)</span>
                    <input
                      type="number"
                      min="0"
                      max="365"
                      value={oge.dinlenme_gun ?? 0}
                      oninput={(e) => dinlenmeAyarla(oge, Number(e.currentTarget.value))}
                    />
                  </label>
                {/if}
              </div>

              {#if !sirali}
              <div class="alan">
                <span class="etiket">Hangi günlerde tekrarlanır</span>
                <div class="gun-secici">
                  {#each [1, 2, 3, 4, 5, 6, 7] as g (g)}
                    <button
                      type="button"
                      class="gun-dugme"
                      class:secili={oge.gunler.includes(g)}
                      onclick={() => gunDegistir(oge, g)}
                    >
                      {GUN_KISA[g]}
                    </button>
                  {/each}
                </div>
                <span class="ipucu">
                  Birden fazla gün seçilirse iş, o günlerin hepsinde aynı
                  içerikle görünür. Farklı içerik için o güne ayrı bir iş
                  eklenmeli.
                </span>
              </div>
              {/if}

              <label class="alan">
                <span class="etiket">İçerik</span>
                <textarea
                  rows="4"
                  bind:value={oge.icerik}
                  placeholder={'Notlar\nhttps://ornek.com/kaynak'}
                ></textarea>
                <span class="ipucu">Not, bağlantı, ne gerekiyorsa. http:// ile başlayan
                      adresler tıklanabilir olur.</span>
              </label>

              <div class="alan">
                <span class="etiket">Hatırlatma</span>
                <div class="hatirlatma">
                  <label class="onay">
                    <input
                      type="checkbox"
                      checked={oge.hatirlatmalar.length > 0}
                      onchange={(e) =>
                        hatirlatmaAyarla(
                          oge,
                          e.currentTarget.checked,
                          hatirlatmaDakika(oge) || 10,
                        )}
                    />
                    Alarm çalsın
                  </label>
                  {#if oge.hatirlatmalar.length > 0}
                    <input
                      class="dakika"
                      type="number"
                      min="0"
                      max="1440"
                      value={hatirlatmaDakika(oge)}
                      onchange={(e) =>
                        hatirlatmaAyarla(oge, true, Number(e.currentTarget.value))}
                    />
                    <span class="birim">dakika önce</span>
                  {/if}
                </div>
              </div>

              <button class="oge-sil" onclick={() => ogeSil(oge.id)}>Bu işi kaldır</button>
            </div>
          {/if}
        </div>
        {#if sirali && (oge.dinlenme_gun ?? 0) > 0}
          {@const ilk = (yerlesim.ofset.get(oge.id) ?? i) + 2}
          {@const kac = oge.dinlenme_gun ?? 0}
          <div class="dinlenme">
            <span class="dinlenme-gun zaman">
              {kac === 1 ? `${ilk}. gün` : `${ilk}–${ilk + kac - 1}. gün`}
            </span>
            <span class="dinlenme-ad">Dinlenme</span>
            <span class="dinlenme-ayar">
              <button onclick={() => dinlenmeAyarla(oge, kac - 1)} aria-label="Bir gün azalt">−</button>
              <span class="zaman">{kac} gün</span>
              <button onclick={() => dinlenmeAyarla(oge, kac + 1)} aria-label="Bir gün artır">+</button>
            </span>
          </div>
        {/if}
      {/each}

      <div class="ekle-satiri">
        <button class="ekle-is" onclick={ogeEkle}>+ İş ekle</button>
        {#if sirali && taslak.ogeler.length > 0}
          <button class="ekle-is" onclick={dinlenmeEkle}>+ Dinlenme günü</button>
        {/if}
      </div>
    </div>

    <!-- Salt okunur ozet: gunler isin icinde seciliyor, burada sonucu gorunuyor.
         Sirali duzende liste zaten gun sirasinda; ozet gereksiz. -->
    {#if !sirali}
    <div class="bolum">
      <span class="etiket">Haftalık görünüm</span>
      <div class="ozet">
        {#each haftalik as g (g.gun)}
          <div class="ozet-gun" class:bos={g.ogeler.length === 0}>
            <span class="ozet-ad">{GUN_UZUN[g.gun]}</span>
            <span class="ozet-isler">
              {#if g.ogeler.length === 0}
                —
              {:else}
                {g.ogeler.map((o) => `${o.saat} ${o.baslik || 'Adsız iş'}`).join(' · ')}
              {/if}
            </span>
          </div>
        {/each}
      </div>
    </div>
    {/if}
  </div>

  <footer>
    <button class="dugme ikincil" onclick={onKapat} disabled={calisiyor}>Vazgeç</button>
    <button class="dugme birincil" onclick={() => void kaydet()} disabled={calisiyor}>
      {calisiyor ? 'Kaydediliyor…' : 'Kaydet'}
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
    grid-template-rows: auto minmax(0, 1fr) auto;
    width: min(620px, calc(100vw - 48px));
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
    align-items: center;
    justify-content: space-between;
    padding: var(--b4) var(--b5);
    border-bottom: 1px solid var(--ayrac);
  }
  h2 { margin: 0; font-size: 14px; font-weight: 600; color: var(--kagit); }
  .ikon {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
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
  .kucuk { min-width: 0; }
  .ikili { display: grid; grid-template-columns: 1fr 1fr; gap: var(--b3); }
  .etiket {
    font-size: 11.5px;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--kagit-3);
  }
  .ipucu { font-size: 11.5px; color: var(--kagit-3); }

  input, textarea {
    width: 100%;
    padding: 7px var(--b3);
    background: var(--murekkep);
    border: 1px solid var(--ayrac);
    border-radius: var(--yuvarlak-dugme);
    font: inherit;
    font-size: 14px;
    color: var(--kagit);
  }
  textarea { resize: vertical; min-height: 44px; line-height: 1.5; }
  input:focus, textarea:focus { border-color: var(--pirinc); outline: none; }
  input[type='time'] { color-scheme: dark; }


  .bolum { display: grid; gap: var(--b2); }
  .bolum-basligi { display: flex; align-items: baseline; justify-content: space-between; }
  .sayac { font-size: 12px; color: var(--kagit-3); }

  .ekle-is {
    justify-self: start;
    margin-top: 2px;
    padding: 4px var(--b3);
    border: 1px dashed var(--ayrac-guclu);
    border-radius: var(--yuvarlak-dugme);
    font-size: 13px;
    color: var(--kagit-3);
    transition: color var(--gecis-hizli), border-color var(--gecis-hizli);
  }
  .ekle-is:hover { color: var(--pirinc); border-color: var(--pirinc); }
  .ekle-satiri { display: flex; gap: var(--b2); }

  .dinlenme {
    display: flex;
    align-items: center;
    gap: var(--b2);
    padding: 4px var(--b3);
    border: 1px dashed var(--ayrac);
    border-radius: var(--yuvarlak-dugme);
    font-size: 12.5px;
    color: var(--kagit-3);
  }
  .dinlenme-gun { min-width: 42px; font-size: 12px; }
  .dinlenme-ad { flex: 1; font-style: italic; }
  .dinlenme-ayar { display: flex; align-items: center; gap: var(--b1); }
  .dinlenme-ayar button {
    width: 22px;
    height: 22px;
    border-radius: var(--yuvarlak-dugme);
    color: var(--kagit-2);
  }
  .dinlenme-ayar button:hover { background: var(--murekkep-3); color: var(--kagit); }

  .ozet {
    display: grid;
    gap: 1px;
    padding: var(--b2) var(--b3);
    background: var(--murekkep);
    border: 1px solid var(--ayrac);
    border-radius: var(--yuvarlak-dugme);
  }
  .ozet-gun { display: grid; grid-template-columns: 82px 1fr; gap: var(--b2); }
  .ozet-gun.bos { opacity: 0.45; }
  .ozet-ad { font-size: 12.5px; color: var(--kagit-3); }
  .ozet-isler {
    font-size: 12.5px;
    color: var(--kagit-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .oge {
    display: grid;
    border: 1px solid var(--ayrac);
    border-radius: var(--yuvarlak-dugme);
  }
  .oge.acik { border-color: var(--ayrac-guclu); background: var(--murekkep); }
  .oge-satiri {
    display: flex;
    align-items: center;
    gap: var(--b2);
    padding: 3px 4px 3px var(--b2);
    border-radius: var(--yuvarlak-dugme);
  }
  .oge-satiri:hover { background: var(--murekkep-3); }
  .oge.acik .oge-satiri { background: var(--murekkep-3); }
  .oge-ac {
    display: flex;
    align-items: baseline;
    gap: var(--b2);
    flex: 1;
    min-width: 0;
    padding: 2px 0;
    text-align: left;
  }
  .oge-kaldir {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    flex: none;
    border-radius: var(--yuvarlak-dugme);
    color: var(--kagit-3);
    opacity: 0;
    transition: color var(--gecis-hizli), opacity var(--gecis-hizli);
  }
  /* Surekli duran bir capraz kazara tiklanmayi davet ediyor; satirin
     uzerindeyken ve klavye odagindayken cikiyor. */
  .oge-satiri:hover .oge-kaldir,
  .oge-kaldir:focus-visible { opacity: 1; }
  .oge-kaldir:hover { color: var(--kirmizi); background: var(--kirmizi-sonuk); }
  .oge-saat { font-size: 12px; color: var(--kagit-3); flex: none; }
  .oge-sira { font-size: 12px; color: var(--pirinc); flex: none; min-width: 42px; }
  .oge-tasi:hover:not(:disabled) { color: var(--kagit); background: var(--murekkep-3); }
  .oge-tasi:disabled { visibility: hidden; }

  .kip-secici { display: flex; gap: 3px; }
  .kip-dugme {
    flex: 1;
    padding: 6px var(--b2);
    border: 1px solid var(--ayrac);
    border-radius: var(--yuvarlak-dugme);
    font-size: 12.5px;
    color: var(--kagit-3);
    transition: color var(--gecis-hizli), border-color var(--gecis-hizli),
      background var(--gecis-hizli);
  }
  .kip-dugme:hover:not(:disabled) { color: var(--kagit-2); border-color: var(--ayrac-guclu); }
  .kip-dugme:disabled:not(.secili) { opacity: 0.45; cursor: default; }
  .kip-dugme.secili {
    background: var(--pirinc);
    border-color: var(--pirinc);
    color: var(--pirinc-ustu);
  }
  .oge-ad {
    font-size: 13.5px;
    color: var(--kagit);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }
  .oge-gunler {
    font-size: 11.5px;
    letter-spacing: 0.02em;
    color: var(--kagit-3);
    flex: none;
  }

  .oge-form {
    display: grid;
    gap: var(--b3);
    margin: var(--b2) 0 var(--b2) var(--b2);
    padding: var(--b3);
    border-left: 2px solid var(--pirinc);
    background: var(--murekkep-2);
    border-radius: 0 var(--yuvarlak-dugme) var(--yuvarlak-dugme) 0;
  }

  .gun-secici { display: flex; gap: 3px; }
  .gun-dugme {
    flex: 1;
    padding: 5px 0;
    border: 1px solid var(--ayrac);
    border-radius: var(--yuvarlak-dugme);
    font-size: 12px;
    color: var(--kagit-3);
    transition: color var(--gecis-hizli), border-color var(--gecis-hizli),
      background var(--gecis-hizli);
  }
  .gun-dugme:hover { color: var(--kagit-2); border-color: var(--ayrac-guclu); }
  .gun-dugme.secili {
    background: var(--pirinc);
    border-color: var(--pirinc);
    color: var(--pirinc-ustu);
  }

  .hatirlatma { display: flex; align-items: center; gap: var(--b2); }
  .onay { display: flex; align-items: center; gap: 6px; font-size: 13.5px; color: var(--kagit-2); }
  .onay input { width: auto; }
  .dakika { width: 72px; }
  .birim { font-size: 13px; color: var(--kagit-3); }

  .oge-sil {
    justify-self: start;
    font-size: 12.5px;
    color: var(--kagit-3);
    padding: 3px var(--b2);
    border-radius: var(--yuvarlak-dugme);
  }
  .oge-sil:hover { color: var(--kirmizi); background: var(--kirmizi-sonuk); }

  .dugme {
    padding: 7px var(--b4);
    border-radius: var(--yuvarlak-dugme);
    font-size: 14px;
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
    font-size: 13px;
    color: var(--kirmizi);
  }
  .uyari {
    margin: 0;
    padding: var(--b2) var(--b3);
    border-left: 2px solid var(--pirinc);
    background: var(--pirinc-sonuk);
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--kagit-2);
  }
</style>
