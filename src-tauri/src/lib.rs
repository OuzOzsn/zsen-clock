//! Zsen Clock - masaustu takvim ve alarm uygulamasi.
//!
//! Uygulama tepside yasar. Pencereler gelip gider, zamanlayici hep calisir.
//! Saf mantik (tekrar kurallari, zamanlama, dosya deposu) `cekirdek`
//! crate'inde; burasi yalnizca Tauri'ye baglama katmani.

mod acilis;
mod kisayol;
mod komutlar;
mod odak;
mod pencere;
mod servis;
mod tepsi;

use std::sync::Arc;

use tauri::{Manager, WindowEvent};

use cekirdek::depo;
use servis::Paylasilan;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if let Err(e) = depo::hazirla() {
        eprintln!("[acilis] veri klasoru hazirlanamadi: {e}");
    }

    tauri::Builder::default()
        // Ikinci kopya acilirsa: yeni pencere acmak yerine var olani one getir.
        // Aksi halde ayni alarm iki kez calar.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            // Pencere acmak ana is parcaciginda kilitlenmeye yol aciyor.
            let h = app.clone();
            std::thread::spawn(move || {
                let _ = pencere::anayi_goster(&h);
            });
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .invoke_handler(tauri::generate_handler![
            komutlar::etkinlikleri_getir,
            komutlar::etkinlik_kaydet,
            komutlar::etkinlik_sil,
            komutlar::etkinlikleri_sil,
            komutlar::kategori_kaydet,
            komutlar::kategori_sil,
            komutlar::olusum_tamamla,
            komutlar::olusum_atla,
            komutlar::olusum_ayir,
            komutlar::olusum_birlestir,
            komutlar::programlari_getir,
            komutlar::program_kaydet,
            komutlar::program_sil,
            komutlar::program_etkinlikleri_yaz,
            komutlar::program_disa_aktar,
            komutlar::program_ice_aktar,
            komutlar::ayarlari_getir,
            komutlar::ayarlari_kaydet,
            komutlar::sesleri_listele,
            komutlar::ses_verisi,
            komutlar::ses_ekle,
            komutlar::alarm_kuyrugu,
            komutlar::alarm_kapat,
            komutlar::alarm_tamamla,
            komutlar::alarm_ertele,
            komutlar::widget_gorunurluk,
            komutlar::widget_boyut_degistir,
            komutlar::takvimi_ac,
            komutlar::veri_klasorunu_ac,
            komutlar::baglanti_ac,
            komutlar::kisayol_durumu,
            komutlar::kisayol_ayarla,
        ])
        .setup(|app| {
            let paylasilan = Arc::new(Paylasilan::yukle());
            let (widget_gorunur, simge_durumunda, acilista_baslat) = {
                let a = paylasilan.ayarlar.lock().unwrap();
                (a.widget_gorunur, a.simge_durumunda_basla, a.acilista_baslat)
            };
            app.manage(paylasilan);

            let h = app.handle().clone();
            tepsi::kur(&h)?;
            acilis::esitle(&h, acilista_baslat);

            if widget_gorunur {
                pencere::widgeti_goster(&h)?;
            }
            // Simge durumunda baslama secilmediyse takvimi de ac.
            if !simge_durumunda {
                pencere::anayi_goster(&h)?;
            }

            servis::baslat(h);
            Ok(())
        })
        .on_window_event(|pencere_ref, olay| {
            if let WindowEvent::CloseRequested { api, .. } = olay {
                let etiket = pencere_ref.label().to_string();
                let app = pencere_ref.app_handle();

                match etiket.as_str() {
                    // Widget'in X'i uygulamayi kapatmaz, widget'i gizler.
                    pencere::WIDGET => {
                        api.prevent_close();
                        pencere::widget_konumunu_kaydet(app);
                        let _ = pencere::widgeti_gizle(app);
                        if let Some(p) = app.try_state::<Arc<Paylasilan>>() {
                            p.ayarlar.lock().unwrap().widget_gorunur = false;
                            let _ = p.ayarlari_kaydet();
                        }
                    }
                    // Takvim penceresi gercekten kapanir (yok edilir): webview
                    // kapaninca RAM geri veriliyor. Uygulama tepside yasamaya
                    // devam eder.
                    _ => {}
                }
            }

            // Widget tasinip boyutlandirildikca konumu kaydet.
            if pencere_ref.label() == pencere::WIDGET {
                if matches!(olay, WindowEvent::Moved(_) | WindowEvent::Resized(_)) {
                    pencere::widget_konumunu_kaydet(pencere_ref.app_handle());
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("Tauri uygulamasi baslatilamadi")
        .run(|app, olay| {
            // Tum pencereler kapansa bile uygulama kapanmasin: hatirlatmalarin
            // calmasi icin tepside beklemesi gerekiyor. Cikis yalnizca tepsi
            // menusunden.
            if let tauri::RunEvent::ExitRequested { api, code, .. } = &olay {
                if code.is_none() {
                    api.prevent_exit();
                }
            }
            if let tauri::RunEvent::Exit = &olay {
                kapanis_hazirligi(app);
            }
        });
}

/// Cikistan hemen once: bekleyen her seyi diske yaz.
pub fn kapanis_hazirligi(app: &tauri::AppHandle) {
    pencere::widget_konumunu_kaydet(app);
    if let Some(p) = app.try_state::<Arc<Paylasilan>>() {
        let _ = p.ayarlari_kaydet();
        let _ = p.durumu_kaydet();
        let _ = p.etkinlikleri_kaydet();
    }
}
