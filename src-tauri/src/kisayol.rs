//! Masaustu kisayolu olusturma / kaldirma.
//!
//! Kisayol Windows'un kendi COM arayuzuyle (IShellLink) yaziliyor. PowerShell
//! cagirmak daha kisa olurdu ama her seferinde bir surec baslatip ekranda
//! pencere titretiyor; tasinabilir bir uygulamada bu kotu duruyor.
//!
//! Masaustu yolu da sabit `%USERPROFILE%\Desktop` degil, sistemden soruluyor:
//! OneDrive masaustu yonlendirmesi yapmis olabilir, o zaman sabit yol yanlis
//! klasore yazardi.

#[cfg(target_os = "windows")]
mod windows_impl {
    use std::path::PathBuf;

    use windows::core::{Interface, PCWSTR};
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, IPersistFile, CLSCTX_INPROC_SERVER,
        COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Shell::{
        FOLDERID_Desktop, IShellLinkW, SHGetKnownFolderPath, ShellLink, KF_FLAG_DEFAULT,
    };

    /// NSIS kurulum dosyasi da masaustune kisayol koyuyor ve adini
    /// `productName`den aliyor (bkz. tauri.conf.json). Burada farkli bir ad
    /// kullanilsa - bir ara oyleydi - kullanici kurulumda ve ilk acilista
    /// "evet" deyince masaustunde IKI kisayol olusuyor. Bu yuzden ad
    /// `productName` ile birebir ayni olmali; kaldirma da onu siliyor.
    const KISAYOL_ADI: &str = "ZsenClock.lnk";

    fn genis(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    /// Masaustu klasorunun gercek yolu (OneDrive yonlendirmesi dahil).
    pub fn masaustu() -> Option<PathBuf> {
        unsafe {
            let ham = SHGetKnownFolderPath(&FOLDERID_Desktop, KF_FLAG_DEFAULT, None).ok()?;
            let yol = ham.to_string().ok()?;
            windows::Win32::System::Com::CoTaskMemFree(Some(ham.0 as *const _));
            Some(PathBuf::from(yol))
        }
    }

    pub fn kisayol_yolu() -> Option<PathBuf> {
        Some(masaustu()?.join(KISAYOL_ADI))
    }

    pub fn var_mi() -> bool {
        kisayol_yolu().is_some_and(|y| y.is_file())
    }

    pub fn olustur() -> Result<(), String> {
        let hedef = std::env::current_exe().map_err(|e| e.to_string())?;
        let klasor = hedef
            .parent()
            .ok_or("exe klasoru bulunamadi")?
            .to_path_buf();
        let yol = kisayol_yolu().ok_or("masaustu klasoru bulunamadi")?;

        unsafe {
            // COM bu is parcaciginda zaten baslatilmis olabilir; o durumda
            // hata donmesi normal, isimize devam ediyoruz.
            let baslatildi = CoInitializeEx(None, COINIT_APARTMENTTHREADED).is_ok();

            let sonuc = (|| -> Result<(), String> {
                let bag: IShellLinkW =
                    CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)
                        .map_err(|e| format!("kisayol nesnesi olusturulamadi: {e}"))?;

                bag.SetPath(PCWSTR(genis(&hedef.to_string_lossy()).as_ptr()))
                    .map_err(|e| e.to_string())?;
                // Calisma klasoru exe'nin yani olmali: veri klasorunu orada ariyor.
                bag.SetWorkingDirectory(PCWSTR(genis(&klasor.to_string_lossy()).as_ptr()))
                    .map_err(|e| e.to_string())?;
                bag.SetDescription(PCWSTR(genis("Zsen Clock — takvim ve alarm").as_ptr()))
                    .map_err(|e| e.to_string())?;

                let dosya: IPersistFile = bag.cast().map_err(|e| e.to_string())?;
                dosya
                    .Save(PCWSTR(genis(&yol.to_string_lossy()).as_ptr()), true)
                    .map_err(|e| format!("kisayol yazilamadi: {e}"))?;
                Ok(())
            })();

            if baslatildi {
                CoUninitialize();
            }
            sonuc
        }
    }

    pub fn kaldir() -> Result<(), String> {
        let Some(yol) = kisayol_yolu() else {
            return Ok(());
        };
        if !yol.exists() {
            return Ok(());
        }
        std::fs::remove_file(&yol).map_err(|e| format!("kisayol silinemedi: {e}"))
    }
}

#[cfg(not(target_os = "windows"))]
mod windows_impl {
    pub fn var_mi() -> bool {
        false
    }
    pub fn olustur() -> Result<(), String> {
        Err("masaustu kisayolu yalnizca Windows'ta destekleniyor".into())
    }
    pub fn kaldir() -> Result<(), String> {
        Ok(())
    }
}

pub use windows_impl::{kaldir, olustur, var_mi};

/// Ayardaki degerle diskteki gercek durumu esitler.
pub fn ayarla(istenen: bool) -> Result<(), String> {
    match (istenen, var_mi()) {
        (true, false) => olustur(),
        (false, true) => kaldir(),
        _ => Ok(()),
    }
}
