//! Hangi hatirlatmanin ne zaman calacagina karar veren saf mantik.
//!
//! Buradaki fonksiyonlar zamani disaridan parametre olarak alir, sistem saatine
//! kendileri bakmaz. Boylece "PC uykudayken gecen 6 saat" gibi senaryolari
//! testte birebir kurabiliyoruz.
//!
//! Calisma bicimi: zamanlayici duzenli araliklarla "son kontrolden simdiye"
//! penceresini sorar. Pencere normalde 20 saniyedir; PC uyandiginda veya
//! kapanip acildiginda saatler suruyor olabilir - ayni kod ikisini de kaldirir.

use chrono::{Duration, NaiveDateTime};
use serde::{Deserialize, Serialize};

use crate::depo::Durum;
use crate::model::EtkinlikDosyasi;
use crate::tekrar;

/// Calmasi gereken tek bir hatirlatma. Alarm penceresine oldugu gibi
/// gonderildigi icin serilestirilebilir olmak zorunda.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Tetiklenen {
    pub etkinlik_id: String,
    pub baslik: String,
    pub not: String,
    pub kategori: String,
    /// Hatirlatmanin ait oldugu tekrar orneginin baslangic ani.
    pub olusum: NaiveDateTime,
    /// Bu ornegin bitis ani (etkinligin suresi varsa). Alarm penceresi
    /// "ne kadar surecek" bilgisini bundan gosteriyor.
    pub bitis: Option<NaiveDateTime>,
    /// Hatirlatmanin calmasi gereken an (olusum - dakika_once).
    pub calma_zamani: NaiveDateTime,
    pub dakika_once: i64,
    pub ses: Option<String>,
    /// PC kapali/uykudayken gectiyse true - arayuz bunu farkli gosterir.
    pub kacirilmis: bool,
}

impl Tetiklenen {
    /// durum.json'da tutulan benzersiz anahtar.
    pub fn anahtar(&self) -> String {
        anahtar_uret(&self.etkinlik_id, self.olusum, self.dakika_once)
    }
}

pub fn anahtar_uret(etkinlik_id: &str, olusum: NaiveDateTime, dakika_once: i64) -> String {
    format!(
        "{etkinlik_id}@{}#{dakika_once}",
        olusum.format("%Y-%m-%dT%H:%M:%S")
    )
}

/// Tekrar ornegi icin bitis ani: etkinligin suresi ornege tasinir.
fn olusum_bitisi(e: &crate::model::Etkinlik, olusum: NaiveDateTime) -> Option<NaiveDateTime> {
    let sure = e.sure_dakika();
    (sure > 0).then(|| olusum + Duration::minutes(sure))
}

/// Bir hatirlatmanin "kacirilmis" sayilmasi icin gereken gecikme.
/// Bunun altindaki gecikmeler normal tick payidir, kullaniciya farkli
/// gosterilmez.
const KACIRILMIS_ESIGI_DAKIKA: i64 = 2;

/// (`son_kontrol`, `simdi`] araliginda calmasi gereken hatirlatmalar.
///
/// - Daha once caldigi `durum`da kayitli olanlar atlanir.
/// - Tamamlanmis olarak isaretlenen tekrar ornekleri atlanir.
/// - `tolerans_saat`ten daha eski kalmis hatirlatmalar hic gosterilmez
///   (PC bir hafta kapali kaldiysa 200 alarm acilmasin diye).
pub fn tetiklenecekler(
    dosya: &EtkinlikDosyasi,
    durum: &Durum,
    son_kontrol: NaiveDateTime,
    simdi: NaiveDateTime,
    tolerans_saat: i64,
) -> Vec<Tetiklenen> {
    if simdi <= son_kontrol {
        return Vec::new();
    }

    // Cok eski hatirlatmalari ele: pencerenin basini tolerans ile sinirla.
    let en_erken = simdi - Duration::hours(tolerans_saat.max(0));
    let pencere_bas = son_kontrol.max(en_erken);

    let mut sonuc = Vec::new();

    for e in &dosya.etkinlikler {
        for h in &e.hatirlatmalar {
            // Hatirlatma `olusum - dakika_once` aninda calar. Calma zamani
            // pencereye dusen olusumlari bulmak icin pencereyi kaydiriyoruz.
            let kaydirma = Duration::minutes(h.dakika_once);
            let olusum_bas = (pencere_bas + kaydirma).date();
            let olusum_son = (simdi + kaydirma).date();

            for olusum in tekrar::olusumlar(e, olusum_bas, olusum_son) {
                let calma = h.calma_zamani(olusum);
                if calma <= pencere_bas || calma > simdi {
                    continue;
                }
                if e.tamamlandi_mi(olusum) {
                    continue;
                }
                let anahtar = anahtar_uret(&e.id, olusum, h.dakika_once);
                if durum.caldi_mi(&anahtar) {
                    continue;
                }

                sonuc.push(Tetiklenen {
                    etkinlik_id: e.id.clone(),
                    baslik: e.baslik.clone(),
                    not: e.not.clone(),
                    kategori: e.kategori.clone(),
                    olusum,
                    bitis: olusum_bitisi(e, olusum),
                    calma_zamani: calma,
                    dakika_once: h.dakika_once,
                    ses: h.ses.clone(),
                    kacirilmis: (simdi - calma).num_minutes() > KACIRILMIS_ESIGI_DAKIKA,
                });
            }
        }
    }

    sonuc.sort_by_key(|t| t.calma_zamani);
    sonuc
}

/// Sirada calacak ilk hatirlatma - tepsi ipucu ve widget geri sayimi icin.
/// Tamamlanmis ve calmis olanlari atlar.
pub fn sonraki_hatirlatma(
    dosya: &EtkinlikDosyasi,
    durum: &Durum,
    simdi: NaiveDateTime,
) -> Option<Tetiklenen> {
    let mut en_yakin: Option<Tetiklenen> = None;

    for e in &dosya.etkinlikler {
        for h in &e.hatirlatmalar {
            // 400 gun ileriye bak: yillik tekrarlar da yakalansin.
            let kaydirma = Duration::minutes(h.dakika_once);
            let bas = (simdi + kaydirma).date();
            let son = bas + Duration::days(400);

            for olusum in tekrar::olusumlar(e, bas, son) {
                let calma = h.calma_zamani(olusum);
                if calma <= simdi || e.tamamlandi_mi(olusum) {
                    continue;
                }
                if durum.caldi_mi(&anahtar_uret(&e.id, olusum, h.dakika_once)) {
                    continue;
                }
                let aday = Tetiklenen {
                    etkinlik_id: e.id.clone(),
                    baslik: e.baslik.clone(),
                    not: e.not.clone(),
                    kategori: e.kategori.clone(),
                    olusum,
                    bitis: olusum_bitisi(e, olusum),
                    calma_zamani: calma,
                    dakika_once: h.dakika_once,
                    ses: h.ses.clone(),
                    kacirilmis: false,
                };
                // Her hatirlatma icin en yakin olusum yeter, sonrakilere bakma.
                if en_yakin.as_ref().is_none_or(|m| aday.calma_zamani < m.calma_zamani) {
                    en_yakin = Some(aday);
                }
                break;
            }
        }
    }

    en_yakin
}

/// Sirada baslayacak ilk ETKINLIK (hatirlatmasi olsun olmasin).
/// Widget'in "sirada ne var" satiri icin.
pub fn sonraki_etkinlik(
    dosya: &EtkinlikDosyasi,
    simdi: NaiveDateTime,
) -> Option<(String, String, NaiveDateTime)> {
    dosya
        .etkinlikler
        .iter()
        .filter_map(|e| {
            tekrar::sonraki_olusum(e, simdi, 400)
                .filter(|o| !e.tamamlandi_mi(*o))
                .map(|o| (e.id.clone(), e.baslik.clone(), o))
        })
        .min_by_key(|(_, _, o)| *o)
}

// ------------------------------------------------------------------ testler

#[cfg(test)]
mod testler {
    use super::*;
    use crate::model::{Etkinlik, Hatirlatma, Tekrar, TekrarTipi};

    fn zaman(s: &str) -> NaiveDateTime {
        NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M").unwrap()
    }

    fn etkinlik(id: &str, baslangic: &str, tekrar: Tekrar, hatirlatmalar: Vec<i64>) -> Etkinlik {
        Etkinlik {
            id: id.into(),
            baslik: format!("etkinlik {id}"),
            not: String::new(),
            kategori: "genel".into(),
            baslangic: zaman(baslangic),
            bitis: None,
            tum_gun: false,
            tekrar,
            hatirlatmalar: hatirlatmalar
                .into_iter()
                .map(|d| Hatirlatma { dakika_once: d, ses: None })
                .collect(),
            renk: None,
            tamamlananlar: vec![],
            program: None,
            olusturuldu: None,
            guncellendi: None,
        }
    }

    fn dosya(etkinlikler: Vec<Etkinlik>) -> EtkinlikDosyasi {
        EtkinlikDosyasi { etkinlikler, ..Default::default() }
    }

    /// Programdan uretilen etkinlik gercekten caliyor mu?
    ///
    /// Program ozelligi somut etkinlik uretmiyor, haftalik tekrar kurali
    /// birakiyor. Zamanlayicinin programdan haberi yok - dolayisiyla bu test
    /// "program alarmi calar" iddiasinin tek dogrulamasi.
    #[test]
    fn program_etkinligi_gununde_calar() {
        use crate::model::ProgramBagi;

        // "Her Pzt/Car/Cum 20:30, 10 dakika once hatirlat" - kullanicinin
        // kurdugu programin uretecegi kaydin aynisi.
        let mut e = etkinlik(
            "prog-1",
            "2026-09-21 20:30",
            Tekrar {
                tip: TekrarTipi::Haftalik,
                aralik: 1,
                gunler: vec![1, 3, 5],
                bitis_tarihi: None,
                istisnalar: vec![],
            },
            vec![10, 0],
        );
        e.program = Some(ProgramBagi {
            program_id: "p1".into(),
            oge_id: "o1".into(),
            gun: None,
        });
        let d = dosya(vec![e]);

        // 23 Eylul Carsamba, 20:20 -> "10 dakika once" calmali.
        let t = tetiklenecekler(
            &d,
            &Durum::default(),
            zaman("2026-09-23 20:19"),
            zaman("2026-09-23 20:20"),
            12,
        );
        assert_eq!(t.len(), 1, "10 dakika once calmaliydi");
        assert_eq!(t[0].dakika_once, 10);
        assert_eq!(t[0].olusum, zaman("2026-09-23 20:30"));
        assert!(!t[0].kacirilmis);

        // 20:30 -> tam saatinde olan ikinci hatirlatma.
        let t = tetiklenecekler(
            &d,
            &Durum::default(),
            zaman("2026-09-23 20:29"),
            zaman("2026-09-23 20:30"),
            12,
        );
        assert_eq!(t.len(), 1);
        assert_eq!(t[0].dakika_once, 0);

        // 22 Eylul Sali programda yok - hicbir sey calmamali.
        let t = tetiklenecekler(
            &d,
            &Durum::default(),
            zaman("2026-09-22 20:19"),
            zaman("2026-09-22 20:31"),
            12,
        );
        assert!(t.is_empty(), "salı programda yok, calmamaliydi");
    }

    /// Bir gunu elle degistirince (olusum_ayir) o gun seriden dusuyor ve
    /// kopya caliyor: ayni gunde iki alarm olmamali.
    #[test]
    fn ayrilan_gun_bir_kez_calar() {
        use crate::model::ProgramBagi;

        let mut seri = etkinlik(
            "prog-1",
            "2026-09-21 20:30",
            Tekrar {
                tip: TekrarTipi::Haftalik,
                aralik: 1,
                gunler: vec![1, 3, 5],
                bitis_tarihi: None,
                istisnalar: vec![chrono::NaiveDate::from_ymd_opt(2026, 9, 23).unwrap()],
            },
            vec![0],
        );
        seri.program = Some(ProgramBagi {
            program_id: "p1".into(),
            oge_id: "o1".into(),
            gun: None,
        });

        // O gune ozel kopya: saat 22:00'ye alinmis.
        let mut kopya = etkinlik("kopya-1", "2026-09-23 22:00", Tekrar::default(), vec![0]);
        kopya.program = Some(ProgramBagi {
            program_id: "p1".into(),
            oge_id: "o1".into(),
            gun: chrono::NaiveDate::from_ymd_opt(2026, 9, 23),
        });

        let d = dosya(vec![seri, kopya]);

        // Serinin eski saatinde hicbir sey calmamali.
        let t = tetiklenecekler(
            &d,
            &Durum::default(),
            zaman("2026-09-23 20:29"),
            zaman("2026-09-23 20:31"),
            12,
        );
        assert!(t.is_empty(), "ayrilan gun eski saatinde calmamali");

        // Yeni saatinde bir kez.
        let t = tetiklenecekler(
            &d,
            &Durum::default(),
            zaman("2026-09-23 21:59"),
            zaman("2026-09-23 22:00"),
            12,
        );
        assert_eq!(t.len(), 1);
        assert_eq!(t[0].etkinlik_id, "kopya-1");
    }

    #[test]
    fn tam_saatinde_calar() {
        let d = dosya(vec![etkinlik("a", "2026-09-11 14:00", Tekrar::default(), vec![0])]);
        let t = tetiklenecekler(&d, &Durum::default(), zaman("2026-09-11 13:59"), zaman("2026-09-11 14:00"), 12);
        assert_eq!(t.len(), 1);
        assert_eq!(t[0].calma_zamani, zaman("2026-09-11 14:00"));
        assert!(!t[0].kacirilmis);
    }

    #[test]
    fn zamani_gelmeden_calmaz() {
        let d = dosya(vec![etkinlik("a", "2026-09-11 14:00", Tekrar::default(), vec![0])]);
        let t = tetiklenecekler(&d, &Durum::default(), zaman("2026-09-11 13:00"), zaman("2026-09-11 13:59"), 12);
        assert!(t.is_empty());
    }

    #[test]
    fn on_hatirlatma_dogru_anda_calar() {
        // 14:00 etkinligi, 10 dk once -> 13:50'de calmali
        let d = dosya(vec![etkinlik("a", "2026-09-11 14:00", Tekrar::default(), vec![10])]);
        let erken = tetiklenecekler(&d, &Durum::default(), zaman("2026-09-11 13:48"), zaman("2026-09-11 13:49"), 12);
        assert!(erken.is_empty());
        let t = tetiklenecekler(&d, &Durum::default(), zaman("2026-09-11 13:49"), zaman("2026-09-11 13:50"), 12);
        assert_eq!(t.len(), 1);
        assert_eq!(t[0].dakika_once, 10);
    }

    #[test]
    fn ayni_etkinligin_iki_hatirlatmasi_ayri_calar() {
        let d = dosya(vec![etkinlik("a", "2026-09-11 14:00", Tekrar::default(), vec![10, 0])]);
        // Genis pencere: ikisi de icine dusuyor
        let t = tetiklenecekler(&d, &Durum::default(), zaman("2026-09-11 13:00"), zaman("2026-09-11 14:00"), 12);
        assert_eq!(t.len(), 2);
        // Zaman sirasinda: once 13:50 (10 dk once), sonra 14:00
        assert_eq!(t[0].calma_zamani, zaman("2026-09-11 13:50"));
        assert_eq!(t[1].calma_zamani, zaman("2026-09-11 14:00"));
    }

    #[test]
    fn calmis_olan_tekrar_calmaz() {
        let d = dosya(vec![etkinlik("a", "2026-09-11 14:00", Tekrar::default(), vec![0])]);
        let mut durum = Durum::default();
        durum.caldi_isaretle(anahtar_uret("a", zaman("2026-09-11 14:00"), 0));
        let t = tetiklenecekler(&d, &durum, zaman("2026-09-11 13:00"), zaman("2026-09-11 14:00"), 12);
        assert!(t.is_empty());
    }

    #[test]
    fn tamamlanmis_olusum_calmaz() {
        let mut e = etkinlik("a", "2026-09-11 14:00", Tekrar { tip: TekrarTipi::Gunluk, ..Default::default() }, vec![0]);
        e.tamamlananlar.push(zaman("2026-09-11 14:00"));
        let d = dosya(vec![e]);
        let t = tetiklenecekler(&d, &Durum::default(), zaman("2026-09-11 13:00"), zaman("2026-09-11 14:00"), 12);
        assert!(t.is_empty());
        // Ertesi gunun ornegi hala calmali
        let yarin = tetiklenecekler(&d, &Durum::default(), zaman("2026-09-12 13:00"), zaman("2026-09-12 14:00"), 12);
        assert_eq!(yarin.len(), 1);
    }

    #[test]
    fn uykudan_uyaninca_gecen_hatirlatmalar_kacirilmis_gelir() {
        // PC 08:00'de uyudu, 15:00'te uyandi. Arada 3 gunluk alarm vardi.
        let d = dosya(vec![etkinlik(
            "a",
            "2026-09-11 09:00",
            Tekrar { tip: TekrarTipi::Gunluk, ..Default::default() },
            vec![0],
        )]);
        let t = tetiklenecekler(&d, &Durum::default(), zaman("2026-09-11 08:00"), zaman("2026-09-11 15:00"), 12);
        assert_eq!(t.len(), 1);
        assert!(t[0].kacirilmis);
        assert_eq!(t[0].calma_zamani, zaman("2026-09-11 09:00"));
    }

    #[test]
    fn tolerans_disinda_kalan_cok_eski_alarm_gelmez() {
        // PC 5 gun kapali kaldi, tolerans 12 saat.
        let d = dosya(vec![etkinlik(
            "a",
            "2026-09-06 09:00",
            Tekrar { tip: TekrarTipi::Gunluk, ..Default::default() },
            vec![0],
        )]);
        let t = tetiklenecekler(&d, &Durum::default(), zaman("2026-09-06 08:00"), zaman("2026-09-11 10:00"), 12);
        // Yalnizca son 12 saatteki tek olusum (11 Eylul 09:00) gelmeli
        assert_eq!(t.len(), 1);
        assert_eq!(t[0].calma_zamani, zaman("2026-09-11 09:00"));
    }

    #[test]
    fn hatirlatmasiz_etkinlik_hic_calmaz() {
        let d = dosya(vec![etkinlik("a", "2026-09-11 14:00", Tekrar::default(), vec![])]);
        let t = tetiklenecekler(&d, &Durum::default(), zaman("2026-09-11 13:00"), zaman("2026-09-11 15:00"), 12);
        assert!(t.is_empty());
    }

    #[test]
    fn gecmise_giden_pencere_bos_doner() {
        let d = dosya(vec![etkinlik("a", "2026-09-11 14:00", Tekrar::default(), vec![0])]);
        let t = tetiklenecekler(&d, &Durum::default(), zaman("2026-09-11 15:00"), zaman("2026-09-11 14:00"), 12);
        assert!(t.is_empty());
    }

    #[test]
    fn sonraki_hatirlatma_en_yakini_secer() {
        let d = dosya(vec![
            etkinlik("a", "2026-09-11 18:00", Tekrar::default(), vec![0]),
            etkinlik("b", "2026-09-11 16:00", Tekrar::default(), vec![0]),
            etkinlik("c", "2026-09-12 09:00", Tekrar::default(), vec![0]),
        ]);
        let s = sonraki_hatirlatma(&d, &Durum::default(), zaman("2026-09-11 10:00")).unwrap();
        assert_eq!(s.etkinlik_id, "b");
        assert_eq!(s.calma_zamani, zaman("2026-09-11 16:00"));
    }

    #[test]
    fn sonraki_hatirlatma_on_bildirimi_de_dikkate_alir() {
        // 18:00 etkinligi 30 dk onceden hatirlatiliyor -> 17:30 daha yakin
        let d = dosya(vec![
            etkinlik("a", "2026-09-11 18:00", Tekrar::default(), vec![30]),
            etkinlik("b", "2026-09-11 17:45", Tekrar::default(), vec![0]),
        ]);
        let s = sonraki_hatirlatma(&d, &Durum::default(), zaman("2026-09-11 10:00")).unwrap();
        assert_eq!(s.etkinlik_id, "a");
        assert_eq!(s.calma_zamani, zaman("2026-09-11 17:30"));
    }

    #[test]
    fn sonraki_hatirlatma_yoksa_none() {
        let d = dosya(vec![etkinlik("a", "2026-09-01 14:00", Tekrar::default(), vec![0])]);
        assert!(sonraki_hatirlatma(&d, &Durum::default(), zaman("2026-09-11 10:00")).is_none());
    }

    #[test]
    fn sonraki_etkinlik_hatirlatmasiz_da_bulur() {
        let d = dosya(vec![etkinlik("a", "2026-09-11 16:00", Tekrar::default(), vec![])]);
        let (id, _, o) = sonraki_etkinlik(&d, zaman("2026-09-11 10:00")).unwrap();
        assert_eq!(id, "a");
        assert_eq!(o, zaman("2026-09-11 16:00"));
    }
}
