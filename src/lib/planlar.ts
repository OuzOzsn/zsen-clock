/**
 * Sihirbazla uretilmis calisma planlarini etkinlik listesinden geri cikarir.
 *
 * Plan diye ayri bir kayit tutulmuyor; uretilen etkinliklerin id'si
 * `plan-<damga>-<sira>` bicimde oldugu icin damga zaten plani isaretliyor
 * (bkz. planUret.ts). Boylece eski surumle uretilmis planlar da -- dosyaya
 * hicbir sey eklemeden -- topluca silinebiliyor.
 */

import type { Etkinlik } from './tipler.ts';
import { isoCoz } from './ipc.ts';

export interface PlanOzeti {
  /** `plan-<damga>` - listede anahtar olarak kullanilir. */
  damga: string;
  /** Plan adi: uretilirken kategori olarak yazilan ad. */
  ad: string;
  idler: string[];
  /** Ilk ve son seansin gunu. */
  bas: Date;
  son: Date;
  /** Kac seans tamamlanmis - silmeden once "emek harcamis miyim" sorusu. */
  tamamlanan: number;
}

const DESEN = /^plan-([a-z0-9]+)-\d+$/;

export function planlariCikar(etkinlikler: Etkinlik[]): PlanOzeti[] {
  const gruplar = new Map<string, Etkinlik[]>();

  for (const e of etkinlikler) {
    const m = DESEN.exec(e.id);
    if (!m) continue;
    const damga = m[1]!;
    const grup = gruplar.get(damga);
    if (grup) grup.push(e);
    else gruplar.set(damga, [e]);
  }

  const ozetler: PlanOzeti[] = [];
  for (const [damga, liste] of gruplar) {
    const zamanlar = liste.map((e) => isoCoz(e.baslangic).getTime());
    ozetler.push({
      damga,
      ad: liste[0]!.kategori || 'Plan',
      idler: liste.map((e) => e.id),
      bas: new Date(Math.min(...zamanlar)),
      son: new Date(Math.max(...zamanlar)),
      tamamlanan: liste.filter((e) => e.tamamlananlar.length > 0).length,
    });
  }

  // En yeni plan ustte: kullanici genelde son urettigiyle ugrasiyor.
  return ozetler.sort((a, b) => b.bas.getTime() - a.bas.getTime());
}
