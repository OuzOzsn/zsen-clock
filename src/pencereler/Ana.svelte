<script lang="ts">
  /**
   * Takvim penceresi.
   *
   * Widget "sirada ne var" sorusuna bakar; burasi planin tamamini gorup
   * duzenledigin yer. Sol panelde ekleme ve gezinme, sagda secilen gorunum.
   */
  import { onMount } from 'svelte';
  import { guncelleme } from '../lib/guncelleme.svelte.ts';
  import AjandaGorunumu from '../bilesenler/AjandaGorunumu.svelte';
  import AyarPaneli from '../bilesenler/AyarPaneli.svelte';
  import AyGorunumu from '../bilesenler/AyGorunumu.svelte';
  import EtkinlikFormu from '../bilesenler/EtkinlikFormu.svelte';
  import GunGorunumu from '../bilesenler/GunGorunumu.svelte';
  import HizliEkle from '../bilesenler/HizliEkle.svelte';
  import Ikon from '../bilesenler/Ikon.svelte';
  import IlkKurulum from '../bilesenler/IlkKurulum.svelte';
  import KategoriPaneli from '../bilesenler/KategoriPaneli.svelte';
  import MiniTakvim from '../bilesenler/MiniTakvim.svelte';
  import PlanListesi from '../bilesenler/PlanListesi.svelte';
  import KonudanProgram from '../bilesenler/KonudanProgram.svelte';
  import ProgramTuruSec from '../bilesenler/ProgramTuruSec.svelte';
  import ProgramBaslat from '../bilesenler/ProgramBaslat.svelte';
  import ProgramDetay from '../bilesenler/ProgramDetay.svelte';
  import ProgramListesi from '../bilesenler/ProgramListesi.svelte';
  import ProgramPaneli from '../bilesenler/ProgramPaneli.svelte';
  import { cagir, dinle, TAURI_ICINDE } from '../lib/ipc.ts';
  import { ayEkle, ayIzgarasi, gunBasi, gunEkle } from '../lib/tarih.ts';
  import { AY_UZUN, type Etkinlik, type Olusum, type Program } from '../lib/tipler.ts';
  import { depo, saatiBaslat } from '../lib/veri.svelte.ts';

  type Gorunum = 'ay' | 'hafta' | 'gun' | 'ajanda';

  let gorunum = $state<Gorunum>('ay');
  let secili = $state(gunBasi(new Date()));
  let duzenlenen = $state<{ etkinlik: Etkinlik; olusum?: Date } | null>(null);
  let hizliEkle = $state<HizliEkle>();
  let gizliKategoriler = $state<Set<string>>(new Set());
  let ayarlarAcik = $state(false);
  let planAcik = $state(false);
  let denemeMi = $state(false);
  /** "Yeni program": once kurulus yolu seciliyor. */
  let turSecimi = $state(false);
  let kategorilerAcik = $state(false);
  let programDuzenlenen = $state<Program | null>(null);
  /** Duzenleyici acilinca acik gelecek is (Ayrintilar'daki "Düzenle"). */
  let programAcikOge = $state<string | null>(null);
  let programDetayi = $state<Program | null>(null);
  let programBaslatilan = $state<Program | null>(null);
  /** Ilk calistirmada karsilama ekrani. Yalnizca bir kez cikar. */
  let kurulumAcik = $derived(depo.yuklendi && !depo.ayarlar.ilk_kurulum_yapildi);

  const simdi = $derived(depo.simdi);

  onMount(() => {
    const durdur = saatiBaslat();
    void depo.yukle();
    void depo.dinlemeyeBasla();
    const temizle = dinle<null>('yeni-etkinlik', () => hizliEkle?.odaklan());
    // Deneme build'i (build.ps1 -Deneme) gercek kurulumla karismasin diye
    // markanin yaninda etiket tasiyor.
    if (TAURI_ICINDE) {
      void import('@tauri-apps/api/app')
        .then((m) => m.getName())
        .then((ad) => (denemeMi = ad.includes('Deneme')));
    }
    // Acilisi yavaslatmasin; internet yoksa sessizce gecer.
    const guncellemeZamani = setTimeout(() => void guncelleme.denetle(), 5000);
    return () => {
      clearTimeout(guncellemeZamani);
      durdur();
      void temizle.then((f) => f());
    };
  });

  // --- gorunur aralik ------------------------------------------------------

  const aralik = $derived.by(() => {
    switch (gorunum) {
      case 'ay': {
        const izgara = ayIzgarasi(secili, depo.ayarlar.haftanin_ilk_gunu || 1);
        return { bas: izgara[0]!, son: izgara[41]! };
      }
      case 'hafta': {
        const ilk = depo.ayarlar.haftanin_ilk_gunu || 1;
        const gun = secili.getDay() === 0 ? 7 : secili.getDay();
        const bas = gunEkle(gunBasi(secili), -((gun - ilk + 7) % 7));
        return { bas, son: gunEkle(bas, 6) };
      }
      case 'gun':
        return { bas: gunBasi(secili), son: gunBasi(secili) };
      case 'ajanda':
        return { bas: gunBasi(simdi), son: gunEkle(gunBasi(simdi), 45) };
    }
  });

  /** Kac kategori suanda gizli - "takvim neden bos?" sorusunu onlemek icin. */
  const gizliSayisi = $derived(
    depo.kategoriler.filter((k) => gizliKategoriler.has(k.ad)).length,
  );

  const tumOlusumlar = $derived(
    depo.yuklendi ? depo.araliktakiler(aralik.bas, aralik.son) : [],
  );
  const olusumlar = $derived(
    tumOlusumlar.filter((o) => !gizliKategoriler.has(o.etkinlik.kategori)),
  );

  const baslik = $derived.by(() => {
    if (gorunum === 'ajanda') return 'Sıradakiler';
    if (gorunum === 'gun') {
      return `${secili.getDate()} ${AY_UZUN[secili.getMonth()]} ${secili.getFullYear()}`;
    }
    if (gorunum === 'hafta') {
      const b = aralik.bas;
      const s = aralik.son;
      return b.getMonth() === s.getMonth()
        ? `${b.getDate()}–${s.getDate()} ${AY_UZUN[b.getMonth()]}`
        : `${b.getDate()} ${AY_UZUN[b.getMonth()]} – ${s.getDate()} ${AY_UZUN[s.getMonth()]}`;
    }
    return `${AY_UZUN[secili.getMonth()]} ${secili.getFullYear()}`;
  });

  // --- gezinme -------------------------------------------------------------

  function kaydir(yon: number) {
    if (gorunum === 'ay') secili = ayEkle(secili, yon);
    else if (gorunum === 'hafta') secili = gunEkle(secili, yon * 7);
    else secili = gunEkle(secili, yon);
  }

  function bugune() {
    secili = gunBasi(new Date());
  }

  function kategoriDegistir(ad: string) {
    const yeni = new Set(gizliKategoriler);
    if (yeni.has(ad)) yeni.delete(ad);
    else yeni.add(ad);
    gizliKategoriler = yeni;
  }

  // --- etkinlik islemleri --------------------------------------------------

  function yeniEtkinlik(gun: Date) {
    const baslangic = new Date(gun);
    // Gun izgarasinda bos bir saate tiklanmadiysa makul bir varsayilan ver.
    if (baslangic.getHours() === 0 && baslangic.getMinutes() === 0) {
      baslangic.setHours(9, 0, 0, 0);
    }
    const bitis = new Date(
      baslangic.getTime() + depo.ayarlar.varsayilan_sure_dakika * 60000,
    );
    duzenlenen = {
      etkinlik: {
        id: '',
        baslik: '',
        not: '',
        kategori: 'genel',
        baslangic: yerel(baslangic),
        bitis: yerel(bitis),
        tum_gun: false,
        tekrar: { tip: 'yok', aralik: 1, gunler: [], istisnalar: [] },
        hatirlatmalar: [{ dakika_once: depo.ayarlar.varsayilan_hatirlatma_dakika }],
        renk: null,
        tamamlananlar: [],
      },
    };
  }

  function yerel(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(
      d.getHours(),
    )}:${p(d.getMinutes())}:00`;
  }

  function yeniProgram() {
    programDuzenlenen = {
      id: '',
      baslik: '',
      aciklama: '',
      kategori: 'ders',
      ogeler: [],
      kosu: null,
    };
  }

  function olusumAc(o: Olusum) {
    duzenlenen = { etkinlik: structuredClone($state.snapshot(o.etkinlik)), olusum: o.baslangic };
  }

  function tamamla(o: Olusum) {
    void depo.tamamla(o, !o.tamamlandi);
  }

  // --- klavye --------------------------------------------------------------

  function klavye(e: KeyboardEvent) {
    const alandaYaziyor =
      e.target instanceof HTMLElement &&
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);
    if (
      alandaYaziyor || duzenlenen || ayarlarAcik || planAcik || turSecimi || kategorilerAcik ||
      kurulumAcik || programDuzenlenen || programDetayi || programBaslatilan
    ) return;

    switch (e.key.toLowerCase()) {
      case 'n': e.preventDefault(); hizliEkle?.odaklan(); break;
      case 't': bugune(); break;
      case '1': gorunum = 'ay'; break;
      case '2': gorunum = 'hafta'; break;
      case '3': gorunum = 'gun'; break;
      case '4': gorunum = 'ajanda'; break;
      case 'arrowleft': kaydir(-1); break;
      case 'arrowright': kaydir(1); break;
      case ',': ayarlarAcik = true; break;
    }
  }
</script>

<svelte:window onkeydown={klavye} />

<div class="duzen">
  <!-- ------------------------------------------------------- yan panel -->
  <aside>
    <div class="marka">
      <span class="marka-ad">
        Zsen Clock
        {#if denemeMi}<span class="deneme" title="Test için derlenmiş sürüm; verisi kendi klasöründe">Deneme</span>{/if}
      </span>
      {#if guncelleme.durum === 'var' || guncelleme.durum === 'indiriliyor'}
        <button
          class="guncelleme"
          disabled={guncelleme.durum === 'indiriliyor'}
          onclick={() => void guncelleme.kur()}
          title={guncelleme.notlar || undefined}
        >
          {#if guncelleme.durum === 'indiriliyor'}
            İndiriliyor{guncelleme.ilerleme !== null ? ` %${guncelleme.ilerleme}` : '…'}
          {:else}
            <span class="guncelleme-nokta"></span>
            Yeni sürüm v{guncelleme.yeniSurum} — {guncelleme.kurulu ? 'Güncelle' : 'İndir'}
          {/if}
        </button>
      {/if}
    </div>

    <HizliEkle
      bind:this={hizliEkle}
      onEklendi={(e) => {
        const d = new Date(e.baslangic);
        secili = gunBasi(d);
      }}
    />

    <MiniTakvim
      {secili}
      {simdi}
      olusumlar={tumOlusumlar}
      onSec={(g) => (secili = g)}
    />

    <!-- Tek kutu: kenar cubugu izgarasinda satir sayisi PlanListesi'nin
         gorunup gorunmemesine gore kaymasin. -->
    <div class="program-alani">
      <ProgramListesi onYeni={() => (turSecimi = true)} onDetay={(p) => (programDetayi = p)} />
      <!-- Eski "çalışma planı" kayitlari: yalnizca varsa gorunur, silmek icin. -->
      <PlanListesi />
    </div>

    <div class="kategoriler">
      <div class="kategori-basligi">
        <span class="panel-baslik">Kategoriler</span>
        <!-- Silme/duzenleme paneli "+" arkasindaydi ve kimse orada aramiyordu;
             acik bir "Yönet" dugmesi eklendi. -->
        <button
          class="metin-dugme"
          onclick={() => (kategorilerAcik = true)}
          title="Kategori ekle, düzenle veya sil"
        >
          Yönet
        </button>
        <button
          class="ekle-dugme"
          onclick={() => (kategorilerAcik = true)}
          aria-label="Kategori ekle"
          title="Kategori ekle"
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" stroke-width="1.5"
              stroke-linecap="round" />
          </svg>
        </button>
      </div>
      {#each depo.kategoriler as k (k.ad)}
        {@const gizli = gizliKategoriler.has(k.ad)}
        <button
          class="kategori"
          class:gizli
          aria-pressed={gizli}
          title={(gizli
            ? `${k.ad} takvimde gizli — göstermek için tıkla`
            : `${k.ad} — takvimde gizlemek için tıkla`) + (k.aciklama ? `\n\n${k.aciklama}` : '')}
          onclick={() => kategoriDegistir(k.ad)}
        >
          {#if k.ikon}
            <span class="kategori-ikon" style:color={gizli ? undefined : k.renk}>
              <Ikon ad={k.ikon} boyut={13} />
            </span>
          {:else}
            <span class="kategori-renk" style:background={k.renk}></span>
          {/if}
          <span class="kategori-ad">{k.ad}</span>
          {#if gizli}
            <!-- Ustu cizili goz: satirin solmus olmasi "gizli" demek icin
                 yetmiyordu, kullanici kategoriyi silinmis saniyor. -->
            <svg class="gizli-simge" width="13" height="13" viewBox="0 0 16 16" fill="none"
              aria-hidden="true">
              <path d="M2 8s2.2-3.5 6-3.5S14 8 14 8s-2.2 3.5-6 3.5S2 8 2 8Z"
                stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M3 13 13 3" stroke="currentColor" stroke-linecap="round" />
            </svg>
          {/if}
        </button>
      {/each}

      {#if gizliSayisi > 0}
        <button class="filtre-uyarisi" onclick={() => (gizliKategoriler = new Set())}>
          {gizliSayisi} kategori takvimde gizli — hepsini göster
        </button>
      {/if}
    </div>

    <div class="panel-dip">
      <button class="dip-dugme" onclick={() => void cagir('veri_klasorunu_ac')}>
        Veri klasörünü aç
      </button>
    </div>
  </aside>

  <!-- ------------------------------------------------------------ ana -->
  <main>
    <header class="ustbar">
      <div class="sol">
        <h1>{baslik}</h1>
        {#if gorunum !== 'ajanda'}
          <div class="gezinme">
            <button class="ok" onclick={() => kaydir(-1)} aria-label="Önceki">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M8.5 3L5 7l3.5 4" stroke="currentColor" stroke-width="1.5"
                  stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
            <button class="ok" onclick={() => kaydir(1)} aria-label="Sonraki">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M5.5 3L9 7l-3.5 4" stroke="currentColor" stroke-width="1.5"
                  stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
            <button class="bugun-dugme" onclick={bugune}>Bugün</button>
          </div>
        {/if}
      </div>

      <nav class="gorunumler" aria-label="Görünüm">
        {#each [['ay', 'Ay'], ['hafta', 'Hafta'], ['gun', 'Gün'], ['ajanda', 'Ajanda']] as [deger, etiket] (deger)}
          <button
            class="gorunum-dugme"
            class:etkin={gorunum === deger}
            onclick={() => (gorunum = deger as Gorunum)}
          >
            {etiket}
          </button>
        {/each}
      </nav>

      <button class="ok ayar" onclick={() => (ayarlarAcik = true)} aria-label="Ayarlar" title="Ayarlar (,)">
        <!-- Ayar carki (Lucide "settings", ISC). Once gunes gibi bir simgeydi;
             kullanici onu ayar olarak tanimadi. -->
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"
          stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>
    </header>

    {#if depo.uyari}
      <div class="uyari-serit" role="alert">
        <strong>Veri dosyası okunamadı.</strong>
        {depo.uyari}
      </div>
    {/if}

    <div class="govde">
      {#if gorunum === 'ay'}
        <AyGorunumu
          ay={secili}
          {secili}
          {simdi}
          {olusumlar}
          onGunSec={(g) => (secili = g)}
          onGunAc={(g) => { secili = g; gorunum = 'gun'; }}
          onOlusumAc={olusumAc}
        />
      {:else if gorunum === 'ajanda'}
        <AjandaGorunumu {olusumlar} {simdi} onOlusumAc={olusumAc} onTamamla={tamamla} />
      {:else}
        <GunGorunumu
          bas={aralik.bas}
          gunSayisi={gorunum === 'hafta' ? 7 : 1}
          {simdi}
          {olusumlar}
          onOlusumAc={olusumAc}
          onBosAlan={yeniEtkinlik}
        />
      {/if}
    </div>
  </main>
</div>

{#if kurulumAcik}
  <IlkKurulum onBitti={() => {}} />
{/if}

{#if turSecimi}
  <ProgramTuruSec
    onKapat={() => (turSecimi = false)}
    onSec={(tur) => {
      turSecimi = false;
      if (tur === 'elle') yeniProgram();
      else planAcik = true;
    }}
  />
{/if}

{#if planAcik}
  <KonudanProgram
    onKapat={() => (planAcik = false)}
    onOlusturuldu={(p, g) => { secili = gunBasi(g); gorunum = 'ay'; programDetayi = p; }}
  />
{/if}

{#if kategorilerAcik}
  <KategoriPaneli onKapat={() => (kategorilerAcik = false)} />
{/if}

{#if programDetayi}
  <ProgramDetay
    program={programDetayi}
    onKapat={() => (programDetayi = null)}
    onDuzenle={(p, ogeId) => { programDetayi = null; programAcikOge = ogeId ?? null; programDuzenlenen = p; }}
    onBaslat={(p) => { programDetayi = null; programBaslatilan = p; }}
  />
{/if}

{#if programDuzenlenen}
  <ProgramPaneli
    program={programDuzenlenen}
    acikOgeId={programAcikOge}
    onKapat={() => { programDuzenlenen = null; programAcikOge = null; }}
    onKaydedildi={(p) => {
      // Uykudaki yeni program kaydedilince dogrudan baslatma adimina gec:
      // kullanicinin istedigi sey zaten "ne zaman baslasin" sorusu.
      if (!p.kosu) programBaslatilan = p;
    }}
  />
{/if}

{#if programBaslatilan}
  <ProgramBaslat
    program={programBaslatilan}
    onKapat={() => (programBaslatilan = null)}
    onBasladi={(g) => { secili = gunBasi(g); gorunum = 'ay'; }}
  />
{/if}

{#if ayarlarAcik}
  <AyarPaneli onKapat={() => (ayarlarAcik = false)} />
{/if}

{#if duzenlenen}
  <EtkinlikFormu
    etkinlik={duzenlenen.etkinlik}
    olusum={duzenlenen.olusum}
    onKapat={() => (duzenlenen = null)}
    onProgramaGit={(id) => {
      const p = depo.programlar.find((x) => x.id === id);
      if (p) programDuzenlenen = p;
    }}
  />
{/if}

<style>
  .duzen {
    display: grid;
    grid-template-columns: 272px 1fr;
    height: 100vh;
  }

  /* ---------------------------------------------------------- yan panel */
  aside {
    display: grid;
    grid-template-rows: auto auto auto auto 1fr auto;
    gap: var(--b5);
    padding: var(--b4);
    background: var(--murekkep);
    border-right: 1px solid var(--ayrac);
    overflow-y: auto;
  }

  .marka { display: grid; gap: var(--b2); padding-bottom: 2px; }
  .guncelleme {
    display: flex;
    align-items: center;
    gap: var(--b2);
    padding: 6px var(--b3);
    border: 1px solid var(--pirinc);
    border-radius: var(--yuvarlak-dugme);
    background: var(--pirinc-sonuk);
    font-size: 12.5px;
    color: var(--kagit);
    text-align: left;
  }
  .guncelleme:hover:not(:disabled) { background: var(--pirinc); color: var(--pirinc-ustu); }
  .guncelleme:disabled { cursor: default; }
  .guncelleme-nokta {
    width: 7px;
    height: 7px;
    flex: none;
    border-radius: 50%;
    background: var(--pirinc);
  }
  .guncelleme:hover .guncelleme-nokta { background: currentColor; }
  .marka-ad {
    font-size: 14px;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--kagit-2);
  }

  .panel-baslik {
    display: block;
    margin-bottom: var(--b2);
    font-size: 12px;
    font-weight: 500;
    color: var(--kagit-3);
  }

  .deneme {
    margin-left: var(--b2);
    padding: 1px 6px;
    border: 1px solid var(--kat-2);
    border-radius: 99px;
    font-size: 11px;
    font-weight: 500;
    color: var(--kat-2);
    vertical-align: 1px;
  }
  .program-alani { display: grid; gap: var(--b4); align-self: start; }

  .kategoriler { align-self: start; }
  .metin-dugme {
    padding: 2px var(--b2);
    border-radius: var(--yuvarlak-dugme);
    font-size: 12px;
    color: var(--kagit-3);
    transition: color var(--gecis-hizli), background var(--gecis-hizli);
  }
  .metin-dugme:hover { color: var(--kagit); background: var(--murekkep-2); }

  .kategori-basligi {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  /* Baslik solda, iki dugme sagda bitisik dursun. */
  .kategori-basligi .metin-dugme { margin-left: auto; }
  .ekle-dugme {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: var(--yuvarlak-dugme);
    color: var(--kagit-3);
    transition: color var(--gecis-hizli), background var(--gecis-hizli);
  }
  .ekle-dugme:hover { color: var(--kagit); background: var(--murekkep-2); }
  .kategori-ikon {
    display: grid;
    place-items: center;
    width: 13px;
    flex: none;
  }
  .kategori.gizli .kategori-ikon { color: var(--kagit-3); }
  .kategori {
    display: flex;
    align-items: center;
    gap: var(--b2);
    width: 100%;
    padding: 4px var(--b2);
    border-radius: var(--yuvarlak-dugme);
    text-align: left;
    transition: background var(--gecis-hizli), opacity var(--gecis-hizli);
  }
  .kategori:hover { background: var(--murekkep-2); }
  /* Gizli satir okunur kalmali: 0.4'te satir "yok olmus" gibi gorunuyordu ve
     kullanici kategoriyi silinmis saniyordu. Durumu saydamlik degil, ustu
     cizili goz simgesi anlatiyor. */
  .kategori.gizli { opacity: 0.65; }
  .kategori.gizli .kategori-ad { text-decoration: line-through; }
  .gizli-simge { margin-left: auto; flex: none; color: var(--kagit-3); }
  .kategori-renk {
    width: 9px;
    height: 9px;
    border-radius: 2px;
    flex: none;
  }
  .kategori.gizli .kategori-renk { background: var(--kagit-3) !important; }
  .kategori-ad {
    font-size: 13.5px;
    color: var(--kagit-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .filtre-uyarisi {
    margin-top: var(--b2);
    padding: 5px var(--b2);
    border: 1px solid var(--pirinc);
    border-radius: var(--yuvarlak-dugme);
    font-size: 12px;
    line-height: 1.4;
    text-align: left;
    color: var(--pirinc);
    transition: background var(--gecis-hizli);
  }
  .filtre-uyarisi:hover { background: var(--pirinc-sonuk); }

  .panel-dip { align-self: end; }
  .dip-dugme {
    font-size: 12.5px;
    color: var(--kagit-3);
    transition: color var(--gecis-hizli);
  }
  .dip-dugme:hover { color: var(--kagit-2); }

  /* --------------------------------------------------------------- ana */
  /* Flex, grid degil: uyari seridi kosullu oldugu icin satir sayisi
     degisiyordu ve govde bazen "1fr" yerine "auto" satirina dusup
     yuksekligi doldurmuyordu. Flex'te sira sayisindan bagimsiz calisiyor. */
  main {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }

  .ustbar {
    flex: none;
    display: flex;
    align-items: center;
    gap: var(--b4);
    padding: var(--b3) var(--b5);
    border-bottom: 1px solid var(--ayrac);
  }
  .sol { margin-right: auto; }

  .sol { display: flex; align-items: center; gap: var(--b4); }
  h1 {
    font-size: 17px;
    font-weight: 600;
    letter-spacing: -0.015em;
  }

  .gezinme { display: flex; align-items: center; gap: 2px; }
  .ok {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: var(--yuvarlak-dugme);
    color: var(--kagit-3);
    transition: color var(--gecis-hizli), background var(--gecis-hizli);
  }
  .ok:hover { color: var(--kagit); background: var(--murekkep-2); }

  .bugun-dugme {
    margin-left: var(--b2);
    padding: 4px var(--b3);
    border: 1px solid var(--ayrac);
    border-radius: var(--yuvarlak-dugme);
    font-size: 13px;
    color: var(--kagit-2);
    transition: color var(--gecis-hizli), border-color var(--gecis-hizli);
  }
  .bugun-dugme:hover { color: var(--kagit); border-color: var(--ayrac-guclu); }

  /* Gorunum secici: secili olan pirinc alt cizgiyle isaretli.
     Kutu/pill degil - ustbar zaten cizgilerle bolunmus bir yuzey. */
  .gorunumler { display: flex; gap: 2px; }
  .ayar { margin-left: var(--b2); }
  .gorunum-dugme {
    position: relative;
    padding: 6px var(--b3) 7px;
    font-size: 13.5px;
    color: var(--kagit-3);
    transition: color var(--gecis-hizli);
  }
  .gorunum-dugme:hover { color: var(--kagit-2); }
  .gorunum-dugme.etkin { color: var(--kagit); font-weight: 500; }
  .gorunum-dugme.etkin::after {
    content: '';
    position: absolute;
    left: var(--b2);
    right: var(--b2);
    bottom: -1px;
    height: 2px;
    background: var(--pirinc);
  }

  .uyari-serit {
    flex: none;
    padding: var(--b2) var(--b5);
    border-bottom: 1px solid var(--ayrac);
    background: var(--kirmizi-sonuk);
    font-size: 13px;
    color: var(--kagit-2);
  }
  .uyari-serit strong { color: var(--kirmizi); font-weight: 600; }

  .govde { flex: 1; min-height: 0; overflow: hidden; }
</style>
