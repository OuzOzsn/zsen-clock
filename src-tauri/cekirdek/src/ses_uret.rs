//! Varsayilan zil seslerini uretir.
//!
//! Neden dosya gomulmuyor da uretiliyor? Uc sebep: exe kucuk kaliyor, telif
//! sorusu hic dogmuyor, ve kullanici uretilen WAV'lari silip yerine kendi
//! dosyalarini koyabiliyor - uygulama onlari geri getirmiyor (yalnizca klasor
//! tamamen bossa uretiyor).
//!
//! Format: 16-bit PCM, mono, 44100 Hz. Her yerde calar, kod sade kalir.

use std::f32::consts::PI;
use std::path::Path;

const ORNEKLEME: u32 = 44_100;

/// Kutudan cikan zil sesi. `Ayarlar::default().varsayilan_ses` bunu
/// gosteriyor; ikisi ayrilirsa alarm calar ama ses cikmaz.
pub const VARSAYILAN_SES: &str = "zil.wav";

/// Klasor tamamen bossa varsayilan sesleri yazar.
/// Kullanici kendi seslerini koyduysa veya bizimkileri sildiyse dokunmaz.
pub fn varsayilanlari_yaz(klasor: &Path) -> std::io::Result<()> {
    let bos = std::fs::read_dir(klasor)?.flatten().next().is_none();
    if !bos {
        return Ok(());
    }

    for (ad, ornekler) in [
        (VARSAYILAN_SES, zil()),
        ("yumusak.wav", yumusak()),
        ("dijital.wav", dijital()),
    ] {
        std::fs::write(klasor.join(ad), wav_paketle(&ornekler))?;
    }
    Ok(())
}

// ------------------------------------------------------------------ sesler

/// Kapi zili gibi iki notali ding-dong. Dikkat cekicidir ama sert degil.
fn zil() -> Vec<f32> {
    let mut s = sessizlik(1.6);
    // La5 -> Mi5: yumusak bir dusen ucuncu
    nota_ekle(&mut s, 0.00, 0.75, 880.0, 0.32, Zarf::Cinlama);
    nota_ekle(&mut s, 0.38, 1.10, 659.25, 0.32, Zarf::Cinlama);
    s
}

/// Yumusak, yuvarlak bir ton. Gece veya calisma sirasinda irkiltmayan secenek.
fn yumusak() -> Vec<f32> {
    let mut s = sessizlik(2.2);
    nota_ekle(&mut s, 0.0, 1.3, 528.0, 0.26, Zarf::Nefes);
    nota_ekle(&mut s, 0.9, 1.3, 792.0, 0.14, Zarf::Nefes);
    s
}

/// Uc kisa bip. Klasik dijital alarm; en uyandirici olani.
fn dijital() -> Vec<f32> {
    let mut s = sessizlik(1.3);
    for i in 0..3 {
        let bas = i as f32 * 0.34;
        nota_ekle(&mut s, bas, 0.16, 1046.5, 0.3, Zarf::Kare);
    }
    s
}

// -------------------------------------------------------------- uretim

enum Zarf {
    /// Ani baslayip uzun sonen - metal cinlamasi.
    Cinlama,
    /// Yavas girip yavas cikan - yumusak.
    Nefes,
    /// Kare dalga, kisa ve keskin kenarli.
    Kare,
}

fn sessizlik(saniye: f32) -> Vec<f32> {
    vec![0.0; (saniye * ORNEKLEME as f32) as usize]
}

fn nota_ekle(hedef: &mut [f32], bas: f32, sure: f32, frekans: f32, seviye: f32, zarf: Zarf) {
    let bas_i = (bas * ORNEKLEME as f32) as usize;
    let uzunluk = (sure * ORNEKLEME as f32) as usize;

    for i in 0..uzunluk {
        let Some(yuva) = hedef.get_mut(bas_i + i) else { break };
        let t = i as f32 / ORNEKLEME as f32;
        let oran = i as f32 / uzunluk as f32;

        let dalga = match zarf {
            Zarf::Kare => {
                // Tam kare dalga hoparlorde tiz ve sert cikiyor; ucuncu
                // harmonigi ekleyip yumusatilmis bir kare kullaniyoruz.
                (2.0 * PI * frekans * t).sin() + 0.33 * (2.0 * PI * frekans * 3.0 * t).sin()
            }
            _ => {
                // Saf sinuse hafif ikinci harmonik: daha dolu, daha az "test tonu".
                (2.0 * PI * frekans * t).sin() + 0.22 * (2.0 * PI * frekans * 2.0 * t).sin()
            }
        };

        let kazanc = match zarf {
            Zarf::Cinlama => (1.0 - oran).powf(2.2),
            Zarf::Nefes => (PI * oran).sin(),          // yavas gir, yavas cik
            Zarf::Kare => {
                // Kenarlarda 5 ms yumusatma: klik sesini onler.
                let kenar = (0.005 * ORNEKLEME as f32) as usize;
                let gir = (i as f32 / kenar as f32).min(1.0);
                let cik = ((uzunluk - i) as f32 / kenar as f32).min(1.0);
                gir * cik
            }
        };

        *yuva += dalga * kazanc * seviye;
    }
}

/// f32 ornekleri 16-bit PCM WAV dosyasina paketler.
fn wav_paketle(ornekler: &[f32]) -> Vec<u8> {
    let veri_boyutu = (ornekler.len() * 2) as u32;
    let mut d = Vec::with_capacity(44 + veri_boyutu as usize);

    d.extend_from_slice(b"RIFF");
    d.extend_from_slice(&(36 + veri_boyutu).to_le_bytes());
    d.extend_from_slice(b"WAVE");

    d.extend_from_slice(b"fmt ");
    d.extend_from_slice(&16u32.to_le_bytes()); // parca boyutu
    d.extend_from_slice(&1u16.to_le_bytes()); // PCM
    d.extend_from_slice(&1u16.to_le_bytes()); // mono
    d.extend_from_slice(&ORNEKLEME.to_le_bytes());
    d.extend_from_slice(&(ORNEKLEME * 2).to_le_bytes()); // bayt/saniye
    d.extend_from_slice(&2u16.to_le_bytes()); // blok hizasi
    d.extend_from_slice(&16u16.to_le_bytes()); // bit derinligi

    d.extend_from_slice(b"data");
    d.extend_from_slice(&veri_boyutu.to_le_bytes());
    for &o in ornekler {
        // Harmonik eklemek genligi 1'in uzerine cikarabiliyor; kirpmak
        // bozulmadan daha iyi.
        let k = (o.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
        d.extend_from_slice(&k.to_le_bytes());
    }
    d
}

#[cfg(test)]
mod testler {
    use super::*;

    #[test]
    fn wav_basligi_dogru() {
        let d = wav_paketle(&[0.0; 100]);
        assert_eq!(&d[0..4], b"RIFF");
        assert_eq!(&d[8..12], b"WAVE");
        assert_eq!(&d[36..40], b"data");
        assert_eq!(d.len(), 44 + 200);
    }

    #[test]
    fn sesler_sessiz_degil_ve_kirpilmamis() {
        for ornekler in [zil(), yumusak(), dijital()] {
            let tepe = ornekler.iter().fold(0.0f32, |m, o| m.max(o.abs()));
            assert!(tepe > 0.1, "ses cok kisik: tepe {tepe}");
            assert!(tepe <= 1.0, "ses kirpiliyor: tepe {tepe}");
        }
    }

    #[test]
    fn sesler_makul_uzunlukta() {
        for (ad, ornekler) in [("zil", zil()), ("yumusak", yumusak()), ("dijital", dijital())] {
            let saniye = ornekler.len() as f32 / ORNEKLEME as f32;
            assert!((0.5..=5.0).contains(&saniye), "{ad}: {saniye} saniye");
        }
    }

    #[test]
    fn dolu_klasore_dokunmaz() {
        let gecici = std::env::temp_dir().join(format!("hat-ses-testi-{}", std::process::id()));
        std::fs::create_dir_all(&gecici).unwrap();
        std::fs::write(gecici.join("kendi.mp3"), b"x").unwrap();

        varsayilanlari_yaz(&gecici).unwrap();

        let sayi = std::fs::read_dir(&gecici).unwrap().count();
        assert_eq!(sayi, 1, "kullanicinin klasorune dosya eklenmemeli");
        std::fs::remove_dir_all(&gecici).ok();
    }

    /// Varsayilan ses ayari gercekten uretilen bir dosyayi gostermeli.
    /// Ikisi ayrilirsa alarm penceresi acilir ama ses cikmaz - kullaniciya
    /// "alarm bozuk" gibi gorunur. Bir kez oyle oldu.
    #[test]
    fn varsayilan_ses_ayari_uretilen_dosyayi_gosterir() {
        let klasor = std::env::temp_dir().join(format!("zsen-ses-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&klasor);
        std::fs::create_dir_all(&klasor).expect("klasor");
        varsayilanlari_yaz(&klasor).expect("yazilmali");

        let ayar = crate::ayarlar::Ayarlar::default();
        assert!(!ayar.varsayilan_ses.is_empty(), "varsayilan ses bos olmamali");
        assert!(
            klasor.join(&ayar.varsayilan_ses).is_file(),
            "varsayilan ses uretilmiyor: {}",
            ayar.varsayilan_ses
        );
        let _ = std::fs::remove_dir_all(&klasor);
    }

    #[test]
    fn bos_klasore_uc_ses_yazar() {
        let gecici = std::env::temp_dir().join(format!("hat-ses-bos-{}", std::process::id()));
        std::fs::create_dir_all(&gecici).unwrap();

        varsayilanlari_yaz(&gecici).unwrap();

        let sayi = std::fs::read_dir(&gecici).unwrap().count();
        assert_eq!(sayi, 3);
        std::fs::remove_dir_all(&gecici).ok();
    }
}
