//! Uygulamanin paylasilan durumu ve arka planda calisan zamanlayici.
//!
//! Zamanlayici ayri bir is parcaciginda, hicbir pencere acik olmasa bile
//! calisir. Isi basit: belirli araliklarla "son kontrolden simdiye ne caldi"
//! diye sorar, cikanlari alarm kuyruguna koyar ve pencereyi acar.

use std::sync::{Arc, Mutex};
use std::time::Duration as StdDuration;

use chrono::{Duration, Local, NaiveDateTime};
use tauri::{AppHandle, Emitter, Manager};

use cekirdek::ayarlar::Ayarlar;
use cekirdek::depo::{self, Durum};
use cekirdek::model::EtkinlikDosyasi;
use cekirdek::program::ProgramDosyasi;
use cekirdek::zamanlayici::{self, Tetiklenen};

/// Zamanlayicinin ne siklikla baktigi. 20 saniye, "tam dakikasinda calsin"
/// beklentisi icin yeterince sik, PC'yi mesgul etmeyecek kadar seyrek.
const TIK_SANIYE: u64 = 20;

/// Iki tik arasinda bundan fazla zaman gectiyse PC uyumus/beklemis demektir;
/// aradaki hatirlatmalar "kacirilmis" olarak islenir.
const SICRAMA_ESIGI_SANIYE: i64 = 90;

/// Calmis kayitlarin defterde tutulma suresi.
const DEFTER_GUN: i64 = 30;

pub struct Paylasilan {
    pub dosya: Mutex<EtkinlikDosyasi>,
    /// Program sablonlari. Zamanlayici bunlari okumaz: baslatilan program
    /// zaten tekrar kurali tasiyan etkinliklere donusuyor.
    pub programlar: Mutex<ProgramDosyasi>,
    pub ayarlar: Mutex<Ayarlar>,
    pub durum: Mutex<Durum>,
    /// Calmis ama kullanicinin henuz kapatmadigi hatirlatmalar.
    pub alarm_kuyrugu: Mutex<Vec<Tetiklenen>>,
    /// Dosya okunurken cikan uyari (bozuk JSON vb.), arayuze gosterilir.
    pub acilis_uyarisi: Mutex<Option<String>>,
}

impl Paylasilan {
    pub fn yukle() -> Self {
        let (dosya, uyari_e) = depo::etkinlikleri_oku();
        let (programlar, uyari_p) = depo::programlari_oku();
        let (ayarlar, uyari_a) = depo::ayarlari_oku();
        let durum = depo::durumu_oku();

        Self {
            dosya: Mutex::new(dosya),
            programlar: Mutex::new(programlar),
            ayarlar: Mutex::new(ayarlar),
            durum: Mutex::new(durum),
            alarm_kuyrugu: Mutex::new(Vec::new()),
            acilis_uyarisi: Mutex::new(uyari_e.or(uyari_p).or(uyari_a)),
        }
    }

    pub fn etkinlikleri_kaydet(&self) -> Result<(), String> {
        let dosya = self.dosya.lock().map_err(|_| "kilit alinamadi")?;
        depo::etkinlikleri_yaz(&dosya)
    }

    pub fn programlari_kaydet(&self) -> Result<(), String> {
        let programlar = self.programlar.lock().map_err(|_| "kilit alinamadi")?;
        depo::programlari_yaz(&programlar)
    }

    pub fn durumu_kaydet(&self) -> Result<(), String> {
        let durum = self.durum.lock().map_err(|_| "kilit alinamadi")?;
        depo::durumu_yaz(&durum)
    }

    pub fn ayarlari_kaydet(&self) -> Result<(), String> {
        let ayarlar = self.ayarlar.lock().map_err(|_| "kilit alinamadi")?;
        depo::ayarlari_yaz(&ayarlar)
    }
}

/// Arka plan zamanlayicisini baslatir.
pub fn baslat(app: AppHandle) {
    std::thread::spawn(move || {
        // Acilista bir kez hemen bak: PC kapaliyken gecen hatirlatmalar
        // kullaniciyi programi actigi anda karsilasin.
        tik(&app);
        loop {
            std::thread::sleep(StdDuration::from_secs(TIK_SANIYE));
            tik(&app);
        }
    });
}

fn tik(app: &AppHandle) {
    let paylasilan = app.state::<Arc<Paylasilan>>();
    let simdi = Local::now().naive_local();

    let (son_kontrol, tolerans, sessiz, oyunda_koru) = {
        let durum = paylasilan.durum.lock().unwrap();
        let ayarlar = paylasilan.ayarlar.lock().unwrap();
        (
            durum.son_kontrol.unwrap_or(simdi - Duration::seconds(TIK_SANIYE as i64)),
            ayarlar.kacan_tolerans_saat,
            ayarlar.sessiz_saatte_mi(simdi.time()),
            ayarlar.oyunda_araya_girme,
        )
    };

    // Saat geriye gittiyse (kullanici sistem saatini degistirdi, yaz saati)
    // gecmise dogru tarama yapmanin anlami yok; pencereyi sifirla.
    let son_kontrol = if son_kontrol > simdi {
        simdi - Duration::seconds(TIK_SANIYE as i64)
    } else {
        son_kontrol
    };

    let sicrama = (simdi - son_kontrol).num_seconds() > SICRAMA_ESIGI_SANIYE;

    let mut yeniler: Vec<Tetiklenen> = {
        let dosya = paylasilan.dosya.lock().unwrap();
        let durum = paylasilan.durum.lock().unwrap();
        zamanlayici::tetiklenecekler(&dosya, &durum, son_kontrol, simdi, tolerans)
    };

    // Zamani gelen ertelemeler
    let ertelenenler = {
        let mut durum = paylasilan.durum.lock().unwrap();
        durum.zamani_gelen_ertelemeler(simdi)
    };
    if !ertelenenler.is_empty() {
        let dosya = paylasilan.dosya.lock().unwrap();
        for e in ertelenenler {
            if let Some(t) = anahtardan_tetiklenen(&dosya, &e.anahtar, simdi) {
                yeniler.push(t);
            }
        }
    }

    {
        let mut durum = paylasilan.durum.lock().unwrap();
        for t in &yeniler {
            durum.caldi_isaretle(t.anahtar());
        }
        durum.son_kontrol = Some(simdi);
        durum.buda(simdi - Duration::days(DEFTER_GUN));
    }
    let _ = paylasilan.durumu_kaydet();

    if yeniler.is_empty() {
        return;
    }

    {
        let mut kuyruk = paylasilan.alarm_kuyrugu.lock().unwrap();
        for t in yeniler {
            // Ayni hatirlatma kuyrukta iki kez durmasin.
            if !kuyruk.iter().any(|v| v.anahtar() == t.anahtar()) {
                kuyruk.push(t);
            }
        }
        kuyruk.sort_by_key(|t| t.calma_zamani);
    }

    // Rahatsiz etmeyin: pencere acilmaz, ses calmaz. Hatirlatmalar yine de
    // kuyrukta ve widget'ta "gecikmis" olarak gorunur - sessizce kaybolmaz.
    if sessiz {
        let _ = app.emit("alarm-guncellendi", ());
        return;
    }

    // Tam ekran oyun/sunum varsa alarm yine acilir ve calar, ama odagi
    // calmaz ve ustte durmaz - oyunu bolmemek icin. Kontrol burada yapiliyor
    // (her tikta degil, yalnizca gercekten calacak bir sey varken).
    let araya_girme = oyunda_koru && crate::odak::tam_ekran_uygulama_var_mi();
    crate::pencere::alarmi_goster(app, sicrama, araya_girme);
}

/// Erteleme anahtarindan yeniden bir Tetiklenen olusturur.
/// Anahtar bicimi: "<etkinlikId>@<olusum>#<dakikaOnce>".
fn anahtardan_tetiklenen(
    dosya: &EtkinlikDosyasi,
    anahtar: &str,
    simdi: NaiveDateTime,
) -> Option<Tetiklenen> {
    let (id, kalan) = anahtar.split_once('@')?;
    let (olusum_metin, dakika_metin) = kalan.split_once('#')?;
    let olusum = NaiveDateTime::parse_from_str(olusum_metin, "%Y-%m-%dT%H:%M:%S").ok()?;
    let dakika_once: i64 = dakika_metin.parse().ok()?;

    let e = dosya.etkinlikler.iter().find(|e| e.id == id)?;
    if e.tamamlandi_mi(olusum) {
        return None;
    }

    let sure = e.sure_dakika();
    Some(Tetiklenen {
        etkinlik_id: e.id.clone(),
        baslik: e.baslik.clone(),
        not: e.not.clone(),
        kategori: e.kategori.clone(),
        olusum,
        bitis: (sure > 0).then(|| olusum + Duration::minutes(sure)),
        calma_zamani: simdi,
        dakika_once,
        ses: e
            .hatirlatmalar
            .iter()
            .find(|h| h.dakika_once == dakika_once)
            .and_then(|h| h.ses.clone()),
        // Erteleme sonucu calan alarm "kacirilmis" degil, kullanicinin
        // kendi istedigi zamanda caliyor.
        kacirilmis: false,
    })
}
