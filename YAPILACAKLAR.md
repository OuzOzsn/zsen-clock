# Yapılacaklar

Sıradaki işler ve açık kalan kararlar. Bir iş bitince buradan silinir;
yeni özellik eklenirken testi de aynı değişiklikte eklenir (bkz. README › Testler).

## Sıradaki

- [ ] **Tekrarlayan etkinlikler listesi.** Programa bağlı olmayan tekrarlar
  (örn. hızlı eklemeyle girilmiş "her gün 00:49 …") sol panelde hiçbir yerde
  listelenmiyor; yalnızca takvimde görünüyor. Programlarım'ın yanına bir
  "Tekrarlayan etkinlikler" bölümü: ad, tekrar kuralı, tıklayınca düzenleme
  formu.

## Karar bekleyenler

- [ ] **"Başlıyorum" = yapıldı mı?** Alarmdaki "Başlıyorum" işi yapıldı olarak
  işaretliyor. "Başladım" ile "bitirdim" ayrı tutulsun mu?
- [ ] **Programı duraklatma.** "Bir haftalığına ara ver" şu an ancak her iş
  için tek tek gün atlayarak yapılabiliyor.

## Bilinen sınırlamalar

- Taşınabilir `ZsenClock.exe` kendini güncelleyemez; yeni sürümde indirme
  sayfasını açar.
- Sıralı program tur sayısıyla başlatıldıktan sonra aynı `data\` klasörüyle
  0.1.1'den eski bir sürüm açılırsa program listesi okunamaz (geri dönüş
  desteklenmiyor).
- Windows kod imzası (Authenticode) yok: kurulumda SmartScreen uyarısı çıkabilir.
