//! Windows acilisinda otomatik baslatma.
//!
//! Kayit defterindeki Run anahtarini kullanir (tauri-plugin-autostart).
//! Tasinabilir kurulumda exe'nin yolu degisebilecegi icin ayar her
//! acildiginda yeniden yazilir - klasoru baska yere tasirsan bozulmaz.

use tauri::AppHandle;
use tauri_plugin_autostart::ManagerExt;

pub fn ayarla(app: &AppHandle, acik: bool) -> Result<(), String> {
    let yonetici = app.autolaunch();
    if acik {
        yonetici.enable().map_err(|e| e.to_string())
    } else {
        yonetici.disable().map_err(|e| e.to_string())
    }
}

/// Acilista cagrilir: ayardaki deger ile isletim sistemindeki gercek durumu
/// esitler. Exe baska bir klasore tasindiysa kaydi tazeler.
pub fn esitle(app: &AppHandle, istenen: bool) {
    let yonetici = app.autolaunch();
    let mevcut = yonetici.is_enabled().unwrap_or(false);

    if istenen {
        // Acik olsa bile yeniden yaz: yol degismis olabilir.
        let _ = yonetici.enable();
    } else if mevcut {
        let _ = yonetici.disable();
    }
}
