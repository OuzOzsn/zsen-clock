<script lang="ts">
  /**
   * "Yeni program": once nasil kurulacagi seciliyor.
   *
   * Eskiden kenar cubugunda ayri bir "Çalışma planı oluştur" dugmesi vardi
   * ve programla farki anlasilmiyordu. Ikisi de artik program; fark yalnizca
   * kurulus yolu. Kutularin aciklamasi o farki soyluyor.
   */
  interface Ozellikler {
    onKapat: () => void;
    onSec: (tur: 'elle' | 'konu') => void;
  }
  let { onKapat, onSec }: Ozellikler = $props();
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') onKapat(); }} />

<div
  class="perde"
  role="button"
  tabindex="-1"
  aria-label="Kapat"
  onclick={onKapat}
  onkeydown={(e) => { if (e.key === 'Enter') onKapat(); }}
></div>

<div class="panel" role="dialog" aria-modal="true" aria-label="Yeni program">
  <header>
    <h2>Yeni program</h2>
    <button class="ikon" onclick={onKapat} aria-label="Kapat">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-linecap="round" />
      </svg>
    </button>
  </header>

  <div class="kutular">
    <button class="kutu" onclick={() => onSec('elle')}>
      <span class="kutu-ikon" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M5 6h14M5 12h14M5 18h9" stroke="currentColor" stroke-width="1.6"
            stroke-linecap="round" />
        </svg>
      </span>
      <span class="kutu-baslik">Kendim oluşturayım</span>
      <span class="kutu-metin">
        İşleri tek tek sen eklersin: adı, saati, süresi, notu.
      </span>
      <ul>
        <li><strong>Haftalık:</strong> her iş haftanın seçtiğin günlerinde tekrarlar
          (her Pzt-Çar spor).</li>
        <li><strong>Sıralı:</strong> her gün listeden bir sonraki iş; araya dinlenme
          günü, aynı güne birden çok iş konabilir.</li>
      </ul>
      <span class="kutu-ne">Düzeni kafanda belli olan işler için.</span>
    </button>

    <button class="kutu" onclick={() => onSec('konu')}>
      <span class="kutu-ikon" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <rect x="3.5" y="4.5" width="17" height="16" rx="2" stroke="currentColor"
            stroke-width="1.6" />
          <path d="M3.5 9h17M8 3v3M16 3v3M7.5 13h3M13.5 13h3M7.5 16.5h3" stroke="currentColor"
            stroke-width="1.6" stroke-linecap="round" />
        </svg>
      </span>
      <span class="kutu-baslik">Konulardan oluştur</span>
      <span class="kutu-metin">
        Konuları yazarsın, program onları günlere kendisi dağıtır.
      </span>
      <ul>
        <li><code>Matematik x2</code> gibi ağırlık verilen konu daha sık gelir.</li>
        <li>Günde kaç çalışma, kaç dakika, aradaki mola ve hangi günler çalışılacağı
          seçilir.</li>
      </ul>
      <span class="kutu-ne">Sınav hazırlığı gibi, çok konuyu dengeli dağıtmak için.
        Sonuç yine düzenlenebilir bir programdır.</span>
    </button>
  </div>
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
    width: min(640px, calc(100vw - 48px));
    max-height: calc(100vh - 48px);
    overflow-y: auto;
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
  h2 { margin: 0; font-size: 15px; font-weight: 600; color: var(--kagit); }
  .ikon {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: var(--yuvarlak-dugme);
    color: var(--kagit-3);
  }
  .ikon:hover { color: var(--kagit); background: var(--murekkep-3); }

  .kutular {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--b3);
    padding: var(--b5);
  }
  @media (max-width: 560px) { .kutular { grid-template-columns: 1fr; } }

  .kutu {
    display: flex;
    flex-direction: column;
    gap: var(--b2);
    padding: var(--b4);
    border: 1px solid var(--ayrac);
    border-radius: var(--yuvarlak-panel);
    background: var(--murekkep);
    text-align: left;
    transition: border-color var(--gecis-hizli), background var(--gecis-hizli);
  }
  .kutu:hover, .kutu:focus-visible {
    border-color: var(--pirinc);
    background: var(--pirinc-sonuk);
    outline: none;
  }
  .kutu-ikon { color: var(--pirinc); }
  .kutu-baslik { font-size: 15px; font-weight: 600; color: var(--kagit); }
  .kutu-metin { font-size: 13.5px; line-height: 1.5; color: var(--kagit-2); }
  ul {
    margin: 0;
    padding-left: 16px;
    display: grid;
    gap: 4px;
    font-size: 13px;
    line-height: 1.5;
    color: var(--kagit-2);
  }
  strong { color: var(--kagit); font-weight: 500; }
  .kutu-ne {
    margin-top: auto;
    padding-top: var(--b2);
    border-top: 1px solid var(--ayrac);
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--kagit-3);
  }
  code {
    padding: 1px 4px;
    border-radius: 3px;
    background: var(--murekkep-3);
    font-family: var(--yazi-mono);
    font-size: 12px;
  }
</style>
