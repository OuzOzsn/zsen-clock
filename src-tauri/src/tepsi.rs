//! Sistem tepsisi simgesi ve menusu.
//!
//! Uygulama tepside yasar: tum pencereler kapaliyken bile hatirlatmalar calar.
//! Cikis yalnizca buradan yapilir, boylece kullanici pencereyi kapatinca
//! yanlislikla alarmlarini kapatmis olmaz.

use std::sync::Arc;

use chrono::{Local, Timelike};
use tauri::menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};

use crate::pencere;
use crate::servis::Paylasilan;

pub fn kur(app: &AppHandle) -> tauri::Result<()> {
    let takvim = MenuItem::with_id(app, "takvim", "Takvimi aç", true, None::<&str>)?;
    let widget = MenuItem::with_id(app, "widget", "Widget'i göster / gizle", true, None::<&str>)?;
    let yeni = MenuItem::with_id(app, "yeni", "Yeni etkinlik", true, None::<&str>)?;

    let s30 = MenuItem::with_id(app, "sessiz30", "30 dakika", true, None::<&str>)?;
    let s60 = MenuItem::with_id(app, "sessiz60", "1 saat", true, None::<&str>)?;
    let s_gun = MenuItem::with_id(app, "sessizgun", "Bugünün kalanı", true, None::<&str>)?;
    let s_kapat = MenuItem::with_id(app, "sessizkapat", "Sessizi kaldır", true, None::<&str>)?;
    let sessiz =
        Submenu::with_id_and_items(app, "sessiz", "Sessize al", true, &[&s30, &s60, &s_gun, &s_kapat])?;

    let klasor = MenuItem::with_id(app, "klasor", "Veri klasörünü aç", true, None::<&str>)?;
    let cikis = MenuItem::with_id(app, "cikis", "Çıkış", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[
            &takvim,
            &widget,
            &yeni,
            &PredefinedMenuItem::separator(app)?,
            &sessiz,
            &klasor,
            &PredefinedMenuItem::separator(app)?,
            &cikis,
        ],
    )?;

    TrayIconBuilder::with_id("tepsi")
        .icon(
            app.default_window_icon()
                .cloned()
                .ok_or_else(|| tauri::Error::AssetNotFound("uygulama simgesi yok".into()))?,
        )
        .tooltip("Zsen Clock")
        // Sol tik menuyu acmasin: sol tik widget'i getirip goturur, sag tik menu.
        .show_menu_on_left_click(false)
        .menu(&menu)
        .on_menu_event(menu_olayi)
        .on_tray_icon_event(|tepsi, olay| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = olay
            {
                ayri_parcacikta(tepsi.app_handle(), |h| widgeti_degistir(&h));
            }
        })
        .build(app)?;

    Ok(())
}

/// Menu ve tepsi olaylari ANA is parcaciginda gelir; pencere olusturmayi
/// oradan yapmak uygulamayi kilitliyor (bkz. pencere.rs). Bu yuzden pencere
/// acan isler ayri bir is parcacigina devrediliyor.
fn ayri_parcacikta(app: &AppHandle, is: impl FnOnce(AppHandle) + Send + 'static) {
    let h = app.clone();
    std::thread::spawn(move || is(h));
}

fn menu_olayi(app: &AppHandle, olay: MenuEvent) {
    match olay.id().as_ref() {
        "takvim" => ayri_parcacikta(app, |h| {
            let _ = pencere::anayi_goster(&h);
        }),
        "widget" => ayri_parcacikta(app, |h| widgeti_degistir(&h)),
        "yeni" => ayri_parcacikta(app, |h| {
            let _ = pencere::anayi_goster(&h);
            let _ = h.emit("yeni-etkinlik", ());
        }),
        "sessiz30" => sessize_al(app, 30),
        "sessiz60" => sessize_al(app, 60),
        "sessizgun" => sessize_al(app, -1),
        "sessizkapat" => sessizi_kaldir(app),
        "klasor" => {
            use tauri_plugin_opener::OpenerExt;
            let _ = app
                .opener()
                .open_path(cekirdek::depo::veri_klasoru().to_string_lossy(), None::<&str>);
        }
        "cikis" => {
            crate::kapanis_hazirligi(app);
            app.exit(0);
        }
        _ => {}
    }
}

fn widgeti_degistir(app: &AppHandle) {
    let gorunur = app
        .get_webview_window(pencere::WIDGET)
        .and_then(|p| p.is_visible().ok())
        .unwrap_or(false);

    if gorunur {
        pencere::widget_konumunu_kaydet(app);
        let _ = pencere::widgeti_gizle(app);
    } else {
        let _ = pencere::widgeti_goster(app);
    }

    if let Some(paylasilan) = app.try_state::<Arc<Paylasilan>>() {
        paylasilan.ayarlar.lock().unwrap().widget_gorunur = !gorunur;
        let _ = paylasilan.ayarlari_kaydet();
    }
}

/// `sure_dakika` negatifse gunun sonuna kadar susturur.
fn sessize_al(app: &AppHandle, sure_dakika: i64) {
    let Some(paylasilan) = app.try_state::<Arc<Paylasilan>>() else { return };
    let simdi = Local::now();

    let (bitis_saat, bitis_dakika) = if sure_dakika < 0 {
        (23, 59)
    } else {
        let b = simdi + chrono::Duration::minutes(sure_dakika);
        (b.hour(), b.minute())
    };

    {
        let mut a = paylasilan.ayarlar.lock().unwrap();
        a.rahatsiz_etme_acik = true;
        a.rahatsiz_etme_bas = format!("{:02}:{:02}", simdi.hour(), simdi.minute());
        a.rahatsiz_etme_son = format!("{bitis_saat:02}:{bitis_dakika:02}");
    }
    let _ = paylasilan.ayarlari_kaydet();
    ayarlari_yayinla(app, &paylasilan);
}

fn sessizi_kaldir(app: &AppHandle) {
    let Some(paylasilan) = app.try_state::<Arc<Paylasilan>>() else { return };
    paylasilan.ayarlar.lock().unwrap().rahatsiz_etme_acik = false;
    let _ = paylasilan.ayarlari_kaydet();
    ayarlari_yayinla(app, &paylasilan);
}

fn ayarlari_yayinla(app: &AppHandle, paylasilan: &Arc<Paylasilan>) {
    let a = paylasilan.ayarlar.lock().unwrap().clone();
    let _ = app.emit("ayarlar-degisti", a);
}
