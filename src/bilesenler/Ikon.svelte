<script lang="ts">
  /**
   * Kategori ikonu. Ad taninmiyorsa hicbir sey cizmez - eski veri dosyalarinda
   * olmayan bir ikon adi kalmis olabilir, bu yuzden kirik kare gostermiyoruz.
   */
  import { IKONLAR } from '../lib/ikonlar.ts';

  interface Ozellikler {
    ad: string | null | undefined;
    boyut?: number;
    /** Cizgi kalinligi; kucuk boyutlarda biraz kalin daha okunur duruyor. */
    kalinlik?: number;
  }
  let { ad, boyut = 14, kalinlik = 1.6 }: Ozellikler = $props();

  const tanim = $derived(ad ? IKONLAR[ad] : undefined);
</script>

{#if tanim}
  <svg
    width={boyut}
    height={boyut}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width={kalinlik}
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html tanim.govde}
  </svg>
{/if}
