//! Program: kenarda duran, istenen tarihte baslatilan haftalik sablon.
//!
//! Bir programin ogeleri haftanin gunlerine bagli sabit islerdir ("her pzt
//! 09:00 matematik, su notlarla"). Program baslatilana kadar takvimde hicbir
//! izi yoktur - `kosu` alani None oldugu surece uykudadir.
//!
//! Baslatildiginda her oge TEK bir tekrarli etkinlige donusur
//! (`tekrar.tip = Haftalik`, `gunler = ogenin gunleri`). Somut etkinlik
//! uretilmemesinin sebebi: "suresiz" program boyle bedava geliyor ve
//! zamanlayicinin (zamanlayici.rs) program diye bir sey bilmesine gerek
//! kalmiyor - zaten tekrar kurallarini isliyor. Karsilastirma icin bkz.
//! src/lib/planUret.ts: orada konular gunden gune DONDUGU icin tersi karar
//! verilmis, tek tek etkinlik uretiliyor.
//!
//! Uretim mantiginin kendisi burada degil, arayuz tarafinda
//! (src/lib/programUret.ts): uretim her zaman kullanici tetikli, boylece tek
//! kopya kaliyor ve tarayici onizlemesi de calisiyor. Bu dosya yalnizca
//! veri modelini ve diskteki bicimi tanimlar.
//!
//! Bilinen sinirlama: "programi bir haftaligina duraklat" bu modelde ancak
//! oge basina 7 istisna ile anlatilabilir.

use chrono::{NaiveDate, NaiveDateTime};
use serde::{Deserialize, Serialize};

use crate::model::Hatirlatma;

pub const PROGRAM_SEMA_SURUMU: u32 = 1;

// ----------------------------------------------------------------- Program

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Program {
    pub id: String,
    pub baslik: String,
    #[serde(default)]
    pub aciklama: String,
    /// Uretilen etkinliklerin kategorisi; takvimdeki rengi de buradan gelir.
    #[serde(default = "kategori_varsayilan")]
    pub kategori: String,
    #[serde(default)]
    pub ogeler: Vec<ProgramOgesi>,
    /// None = uykuda, takvime islenmis degil.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kosu: Option<ProgramKosusu>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub olusturuldu: Option<NaiveDateTime>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub guncellendi: Option<NaiveDateTime>,
}

fn kategori_varsayilan() -> String {
    "genel".to_string()
}

impl Program {
    pub fn calisiyor_mu(&self) -> bool {
        self.kosu.is_some()
    }

    /// Haftada kac oturum - ayni oge birden fazla gune isaretliyse her gun sayilir.
    pub fn haftalik_oturum(&self) -> usize {
        self.ogeler.iter().map(|o| o.gunler.len()).sum()
    }

    /// Haftalik toplam dakika.
    pub fn haftalik_dakika(&self) -> u32 {
        self.ogeler
            .iter()
            .map(|o| o.sure_dakika * o.gunler.len() as u32)
            .sum()
    }
}

// ------------------------------------------------------------ Program ogesi

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgramOgesi {
    pub id: String,
    pub baslik: String,
    /// Duz metin. Baglantilar gosterimde taninir, markdown yok.
    #[serde(default)]
    pub icerik: String,
    /// 1 = Pazartesi ... 7 = Pazar. Bos ise oge hicbir gune dusmez.
    #[serde(default)]
    pub gunler: Vec<u8>,
    /// "HH:MM"
    pub saat: String,
    #[serde(default)]
    pub sure_dakika: u32,
    #[serde(default)]
    pub hatirlatmalar: Vec<Hatirlatma>,
}

// ------------------------------------------------------------- Program kosusu

/// Sureyi kullanicinin hangi biciminde verdigi. `bitis` her durumda
/// hesaplanip yazilir; bu alan yalnizca arayuzde geri gostermek icin.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum SureKipi {
    #[default]
    Hafta,
    Tarih,
    Suresiz,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgramKosusu {
    /// Kullanicinin sectigi gun. Ilk olusum bu gunden itibaren ilk uyan hafta
    /// gunudur (bu gun dahil). Yeniden uretim HER ZAMAN bunu temel alir,
    /// turetilmis capayi degil - yoksa ogeye sonradan gun eklenince ilk
    /// olusum yanlis haftaya kayar.
    pub baslangic: NaiveDate,
    /// Turetilmis ama diskte tutuluyor: sonradan hicbir sey yeniden
    /// hesaplamasin. None = suresiz.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bitis: Option<NaiveDate>,
    #[serde(default)]
    pub kip: SureKipi,
    /// Kip `Hafta` ise kullanicinin girdigi hafta sayisi.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hafta: Option<u32>,
    pub baslatildi: NaiveDateTime,
}

// ------------------------------------------------------------- Dosya koku

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgramDosyasi {
    #[serde(default = "program_sema_surumu")]
    pub surum: u32,
    #[serde(default)]
    pub programlar: Vec<Program>,
}

fn program_sema_surumu() -> u32 {
    PROGRAM_SEMA_SURUMU
}

impl Default for ProgramDosyasi {
    fn default() -> Self {
        Self {
            surum: PROGRAM_SEMA_SURUMU,
            programlar: Vec::new(),
        }
    }
}

// --------------------------------------------------------- disa/ice aktarma

/// Tek bir programin dosya bicimi. Tur alani, yanlis dosyayi ice aktarmaya
/// calisildiginda anlasilir bir hata verebilmek icin.
pub const DISA_AKTARIM_TURU: &str = "zsenclock-program";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgramAktarimi {
    pub tur: String,
    #[serde(default = "program_sema_surumu")]
    pub surum: u32,
    pub program: Program,
}

impl ProgramAktarimi {
    pub fn sar(program: &Program) -> Self {
        let mut p = program.clone();
        // Disa aktarilan sablon her zaman uykuda gider: karsi tarafin takvimi
        // bizim baslangic tarihimizle dolmasin.
        p.kosu = None;
        Self {
            tur: DISA_AKTARIM_TURU.to_string(),
            surum: PROGRAM_SEMA_SURUMU,
            program: p,
        }
    }

    /// Ice aktarirken dogrular ve uykuda bir program dondurur. Yeni kimlik
    /// cagiran tarafta atanir (kimlik uretimi Tauri katmaninda).
    pub fn coz(metin: &str) -> Result<Program, String> {
        let aktarim: ProgramAktarimi = serde_json::from_str(metin)
            .map_err(|_| "Bu dosya bir program dosyasi degil.".to_string())?;
        if aktarim.tur != DISA_AKTARIM_TURU {
            return Err("Bu dosya bir program dosyasi degil.".to_string());
        }
        if aktarim.surum > PROGRAM_SEMA_SURUMU {
            return Err(
                "Bu program daha yeni bir surumle olusturulmus. Uygulamayi guncelle."
                    .to_string(),
            );
        }
        let mut p = aktarim.program;
        p.kosu = None;
        Ok(p)
    }
}

#[cfg(test)]
mod testler {
    use super::*;

    fn oge(id: &str, gunler: Vec<u8>, dakika: u32) -> ProgramOgesi {
        ProgramOgesi {
            id: id.to_string(),
            baslik: "Matematik".to_string(),
            icerik: String::new(),
            gunler,
            saat: "09:00".to_string(),
            sure_dakika: dakika,
            hatirlatmalar: Vec::new(),
        }
    }

    fn program() -> Program {
        Program {
            id: "p1".to_string(),
            baslik: "Haftalik duzen".to_string(),
            aciklama: String::new(),
            kategori: "ders".to_string(),
            ogeler: vec![oge("o1", vec![1, 3], 60), oge("o2", vec![6], 90)],
            kosu: None,
            olusturuldu: None,
            guncellendi: None,
        }
    }

    #[test]
    fn bos_dosya_varsayilana_doner() {
        let d = ProgramDosyasi::default();
        assert_eq!(d.surum, PROGRAM_SEMA_SURUMU);
        assert!(d.programlar.is_empty());
    }

    #[test]
    fn eksik_alanlar_varsayilanla_okunur() {
        let ham = r#"{ "programlar": [
            { "id": "p1", "baslik": "Sade", "ogeler": [
                { "id": "o1", "baslik": "Is", "saat": "08:00" }
            ] }
        ] }"#;
        let d: ProgramDosyasi = serde_json::from_str(ham).expect("okunmali");
        let p = &d.programlar[0];
        assert_eq!(d.surum, PROGRAM_SEMA_SURUMU);
        assert_eq!(p.kategori, "genel");
        assert_eq!(p.aciklama, "");
        assert!(p.ogeler[0].gunler.is_empty());
        assert_eq!(p.ogeler[0].sure_dakika, 0);
    }

    #[test]
    fn kosusu_yoksa_uykudadir() {
        let p = program();
        assert!(!p.calisiyor_mu());
        // Uykudaki programin JSON'unda kosu alani hic gorunmemeli.
        let metin = serde_json::to_string(&p).expect("yazilmali");
        assert!(!metin.contains("kosu"), "uykuda kosu yazilmamali: {metin}");
    }

    #[test]
    fn haftalik_toplamlar_gun_basina_sayilir() {
        let p = program();
        // o1 iki gune 60'sar dakika, o2 bir gune 90 dakika.
        assert_eq!(p.haftalik_oturum(), 3);
        assert_eq!(p.haftalik_dakika(), 210);
    }

    #[test]
    fn disa_aktarilan_program_geri_okunur() {
        let mut p = program();
        p.kosu = Some(ProgramKosusu {
            baslangic: NaiveDate::from_ymd_opt(2026, 9, 21).unwrap(),
            bitis: NaiveDate::from_ymd_opt(2026, 10, 18),
            kip: SureKipi::Hafta,
            hafta: Some(4),
            baslatildi: NaiveDate::from_ymd_opt(2026, 9, 18)
                .unwrap()
                .and_hms_opt(10, 0, 0)
                .unwrap(),
        });

        let metin = serde_json::to_string(&ProgramAktarimi::sar(&p)).expect("yazilmali");
        let geri = ProgramAktarimi::coz(&metin).expect("okunmali");

        assert_eq!(geri.baslik, "Haftalik duzen");
        assert_eq!(geri.ogeler.len(), 2);
        assert_eq!(geri.ogeler[0].gunler, vec![1, 3]);
    }

    #[test]
    fn ice_aktarilan_program_uykuda_gelir() {
        let mut p = program();
        p.kosu = Some(ProgramKosusu {
            baslangic: NaiveDate::from_ymd_opt(2026, 9, 21).unwrap(),
            bitis: None,
            kip: SureKipi::Suresiz,
            hafta: None,
            baslatildi: NaiveDate::from_ymd_opt(2026, 9, 18)
                .unwrap()
                .and_hms_opt(10, 0, 0)
                .unwrap(),
        });

        // Sarmalayici zaten kosuyu dusuruyor; elle kosu iceren bir dosya
        // gelse bile ice aktarma uykuda birakmali.
        let mut ham: serde_json::Value =
            serde_json::to_value(ProgramAktarimi::sar(&p)).expect("yazilmali");
        ham["program"]["kosu"] = serde_json::json!({
            "baslangic": "2026-09-21",
            "kip": "suresiz",
            "baslatildi": "2026-09-18T10:00:00"
        });

        let geri = ProgramAktarimi::coz(&ham.to_string()).expect("okunmali");
        assert!(!geri.calisiyor_mu(), "ice aktarilan program uykuda olmali");
    }

    #[test]
    fn yabanci_dosya_anlasilir_hata_verir() {
        assert!(ProgramAktarimi::coz("{}").is_err());
        assert!(ProgramAktarimi::coz("merhaba").is_err());
        let baska = r#"{ "tur": "baska-uygulama", "surum": 1, "program":
            { "id": "p1", "baslik": "X", "ogeler": [] } }"#;
        assert!(ProgramAktarimi::coz(baska).is_err());
    }
}
