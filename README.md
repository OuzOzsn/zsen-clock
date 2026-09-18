# Zsen Clock

Masaüstünde pinli duran, kendi kurduğun takvim ve alarmları hatırlatan bir
Windows uygulaması. Veritabanı yok — her şey `data/` klasöründe düz JSON.

- **Widget** — masaüstünde her zaman üstte, sıradaki işe canlı geri sayım.
  Tek tıkla tepsiye iner, tepsiden geri gelir.
- **Takvim** — Ay / Hafta / Gün / Ajanda görünümleri, sürükleyip bırakmadan da
  tek satırda ekleme: `her pzt çar cum 09:00 spor`
- **Alarm** — zamanı gelince ekranın ortasında açılır, kendi zil sesin çalar,
  ertele veya tamamlandı işaretle.
- **Program** — haftalık bir düzen kur, kenarda dursun, istediğin tarihte
  başlat. Her günün kendi içeriği olur: not, bağlantı, süre. Güncelleyince
  takvim de güncellenir; elle değiştirdiğin gün olduğu gibi kalır.
- **Çalışma planı sihirbazı** — konuları ve saatleri söyle, haftalarca sürecek
  programı tek seferde üretsin. Ağırlık verebilirsin: `Matematik x3`.
- **Taşınabilir** — klasörü kopyala, başka PC'de çalıştır; her şey gelir.

---

## Kurmak

`dist-windows\ZsenClock_0.1.0_x64-setup.exe` dosyasına çift tıkla. Yönetici
izni istemez, kullanıcı hesabına kurar.

Başka hiçbir şey kurman gerekmez — Rust, Node, .NET yok. Arayüzü çizen
WebView2 motoru Windows 11'de zaten hazır; yoksa kurulum dosyasının **içinden**
kurar, internet bile gerekmez. Sürüm uyumsuzluğu riski olmasın diye bilerek
böyle: setup ~130 MB, ama her makinede aynı şekilde çalışır.

Kurmak istemiyorsan `dist-windows\ZsenClock.exe` taşınabilir sürümdür; çift
tıkla, kurulum yok.

İlk açılışta iki şey sorar — masaüstüne kısayol koyayım mı, bilgisayar açılınca
otomatik başlayayım mı. İkisi de sonradan **Ayarlar › Başlangıç** altından
değiştirilebilir; karşılama ekranı bir daha çıkmaz.

İlk açılışta yanında bir `data\` klasörü oluşur:

```
ZsenClock.exe
data\
  etkinlikler.json   ← takvimin (Not Defteri ile açıp düzenleyebilirsin)
  programlar.json    ← haftalık program şablonların
  ayarlar.json       ← tercihler
  durum.json         ← hangi alarmın çaldığı (uygulamanın kendi defteri)
  sesler\            ← buraya attığın mp3/wav/ogg zil sesi olarak çıkar
  yedekler\          ← her kayıtta otomatik yedek, son 20 tanesi durur
```

Program klasörü yazılamaz bir yerdeyse (ör. `Program Files`) veri otomatik
olarak `%APPDATA%\ZsenClock` altına düşer.

---

## Kullanım

### Hızlı ekleme
Sol üstteki kutuya tek satır yaz, altında ne anlaşıldığını anında gör:

| Yazdığın | Ne olur |
|---|---|
| `yarın 14:00 matematik 45dk` | Yarın 14:00, 45 dakika |
| `her pzt çar cum 09:00 spor` | Haftalık tekrar, Pzt/Çar/Cum |
| `hafta içi 07:30 kalk` | Pazartesi–Cuma her gün |
| `2 günde bir 20:00 ilaç` | İki günde bir |
| `15 ekim 10:30 diş randevusu` | Tek seferlik |
| `akşam 8 film` | Bugün 20:00 (geçtiyse yarın) |
| `3 gün sonra 12:00 fatura` | Göreli tarih |

Tanınmayan her şey başlık olur — yani hiçbir zaman veri kaybetmezsin.

### Klavye

| Tuş | İş |
|---|---|
| `N` | Hızlı ekleme kutusuna geç |
| `T` | Bugüne dön |
| `1` `2` `3` `4` | Ay / Hafta / Gün / Ajanda |
| `←` `→` | Önceki / sonraki |
| `Esc` | Açık pencereyi kapat |
| `,` | Ayarlar |
| `Ctrl+Enter` | Formu kaydet |

### Tepsi simgesi
- **Sol tık** — widget'ı göster / gizle
- **Sağ tık** — takvim, yeni etkinlik, sessize al, veri klasörü, çıkış

Pencereleri kapatmak uygulamayı kapatmaz; alarmların çalabilmesi için tepside
bekler. Çıkış yalnızca tepsi menüsünden.

### Etkinliği sürükleyerek taşıma
Gün ve hafta görünümünde etkinliği tutup başka saate sürükle; alt kenarından
çekince süresi uzar. 15 dakikaya yuvarlanır, sürüklerken üstte yeni saat yazar.

Tekrarlayan etkinliklerde yalnızca **saat** değişir, gün değişmez — "her pzt çar
cum" olan bir şeyi salıya bırakmak belirsiz olurdu. Saat değişikliği tüm
tekrarlara işlenir.

### Programlar

Sol paneldeki **Programlarım** altında haftalık düzenler tutulur. Bir program
başlatılana kadar takvimde görünmez — kenarda bekler.

Program oluştururken haftanın günlerinin altına iş eklersin: saat, süre ve
içerik. İçerik düz metindir; içine yazdığın `http://` ile başlayan adresler
tıklanabilir olur.

**Başlatmak.** Bir tarih seç ve süreyi ver: *kaç hafta*, *bitiş tarihi* ya da
*süresiz*. Seçtiğin gün dahildir — program Pzt+Sal ise ve Perşembe
başlatırsan ilk iş gelecek Pazartesi'ye düşer; Pazartesi başlatırsan o
Pazartesi'ye. "4 hafta" seçilen tarihten sayılır, yani her işten tam 4 seans
çıkar.

**Bir günü değiştirmek.** Takvimden program etkinliğine tıklayıp saatini ya da
notunu değiştirirsen bu yalnızca o güne işlenir — o güne özel bir şey çıkmış
olabilir. Program güncellemeleri o güne dokunmaz. Geri almak için programın
detayındaki **Elle değiştirilen günler** listesinden *Programa döndür*.

**Güncellemek.** Programın tamamı yalnızca Programlarım'dan değişir. Günleri
ya da saati değiştirirsen geçmiş dondurulur: geçmiş haftalar eski haliyle
kalır, yeni düzen bugünden başlar. Böylece "programı güncelledim, üç aylık
çalışma geçmişim yeniden dizildi" olmaz.

**Durdurmak ve silmek.** *Durdur* geçmişi bırakır, geleceği temizler ve
programı uykuya alır. *Sil* takvimdeki bütün izi — geçmiş dahil — kaldırır.

**Taşımak.** *Dışa aktar* programı tek bir `.json` dosyasına yazar — nereye
kaydedeceğini sen seçersin. *İçe aktar* ile o dosyayı seçip geri alırsın; başka
bir bilgisayarda da çalışır. İçe aktarılan program her zaman uykuda gelir,
başlangıç tarihini sen verirsin. Aynı adla ikinci bir program gelirse sonuna
`(2)` eklenir.

### Çalışma planı oluşturma
Sol paneldeki **Çalışma planı oluştur** ile konuları, günleri ve seans düzenini
verip toplu program üretebilirsin:

```
Matematik x3        ← üç kat sık gelsin
Türkçe x2
Tarih
Coğrafya
Vatandaşlık
```

Konular döngüsel dağıtılır, aynı konu üst üste gelmez. Eklemeden önce kaç seans,
kaç gün ve konu başına kaç ders düştüğünü gösterir. Üretilen kayıtlar tekrar
kuralı değil tek tek etkinliktir — böylece bir günü serbestçe değiştirebilirsin.

### Zil sesi ekleme
`data\sesler\` klasörüne mp3, wav veya ogg at. Uygulama otomatik listeler;
her hatırlatma için ayrı ses seçebilirsin.

---

## Geliştirme

### Arayüz (hızlı döngü)

```bash
npm install
npm run dev
```

Sonra tarayıcıda `http://localhost:5173/onizleme.html` — widget ve alarm
pencerelerini gerçek boyutlarında yan yana gösterir. Ana pencere için
`/index.html`. Tarayıcıda Rust yok, sahte veriyle çalışır.

Chrome ile WebView2 aynı Chromium motoru olduğu için tarayıcıda gördüğün
render, uygulamanın içindekiyle birebir aynı.

### Testler

```bash
# Türkçe doğal dil ayrıştırıcı, tarih/tekrar, plan ve program üretici
node --test src/lib/dogalDil.test.ts src/lib/tarih.test.ts \
            src/lib/planUret.test.ts src/lib/programUret.test.ts \
            src/lib/programAktarim.test.ts

# Çekirdek: tekrar kuralları, zamanlayıcı, dosya deposu, program modeli
cd src-tauri/cekirdek && cargo test
```

### Windows exe derlemek

```powershell
.\build.ps1
```

Derleme Docker içinde, Linux üzerinde yapılır — bu makineye Rust veya Visual
Studio Build Tools kurulmaz. İlk çalıştırmada Docker imajı (~5 dk) ve Windows
SDK (~2 dk) hazırlanır, sonra her ikisi de önbellekten gelir.

İki çıktı verir:

- `dist-windows\ZsenClock.exe` — taşınabilir, kopyala-çalıştır
- `dist-windows\ZsenClock_<sürüm>_x64-setup.exe` — kurulum dosyası

Kurulum dosyası WebView2'yi içinde taşıdığı için ilk derlemede ~130 MB'lık bir
indirme yapar; sonraki derlemeler önbellekten gelir.

```powershell
.\build.ps1 -Yeniden   # Docker imajını sıfırdan kur
.\build.ps1 -Temizle   # önbellek hacimlerini sil
```

---

## Nasıl kurulu

```
src/                      arayüz (Svelte 5 + TypeScript)
  pencereler/             Ana, Widget, Alarm — her biri ayrı HTML girişi
  bilesenler/             takvim görünümleri, form, hızlı ekleme
  lib/                    dogalDil, planUret, programUret, tarih, ipc, tipler,
                          veri deposu
  stil/                   tasarım token'ları

src-tauri/
  cekirdek/               saf Rust mantığı, Tauri'ye bağlı DEĞİL
    model.rs              veri modeli
    program.rs            program şablonu (haftalık düzen, dışa/içe aktarım)
    tekrar.rs             tekrar kuralı → somut tarihler
    zamanlayici.rs        hangi hatırlatma ne zaman çalar
    depo.rs               atomik JSON okuma/yazma, yedek, kurtarma
    ayarlar.rs            tercihler
  src/                    Tauri bağlama katmanı
    servis.rs             arka plan zamanlayıcı döngüsü
    komutlar.rs           arayüzün çağırdığı komutlar
    pencere.rs            pencere yaşam döngüsü
    tepsi.rs              sistem tepsisi
    acilis.rs             Windows açılışında başlatma
    kisayol.rs            masaüstü kısayolu (IShellLink)

docker/                   derleme ortamı
```

Tekrar kuralının iki kopyası var (arayüzde `tarih.ts`, zamanlayıcıda
`tekrar.rs`) çünkü biri pencere kapalıyken, öteki IPC'ye gitmeden çalışmak
zorunda. İkisi `src/lib/tekrar-vektorleri.json` dosyasındaki ortak vektörlerden
geçiyor — kuralı değiştirip vektörü güncellemezsen iki testten biri kırılır.

**Çekirdek neden ayrı bir crate?** Windows exe'si Linux container'ında çapraz
derleniyor ve o ortamda Windows ikilisi çalıştırılamıyor. Mantık Tauri'den
bağımsız durunca `cargo test` aynı container'da native Linux olarak saniyeler
içinde koşuyor — yoksa tekrar kurallarını ve zamanlayıcıyı hiç test edemezdik.

### Bellek kullanımı (ölçülmüş)

`.\scripts\bellek-olc.ps1` ile kendi makinende ölçebilirsin. Windows 11,
WebView2 152 üzerinde alınan değerler:

| Durum | Özel bellek | Çalışma kümesi |
|---|---|---|
| Widget açık (sürekli çalışan hâl) | ~180 MB | ~400 MB |
| Widget + takvim + alarm | ~228 MB | ~485 MB |

İki sayı da doğru ama farklı şeyi ölçüyor: WebView2 çok süreçli çalıştığı için
Chromium'un paylaşılan kod sayfaları her süreçte tekrar sayılıyor ve "çalışma
kümesi" gerçekte kullanılan RAM'den yüksek çıkıyor. Görev Yöneticisi'nin
gösterdiği değer özel belleğe daha yakın.

Bu rakam WebView2'nin taban maliyeti; uygulamanın kendi Rust süreci yalnızca
~7 MB. `src-tauri/src/main.rs` içinde WebView2'ye süreç sayısını ve V8 yığınını
sınırlayan bayraklar veriliyor (bunlar olmadan ~480 MB çalışma kümesi çıkıyordu).

### Dayanıklılık notları

- **Atomik yazma** — önce geçici dosyaya yazılır, `fsync` edilir, sonra yerine
  taşınır. Elektrik giderse yarım dosya kalmaz.
- **Bozuk JSON** — uygulama çökmez; bozuk dosyayı `bozuk-*.json` diye kenara
  koyar, en yeni sağlam yedekten döner ve durumu arayüzde söyler.
- **Uyku / kapanma** — zamanlayıcı saat sıçramasını fark eder, PC kapalıyken
  geçen hatırlatmaları açılışta "kaçırıldı" olarak gösterir (varsayılan
  tolerans 12 saat; daha eskiler gösterilmez ki 200 alarm birden açılmasın).
- **Tek kopya** — ikinci kez açılırsa yeni pencere açmaz, var olanı öne getirir;
  yoksa aynı alarm iki kez çalardı.
- **Başıboş tıklama koruması** — kendiliğinden açılan pencereler (alarm ve ilk
  açılış karşılaması) ilk yarım saniye tıklama ve tuş kabul etmiyor. Kısayola
  çift tıklayınca ikinci tıklamanın açılan panele düşüp onu görülmeden
  kapatmasını engelliyor; ölçerek doğrulandı. Alarmda `Enter` de "Tamamlandı"ya
  bağlı değil — başka yerde yazarken alarm açılırsa hatırlatman kaybolmasın.
- **Masaüstü kısayolu** sistemden sorulan gerçek masaüstü yoluna yazılıyor;
  OneDrive masaüstü klasörünü taşımışsa sabit yol yanlış yere yazardı.
- **Pencere açmak asla ana iş parçacığında yapılmıyor.** `WebviewWindowBuilder::build()`
  webview kurulana kadar bekler ve bunun için olay döngüsünün dönmesine ihtiyaç
  duyar; olay döngüsünün *içinden* çağrılırsa (senkron komut, tepsi menüsü,
  `run_on_main_thread`) hiç geri dönmez. Pencere çerçevesi açılır ama içi boş
  kalır ve uygulama kilitlenir — widget'tan takvimi açmaya çalışınca tam olarak
  bu oluyordu. Bu yüzden pencere açan komutlar `async fn`, tepsi olayları
  `std::thread::spawn` ile devrediyor. `setup()` güvenli, çünkü olay döngüsü
  henüz başlamamış oluyor.

---

## Tasarım

Referans, her Türk evinde asılı duran yırtmalı gün takvimi: büyük gün rakamı ve
kırmızının yalnızca "bugün" için kullanılması. Burada tersine çevrildi — kâğıt
üzerine mürekkep değil, mürekkep üzerine kâğıt — çünkü uygulama gece dahil tüm
gün ekranın üstünde duruyor.

Renkler rol taşır, süs değildir:

| Renk | Anlamı |
|---|---|
| kırmızı `#e23c2e` | **yalnızca** şimdi, geçmiş, kaçırılan |
| pirinç `#c9a227` | etkileşim: seçim, odak, birincil düğme, geri sayım |
| zeytin `#7fa356` | tamamlandı |
| kâğıt `#ede7da` | metin — vurgu için renk değil, ağırlık kullanılır |

Yuvarlaklık da bilgi taşır: liste ve ızgaralar kare (kâğıt/cetvel), yalnızca
tıklanabilir şeyler yuvarlak. Çerçevesiz pencerelerin (widget, alarm) yuvarlak
köşeleri saydamlıkla değil Windows 11'in kendi DWM köşe tercihiyle alınıyor —
pencereler opak kalıyor.

Tipografi IBM Plex Sans + Plex Mono, projeye gömülü (internet gerekmez). Tüm
saat ve sayılar mono ve `tabular-nums` — geri sayımda rakamlar zıplamaz.

---

## Lisans

MIT — bkz. [LICENSE](LICENSE).

Kısaca: kullan, değiştir, dağıt, istersen sat. Tek şart telif bildirimini
korumak. Yazılım **olduğu gibi** sunulur; garanti verilmez, doğabilecek
zarardan sorumluluk kabul edilmez.
