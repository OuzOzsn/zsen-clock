//! Uygulamanin veri modeli. Bu yapilar dogrudan data/etkinlikler.json ve
//! data/ayarlar.json dosyalarina serilestirilir; kullanici dosyalari elle
//! duzenleyebilsin diye alan adlari kisa ve Turkce tutuldu.

use chrono::{NaiveDate, NaiveDateTime};
use serde::{Deserialize, Serialize};

pub const SEMA_SURUMU: u32 = 1;

// ---------------------------------------------------------------- Etkinlik

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Etkinlik {
    pub id: String,
    pub baslik: String,
    #[serde(default)]
    pub not: String,
    #[serde(default = "kategori_varsayilan")]
    pub kategori: String,
    pub baslangic: NaiveDateTime,
    /// Bos birakilirsa etkinligin suresi yok (anlik hatirlatma) kabul edilir.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bitis: Option<NaiveDateTime>,
    #[serde(default)]
    pub tum_gun: bool,
    #[serde(default)]
    pub tekrar: Tekrar,
    #[serde(default)]
    pub hatirlatmalar: Vec<Hatirlatma>,
    /// Bos birakilirsa kategorinin rengi kullanilir.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub renk: Option<String>,
    /// Tamamlanmis olarak isaretlenen tekrar ornekleri (baslangic saatleriyle).
    /// Tekrarsiz etkinlikte en fazla bir kayit bulunur.
    ///
    /// Bos olsa da yaziliyor: arayuz tipi bunu zorunlu dizi sayiyor
    /// (src/lib/tipler.ts) ve alan dusunce `undefined` uzerinde islem yapip
    /// patliyordu. Ayni sey gunler/istisnalar icin de gecerli.
    #[serde(default)]
    pub tamamlananlar: Vec<NaiveDateTime>,
    /// Bu etkinligi ureten program. Elle olusturulan etkinliklerde yok.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub program: Option<ProgramBagi>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub olusturuldu: Option<NaiveDateTime>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub guncellendi: Option<NaiveDateTime>,
}

fn kategori_varsayilan() -> String {
    "genel".to_string()
}

/// Etkinligi ureten programa bag. Program tanimi ayri dosyada durur
/// (bkz. program.rs); burada yalnizca hangi programin hangi ogesi oldugu yazar.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgramBagi {
    pub program_id: String,
    pub oge_id: String,
    /// Yalnizca "bu gune ozel" kopyalarda dolu. Bos = seri kaydi.
    /// Kullanici takvimden tek bir gunu duzenledinde o gun seriden ayrilir:
    /// tarih serinin istisnalarina girer, icerik bu kopyaya tasinir.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub gun: Option<NaiveDate>,
}

impl ProgramBagi {
    /// Seri kaydi mi (tekrar kuralini tasiyan), yoksa gune ozel kopya mi?
    pub fn seri_mi(&self) -> bool {
        self.gun.is_none()
    }
}

impl Etkinlik {
    /// Etkinligin suresi (dakika). Bitis yoksa 0.
    pub fn sure_dakika(&self) -> i64 {
        match self.bitis {
            Some(b) => (b - self.baslangic).num_minutes().max(0),
            None => 0,
        }
    }

    pub fn tamamlandi_mi(&self, olusum: NaiveDateTime) -> bool {
        self.tamamlananlar.contains(&olusum)
    }

    /// Verilen programa ait mi - gune ozel kopyalar dahil.
    pub fn programa_ait_mi(&self, program_id: &str) -> bool {
        self.program
            .as_ref()
            .is_some_and(|b| b.program_id == program_id)
    }

    /// Verilen programin tekrar kuralini tasiyan seri kaydi mi?
    /// Gune ozel kopyalar bunun disinda kalir - yeniden uretim onlara dokunmaz.
    pub fn program_serisi_mi(&self, program_id: &str) -> bool {
        self.program
            .as_ref()
            .is_some_and(|b| b.program_id == program_id && b.seri_mi())
    }
}

// ------------------------------------------------------------------ Tekrar

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum TekrarTipi {
    #[default]
    Yok,
    Gunluk,
    Haftalik,
    Aylik,
    Yillik,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tekrar {
    #[serde(default)]
    pub tip: TekrarTipi,
    /// "Her N gunde/haftada/ayda bir". En az 1.
    #[serde(default = "bir")]
    pub aralik: u32,
    /// Yalnizca haftalik tekrarda kullanilir. 1 = Pazartesi ... 7 = Pazar.
    /// Bos birakilirsa etkinligin baslangic gunu kullanilir.
    #[serde(default)]
    pub gunler: Vec<u8>,
    /// Bu tarihten sonra tekrar uretilmez (bu gun dahil).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bitis_tarihi: Option<NaiveDate>,
    /// Atlanacak gunler - kullanici tek bir tekrari sildiginde buraya eklenir.
    #[serde(default)]
    pub istisnalar: Vec<NaiveDate>,
}

fn bir() -> u32 {
    1
}

impl Default for Tekrar {
    fn default() -> Self {
        Self {
            tip: TekrarTipi::Yok,
            aralik: 1,
            gunler: Vec::new(),
            bitis_tarihi: None,
            istisnalar: Vec::new(),
        }
    }
}

impl Tekrar {
    pub fn var_mi(&self) -> bool {
        self.tip != TekrarTipi::Yok
    }
}

// ------------------------------------------------------------- Hatirlatma

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Hatirlatma {
    /// Etkinlikten kac dakika once calacak. 0 = tam saatinde.
    /// Negatif deger etkinlikten SONRA anlamina gelir.
    pub dakika_once: i64,
    /// data/sesler/ altindaki dosya adi. Bos ise ayarlardaki varsayilan ses.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ses: Option<String>,
}

impl Hatirlatma {
    /// Bu hatirlatmanin, verilen tekrar ornegi icin calma zamani.
    pub fn calma_zamani(&self, olusum: NaiveDateTime) -> NaiveDateTime {
        olusum - chrono::Duration::minutes(self.dakika_once)
    }
}

// -------------------------------------------------------------- Kategoriler

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Kategori {
    pub ad: String,
    pub renk: String,
    /// Ikon paketindeki ad (bkz. src/lib/ikonlar.ts). Bos birakilabilir;
    /// o zaman arayuz yalnizca renk noktasini gosterir.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ikon: Option<String>,
}

impl Kategori {
    pub fn yeni(ad: &str, renk: &str, ikon: &str) -> Self {
        Self {
            ad: ad.to_string(),
            renk: renk.to_string(),
            ikon: Some(ikon.to_string()),
        }
    }
}

// ----------------------------------------------------------- Dosya kokleri

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EtkinlikDosyasi {
    #[serde(default = "sema_surumu")]
    pub surum: u32,
    #[serde(default)]
    pub kategoriler: Vec<Kategori>,
    #[serde(default)]
    pub etkinlikler: Vec<Etkinlik>,
}

fn sema_surumu() -> u32 {
    SEMA_SURUMU
}

impl Default for EtkinlikDosyasi {
    fn default() -> Self {
        Self {
            surum: SEMA_SURUMU,
            kategoriler: vec![
                Kategori::yeni("genel", "#c9a227", "etiket"),
                Kategori::yeni("ders", "#6aa9d6", "kitap"),
                Kategori::yeni("spor", "#7fa356", "kosu"),
                Kategori::yeni("kisisel", "#d2775a", "kalp"),
            ],
            etkinlikler: Vec::new(),
        }
    }
}

#[cfg(test)]
mod testler {
    use super::*;

    /// Program alani sonradan eklendi. Eski `etkinlikler.json` dosyalarinin
    /// goc kodu olmadan okunabildigini burada sabitliyoruz.
    #[test]
    fn program_alani_olmayan_etkinlik_okunur() {
        let ham = r#"{
            "id": "e1", "baslik": "Spor", "kategori": "spor",
            "baslangic": "2026-09-18T18:00:00"
        }"#;
        let e: Etkinlik = serde_json::from_str(ham).expect("eski kayit okunmali");
        assert_eq!(e.baslik, "Spor");
        assert!(e.program.is_none());
        assert!(!e.tekrar.var_mi());
    }

    /// Programsiz etkinlikte alan JSON'a hic yazilmamali - kullanici dosyayi
    /// elle acinca anlamadigi bos alanlar gormesin.
    #[test]
    fn programsiz_etkinlik_alani_yazmaz() {
        let e: Etkinlik = serde_json::from_str(
            r#"{ "id": "e1", "baslik": "Spor", "baslangic": "2026-09-18T18:00:00" }"#,
        )
        .expect("okunmali");
        let metin = serde_json::to_string(&e).expect("yazilmali");
        assert!(!metin.contains("program"), "beklenmedik alan: {metin}");
    }

    /// Bu uc dizi bos oldugunda JSON'dan dusuyordu; arayuz onlari zorunlu
    /// sayip `undefined` uzerinde donunce program detayi hic acilmiyordu.
    #[test]
    fn bos_diziler_de_yazilir() {
        let e: Etkinlik = serde_json::from_str(
            r#"{ "id": "e1", "baslik": "Spor", "baslangic": "2026-09-18T18:00:00" }"#,
        )
        .expect("okunmali");
        let metin = serde_json::to_string(&e).expect("yazilmali");
        for alan in ["tamamlananlar", "gunler", "istisnalar"] {
            assert!(metin.contains(alan), "{alan} JSON'da olmali: {metin}");
        }
    }

    #[test]
    fn program_bagi_seriyi_kopyadan_ayirir() {
        let ham = r#"{
            "id": "e1", "baslik": "Matematik", "baslangic": "2026-09-21T09:00:00",
            "program": { "program_id": "p1", "oge_id": "o1" }
        }"#;
        let seri: Etkinlik = serde_json::from_str(ham).expect("okunmali");
        assert!(seri.programa_ait_mi("p1"));
        assert!(seri.program_serisi_mi("p1"));
        assert!(!seri.program_serisi_mi("p2"));

        let ham_kopya = r#"{
            "id": "e2", "baslik": "Matematik", "baslangic": "2026-09-28T10:00:00",
            "program": { "program_id": "p1", "oge_id": "o1", "gun": "2026-09-28" }
        }"#;
        let kopya: Etkinlik = serde_json::from_str(ham_kopya).expect("okunmali");
        assert!(kopya.programa_ait_mi("p1"));
        assert!(
            !kopya.program_serisi_mi("p1"),
            "gune ozel kopya seri sayilmamali"
        );
    }
}
