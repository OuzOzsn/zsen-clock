//! Uygulamanin platformdan bagimsiz cekirdegi: veri modeli, dosya deposu,
//! tekrar kurallari ve zamanlayici mantigi.
//!
//! Burada bilerek hicbir Tauri/Windows bagimliligi yok. Sebebi pratik:
//! Windows exe'si Linux container'inda capraz derleniyor ve o ortamda Windows
//! ikilisi calistirilamiyor. Mantik ayri bir crate'te durunca `cargo test`
//! ayni container'da native Linux olarak saniyeler icinde kosuyor.

pub mod ayarlar;
pub mod depo;
pub mod model;
pub mod program;
pub mod ses_uret;
pub mod tekrar;
pub mod zamanlayici;
