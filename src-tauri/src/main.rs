// Windows'ta release derlemesinde arkada konsol penceresi acilmasin.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    webview_ayarlari();
    zsenclock_lib::run()
}

/// WebView2'yi baslamadan once sinirlar.
///
/// Neden gerekli: WebView2 varsayilan olarak Edge'in tam tarayici altyapisini
/// ayaga kaldiriyor - her pencereye ayri bir olusturucu sureci, artı arka plan
/// senkronizasyonu, cevirici, telemetri, guncelleme kontrolu. 7/24 acik duran
/// bir hatirlatici icin bunlarin hicbiri gerekli degil.
///
/// En cok ise yarayan iki ayar:
///   --renderer-process-limit=1  -> uc pencere tek olusturucuyu paylasir
///   --js-flags=--max-old-space-size  -> V8 yigini kucuk tutulur; bu uygulama
///                                      birkac yuz etkinlikten fazlasini tutmuyor
///
/// Bu degiskenin Tauri baslamadan once ayarlanmasi sart; WebView2 ortami bir
/// kez kurulduktan sonra okunmuyor.
fn webview_ayarlari() {
    // Kullanici kendi bayraklarini vermisse ona dokunma.
    if std::env::var_os("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").is_some() {
        return;
    }

    let bayraklar = [
        // Alarm penceresi kullanici tiklamadan ses caliyor; Chromium'un
        // otomatik oynatma kilidi acik kalirsa play() NotAllowedError veriyor.
        // wry kendi varsayilanlarinda bunu veriyor ama bu degisken onlarin
        // yerine gecebildigi icin burada da olmasi sart.
        "--autoplay-policy=no-user-gesture-required",
        "--renderer-process-limit=1",
        "--js-flags=--max-old-space-size=64",
        "--disable-background-networking",
        "--disable-component-update",
        "--disable-domain-reliability",
        "--disable-sync",
        "--no-pings",
        "--no-default-browser-check",
        "--disable-features=Translate,OptimizationHints,MediaRouter,\
         msWebOOUI,msPdfOOUI,msSmartScreenProtection,CalculateNativeWinOcclusion",
    ]
    .join(" ");

    std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", bayraklar);
}
