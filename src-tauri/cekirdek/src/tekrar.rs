//! Tekrar kurallarindan somut tarihler (olusum) uretir.
//!
//! Tasarim notu: verilen aralik her zaman kisadir (zamanlayici 60 gunluk pencere
//! kullanir), bu yuzden gun gun dolasip uyeligi test etmek yeterince hizli ve
//! akilda tutulmasi kolay. Ayin 31'i gibi bazi aylarda karsiligi olmayan gunler
//! ATLANIR (Subat'a kaydirilmaz) - iCalendar davranisi budur.

use chrono::{Datelike, Duration, NaiveDate, NaiveDateTime, NaiveTime};

use crate::model::{Etkinlik, TekrarTipi};

/// `etkinlik`in [bas, son] araligina (iki uc dahil) dusen tum olusumlarini,
/// baslangic saatleriyle birlikte sirali dondurur.
pub fn olusumlar(etkinlik: &Etkinlik, bas: NaiveDate, son: NaiveDate) -> Vec<NaiveDateTime> {
    if bas > son {
        return Vec::new();
    }

    let ilk = etkinlik.baslangic.date();
    let saat = etkinlik.baslangic.time();
    let t = &etkinlik.tekrar;

    // Tekrarsiz etkinlik: yalnizca kendi gununde gorunur.
    if !t.var_mi() {
        return if ilk >= bas && ilk <= son {
            vec![etkinlik.baslangic]
        } else {
            Vec::new()
        };
    }

    let aralik = t.aralik.max(1) as i64;
    // Etkinligin baslangicindan once tekrar uretilmez.
    let tarama_bas = bas.max(ilk);
    // Tekrar bitis tarihi varsa orada kes.
    let tarama_son = match t.bitis_tarihi {
        Some(b) => son.min(b),
        None => son,
    };

    let mut sonuc = Vec::new();
    let mut gun = tarama_bas;
    while gun <= tarama_son {
        if uyuyor_mu(t.tip, aralik, &t.gunler, ilk, gun) && !t.istisnalar.contains(&gun) {
            sonuc.push(NaiveDateTime::new(gun, saat));
        }
        gun += Duration::days(1);
    }
    sonuc
}

/// `gun`, ilk tarihten baslayan tekrar kuralina uyuyor mu?
fn uyuyor_mu(tip: TekrarTipi, aralik: i64, gunler: &[u8], ilk: NaiveDate, gun: NaiveDate) -> bool {
    match tip {
        TekrarTipi::Yok => gun == ilk,

        TekrarTipi::Gunluk => (gun - ilk).num_days() % aralik == 0,

        TekrarTipi::Haftalik => {
            // Kullanici gun secmediyse etkinligin kendi gunu kullanilir.
            let secili: Vec<u8> = if gunler.is_empty() {
                vec![hafta_gunu(ilk)]
            } else {
                gunler.to_vec()
            };
            if !secili.contains(&hafta_gunu(gun)) {
                return false;
            }
            if aralik == 1 {
                return true;
            }
            // "Her 2 haftada bir" gibi durumlarda haftalari Pazartesi'ye
            // hizalayip sayiyoruz; boylece hafta icinde secilen tum gunler
            // ayni haftaya dusuyor.
            let hafta_farki =
                (pazartesiye_hizala(gun) - pazartesiye_hizala(ilk)).num_days() / 7;
            hafta_farki % aralik == 0
        }

        TekrarTipi::Aylik => {
            if gun.day() != ilk.day() {
                return false;
            }
            let ay_farki = (gun.year() - ilk.year()) as i64 * 12
                + (gun.month() as i64 - ilk.month() as i64);
            ay_farki >= 0 && ay_farki % aralik == 0
        }

        TekrarTipi::Yillik => {
            if gun.day() != ilk.day() || gun.month() != ilk.month() {
                return false;
            }
            let yil_farki = (gun.year() - ilk.year()) as i64;
            yil_farki >= 0 && yil_farki % aralik == 0
        }
    }
}

/// 1 = Pazartesi ... 7 = Pazar (kullanicinin JSON'da gorecegi numaralandirma).
fn hafta_gunu(d: NaiveDate) -> u8 {
    d.weekday().number_from_monday() as u8
}

fn pazartesiye_hizala(d: NaiveDate) -> NaiveDate {
    d - Duration::days(d.weekday().num_days_from_monday() as i64)
}

/// Verilen andan sonraki ilk olusum. `ileri_gun` kadar ileri bakar; yillik
/// tekrarlarin da yakalanmasi icin cagrilarda 400 gun kullaniyoruz.
pub fn sonraki_olusum(
    etkinlik: &Etkinlik,
    andan_sonra: NaiveDateTime,
    ileri_gun: i64,
) -> Option<NaiveDateTime> {
    let bas = andan_sonra.date();
    let son = bas + Duration::days(ileri_gun);
    olusumlar(etkinlik, bas, son)
        .into_iter()
        .find(|o| *o > andan_sonra)
}

/// Gun basi (00:00) yardimcisi - takvim gorunumlerinde sik lazim oluyor.
pub fn gun_basi(d: NaiveDate) -> NaiveDateTime {
    NaiveDateTime::new(d, NaiveTime::MIN)
}

// ------------------------------------------------------------------ testler

#[cfg(test)]
mod testler {
    use super::*;
    use crate::model::Tekrar;

    fn tarih(s: &str) -> NaiveDate {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
    }

    fn zaman(s: &str) -> NaiveDateTime {
        NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M").unwrap()
    }

    fn gunleri(o: &[NaiveDateTime]) -> Vec<String> {
        o.iter().map(|d| d.format("%Y-%m-%d").to_string()).collect()
    }

    fn etkinlik(baslangic: &str, tekrar: Tekrar) -> Etkinlik {
        Etkinlik {
            id: "t1".into(),
            baslik: "test".into(),
            not: String::new(),
            kategori: "genel".into(),
            baslangic: zaman(baslangic),
            bitis: None,
            tum_gun: false,
            tekrar,
            hatirlatmalar: vec![],
            renk: None,
            tamamlananlar: vec![],
            program: None,
            olusturuldu: None,
            guncellendi: None,
        }
    }

    /// Arayuz kopyasi (src/lib/tarih.ts) ile buradaki motorun ayni vektor
    /// dosyasindan gecmesi gerekiyor. Dosyanin TS yarisi:
    /// src/lib/tarih.test.ts icindeki ayni adli test. Ikisi birden gecmeden
    /// iki kopyanin sessizce ayrilmadigindan emin olamayiz.
    #[test]
    fn ortak_vektorler_uyusuyor() {
        #[derive(serde::Deserialize)]
        struct Dosya {
            vakalar: Vec<Vaka>,
        }
        #[derive(serde::Deserialize)]
        struct Vaka {
            ad: String,
            baslangic: String,
            #[serde(default)]
            tekrar: Tekrar,
            bas: String,
            son: String,
            beklenen: Vec<String>,
        }

        let ham = include_str!("../../../src/lib/tekrar-vektorleri.json");
        let dosya: Dosya = serde_json::from_str(ham).expect("vektor dosyasi okunmali");
        assert!(!dosya.vakalar.is_empty(), "vektor dosyasi bos");

        for v in dosya.vakalar {
            let e = etkinlik(&v.baslangic, v.tekrar);
            let cikan: Vec<String> = olusumlar(&e, tarih(&v.bas), tarih(&v.son))
                .iter()
                .map(|o| o.format("%Y-%m-%dT%H:%M:%S").to_string())
                .collect();
            assert_eq!(cikan, v.beklenen, "vaka: {}", v.ad);
        }
    }

    #[test]
    fn tekrarsiz_sadece_kendi_gununde() {
        let e = etkinlik("2026-09-15 09:00", Tekrar::default());
        assert_eq!(
            olusumlar(&e, tarih("2026-09-01"), tarih("2026-09-30")),
            vec![zaman("2026-09-15 09:00")]
        );
        assert!(olusumlar(&e, tarih("2026-10-01"), tarih("2026-10-31")).is_empty());
    }

    #[test]
    fn gunluk_her_gun() {
        let e = etkinlik(
            "2026-09-01 08:00",
            Tekrar { tip: TekrarTipi::Gunluk, ..Default::default() },
        );
        let o = olusumlar(&e, tarih("2026-09-01"), tarih("2026-09-05"));
        assert_eq!(o.len(), 5);
        assert_eq!(o[0], zaman("2026-09-01 08:00"));
        assert_eq!(o[4], zaman("2026-09-05 08:00"));
    }

    #[test]
    fn gunluk_iki_gunde_bir() {
        let e = etkinlik(
            "2026-09-01 08:00",
            Tekrar { tip: TekrarTipi::Gunluk, aralik: 2, ..Default::default() },
        );
        let o = olusumlar(&e, tarih("2026-09-01"), tarih("2026-09-06"));
        assert_eq!(
            gunleri(&o),
            vec!["2026-09-01", "2026-09-03", "2026-09-05"]
        );
    }

    #[test]
    fn haftalik_secili_gunler() {
        // 2026-09-01 Sali. Pzt(1) / Car(3) / Cum(5) secili.
        let e = etkinlik(
            "2026-09-01 09:00",
            Tekrar { tip: TekrarTipi::Haftalik, gunler: vec![1, 3, 5], ..Default::default() },
        );
        let o = olusumlar(&e, tarih("2026-09-01"), tarih("2026-09-13"));
        assert_eq!(
            gunleri(&o),
            vec!["2026-09-02", "2026-09-04", "2026-09-07", "2026-09-09", "2026-09-11"]
        );
    }

    #[test]
    fn haftalik_iki_haftada_bir_ayni_haftayi_gruplar() {
        // 2026-09-02 Carsamba. Car + Cum, iki haftada bir.
        let e = etkinlik(
            "2026-09-02 09:00",
            Tekrar {
                tip: TekrarTipi::Haftalik,
                aralik: 2,
                gunler: vec![3, 5],
                ..Default::default()
            },
        );
        let o = olusumlar(&e, tarih("2026-09-02"), tarih("2026-09-20"));
        // 1. hafta: 2 ve 4 Eylul. Arada bir hafta atlanir. 3. hafta: 16 ve 18 Eylul.
        assert_eq!(
            gunleri(&o),
            vec!["2026-09-02", "2026-09-04", "2026-09-16", "2026-09-18"]
        );
    }

    #[test]
    fn aylik_karsiligi_olmayan_gunu_atlar() {
        // Ayin 31'i: Subat, Nisan, Haziran atlanir.
        let e = etkinlik(
            "2026-01-31 10:00",
            Tekrar { tip: TekrarTipi::Aylik, ..Default::default() },
        );
        let o = olusumlar(&e, tarih("2026-01-01"), tarih("2026-06-30"));
        assert_eq!(gunleri(&o), vec!["2026-01-31", "2026-03-31", "2026-05-31"]);
    }

    #[test]
    fn yillik() {
        let e = etkinlik(
            "2026-04-23 10:00",
            Tekrar { tip: TekrarTipi::Yillik, ..Default::default() },
        );
        let o = olusumlar(&e, tarih("2026-01-01"), tarih("2028-12-31"));
        assert_eq!(gunleri(&o), vec!["2026-04-23", "2027-04-23", "2028-04-23"]);
    }

    #[test]
    fn istisna_gunu_atlanir() {
        let e = etkinlik(
            "2026-09-01 08:00",
            Tekrar {
                tip: TekrarTipi::Gunluk,
                istisnalar: vec![tarih("2026-09-03")],
                ..Default::default()
            },
        );
        let o = olusumlar(&e, tarih("2026-09-01"), tarih("2026-09-04"));
        assert_eq!(o.len(), 3);
        assert!(!o.contains(&zaman("2026-09-03 08:00")));
    }

    #[test]
    fn bitis_tarihinden_sonra_uretmez() {
        let e = etkinlik(
            "2026-09-01 08:00",
            Tekrar {
                tip: TekrarTipi::Gunluk,
                bitis_tarihi: Some(tarih("2026-09-03")),
                ..Default::default()
            },
        );
        assert_eq!(olusumlar(&e, tarih("2026-09-01"), tarih("2026-09-10")).len(), 3);
    }

    #[test]
    fn baslangictan_once_uretmez() {
        let e = etkinlik(
            "2026-09-10 08:00",
            Tekrar { tip: TekrarTipi::Gunluk, ..Default::default() },
        );
        let o = olusumlar(&e, tarih("2026-09-01"), tarih("2026-09-12"));
        assert_eq!(o.len(), 3);
        assert_eq!(o[0], zaman("2026-09-10 08:00"));
    }

    #[test]
    fn sonraki_olusum_gecmisi_atlar() {
        let e = etkinlik(
            "2026-09-01 08:00",
            Tekrar { tip: TekrarTipi::Gunluk, ..Default::default() },
        );
        assert_eq!(
            sonraki_olusum(&e, zaman("2026-09-05 09:00"), 400),
            Some(zaman("2026-09-06 08:00"))
        );
    }
}
