//! Pencere yonetimi.
//!
//! ONEMLI - pencere olusturma ve is parcacigi:
//!
//! `WebviewWindowBuilder::build()` webview kurulana kadar bekler ve bunu
//! yaparken olay dongusunun donmesine ihtiyac duyar. Ana is parcaciginda,
//! olay dongusunun ICINDEN cagrilirsa (senkron bir Tauri komutu, tepsi menusu
//! olayi veya run_on_main_thread kapanisi) asla geri donmez: pencere cercevesi
//! aciliyor ama webview hic yuklenmiyor ve ana is parcacigi kilitleniyor.
//! Kullanici beyaz bir pencere goruyor, sonrasinda hicbir dugme calismiyor.
//!
//! Bu yuzden pencere acan her yol ayri bir is parcaciginda calismali:
//!   - komutlar `async fn` olarak tanimli (Tauri onlari ayri havuzda kosuyor)
//!   - tepsi menusu olaylari std::thread::spawn ile devrediyor
//!   - zamanlayici zaten kendi is parcaciginda
//! setup() ise olay dongusu baslamadan once calistigi icin guvenli.
//!
//! Yuvarlak koseler saydamlikla degil, Windows 11'in DWM kose tercihiyle
//! aliniyor; boylece pencereler opak kaliyor ve ekran goruntusu/kompozisyon
//! sorunlari cikmiyor.
//!
//! Uc pencere var ve ucu de gerektiginde olusturulup gerektiginde yok edilir:
//!
//!   ana    - takvim. Kapatilinca YOK EDILIR, sadece gizlenmez. Sebebi bellek:
//!            kapali pencerenin webview'i kapaninca RAM geri veriliyor.
//!   widget - masaustune sabitlenen kucuk pencere. Uygulama acikken yasar.
//!   alarm  - hatirlatma calinca acilir, kuyruk bitince kapanir.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::servis::Paylasilan;
use std::sync::Arc;

pub const ANA: &str = "ana";
pub const WIDGET: &str = "widget";
pub const ALARM: &str = "alarm";

// ------------------------------------------------------------------- ana

pub fn anayi_goster(app: &AppHandle) -> tauri::Result<()> {
    if let Some(p) = app.get_webview_window(ANA) {
        p.show()?;
        p.unminimize()?;
        p.set_focus()?;
        return Ok(());
    }

    let p = WebviewWindowBuilder::new(app, ANA, WebviewUrl::App("index.html".into()))
        .title("Zsen Clock")
        .inner_size(1180.0, 760.0)
        .min_inner_size(880.0, 560.0)
        .center()
        .resizable(true)
        .build()?;
    p.set_focus()?;
    Ok(())
}

// ---------------------------------------------------------------- widget

/// Widget boyut kipleri. Kompakt kip oyun oynarken ekrani kapatmasin diye
/// gercekten kucuk: yalnizca tarih, geri sayim ve siradaki isin adi siyor.
pub fn widget_olcusu(kip: &str) -> (f64, f64) {
    match kip {
        "kompakt" => (272.0, 132.0),
        "genis" => (400.0, 580.0),
        _ => (340.0, 460.0),
    }
}

/// Kip degistiginde pencereyi o kipin olcusune oturtur.
pub fn widget_boyutla(app: &AppHandle, kip: &str) {
    let Some(p) = app.get_webview_window(WIDGET) else { return };
    let (g, y) = widget_olcusu(kip);
    let _ = p.set_size(tauri::LogicalSize::new(g, y));
}

pub fn widgeti_goster(app: &AppHandle) -> tauri::Result<()> {
    if let Some(p) = app.get_webview_window(WIDGET) {
        p.show()?;
        p.set_focus()?;
        return Ok(());
    }

    let (genislik, yukseklik, x, y, ustte) = {
        let paylasilan = app.state::<Arc<Paylasilan>>();
        let a = paylasilan.ayarlar.lock().unwrap();
        let (vg, vy) = widget_olcusu(&a.widget_boyut);
        (
            a.widget_genislik.unwrap_or(vg),
            a.widget_yukseklik.unwrap_or(vy),
            a.widget_x,
            a.widget_y,
            a.widget_ustte,
        )
    };

    let mut kurucu = WebviewWindowBuilder::new(app, WIDGET, WebviewUrl::App("widget.html".into()))
        .title("Zsen Clock widget")
        .inner_size(genislik, yukseklik)
        .min_inner_size(240.0, 120.0)
        .decorations(false)      // kendi baslik cubugumuzu ciziyoruz
        .always_on_top(ustte)
        .skip_taskbar(true)      // gorev cubugunu ve Alt+Tab'i kalabaliklastirmasin
        .shadow(true)
        .resizable(true);

    // Kayitli konum varsa oraya, yoksa ekranin sag ustune yerlestir.
    if let (Some(x), Some(y)) = (x, y) {
        kurucu = kurucu.position(x, y);
    }

    let p = kurucu.build()?;

    if x.is_none() || y.is_none() {
        sag_uste_yerlestir(&p, genislik);
    }

    // Yuvarlak koseler: saydamlik yerine isletim sisteminden.
    koseleri_yuvarla(&p);

    Ok(())
}

/// Ilk acilista widget'i calisma alaninin sag ust kosesine koyar.
fn sag_uste_yerlestir(p: &WebviewWindow, genislik: f64) {
    const KENAR: f64 = 24.0;
    if let Ok(Some(ekran)) = p.current_monitor() {
        let olcek = ekran.scale_factor();
        let alan = ekran.size().to_logical::<f64>(olcek);
        let kaynak = ekran.position().to_logical::<f64>(olcek);
        let _ = p.set_position(tauri::LogicalPosition::new(
            kaynak.x + alan.width - genislik - KENAR,
            kaynak.y + KENAR,
        ));
    }
}

pub fn widgeti_gizle(app: &AppHandle) -> tauri::Result<()> {
    if let Some(p) = app.get_webview_window(WIDGET) {
        p.hide()?;
    }
    Ok(())
}

/// Widget'in son konum ve boyutunu ayarlara yazar ki bir dahaki acilista
/// kullanici onu biraktigi yerde bulsun.
pub fn widget_konumunu_kaydet(app: &AppHandle) {
    let Some(p) = app.get_webview_window(WIDGET) else { return };
    let paylasilan = app.state::<Arc<Paylasilan>>();

    let olcek = p.scale_factor().unwrap_or(1.0);
    if let (Ok(konum), Ok(boyut)) = (p.outer_position(), p.inner_size()) {
        let k = konum.to_logical::<f64>(olcek);
        let b = boyut.to_logical::<f64>(olcek);
        let mut a = paylasilan.ayarlar.lock().unwrap();
        a.widget_x = Some(k.x);
        a.widget_y = Some(k.y);
        a.widget_genislik = Some(b.width);
        a.widget_yukseklik = Some(b.height);
    }
    let _ = paylasilan.ayarlari_kaydet();
}

// ----------------------------------------------------------------- alarm

/// Alarm penceresini acar veya zaten aciksa one getirir.
///
/// `kacirilmis` true ise pencere odagi calmaz - kullanici bilgisayarin basina
/// yeni oturmustur, yazdigi seyin ortasinda degildir.
///
/// `araya_girme` true ise (tam ekran oyun/sunum) pencere ne odagi alir ne de
/// ustte durur: acilir, zil calar, gorev cubugunda bekler. Oyundan cikan
/// kullanici alarmi zaten acik bulur. Bkz. odak.rs.
pub fn alarmi_goster(app: &AppHandle, kacirilmis: bool, araya_girme: bool) {
    use tauri::Emitter;
    let one_gel = !kacirilmis && !araya_girme;

    if let Some(p) = app.get_webview_window(ALARM) {
        let _ = p.show();
        // Ustte durma her seferinde yeniden kuruluyor: bir onceki alarm oyun
        // sirasinda acildiysa pencere "ustte degil" kalmisti.
        let _ = p.set_always_on_top(!araya_girme);
        if !araya_girme {
            let _ = p.unminimize();
        }
        if one_gel {
            let _ = p.set_focus();
        }
        let _ = app.emit("alarm-guncellendi", ());
        return;
    }

    let sonuc = WebviewWindowBuilder::new(app, ALARM, WebviewUrl::App("alarm.html".into()))
        .title("Hatırlatma")
        .inner_size(460.0, 300.0)
        .min_inner_size(380.0, 260.0)
        .center()
        .decorations(false)
        .always_on_top(!araya_girme)
        .resizable(false)
        .skip_taskbar(false) // alarm gorev cubugunda gorunsun, kaybolmasin
        .focused(one_gel)
        .build();

    match sonuc {
        Ok(p) => koseleri_yuvarla(&p),
        Err(e) => eprintln!("[pencere] alarm penceresi acilamadi: {e}"),
    }
}

/// Cercevesiz pencerelere Windows 11'in yuvarlak kosesini uygular.
/// Windows 10'da cagri sessizce basarisiz olur, pencere kare kalir.
fn koseleri_yuvarla(_p: &WebviewWindow) {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::Graphics::Dwm::{
            DwmSetWindowAttribute, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND,
        };

        let Ok(ham) = _p.hwnd() else { return };
        let tercih = DWMWCP_ROUND;
        unsafe {
            let _ = DwmSetWindowAttribute(
                HWND(ham.0 as _),
                DWMWA_WINDOW_CORNER_PREFERENCE,
                &tercih as *const _ as *const core::ffi::c_void,
                std::mem::size_of_val(&tercih) as u32,
            );
        }
    }
}

pub fn alarmi_kapat(app: &AppHandle) {
    if let Some(p) = app.get_webview_window(ALARM) {
        let _ = p.close();
    }
}
