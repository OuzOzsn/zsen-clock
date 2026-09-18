<script lang="ts">
  /**
   * Cok satirli duz metin; icindeki http(s) adresleri tiklanabilir olur.
   *
   * Markdown yok, sanitizer yok. Baglantilar `{@html}` ile degil gercek
   * <a> dugumleri olarak cizilyor - ice aktarilan bir program dosyasi
   * guvenilmez girdi ve icine HTML kacirilamamali. Semayi ayrica suzuyoruz:
   * `opener` eklentisi `file:` ya da rastgele bir sema isleyicisini de acardi.
   */
  import { cagir, TAURI_ICINDE } from '../lib/ipc.ts';

  interface Ozellikler {
    metin: string;
    /** Satir satir degil tek satirda goster (liste satirlarinda). */
    tekSatir?: boolean;
  }
  let { metin, tekSatir = false }: Ozellikler = $props();

  type Parca = { tur: 'metin' | 'baglanti'; deger: string };

  // Sondaki noktalama baglantiya dahil edilmiyor: "bkz. https://a.com."
  const KALIP = /https?:\/\/[^\s<>"']+/g;
  const SON_NOKTALAMA = /[.,;:!?)\]]+$/;

  const parcalar = $derived.by((): Parca[] => {
    const sonuc: Parca[] = [];
    let konum = 0;
    for (const esles of metin.matchAll(KALIP)) {
      const bas = esles.index!;
      let url = esles[0];
      const kirpilan = url.replace(SON_NOKTALAMA, '');
      const artan = url.slice(kirpilan.length);
      url = kirpilan;

      if (bas > konum) sonuc.push({ tur: 'metin', deger: metin.slice(konum, bas) });
      sonuc.push({ tur: 'baglanti', deger: url });
      if (artan) sonuc.push({ tur: 'metin', deger: artan });
      konum = bas + esles[0].length;
    }
    if (konum < metin.length) sonuc.push({ tur: 'metin', deger: metin.slice(konum) });
    return sonuc;
  });

  function ac(olay: MouseEvent, url: string) {
    if (!TAURI_ICINDE) return; // tarayicida gercek <a> zaten calisiyor
    // Webview icinde normal gezinme tum pencereyi degistirirdi.
    olay.preventDefault();
    void cagir('baglanti_ac', { url });
  }
</script>

{#if metin.trim()}
  <p class="icerik" class:tek-satir={tekSatir} data-secilebilir>
    {#each parcalar as p, i (i)}
      {#if p.tur === 'baglanti'}
        <a href={p.deger} target="_blank" rel="noopener noreferrer" onclick={(e) => ac(e, p.deger)}
          >{p.deger}</a
        >
      {:else}{p.deger}{/if}
    {/each}
  </p>
{/if}

<style>
  .icerik {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: var(--kagit-2);
    /* Satir sonlari korunsun; uzun baglantilar kutuyu tasirmasin. */
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .tek-satir {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  a {
    color: var(--pirinc);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  a:hover {
    color: var(--pirinc-parlak);
  }
</style>
