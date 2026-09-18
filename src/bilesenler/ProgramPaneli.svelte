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
  import type { UretimOzeti } from '../lib/programUret.ts';

  interface Ozellikler {
    program: Program;
    onKapat: () => void;
    onKaydedildi?: (p: Program, ozet: UretimOzeti | null) => void;
  }
  let { program, onKapat, onKaydedildi }: Ozellikler = $props();

  // Formun kendi kopyasi: iptal edilirse depodaki kayit bozulmasin.
  let taslak = $state<Program>(
    untrack(() => structuredClone($state.snapshot(program))),
  );
  let acikOge = $state<string | null>(null);
  let hata = $state<string | null>(null);
  let calisiyor = $state(false);

  const yeniMi = $derived(!taslak.id);
  const isSayisi = $derived(taslak.ogeler.reduce((t, o) => t + o.gunler.length, 0));
  const haftalikDakika = $derived(
    taslak.ogeler.reduce((t, o) => t + o.sure_dakika * o.gunler.length, 0),
  );

  const secilenKategori = $derived(
    depo.kategoriler.find(
      (k) => k.ad.toLowerCase() === taslak.kategori.trim().toLowerCase(),
    ),
  );

  function yeniKimlik(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  }

  /** Listeleme sirasi: once en erken gun, sonra saat. */
  const sirali = $derived(
    [...taslak.ogeler].sort((a, b) => {
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
      gunler: [1],
      saat: '09:00',
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

    <label class="alan">
      <span class="etiket">Kategori</span>
      <div class="kategori-satiri">
        {#if secilenKategori}
          <span class="kategori-nokta" style:background={secilenKategori.renk}></span>
        {/if}
        <input bind:value={taslak.kategori} list="program-kategori-listesi" placeholder="genel" />
      </div>
    </label>
    <datalist id="program-kategori-listesi">
      {#each depo.kategoriler as k (k.ad)}<option value={k.ad}></option>{/each}
    </datalist>

    <div class="bolum">
      <div class="bolum-basligi">
        <span class="etiket">İşler</span>
        <span class="sayac">
          {isSayisi} iş · haftada {Math.round((haftalikDakika / 60) * 10) / 10} saat
        </span>
      </div>

      {#each sirali as oge (oge.id)}
        <div class="oge" class:acik={acikOge === oge.id}>
          <!-- Silme dugmesi satirda duruyor: yalnizca acik formda olunca
               kapali bir isi kaldirmanin yolu gorunmuyordu. -->
          <div class="oge-satiri">
            <button
              class="oge-ac"
              onclick={() => (acikOge = acikOge === oge.id ? null : oge.id)}
            >
              <span class="oge-saat zaman">{oge.saat}–{bitisSaati(oge)}</span>
              <span class="oge-ad">{oge.baslik || 'Adsız iş'}</span>
              <span class="oge-gunler">
                {#if oge.gunler.length === 0}
                  gün seçilmedi
                {:else}
                  {oge.gunler.map((g) => GUN_KISA[g]).join(' ')}
                {/if}
              </span>
            </button>
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
              </div>

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
      {/each}

      <button class="ekle-is" onclick={ogeEkle}>+ İş ekle</button>
    </div>

    <!-- Salt okunur ozet: gunler isin icinde seciliyor, burada sonucu gorunuyor. -->
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
    grid-template-rows: auto 1fr auto;
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
    font-size: 10.5px;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--kagit-3);
  }
  .ipucu { font-size: 10.5px; color: var(--kagit-3); }

  input, textarea {
    width: 100%;
    padding: 7px var(--b3);
    background: var(--murekkep);
    border: 1px solid var(--ayrac);
    border-radius: var(--yuvarlak-dugme);
    font: inherit;
    font-size: 13px;
    color: var(--kagit);
  }
  textarea { resize: vertical; min-height: 44px; line-height: 1.5; }
  input:focus, textarea:focus { border-color: var(--pirinc); outline: none; }
  input[type='time'] { color-scheme: dark; }

  .kategori-satiri { display: flex; align-items: center; gap: var(--b2); }
  .kategori-nokta { width: 9px; height: 9px; flex: none; border-radius: 50%; }

  .bolum { display: grid; gap: var(--b2); }
  .bolum-basligi { display: flex; align-items: baseline; justify-content: space-between; }
  .sayac { font-size: 11px; color: var(--kagit-3); }

  .ekle-is {
    justify-self: start;
    margin-top: 2px;
    padding: 4px var(--b3);
    border: 1px dashed var(--ayrac-guclu);
    border-radius: var(--yuvarlak-dugme);
    font-size: 12px;
    color: var(--kagit-3);
    transition: color var(--gecis-hizli), border-color var(--gecis-hizli);
  }
  .ekle-is:hover { color: var(--pirinc); border-color: var(--pirinc); }

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
  .ozet-ad { font-size: 11.5px; color: var(--kagit-3); }
  .ozet-isler {
    font-size: 11.5px;
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
  .oge-saat { font-size: 11px; color: var(--kagit-3); flex: none; }
  .oge-ad {
    font-size: 12.5px;
    color: var(--kagit);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }
  .oge-gunler {
    font-size: 10.5px;
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
    font-size: 11px;
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
  .onay { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--kagit-2); }
  .onay input { width: auto; }
  .dakika { width: 72px; }
  .birim { font-size: 12px; color: var(--kagit-3); }

  .oge-sil {
    justify-self: start;
    font-size: 11.5px;
    color: var(--kagit-3);
    padding: 3px var(--b2);
    border-radius: var(--yuvarlak-dugme);
  }
  .oge-sil:hover { color: var(--kirmizi); background: var(--kirmizi-sonuk); }

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
  .uyari {
    margin: 0;
    padding: var(--b2) var(--b3);
    border-left: 2px solid var(--pirinc);
    background: var(--pirinc-sonuk);
    font-size: 11.5px;
    line-height: 1.5;
    color: var(--kagit-2);
  }
</style>
