//! Veri katmani: duz JSON dosyalari, veritabani yok.
//!
//! Dort dosya var, hepsi exe'nin yanindaki `data/` klasorunde:
//!   etkinlikler.json  - kullanicinin takvimi (elle duzenlenebilir)
//!   programlar.json   - haftalik program sablonlari (elle duzenlenebilir)
//!   ayarlar.json      - tercihler
//!   durum.json        - hangi hatirlatmalarin caldigi (uygulamanin ic defteri)
//!
//! Yazma her zaman atomiktir: once gecici dosyaya yazilir, sonra yerine
//! tasinir. Elektrik giderse ya eski ya yeni dosya kalir, yarim dosya kalmaz.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use chrono::{DateTime, Local, NaiveDateTime};
use serde::{Deserialize, Serialize};

use crate::ayarlar::Ayarlar;
use crate::model::EtkinlikDosyasi;
use crate::program::ProgramDosyasi;

const TUTULACAK_YEDEK: usize = 20;

// ------------------------------------------------------------- klasor yolu

static VERI_KLASORU: OnceLock<PathBuf> = OnceLock::new();

/// Veri klasoru. Oncelik exe'nin yanindaki `data/` (tasinabilir kullanim);
/// oraya yazilamiyorsa (orn. Program Files'a kurulmussa) %APPDATA% kullanilir.
pub fn veri_klasoru() -> &'static Path {
    VERI_KLASORU.get_or_init(|| {
        if let Some(yan) = exe_yanindaki_data() {
            if yazilabilir_mi(&yan) {
                return yan;
            }
            eprintln!(
                "[depo] {} yazilabilir degil, %APPDATA% kullanilacak",
                yan.display()
            );
        }
        let yedek = dirs_appdata().join("ZsenClock");
        let _ = fs::create_dir_all(&yedek);
        yedek
    })
}

fn exe_yanindaki_data() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    Some(exe.parent()?.join("data"))
}

fn dirs_appdata() -> PathBuf {
    std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
}

/// Klasoru olusturup gercekten yazabildigimizi dogrular. Windows'ta izinler
/// dosya sistemi bayraklarindan anlasilmadigi icin deneme dosyasi yaziyoruz.
fn yazilabilir_mi(klasor: &Path) -> bool {
    if fs::create_dir_all(klasor).is_err() {
        return false;
    }
    let deneme = klasor.join(".yazma-denemesi");
    match fs::File::create(&deneme) {
        Ok(mut f) => {
            let ok = f.write_all(b"ok").is_ok();
            drop(f);
            let _ = fs::remove_file(&deneme);
            ok
        }
        Err(_) => false,
    }
}

pub fn sesler_klasoru() -> PathBuf {
    let k = veri_klasoru().join("sesler");
    let _ = fs::create_dir_all(&k);
    k
}

pub fn yedekler_klasoru() -> PathBuf {
    let k = veri_klasoru().join("yedekler");
    let _ = fs::create_dir_all(&k);
    k
}

fn etkinlik_yolu() -> PathBuf {
    veri_klasoru().join("etkinlikler.json")
}

fn program_yolu() -> PathBuf {
    veri_klasoru().join("programlar.json")
}

fn ayar_yolu() -> PathBuf {
    veri_klasoru().join("ayarlar.json")
}

fn durum_yolu() -> PathBuf {
    veri_klasoru().join("durum.json")
}

// ------------------------------------------------------------- ic defter

/// Ertelenmis bir hatirlatma. Erteleme diske yaziliyor ki uygulama kapanip
/// acilsa bile "15 dakika sonra tekrar hatirlat" sozu tutulsun.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Erteleme {
    /// Ertelenen hatirlatmanin anahtari.
    pub anahtar: String,
    /// Yeniden calacagi an.
    pub zaman: NaiveDateTime,
}

/// Uygulamanin kendi tuttugu, kullanicinin ellemesi gerekmeyen durum.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Durum {
    /// Calmis hatirlatmalarin anahtarlari: "<etkinlikId>@<olusum>#<dakikaOnce>".
    /// Yeniden baslatinca ayni alarm tekrar calmasin diye tutulur.
    pub calanlar: Vec<String>,
    /// Zamanlayicinin en son kontrol ettigi an. PC kapaliyken gecen
    /// hatirlatmalari bulmak icin baslangic noktasi.
    pub son_kontrol: Option<NaiveDateTime>,
    /// Bekleyen ertelemeler.
    pub ertelemeler: Vec<Erteleme>,
}

impl Durum {
    pub fn caldi_mi(&self, anahtar: &str) -> bool {
        self.calanlar.iter().any(|a| a == anahtar)
    }

    pub fn caldi_isaretle(&mut self, anahtar: String) {
        if !self.caldi_mi(&anahtar) {
            self.calanlar.push(anahtar);
        }
    }

    /// Defteri sinirsiz buyutmemek icin eski kayitlari atar.
    /// Anahtarin ortasindaki olusum zamani `esik`ten eskiyse silinir.
    pub fn buda(&mut self, esik: NaiveDateTime) {
        self.calanlar.retain(|a| match anahtardan_olusum(a) {
            Some(z) => z >= esik,
            None => false, // cozulemeyen anahtar zaten ise yaramaz
        });
    }

    pub fn ertele(&mut self, anahtar: String, zaman: NaiveDateTime) {
        self.ertelemeler.retain(|e| e.anahtar != anahtar);
        self.ertelemeler.push(Erteleme { anahtar, zaman });
    }

    /// `simdi`ye kadar zamani gelmis ertelemeleri listeden cikarip dondurur.
    pub fn zamani_gelen_ertelemeler(&mut self, simdi: NaiveDateTime) -> Vec<Erteleme> {
        let (gelen, bekleyen): (Vec<_>, Vec<_>) =
            self.ertelemeler.iter().cloned().partition(|e| e.zaman <= simdi);
        self.ertelemeler = bekleyen;
        gelen
    }
}

fn anahtardan_olusum(anahtar: &str) -> Option<NaiveDateTime> {
    let govde = anahtar.split('@').nth(1)?;
    let zaman = govde.split('#').next()?;
    NaiveDateTime::parse_from_str(zaman, "%Y-%m-%dT%H:%M:%S").ok()
}

// ------------------------------------------------------------ okuma/yazma

/// JSON dosyasini okur. Dosya yoksa varsayilani dondurur.
/// Dosya bozuksa: bozuk halini `bozuk-*.json` diye kenara koyar, yedeklerden
/// en yenisini dener, o da olmazsa varsayilana doner - uygulama asla cokmez.
fn oku<T>(yol: &Path, etiket: &str) -> (T, Option<String>)
where
    T: Default + for<'de> Deserialize<'de>,
{
    let Ok(icerik) = fs::read_to_string(yol) else {
        return (T::default(), None);
    };
    // Windows'ta Not Defteri ve PowerShell dosyalari cogu zaman UTF-8 BOM ile
    // kaydediyor; JSON ayristiricisi BOM'u gordugunde dosyayi bozuk sayiyor.
    // Kullanicinin kendi takvimini duzenlemesini istiyoruz, o yuzden BOM'u
    // sessizce atlıyoruz.
    let icerik = icerik.strip_prefix('\u{feff}').unwrap_or(&icerik);

    match serde_json::from_str::<T>(icerik) {
        Ok(v) => (v, None),
        Err(e) => {
            let damga = Local::now().format("%Y%m%d-%H%M%S");
            let bozuk = veri_klasoru().join(format!("bozuk-{etiket}-{damga}.json"));
            let _ = fs::copy(yol, &bozuk);

            if let Some((v, kaynak)) = en_yeni_yedekten::<T>(etiket) {
                return (
                    v,
                    Some(format!(
                        "{etiket}.json okunamadi ({e}). {kaynak} yedeginden geri yuklendi. \
                         Bozuk dosya: {}",
                        bozuk.display()
                    )),
                );
            }
            (
                T::default(),
                Some(format!(
                    "{etiket}.json okunamadi ({e}) ve kullanilabilir yedek yok. \
                     Bos bir dosyayla baslatildi. Bozuk dosya: {}",
                    bozuk.display()
                )),
            )
        }
    }
}

fn en_yeni_yedekten<T>(etiket: &str) -> Option<(T, String)>
where
    T: for<'de> Deserialize<'de>,
{
    let onek = format!("{etiket}-");
    let mut adaylar: Vec<PathBuf> = fs::read_dir(yedekler_klasoru())
        .ok()?
        .flatten()
        .map(|g| g.path())
        .filter(|p| {
            p.file_name()
                .and_then(|a| a.to_str())
                .is_some_and(|a| a.starts_with(&onek) && a.ends_with(".json"))
        })
        .collect();
    adaylar.sort(); // ad zaman damgasi icerdigi icin alfabetik siralama = kronolojik
    for yol in adaylar.iter().rev() {
        if let Ok(m) = fs::read_to_string(yol) {
            if let Ok(v) = serde_json::from_str::<T>(&m) {
                let ad = yol.file_name().unwrap_or_default().to_string_lossy().to_string();
                return Some((v, ad));
            }
        }
    }
    None
}

/// Atomik yazma: gecici dosya -> fsync -> rename.
fn yaz<T: Serialize>(yol: &Path, deger: &T) -> Result<(), String> {
    let klasor = yol.parent().ok_or("gecersiz yol")?;
    fs::create_dir_all(klasor).map_err(|e| e.to_string())?;

    let metin = serde_json::to_string_pretty(deger).map_err(|e| e.to_string())?;
    let gecici = yol.with_extension("json.tmp");

    {
        let mut f = fs::File::create(&gecici).map_err(|e| e.to_string())?;
        f.write_all(metin.as_bytes()).map_err(|e| e.to_string())?;
        // Disk onbellegi degil, gercekten diske yazildigindan emin ol.
        f.sync_all().map_err(|e| e.to_string())?;
    }

    // Windows'ta hedef varsa rename basarisiz olabilir; once kaldiriyoruz.
    if yol.exists() {
        let _ = fs::remove_file(yol);
    }
    fs::rename(&gecici, yol).map_err(|e| e.to_string())
}

/// Yazmadan onceki hali zaman damgali olarak yedekler ve eskileri temizler.
fn yedekle(yol: &Path, etiket: &str) {
    if !yol.exists() {
        return;
    }
    let damga: DateTime<Local> = Local::now();
    let hedef = yedekler_klasoru().join(format!(
        "{etiket}-{}.json",
        damga.format("%Y%m%d-%H%M%S")
    ));
    if fs::copy(yol, &hedef).is_err() {
        return;
    }

    let onek = format!("{etiket}-");
    let mut eskiler: Vec<PathBuf> = fs::read_dir(yedekler_klasoru())
        .into_iter()
        .flatten()
        .flatten()
        .map(|g| g.path())
        .filter(|p| {
            p.file_name()
                .and_then(|a| a.to_str())
                .is_some_and(|a| a.starts_with(&onek) && a.ends_with(".json"))
        })
        .collect();
    eskiler.sort();
    if eskiler.len() > TUTULACAK_YEDEK {
        for p in &eskiler[..eskiler.len() - TUTULACAK_YEDEK] {
            let _ = fs::remove_file(p);
        }
    }
}

// --------------------------------------------------------------- genel API

/// Etkinlikleri okur. Ikinci deger, kullaniciya gosterilecek bir uyari varsa doludur.
pub fn etkinlikleri_oku() -> (EtkinlikDosyasi, Option<String>) {
    oku(&etkinlik_yolu(), "etkinlikler")
}

pub fn etkinlikleri_yaz(dosya: &EtkinlikDosyasi) -> Result<(), String> {
    let yol = etkinlik_yolu();
    yedekle(&yol, "etkinlikler");
    yaz(&yol, dosya)
}

/// Programlar da yedeklenir: icerikleri elle yazilmis, kaybi telafi edilmez.
pub fn programlari_oku() -> (ProgramDosyasi, Option<String>) {
    oku(&program_yolu(), "programlar")
}

pub fn programlari_yaz(dosya: &ProgramDosyasi) -> Result<(), String> {
    let yol = program_yolu();
    yedekle(&yol, "programlar");
    yaz(&yol, dosya)
}

pub fn ayarlari_oku() -> (Ayarlar, Option<String>) {
    oku(&ayar_yolu(), "ayarlar")
}

pub fn ayarlari_yaz(a: &Ayarlar) -> Result<(), String> {
    yaz(&ayar_yolu(), a)
}

pub fn durumu_oku() -> Durum {
    oku::<Durum>(&durum_yolu(), "durum").0
}

pub fn durumu_yaz(d: &Durum) -> Result<(), String> {
    yaz(&durum_yolu(), d)
}

/// Ilk calistirmada eksik klasorleri ve dosyalari olusturur.
pub fn hazirla() -> Result<(), String> {
    fs::create_dir_all(veri_klasoru()).map_err(|e| e.to_string())?;
    let sesler = sesler_klasoru();
    yedekler_klasoru();

    // Kutudan cikan haliyle alarm sessiz olmasin. Yalnizca klasor tamamen
    // bossa yazar; kullanicinin kendi sectigi seslere karismaz.
    if let Err(e) = crate::ses_uret::varsayilanlari_yaz(&sesler) {
        eprintln!("[depo] varsayilan sesler yazilamadi: {e}");
    }
    if !etkinlik_yolu().exists() {
        yaz(&etkinlik_yolu(), &EtkinlikDosyasi::default())?;
    }
    if !program_yolu().exists() {
        yaz(&program_yolu(), &ProgramDosyasi::default())?;
    }
    if !ayar_yolu().exists() {
        yaz(&ayar_yolu(), &Ayarlar::default())?;
    }
    Ok(())
}

#[cfg(test)]
mod testler {
    use super::*;

    #[test]
    fn anahtardan_olusum_cozulur() {
        let z = anahtardan_olusum("abc@2026-09-12T09:00:00#10").unwrap();
        assert_eq!(z.format("%Y-%m-%d %H:%M").to_string(), "2026-09-12 09:00");
    }

    #[test]
    fn bozuk_anahtar_none_doner() {
        assert!(anahtardan_olusum("bozuk").is_none());
        assert!(anahtardan_olusum("abc@filanca#10").is_none());
    }

    #[test]
    fn budama_eski_kayitlari_atar() {
        let esik = NaiveDateTime::parse_from_str("2026-09-10 00:00", "%Y-%m-%d %H:%M").unwrap();
        let mut d = Durum {
            calanlar: vec![
                "a@2026-09-01T08:00:00#0".into(),
                "b@2026-09-15T08:00:00#0".into(),
                "bozuk".into(),
            ],
            ..Default::default()
        };
        d.buda(esik);
        assert_eq!(d.calanlar, vec!["b@2026-09-15T08:00:00#0".to_string()]);
    }

    fn zaman(s: &str) -> NaiveDateTime {
        NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M").unwrap()
    }

    /// Windows'ta en sik karsilasilan bozulma sebebi: Not Defteri veya
    /// PowerShell'in dosyayi BOM ile kaydetmesi.
    #[test]
    fn bom_ile_baslayan_dosya_okunur() {
        let klasor = std::env::temp_dir().join(format!("hat-bom-{}", std::process::id()));
        std::fs::create_dir_all(&klasor).unwrap();
        let yol = klasor.join("ayarlar.json");

        let govde = serde_json::to_string(&Ayarlar::default()).unwrap();
        std::fs::write(&yol, format!("\u{feff}{govde}")).unwrap();

        let (okunan, uyari): (Ayarlar, _) = oku(&yol, "ayarlar");
        assert!(uyari.is_none(), "BOM'lu dosya bozuk sayilmamali: {uyari:?}");
        assert_eq!(okunan.tema, Ayarlar::default().tema);

        std::fs::remove_dir_all(&klasor).ok();
    }

    #[test]
    fn erteleme_ayni_anahtari_tekrarlamaz() {
        let mut d = Durum::default();
        d.ertele("a@x#0".into(), zaman("2026-09-11 10:00"));
        d.ertele("a@x#0".into(), zaman("2026-09-11 10:30"));
        assert_eq!(d.ertelemeler.len(), 1);
        assert_eq!(d.ertelemeler[0].zaman, zaman("2026-09-11 10:30"));
    }

    #[test]
    fn zamani_gelen_ertelemeler_listeden_cikar() {
        let mut d = Durum::default();
        d.ertele("a@x#0".into(), zaman("2026-09-11 10:00"));
        d.ertele("b@y#0".into(), zaman("2026-09-11 12:00"));

        let gelen = d.zamani_gelen_ertelemeler(zaman("2026-09-11 11:00"));
        assert_eq!(gelen.len(), 1);
        assert_eq!(gelen[0].anahtar, "a@x#0");
        assert_eq!(d.ertelemeler.len(), 1);
        assert_eq!(d.ertelemeler[0].anahtar, "b@y#0");
    }
}
