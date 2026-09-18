//! Kullanici ayarlari - data/ayarlar.json.
//!
//! Her alanin `#[serde(default)]` karsiligi var; yeni surumde eklenen bir ayar
//! eski dosyayi bozmaz, varsayilaniyla gelir.

use chrono::NaiveTime;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Ayarlar {
    // --- Genel ---
    /// Windows acilisinda uygulamayi baslat.
    pub acilista_baslat: bool,
    /// Uygulama acildiginda yalnizca tepsi simgesi gorunsun.
    pub simge_durumunda_basla: bool,
    /// Masaustunde kisayol bulunsun.
    pub masaustu_kisayolu: bool,
    /// Ilk calistirmadaki karsilama ekrani gosterildi mi?
    /// false ise uygulama acilista "kisayol olusturayim mi" diye soruyor.
    pub ilk_kurulum_yapildi: bool,
    /// "koyu" | "acik" | "sistem"
    pub tema: String,
    pub vurgu_rengi: String,
    /// 1 = Pazartesi ... 7 = Pazar
    pub haftanin_ilk_gunu: u8,
    /// false ise 12 saatlik (OO/OS) gosterim.
    pub saat24: bool,

    // --- Varsayilan etkinlik degerleri ---
    pub varsayilan_sure_dakika: i64,
    pub varsayilan_hatirlatma_dakika: i64,
    pub varsayilan_ses: String,

    // --- Alarm davranisi ---
    pub ses_seviyesi: f32,
    /// Sesin kac kez tekrarlanacagi.
    pub ses_tekrari: u32,
    /// Alarm penceresi kac saniye sonra kendiliginden kapansin. 0 = kapanmasin.
    pub otomatik_kapanma_saniye: u32,
    pub windows_bildirimi: bool,
    /// Erteleme dugmesinin varsayilan degeri (dakika).
    pub varsayilan_erteleme_dakika: i64,
    /// PC kapaliyken kacan hatirlatmalar kac saate kadar geriye donuk gosterilsin.
    pub kacan_tolerans_saat: i64,

    // --- Rahatsiz etmeyin ---
    /// Tam ekran bir oyun/sunum varken alarm penceresi odagi calmasin ve
    /// ustte durmasin. Alarm yine acilir ve calar (bkz. src/odak.rs).
    pub oyunda_araya_girme: bool,

    pub rahatsiz_etme_acik: bool,
    pub rahatsiz_etme_bas: String,
    pub rahatsiz_etme_son: String,

    // --- Widget ---
    pub widget_gorunur: bool,
    pub widget_ustte: bool,
    /// 0.2 - 1.0
    pub widget_saydamlik: f32,
    /// Fare uzerine gelince saydamlas (altindakini gormek icin).
    pub widget_hoverda_saydamlas: bool,
    /// "kompakt" | "normal" | "genis"
    pub widget_boyut: String,
    pub widget_x: Option<f64>,
    pub widget_y: Option<f64>,
    pub widget_genislik: Option<f64>,
    pub widget_yukseklik: Option<f64>,
}

impl Default for Ayarlar {
    fn default() -> Self {
        Self {
            acilista_baslat: false,
            simge_durumunda_basla: false,
            masaustu_kisayolu: false,
            ilk_kurulum_yapildi: false,
            tema: "koyu".into(),
            vurgu_rengi: "#c9a227".into(),
            haftanin_ilk_gunu: 1,
            saat24: true,

            varsayilan_sure_dakika: 60,
            varsayilan_hatirlatma_dakika: 10,
            // Bos birakilirsa alarm penceresi acilir ama hicbir ses cikmaz.
            // Uretilen zil dosyasini gosteriyoruz (bkz. ses_uret.rs).
            varsayilan_ses: crate::ses_uret::VARSAYILAN_SES.to_string(),

            ses_seviyesi: 0.8,
            ses_tekrari: 3,
            otomatik_kapanma_saniye: 0,
            windows_bildirimi: true,
            varsayilan_erteleme_dakika: 10,
            kacan_tolerans_saat: 12,

            oyunda_araya_girme: true,
            rahatsiz_etme_acik: false,
            rahatsiz_etme_bas: "23:00".into(),
            rahatsiz_etme_son: "08:00".into(),

            widget_gorunur: true,
            widget_ustte: true,
            widget_saydamlik: 1.0,
            widget_hoverda_saydamlas: false,
            widget_boyut: "normal".into(),
            widget_x: None,
            widget_y: None,
            widget_genislik: None,
            widget_yukseklik: None,
        }
    }
}

impl Ayarlar {
    /// Verilen saat rahatsiz etmeyin araligina giriyor mu?
    /// Aralik gece yarisini asabilir (orn. 23:00 - 08:00).
    pub fn sessiz_saatte_mi(&self, saat: NaiveTime) -> bool {
        if !self.rahatsiz_etme_acik {
            return false;
        }
        let (Some(bas), Some(son)) = (
            saat_coz(&self.rahatsiz_etme_bas),
            saat_coz(&self.rahatsiz_etme_son),
        ) else {
            return false;
        };
        if bas <= son {
            saat >= bas && saat < son
        } else {
            saat >= bas || saat < son
        }
    }
}

fn saat_coz(s: &str) -> Option<NaiveTime> {
    NaiveTime::parse_from_str(s, "%H:%M").ok()
}

#[cfg(test)]
mod testler {
    use super::*;

    fn saat(s: &str) -> NaiveTime {
        NaiveTime::parse_from_str(s, "%H:%M").unwrap()
    }

    #[test]
    fn kapaliyken_hicbir_saat_sessiz_degil() {
        let a = Ayarlar::default();
        assert!(!a.sessiz_saatte_mi(saat("03:00")));
    }

    #[test]
    fn gece_yarisini_asan_aralik() {
        let a = Ayarlar {
            rahatsiz_etme_acik: true,
            rahatsiz_etme_bas: "23:00".into(),
            rahatsiz_etme_son: "08:00".into(),
            ..Default::default()
        };
        assert!(a.sessiz_saatte_mi(saat("23:30")));
        assert!(a.sessiz_saatte_mi(saat("03:00")));
        assert!(a.sessiz_saatte_mi(saat("07:59")));
        assert!(!a.sessiz_saatte_mi(saat("08:00")));
        assert!(!a.sessiz_saatte_mi(saat("14:00")));
    }

    #[test]
    fn ayni_gun_icindeki_aralik() {
        let a = Ayarlar {
            rahatsiz_etme_acik: true,
            rahatsiz_etme_bas: "13:00".into(),
            rahatsiz_etme_son: "15:00".into(),
            ..Default::default()
        };
        assert!(a.sessiz_saatte_mi(saat("14:00")));
        assert!(!a.sessiz_saatte_mi(saat("12:59")));
        assert!(!a.sessiz_saatte_mi(saat("15:00")));
    }
}
