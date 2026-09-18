//! Kullanici su an rahatsiz edilebilir mi?
//!
//! Alarm penceresi normalde her zaman ustte acilir ve odagi alir. Tam ekran
//! bir oyunun ustune boyle dusmek oyunu bozuyor - dereceli bir macta alt-tab
//! etkisi yaratiyor. Windows'un kendi "Odak yardimi" ozelligi de ayni soruyu
//! soruyor ve ayni API'yi kullaniyor: SHQueryUserNotificationState.
//!
//! Burada alarmi iptal etmiyoruz; yalnizca ARAYA GIRMEDEN aciyoruz: pencere
//! olusur, zil calar, ama odak ve "her zaman ustte" yok. Kullanici oyundan
//! ciktiginda alarm zaten acik bekliyor olur.

/// Tam ekran bir uygulama (oyun, sunum, video) calisiyor mu?
///
/// Emin olamadigimiz her durumda `false` donuyoruz: yanlis pozitif, alarmin
/// sessizce arkada kalmasina yol acardi - kacirilmasindansa araya girmesi
/// yeglenir.
#[cfg(windows)]
pub fn tam_ekran_uygulama_var_mi() -> bool {
    use windows::Win32::UI::Shell::{
        SHQueryUserNotificationState, QUNS_ACCEPTS_NOTIFICATIONS, QUNS_NOT_PRESENT,
    };

    let Ok(durum) = (unsafe { SHQueryUserNotificationState() }) else {
        return false;
    };

    // QUNS_ACCEPTS_NOTIFICATIONS = normal masaustu, araya girebiliriz.
    // QUNS_NOT_PRESENT = oturum kilitli/kullanici yok; alarm yine de acilsin,
    // donunce gorsun.
    // Geriye kalanlar: BUSY (tam ekran), RUNNING_D3D_FULL_SCREEN (oyun),
    // PRESENTATION_MODE (sunum), QUIET_TIME, APP - hepsinde araya girmiyoruz.
    !matches!(durum, QUNS_ACCEPTS_NOTIFICATIONS | QUNS_NOT_PRESENT)
}

#[cfg(not(windows))]
pub fn tam_ekran_uygulama_var_mi() -> bool {
    false
}
