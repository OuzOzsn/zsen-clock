//! Arayuzun cagirdigi komutlar. Buradaki her fonksiyon src/lib/ipc.ts
//! icindeki `Komutlar` tipinde bire bir karsiligi olan bir giristir.

use std::sync::Arc;

use chrono::{Duration, Local, NaiveDate, NaiveDateTime};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use cekirdek::ayarlar::Ayarlar;
use cekirdek::depo;
use cekirdek::model::{Etkinlik, Kategori, ProgramBagi, Tekrar};
use cekirdek::program::{Program, ProgramAktarimi};
use cekirdek::zamanlayici::Tetiklenen;

use crate::pencere;
use crate::servis::Paylasilan;

type Sonuc<T> = Result<T, String>;

/// Veri degistiginde tum acik pencereleri tazeler.
fn yayinla(app: &AppHandle) {
    let _ = app.emit("veri-degisti", ());
}

// ------------------------------------------------------------------ veri

#[derive(Serialize)]
pub struct EtkinlikYaniti {
    etkinlikler: Vec<Etkinlik>,
    kategoriler: Vec<Kategori>,
    /// Dosya bozuksa kullaniciya gosterilecek aciklama.
    uyari: Option<String>,
}

#[tauri::command]
pub fn etkinlikleri_getir(durum: State<'_, Arc<Paylasilan>>) -> Sonuc<EtkinlikYaniti> {
    let dosya = durum.dosya.lock().map_err(|_| "kilit alinamadi")?;
    // Uyari bir kez gosterilir, sonra temizlenir.
    let uyari = durum.acilis_uyarisi.lock().map_err(|_| "kilit")?.take();
    Ok(EtkinlikYaniti {
        etkinlikler: dosya.etkinlikler.clone(),
        kategoriler: dosya.kategoriler.clone(),
        uyari,
    })
}

#[tauri::command]
pub fn etkinlik_kaydet(
    app: AppHandle,
    durum: State<'_, Arc<Paylasilan>>,
    mut etkinlik: Etkinlik,
) -> Sonuc<Etkinlik> {
    let simdi = Local::now().naive_local();
    if etkinlik.id.is_empty() {
        etkinlik.id = yeni_kimlik();
        etkinlik.olusturuldu = Some(simdi);
    }
    etkinlik.guncellendi = Some(simdi);

    {
        let mut dosya = durum.dosya.lock().map_err(|_| "kilit alinamadi")?;
        match dosya.etkinlikler.iter_mut().find(|e| e.id == etkinlik.id) {
            Some(mevcut) => {
                // Olusturulma zamanini koru.
                etkinlik.olusturuldu = mevcut.olusturuldu.or(Some(simdi));
                *mevcut = etkinlik.clone();
            }
            None => dosya.etkinlikler.push(etkinlik.clone()),
        }

        // Yeni bir kategori adi girildiyse listeye ekle ki renk alsin.
        if !dosya.kategoriler.iter().any(|k| k.ad == etkinlik.kategori) {
            let renk = sirasi_gelen_renk(dosya.kategoriler.len());
            dosya.kategoriler.push(Kategori {
                ad: etkinlik.kategori.clone(),
                renk,
                ikon: None,
            });
        }
    }

    durum.etkinlikleri_kaydet()?;
    yayinla(&app);
    Ok(etkinlik)
}

#[tauri::command]
pub fn etkinlik_sil(app: AppHandle, durum: State<'_, Arc<Paylasilan>>, id: String) -> Sonuc<()> {
    {
        let mut dosya = durum.dosya.lock().map_err(|_| "kilit alinamadi")?;
        dosya.etkinlikler.retain(|e| e.id != id);
    }
    {
        // Silinen etkinligin bekleyen alarmlari da gitsin.
        let mut kuyruk = durum.alarm_kuyrugu.lock().map_err(|_| "kilit")?;
        kuyruk.retain(|t| t.etkinlik_id != id);
    }
    durum.etkinlikleri_kaydet()?;
    yayinla(&app);
    let _ = app.emit("alarm-guncellendi", ());
    Ok(())
}

/// Birden cok etkinligi tek seferde siler; silinen sayisini dondurur.
///
/// Tek tek `etkinlik_sil` cagirmak yerine bu var, cunku her cagri dosyayi
/// bastan yaziyor ve tum pencereleri tazeliyor: 80 seanslik bir plani silmek
/// 80 yazma + 80 tazeleme demekti.
#[tauri::command]
pub fn etkinlikleri_sil(
    app: AppHandle,
    durum: State<'_, Arc<Paylasilan>>,
    idler: Vec<String>,
) -> Sonuc<usize> {
    if idler.is_empty() {
        return Ok(0);
    }
    let kume: std::collections::HashSet<&str> = idler.iter().map(|s| s.as_str()).collect();

    let silinen = {
        let mut dosya = durum.dosya.lock().map_err(|_| "kilit alinamadi")?;
        let onceki = dosya.etkinlikler.len();
        dosya.etkinlikler.retain(|e| !kume.contains(e.id.as_str()));
        onceki - dosya.etkinlikler.len()
    };
    {
        let mut kuyruk = durum.alarm_kuyrugu.lock().map_err(|_| "kilit")?;
        kuyruk.retain(|t| !kume.contains(t.etkinlik_id.as_str()));
    }

    durum.etkinlikleri_kaydet()?;
    yayinla(&app);
    let _ = app.emit("alarm-guncellendi", ());
    Ok(silinen)
}

// ------------------------------------------------------------ kategoriler

/// Kategori ekler veya gunceller.
///
/// `eski_ad` verilirse yeniden adlandirma yapilir: o kategorideki etkinlikler
/// de yeni ada tasinir, yoksa kategorisiz kalip rengini kaybederlerdi.
#[tauri::command]
pub fn kategori_kaydet(
    app: AppHandle,
    durum: State<'_, Arc<Paylasilan>>,
    mut kategori: Kategori,
    eski_ad: Option<String>,
) -> Sonuc<()> {
    kategori.ad = kategori.ad.trim().to_string();
    if kategori.ad.is_empty() {
        return Err("Kategori adı boş olamaz.".into());
    }
    if kategori.ad.chars().count() > 30 {
        return Err("Kategori adı en fazla 30 karakter olabilir.".into());
    }

    {
        let mut dosya = durum.dosya.lock().map_err(|_| "kilit alinamadi")?;

        // Ayni ad iki kez olmasin (buyuk/kucuk harf farki da sayilmaz).
        let cakisma = dosya.kategoriler.iter().any(|k| {
            k.ad.to_lowercase() == kategori.ad.to_lowercase()
                && Some(&k.ad) != eski_ad.as_ref()
        });
        if cakisma {
            return Err(format!("\"{}\" adında bir kategori zaten var.", kategori.ad));
        }

        match eski_ad.as_deref() {
            Some(eski) => {
                let yer = dosya
                    .kategoriler
                    .iter()
                    .position(|k| k.ad == eski)
                    .ok_or("kategori bulunamadi")?;
                dosya.kategoriler[yer] = kategori.clone();

                if eski != kategori.ad {
                    for e in dosya.etkinlikler.iter_mut().filter(|e| e.kategori == eski) {
                        e.kategori = kategori.ad.clone();
                    }
                }
            }
            None => dosya.kategoriler.push(kategori.clone()),
        }
    }

    durum.etkinlikleri_kaydet()?;
    yayinla(&app);
    Ok(())
}

/// Kategoriyi siler.
///
/// `etkinlikleri_de_sil` true ise kategorideki etkinlikler de gider; degilse
/// "genel"e tasinirlar. Silinen etkinlik sayisi doner.
#[tauri::command]
pub fn kategori_sil(
    app: AppHandle,
    durum: State<'_, Arc<Paylasilan>>,
    ad: String,
    etkinlikleri_de_sil: bool,
) -> Sonuc<usize> {
    // Silinen etkinliklerin id'leri; kuyruk bunlara gore temizlenecek.
    // Iki kilit ic ice alinmiyor: once dosya isi bitiyor, sonra kuyruk.
    let mut silinen_idler: Vec<String> = Vec::new();

    let silinen = {
        let mut dosya = durum.dosya.lock().map_err(|_| "kilit alinamadi")?;
        if !dosya.kategoriler.iter().any(|k| k.ad == ad) {
            return Err("kategori bulunamadi".into());
        }
        dosya.kategoriler.retain(|k| k.ad != ad);

        if etkinlikleri_de_sil {
            let onceki = dosya.etkinlikler.len();
            silinen_idler = dosya
                .etkinlikler
                .iter()
                .filter(|e| e.kategori == ad)
                .map(|e| e.id.clone())
                .collect();
            dosya.etkinlikler.retain(|e| e.kategori != ad);
            onceki - dosya.etkinlikler.len()
        } else {
            for e in dosya.etkinlikler.iter_mut().filter(|e| e.kategori == ad) {
                e.kategori = "genel".to_string();
            }
            // "genel" silinmisse geri gelsin; etkinlikler renksiz kalmasin.
            if !dosya.kategoriler.iter().any(|k| k.ad == "genel") {
                dosya
                    .kategoriler
                    .insert(0, Kategori::yeni("genel", "#c9a227", "etiket"));
            }
            0
        }
    };

    if !silinen_idler.is_empty() {
        let mut kuyruk = durum.alarm_kuyrugu.lock().map_err(|_| "kilit")?;
        kuyruk.retain(|t| !silinen_idler.contains(&t.etkinlik_id));
    }

    durum.etkinlikleri_kaydet()?;
    yayinla(&app);
    let _ = app.emit("alarm-guncellendi", ());
    Ok(silinen)
}

#[tauri::command]
pub fn olusum_tamamla(
    app: AppHandle,
    durum: State<'_, Arc<Paylasilan>>,
    id: String,
    olusum: String,
    tamamlandi: bool,
) -> Sonuc<()> {
    let an = zaman_coz(&olusum)?;
    {
        let mut dosya = durum.dosya.lock().map_err(|_| "kilit alinamadi")?;
        let e = dosya
            .etkinlikler
            .iter_mut()
            .find(|e| e.id == id)
            .ok_or("etkinlik bulunamadi")?;

        if tamamlandi {
            if !e.tamamlananlar.contains(&an) {
                e.tamamlananlar.push(an);
            }
        } else {
            e.tamamlananlar.retain(|t| *t != an);
        }
    }
    durum.etkinlikleri_kaydet()?;
    yayinla(&app);
    Ok(())
}

#[tauri::command]
pub fn olusum_atla(
    app: AppHandle,
    durum: State<'_, Arc<Paylasilan>>,
    id: String,
    gun: String,
) -> Sonuc<()> {
    let tarih = NaiveDate::parse_from_str(&gun, "%Y-%m-%d").map_err(|e| e.to_string())?;
    {
        let mut dosya = durum.dosya.lock().map_err(|_| "kilit alinamadi")?;
        let e = dosya
            .etkinlikler
            .iter_mut()
            .find(|e| e.id == id)
            .ok_or("etkinlik bulunamadi")?;
        if !e.tekrar.istisnalar.contains(&tarih) {
            e.tekrar.istisnalar.push(tarih);
        }
    }
    durum.etkinlikleri_kaydet()?;
    yayinla(&app);
    Ok(())
}

// --------------------------------------------------------------- programlar

/// Program sablonlarini dondurur.
///
/// Bozuk dosya uyarisi burada dondurulmuyor: tek bir uyari yuvasi var ve
/// `etkinlikleri_getir` onu zaten aliyor (bkz. servis.rs `acilis_uyarisi`).
#[tauri::command]
pub fn programlari_getir(durum: State<'_, Arc<Paylasilan>>) -> Sonuc<Vec<Program>> {
    let d = durum.programlar.lock().map_err(|_| "kilit alinamadi")?;
    Ok(d.programlar.clone())
}

/// Program tanimini ekler veya gunceller. Takvime dokunmaz - uretim ayri
/// adim (`program_etkinlikleri_yaz`), boylece uykudaki program kaydedilebilir.
#[tauri::command]
pub fn program_kaydet(
    app: AppHandle,
    durum: State<'_, Arc<Paylasilan>>,
    mut program: Program,
) -> Sonuc<Program> {
    let simdi = Local::now().naive_local();
    if program.id.is_empty() {
        program.id = yeni_kimlik();
        program.olusturuldu = Some(simdi);
    }
    program.guncellendi = Some(simdi);

    {
        let mut d = durum.programlar.lock().map_err(|_| "kilit alinamadi")?;
        match d.programlar.iter_mut().find(|p| p.id == program.id) {
            Some(mevcut) => {
                program.olusturuldu = mevcut.olusturuldu.or(Some(simdi));
                *mevcut = program.clone();
            }
            None => d.programlar.push(program.clone()),
        }
    }

    durum.programlari_kaydet()?;
    yayinla(&app);
    Ok(program)
}

/// Program tanimini siler. `etkinlikleriDeSil` ise takvimdeki izini de
/// (gune ozel kopyalar dahil) temizler; silinen etkinlik sayisini dondurur.
#[tauri::command]
pub fn program_sil(
    app: AppHandle,
    durum: State<'_, Arc<Paylasilan>>,
    id: String,
    etkinlikleri_de_sil: bool,
) -> Sonuc<usize> {
    {
        let mut d = durum.programlar.lock().map_err(|_| "kilit alinamadi")?;
        d.programlar.retain(|p| p.id != id);
    }
    durum.programlari_kaydet()?;

    let mut silinen = 0;
    if etkinlikleri_de_sil {
        let gidenler: Vec<String> = {
            let mut dosya = durum.dosya.lock().map_err(|_| "kilit alinamadi")?;
            let gidenler: Vec<String> = dosya
                .etkinlikler
                .iter()
                .filter(|e| e.programa_ait_mi(&id))
                .map(|e| e.id.clone())
                .collect();
            dosya.etkinlikler.retain(|e| !e.programa_ait_mi(&id));
            gidenler
        };
        silinen = gidenler.len();
        if silinen > 0 {
            let kume: std::collections::HashSet<&str> =
                gidenler.iter().map(|s| s.as_str()).collect();
            let mut kuyruk = durum.alarm_kuyrugu.lock().map_err(|_| "kilit")?;
            kuyruk.retain(|t| !kume.contains(t.etkinlik_id.as_str()));
        }
        durum.etkinlikleri_kaydet()?;
    }

    yayinla(&app);
    let _ = app.emit("alarm-guncellendi", ());
    Ok(silinen)
}

/// Programin takvimdeki seri kayitlarini tek yazmada degistirir.
///
/// Bu programa bagli TUM seri kayitlari (`program.gun` bos olanlar) silinir ve
/// verilenler yazilir. Gune ozel kopyalara dokunulmaz - kullanicinin elle
/// duzenledigi gun program guncellemesinde kaybolmasin diye.
///
/// `ayrilacak`, artik programin kapsamadigi bir gune dusen kopyalarin
/// id'leri: silinmiyorlar, yalnizca program bagi kopariliyor. Boylece elle
/// yazilmis icerik siradan bir etkinlik olarak takvimde kaliyor.
///
/// Tek komut olmasinin sebebi atomiklik: ayri ayri cagrilar iki dosya yazmasi,
/// iki tam tazeleme ve ikincisi patlarsa yirtik durum demekti.
#[tauri::command]
pub fn program_etkinlikleri_yaz(
    app: AppHandle,
    durum: State<'_, Arc<Paylasilan>>,
    program_id: String,
    etkinlikler: Vec<Etkinlik>,
    ayrilacak: Vec<String>,
) -> Sonuc<usize> {
    let simdi = Local::now().naive_local();
    let ayrilacak_kume: std::collections::HashSet<&str> =
        ayrilacak.iter().map(|s| s.as_str()).collect();

    let dusenler: Vec<String> = {
        let mut dosya = durum.dosya.lock().map_err(|_| "kilit alinamadi")?;

        // Eski seri kayitlari: olusturulma zamanlarini korumak icin once not al.
        let mut eski_olusturuldu: std::collections::HashMap<String, NaiveDateTime> =
            std::collections::HashMap::new();
        let mut dusenler = Vec::new();
        for e in dosya.etkinlikler.iter() {
            if !e.program_serisi_mi(&program_id) {
                continue;
            }
            dusenler.push(e.id.clone());
            if let Some(o) = e.olusturuldu {
                eski_olusturuldu.insert(e.id.clone(), o);
            }
        }
        dosya.etkinlikler.retain(|e| !e.program_serisi_mi(&program_id));

        // Programdan dusen gunlerin kopyalari: silme, yalnizca bagi kopar.
        for e in dosya.etkinlikler.iter_mut() {
            if ayrilacak_kume.contains(e.id.as_str()) {
                e.program = None;
                e.guncellendi = Some(simdi);
            }
        }

        for mut e in etkinlikler {
            if e.id.is_empty() {
                e.id = yeni_kimlik();
            }
            e.olusturuldu = eski_olusturuldu.get(&e.id).copied().or(Some(simdi));
            e.guncellendi = Some(simdi);

            // Yeni kategori adi girildiyse listeye ekle ki renk alsin.
            if !dosya.kategoriler.iter().any(|k| k.ad == e.kategori) {
                let renk = sirasi_gelen_renk(dosya.kategoriler.len());
                dosya.kategoriler.push(Kategori {
                    ad: e.kategori.clone(),
                    renk,
                    ikon: None,
                });
            }
            dosya.etkinlikler.push(e);
        }

        dusenler
    };

    {
        // Silinen seri kayitlarinin bekleyen alarmlari da gitsin.
        let kume: std::collections::HashSet<&str> =
            dusenler.iter().map(|s| s.as_str()).collect();
        let mut kuyruk = durum.alarm_kuyrugu.lock().map_err(|_| "kilit")?;
        kuyruk.retain(|t| !kume.contains(t.etkinlik_id.as_str()));
    }

    let yazilan = {
        let dosya = durum.dosya.lock().map_err(|_| "kilit alinamadi")?;
        dosya
            .etkinlikler
            .iter()
            .filter(|e| e.program_serisi_mi(&program_id))
            .count()
    };

    durum.etkinlikleri_kaydet()?;
    yayinla(&app);
    let _ = app.emit("alarm-guncellendi", ());
    Ok(yazilan)
}

/// Bir gunu seriden ayirir: o tarih serinin istisnalarina girer ve verilen
/// icerik tek seferlik bir kopya olarak takvime yazilir.
///
/// Uc is tek yazmada yapiliyor cunku ayri cagrilar (once `olusum_atla`, sonra
/// `etkinlik_kaydet`) arasinda ikincisi patlarsa gun bosta kalirdi.
/// Tamamlanma da tasiniyor: yapilmis bir seansi ayirmak onu sessizce
/// tamamlanmamisa cevirmesin.
#[tauri::command]
pub fn olusum_ayir(
    app: AppHandle,
    durum: State<'_, Arc<Paylasilan>>,
    id: String,
    gun: String,
    mut etkinlik: Etkinlik,
) -> Sonuc<Etkinlik> {
    let tarih = NaiveDate::parse_from_str(&gun, "%Y-%m-%d").map_err(|e| e.to_string())?;
    let simdi = Local::now().naive_local();

    if etkinlik.id.is_empty() {
        etkinlik.id = yeni_kimlik();
    }
    etkinlik.olusturuldu = Some(simdi);
    etkinlik.guncellendi = Some(simdi);
    // Kopya tek seferliktir; tekrar kurali seride kalir.
    etkinlik.tekrar = Tekrar::default();

    {
        let mut dosya = durum.dosya.lock().map_err(|_| "kilit alinamadi")?;

        let tamamlanmis = {
            let seri = dosya
                .etkinlikler
                .iter_mut()
                .find(|e| e.id == id)
                .ok_or("etkinlik bulunamadi")?;
            let bag = seri
                .program
                .clone()
                .ok_or("bu etkinlik bir programa ait degil")?;
            if !bag.seri_mi() {
                return Err("bu kayit zaten bir gune ozel kopya".to_string());
            }

            etkinlik.program = Some(ProgramBagi {
                program_id: bag.program_id,
                oge_id: bag.oge_id,
                gun: Some(tarih),
            });

            if !seri.tekrar.istisnalar.contains(&tarih) {
                seri.tekrar.istisnalar.push(tarih);
            }

            let vardi = seri.tamamlananlar.iter().any(|t| t.date() == tarih);
            seri.tamamlananlar.retain(|t| t.date() != tarih);
            vardi
        };

        if tamamlanmis && !etkinlik.tamamlananlar.contains(&etkinlik.baslangic) {
            etkinlik.tamamlananlar.push(etkinlik.baslangic);
        }

        dosya.etkinlikler.push(etkinlik.clone());
    }

    {
        // Bugunun alarmi calmissa kopyanin yeni id'si yuzunden yeniden
        // calmasin: defterdeki anahtarlari yeni kimlige tasiyoruz.
        let mut d = durum.durum.lock().map_err(|_| "kilit alinamadi")?;
        let yeni_zaman = etkinlik.baslangic.format("%Y-%m-%dT%H:%M:%S").to_string();
        for anahtar in d.calanlar.iter_mut() {
            let Ok((a_id, olusum, dakika)) = anahtari_coz(anahtar) else {
                continue;
            };
            if a_id != id || olusum.date() != tarih {
                continue;
            }
            *anahtar = format!("{}@{}#{}", etkinlik.id, yeni_zaman, dakika);
        }
    }

    durum.etkinlikleri_kaydet()?;
    durum.durumu_kaydet()?;
    yayinla(&app);
    let _ = app.emit("alarm-guncellendi", ());
    Ok(etkinlik)
}

/// Ayirmayi (ya da "sadece bu gunu atla"yi) geri alir: istisna kalkar, varsa
/// gune ozel kopya silinir, tamamlanma seriye geri tasinir.
///
/// Bu komut olmadan su dizi gunu kalici olarak bosaltirdi: kullanici gunu
/// ayirir, sonra vazgecip kopyayi siler, istisna sonsuza kadar kalir.
#[tauri::command]
pub fn olusum_birlestir(
    app: AppHandle,
    durum: State<'_, Arc<Paylasilan>>,
    id: String,
    gun: String,
) -> Sonuc<()> {
    let tarih = NaiveDate::parse_from_str(&gun, "%Y-%m-%d").map_err(|e| e.to_string())?;

    {
        let mut dosya = durum.dosya.lock().map_err(|_| "kilit alinamadi")?;

        let (bag, seri_saat) = {
            let seri = dosya
                .etkinlikler
                .iter()
                .find(|e| e.id == id)
                .ok_or("etkinlik bulunamadi")?;
            (seri.program.clone(), seri.baslangic.time())
        };

        // Bu gune ait kopyayi bul ve sil; tamamlanmissa seriye geri yaz.
        let mut tamamlanmisti = false;
        if let Some(b) = bag {
            dosya.etkinlikler.retain(|e| {
                let esles = e
                    .program
                    .as_ref()
                    .is_some_and(|k| {
                        k.program_id == b.program_id
                            && k.oge_id == b.oge_id
                            && k.gun == Some(tarih)
                    });
                if esles && !e.tamamlananlar.is_empty() {
                    tamamlanmisti = true;
                }
                !esles
            });
        }

        let seri = dosya
            .etkinlikler
            .iter_mut()
            .find(|e| e.id == id)
            .ok_or("etkinlik bulunamadi")?;
        seri.tekrar.istisnalar.retain(|t| *t != tarih);
        if tamamlanmisti {
            let an = tarih.and_time(seri_saat);
            if !seri.tamamlananlar.contains(&an) {
                seri.tamamlananlar.push(an);
            }
        }
    }

    durum.etkinlikleri_kaydet()?;
    yayinla(&app);
    let _ = app.emit("alarm-guncellendi", ());
    Ok(())
}

/// Programi tek dosyaya yazar. Yolu arayuz `plugin-dialog` ile seciyor,
/// dosya isini burasi yapiyor - `ses_ekle` ile ayni bolusum.
#[tauri::command]
pub fn program_disa_aktar(
    durum: State<'_, Arc<Paylasilan>>,
    id: String,
    yol: String,
) -> Sonuc<()> {
    let program = {
        let d = durum.programlar.lock().map_err(|_| "kilit alinamadi")?;
        d.programlar
            .iter()
            .find(|p| p.id == id)
            .cloned()
            .ok_or("program bulunamadi")?
    };
    let metin = serde_json::to_string_pretty(&ProgramAktarimi::sar(&program))
        .map_err(|e| e.to_string())?;
    std::fs::write(&yol, metin).map_err(|e| format!("yazilamadi: {e}"))
}

/// Program dosyasini okur, yeni kimlikle uykuda ekler.
#[tauri::command]
pub fn program_ice_aktar(
    app: AppHandle,
    durum: State<'_, Arc<Paylasilan>>,
    yol: String,
) -> Sonuc<Program> {
    let ham = std::fs::read_to_string(&yol).map_err(|e| format!("okunamadi: {e}"))?;
    // Not Defteri UTF-8 BOM ile kaydediyor; JSON ayristirici BOM'u bozuk sayar.
    let metin = ham.strip_prefix('\u{feff}').unwrap_or(&ham);

    let mut program = ProgramAktarimi::coz(metin)?;
    let simdi = Local::now().naive_local();
    program.id = yeni_kimlik();
    program.olusturuldu = Some(simdi);
    program.guncellendi = Some(simdi);

    {
        let mut d = durum.programlar.lock().map_err(|_| "kilit alinamadi")?;
        // Ayni baslikla ikinci bir program listede ayirt edilemezdi.
        let govde = if program.baslik.trim().is_empty() {
            "Program".to_string()
        } else {
            program.baslik.clone()
        };
        let mut ad = govde.clone();
        let mut sayi = 2;
        while d.programlar.iter().any(|p| p.baslik == ad) {
            ad = format!("{govde} ({sayi})");
            sayi += 1;
        }
        program.baslik = ad;
        d.programlar.push(program.clone());
    }

    durum.programlari_kaydet()?;
    yayinla(&app);
    Ok(program)
}

// --------------------------------------------------------------- ayarlar

#[tauri::command]
pub fn ayarlari_getir(durum: State<'_, Arc<Paylasilan>>) -> Sonuc<Ayarlar> {
    Ok(durum.ayarlar.lock().map_err(|_| "kilit alinamadi")?.clone())
}

#[tauri::command]
pub fn ayarlari_kaydet(
    app: AppHandle,
    durum: State<'_, Arc<Paylasilan>>,
    ayarlar: Ayarlar,
) -> Sonuc<()> {
    let (eski_acilis, eski_ustte, eski_kisayol, eski_boyut) = {
        let mevcut = durum.ayarlar.lock().map_err(|_| "kilit")?;
        (
            mevcut.acilista_baslat,
            mevcut.widget_ustte,
            mevcut.masaustu_kisayolu,
            mevcut.widget_boyut.clone(),
        )
    };

    *durum.ayarlar.lock().map_err(|_| "kilit")? = ayarlar.clone();
    durum.ayarlari_kaydet()?;

    if ayarlar.acilista_baslat != eski_acilis {
        crate::acilis::ayarla(&app, ayarlar.acilista_baslat)?;
    }
    if ayarlar.masaustu_kisayolu != eski_kisayol {
        crate::kisayol::ayarla(ayarlar.masaustu_kisayolu)?;
    }
    if ayarlar.widget_boyut != eski_boyut {
        pencere::widget_boyutla(&app, &ayarlar.widget_boyut);
    }
    if ayarlar.widget_ustte != eski_ustte {
        if let Some(p) = app.get_webview_window(pencere::WIDGET) {
            let _ = p.set_always_on_top(ayarlar.widget_ustte);
        }
    }

    let _ = app.emit("ayarlar-degisti", &ayarlar);
    Ok(())
}

// ------------------------------------------------------------------- ses

/// Zil sesi olarak kabul edilen uzantilar. WebView2'nin caldigi bicimler;
/// listeye yenisi eklenecekse once orada caldigi dogrulanmali.
pub const UZANTILAR: [&str; 5] = ["mp3", "wav", "ogg", "m4a", "flac"];

#[tauri::command]
pub fn sesleri_listele() -> Sonuc<Vec<String>> {
    let klasor = depo::sesler_klasoru();

    let mut liste: Vec<String> = std::fs::read_dir(klasor)
        .map_err(|e| e.to_string())?
        .flatten()
        .filter_map(|g| {
            let yol = g.path();
            let uzanti = yol.extension()?.to_str()?.to_lowercase();
            if !UZANTILAR.contains(&uzanti.as_str()) {
                return None;
            }
            Some(yol.file_name()?.to_str()?.to_string())
        })
        .collect();
    liste.sort();
    Ok(liste)
}

/// En buyuk zil sesi boyutu. Zil sesi birkac saniyelik olur; bundan buyugu
/// muhtemelen yanlislikla klasore atilmis bir sarki.
const AZAMI_SES_BOYUTU: u64 = 12 * 1024 * 1024;

/// Kullanicinin sectigi ses dosyasini sesler klasorune kopyalar ve klasordeki
/// adini dondurur.
///
/// Kopyalaniyor, yol olarak tutulmuyor: uygulama tasinabilir ve kullanici
/// dosyayi Indirilenler'den silince alarm sessiz kalmasin.
#[tauri::command]
pub fn ses_ekle(kaynak: String) -> Sonuc<String> {
    let yol = std::path::PathBuf::from(&kaynak);

    let uzanti = yol
        .extension()
        .and_then(|u| u.to_str())
        .map(|u| u.to_lowercase())
        .unwrap_or_default();
    if !UZANTILAR.contains(&uzanti.as_str()) {
        return Err(format!(
            "{uzanti} desteklenmiyor. Kabul edilenler: {}",
            UZANTILAR.join(", ")
        ));
    }

    let bilgi = std::fs::metadata(&yol).map_err(|e| format!("dosya okunamadi: {e}"))?;
    if !bilgi.is_file() {
        return Err("bu bir dosya degil".into());
    }
    if bilgi.len() > AZAMI_SES_BOYUTU {
        return Err(format!(
            "Dosya çok büyük ({} MB). Zil sesi 12 MB'ın altında olmalı.",
            bilgi.len() / 1024 / 1024
        ));
    }

    let govde = yol
        .file_stem()
        .and_then(|a| a.to_str())
        .map(temiz_dosya_adi)
        .filter(|a| !a.is_empty())
        .ok_or("dosya adi cozulemedi")?;

    let klasor = depo::sesler_klasoru();
    // Ayni ada sahip bir ses varsa ustune yazmiyoruz: kullanicinin onceden
    // sectigi zil sessizce degisebilirdi.
    let mut ad = format!("{govde}.{uzanti}");
    let mut sayi = 2;
    while klasor.join(&ad).exists() {
        ad = format!("{govde}-{sayi}.{uzanti}");
        sayi += 1;
    }

    std::fs::copy(&yol, klasor.join(&ad)).map_err(|e| format!("kopyalanamadi: {e}"))?;
    Ok(ad)
}

/// Dosya adini klasore yazmaya guvenli hale getirir: yol ayraclari, Windows'un
/// yasakli karakterleri ve bosluklar sadelestirilir.
fn temiz_dosya_adi(ad: &str) -> String {
    // Windows'ta dosya adinda yasak olan karakterler + yol ayraclari.
    const YASAK: &str = r#"/\:*?"<>|"#;
    let temiz: String = ad
        .chars()
        .map(|k| if YASAK.contains(k) || k.is_control() { '-' } else { k })
        .collect();
    // Uzun adlar kirpiliyor; kirpma sonrasi tekrar temizlemek sart, cunku
    // bastaki nokta gizli dosya yapiyor, sondaki nokta/bosluk ise Windows'ta
    // gecersiz bir ad birakiyor.
    let temiz: String = temiz.chars().take(60).collect();
    temiz.trim().trim_matches('.').trim().to_string()
}

/// Ses dosyasinin ham baytlarini dondurur.
///
/// Asset protokolu yerine bu yol secildi: uygulama tasinabilir, yani veri
/// klasorunun yolu derleme aninda bilinmiyor ve asset kapsamini onceden
/// tanimlamak mumkun degil. Zil sesleri kucuk oldugu icin baytlari dogrudan
/// gondermek hem daha basit hem de kapsam/izin hatasi riski tasimiyor.
#[tauri::command]
pub fn ses_verisi(dosya: String) -> Result<tauri::ipc::Response, String> {
    // Yalnizca dosya adi kabul ediliyor: ayrac veya ".." ile sesler
    // klasorunun disina cikilamasin.
    if dosya.contains(['/', '\\']) || dosya.contains("..") {
        return Err("gecersiz dosya adi".into());
    }
    let yol = depo::sesler_klasoru().join(&dosya);

    let bilgi = std::fs::metadata(&yol).map_err(|_| format!("ses bulunamadi: {dosya}"))?;
    if !bilgi.is_file() {
        return Err(format!("ses bulunamadi: {dosya}"));
    }
    if bilgi.len() > AZAMI_SES_BOYUTU {
        return Err(format!(
            "{dosya} çok büyük ({} MB). Zil sesi 12 MB'ın altında olmalı.",
            bilgi.len() / 1024 / 1024
        ));
    }

    let baytlar = std::fs::read(&yol).map_err(|e| e.to_string())?;
    Ok(tauri::ipc::Response::new(baytlar))
}

// ----------------------------------------------------------------- alarm

#[tauri::command]
pub fn alarm_kuyrugu(durum: State<'_, Arc<Paylasilan>>) -> Sonuc<Vec<Tetiklenen>> {
    Ok(durum.alarm_kuyrugu.lock().map_err(|_| "kilit")?.clone())
}

/// Kuyruktan cikarir; bos kalirsa alarm penceresini kapatir.
fn kuyruktan_cikar(app: &AppHandle, durum: &Arc<Paylasilan>, anahtar: &str) -> Sonuc<()> {
    let bos_kaldi = {
        let mut kuyruk = durum.alarm_kuyrugu.lock().map_err(|_| "kilit")?;
        kuyruk.retain(|t| t.anahtar() != anahtar);
        kuyruk.is_empty()
    };
    if bos_kaldi {
        pencere::alarmi_kapat(app);
    }
    Ok(())
}

#[tauri::command]
pub fn alarm_kapat(
    app: AppHandle,
    durum: State<'_, Arc<Paylasilan>>,
    anahtar: String,
) -> Sonuc<()> {
    kuyruktan_cikar(&app, &durum, &anahtar)
}

#[tauri::command]
pub fn alarm_tamamla(
    app: AppHandle,
    durum: State<'_, Arc<Paylasilan>>,
    anahtar: String,
) -> Sonuc<()> {
    let (id, olusum, _) = anahtari_coz(&anahtar)?;
    {
        let mut dosya = durum.dosya.lock().map_err(|_| "kilit")?;
        if let Some(e) = dosya.etkinlikler.iter_mut().find(|e| e.id == id) {
            if !e.tamamlananlar.contains(&olusum) {
                e.tamamlananlar.push(olusum);
            }
        }
    }
    durum.etkinlikleri_kaydet()?;

    // Ayni olusuma ait diger hatirlatmalar da artik gereksiz
    // ("10 dk once" caldiktan sonra tamamlandiysa "tam saatinde" calmasin).
    {
        let onek = format!("{id}@{}", olusum.format("%Y-%m-%dT%H:%M:%S"));
        let mut kuyruk = durum.alarm_kuyrugu.lock().map_err(|_| "kilit")?;
        kuyruk.retain(|t| !t.anahtar().starts_with(&onek));
        if kuyruk.is_empty() {
            pencere::alarmi_kapat(&app);
        }
    }

    yayinla(&app);
    Ok(())
}

#[tauri::command]
pub fn alarm_ertele(
    app: AppHandle,
    durum: State<'_, Arc<Paylasilan>>,
    anahtar: String,
    dakika: i64,
) -> Sonuc<()> {
    let yeni_zaman = Local::now().naive_local() + Duration::minutes(dakika.max(1));
    {
        let mut d = durum.durum.lock().map_err(|_| "kilit")?;
        d.ertele(anahtar.clone(), yeni_zaman);
        // Erteleme, "bu caldi" kaydini geri alir; yoksa tekrar calamaz.
        d.calanlar.retain(|a| a != &anahtar);
    }
    durum.durumu_kaydet()?;
    kuyruktan_cikar(&app, &durum, &anahtar)
}

// --------------------------------------------------------------- pencere

/// `async`: pencere olusturma ana is parcaciginda calisirsa kilitleniyor
/// (bkz. pencere.rs basindaki not). Tauri async komutlari ayri havuzda kosar.
#[tauri::command]
pub async fn widget_gorunurluk(
    app: AppHandle,
    durum: State<'_, Arc<Paylasilan>>,
    gorunur: bool,
) -> Sonuc<()> {
    if gorunur {
        pencere::widgeti_goster(&app).map_err(|e| e.to_string())?;
    } else {
        pencere::widget_konumunu_kaydet(&app);
        pencere::widgeti_gizle(&app).map_err(|e| e.to_string())?;
    }
    durum.ayarlar.lock().map_err(|_| "kilit")?.widget_gorunur = gorunur;
    durum.ayarlari_kaydet()
}

/// Widget'in kendi uzerindeki kucult/buyut dugmesi icin.
/// Ayarlar panelini acmaya gerek kalmadan kip degistirir.
#[tauri::command]
pub async fn widget_boyut_degistir(
    app: AppHandle,
    durum: State<'_, Arc<Paylasilan>>,
    kip: String,
) -> Sonuc<()> {
    {
        let mut a = durum.ayarlar.lock().map_err(|_| "kilit")?;
        a.widget_boyut = kip.clone();
        // Kayitli olcuyu sifirla ki yeni kip kendi olcusune otursun.
        let (g, y) = pencere::widget_olcusu(&kip);
        a.widget_genislik = Some(g);
        a.widget_yukseklik = Some(y);
    }
    pencere::widget_boyutla(&app, &kip);
    durum.ayarlari_kaydet()?;

    let a = durum.ayarlar.lock().map_err(|_| "kilit")?.clone();
    let _ = app.emit("ayarlar-degisti", a);
    Ok(())
}

#[tauri::command]
pub async fn takvimi_ac(app: AppHandle) -> Sonuc<()> {
    pencere::anayi_goster(&app).map_err(|e| e.to_string())
}

/// Masaustunde kisayol var mi? Ayar ile gercek durum ayrisabilir (kullanici
/// kisayolu elle silmis olabilir), o yuzden diske bakiyoruz.
#[tauri::command]
pub fn kisayol_durumu() -> bool {
    crate::kisayol::var_mi()
}

#[tauri::command]
pub fn kisayol_ayarla(durum: State<'_, Arc<Paylasilan>>, olsun: bool) -> Sonuc<()> {
    crate::kisayol::ayarla(olsun)?;
    durum.ayarlar.lock().map_err(|_| "kilit")?.masaustu_kisayolu = olsun;
    durum.ayarlari_kaydet()
}

/// Program icerigindeki bir baglantiyi tarayicida acar.
///
/// Sema kontrolu burada, cunku ice aktarilan program dosyasi guvenilmez
/// girdi: `file:` ya da rastgele bir sema isleyicisi acilmamali. Arayuz
/// tarafinda da kontrol var ama karar mercii burasi.
#[tauri::command]
pub fn baglanti_ac(app: AppHandle, url: String) -> Sonuc<()> {
    let temiz = url.trim();
    if !(temiz.starts_with("http://") || temiz.starts_with("https://")) {
        return Err("yalnizca http/https baglantilari acilabilir".to_string());
    }
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url(temiz, None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn veri_klasorunu_ac(app: AppHandle) -> Sonuc<()> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_path(depo::veri_klasoru().to_string_lossy(), None::<&str>)
        .map_err(|e| e.to_string())
}

// ------------------------------------------------------------ yardimcilar

/// Anahtar bicimi: "<etkinlikId>@<olusum>#<dakikaOnce>"
fn anahtari_coz(anahtar: &str) -> Sonuc<(String, NaiveDateTime, i64)> {
    let (id, kalan) = anahtar.split_once('@').ok_or("gecersiz anahtar")?;
    let (olusum, dakika) = kalan.split_once('#').ok_or("gecersiz anahtar")?;
    Ok((
        id.to_string(),
        zaman_coz(olusum)?,
        dakika.parse().map_err(|_| "gecersiz dakika")?,
    ))
}

fn zaman_coz(s: &str) -> Sonuc<NaiveDateTime> {
    NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S")
        .or_else(|_| NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M"))
        .map_err(|e| format!("zaman cozulemedi ({s}): {e}"))
}

/// Yeni kategoriler tokens.css'teki kategori paletinden sirayla renk alir.
fn sirasi_gelen_renk(sira: usize) -> String {
    const PALET: [&str; 8] = [
        "#c9a227", "#6aa9d6", "#7fa356", "#d2775a",
        "#9b8ec4", "#5fa89a", "#c98fa8", "#8a8f98",
    ];
    PALET[sira % PALET.len()].to_string()
}

/// Zaman damgasi + sayac tabanli kimlik. Tek kullanicili yerel bir uygulama
/// icin yeterli; UUID bagimliligi getirmeye degmez.
fn yeni_kimlik() -> String {
    use std::sync::atomic::{AtomicU32, Ordering};
    static SAYAC: AtomicU32 = AtomicU32::new(0);
    let n = SAYAC.fetch_add(1, Ordering::Relaxed);
    format!(
        "{}-{:04x}",
        Local::now().format("%Y%m%d%H%M%S%3f"),
        n & 0xffff
    )
}

#[cfg(test)]
mod testler {
    use super::*;

    #[test]
    fn anahtar_cozulur() {
        let (id, olusum, dk) = anahtari_coz("abc@2026-09-12T09:00:00#10").unwrap();
        assert_eq!(id, "abc");
        assert_eq!(olusum.format("%Y-%m-%d %H:%M").to_string(), "2026-09-12 09:00");
        assert_eq!(dk, 10);
    }

    #[test]
    fn bozuk_anahtar_hata_verir() {
        assert!(anahtari_coz("bozuk").is_err());
        assert!(anahtari_coz("a@bozuk#0").is_err());
    }

    #[test]
    fn kimlikler_benzersiz() {
        let a = yeni_kimlik();
        let b = yeni_kimlik();
        assert_ne!(a, b);
    }
}
