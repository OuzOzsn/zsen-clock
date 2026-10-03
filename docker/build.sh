#!/usr/bin/env bash
# Container icinde calisir. Kaynak /app'e, cikti /cikti'ya baglanir.
#
# Iki asama var:
#   1. Windows SDK + MSVC CRT'yi hazirla (xwin). Yalnizca ilk seferde calisir,
#      sonrasinda /xwin-sdk hacminde durur.
#   2. clang-cl + lld-link ile x86_64-pc-windows-msvc hedefine derle.
set -euo pipefail

HEDEF=x86_64-pc-windows-msvc
XWIN_SDK=${XWIN_SDK:-/xwin/sdk}
XWIN_CACHE=${XWIN_CACHE:-/xwin/cache}

# --- 1) Windows SDK -----------------------------------------------------
if [ ! -d "$XWIN_SDK/crt/lib/x86_64" ]; then
  echo "==> Windows SDK hazirlaniyor (ilk seferde ~5-10 dk, sonra onbellekten)"
  xwin --accept-license \
       --cache-dir "$XWIN_CACHE" \
       --arch x86_64 \
       --variant desktop \
       splat --output "$XWIN_SDK"
else
  echo "==> Windows SDK onbellekten kullaniliyor"
fi

# --- 2) Derleyici ayarlari ---------------------------------------------
# clang-cl'e MSVC basliklarini /imsvc ile veriyoruz (sistem basligi say:
# icindeki uyarilar bizim kodumuzun uyarilariyla karismasin).
KAPSAYICILAR="\
-Wno-unused-command-line-argument \
/imsvc$XWIN_SDK/crt/include \
/imsvc$XWIN_SDK/sdk/include/ucrt \
/imsvc$XWIN_SDK/sdk/include/um \
/imsvc$XWIN_SDK/sdk/include/shared"

export CC_x86_64_pc_windows_msvc=clang-cl
export CXX_x86_64_pc_windows_msvc=clang-cl
export AR_x86_64_pc_windows_msvc=llvm-lib
export CFLAGS_x86_64_pc_windows_msvc="$KAPSAYICILAR"
export CXXFLAGS_x86_64_pc_windows_msvc="$KAPSAYICILAR"
export CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER=lld-link
export RUSTFLAGS="${RUSTFLAGS:-} \
-Lnative=$XWIN_SDK/crt/lib/x86_64 \
-Lnative=$XWIN_SDK/sdk/lib/um/x86_64 \
-Lnative=$XWIN_SDK/sdk/lib/ucrt/x86_64"

# --- 3) Arayuz ----------------------------------------------------------
echo "==> Arayuz bagimliliklari"
npm ci --no-audit --no-fund 2>/dev/null || npm install --no-audit --no-fund

# --- 4) Cekirdek testleri ----------------------------------------------
# Saf mantik Tauri'ye bagli olmadigi icin burada native Linux olarak kosuyor.
# Windows ikilisini container'da calistiramadigimiz icin tek test firsatimiz bu.
echo "==> Cekirdek testleri"
( cd src-tauri/cekirdek && RUSTFLAGS= cargo test --quiet )

# --- 5) Windows exe + kurulum dosyasi -----------------------------------
# Iki cikti var: tasinabilir exe (kopyala-calistir) ve NSIS kurulum dosyasi.
# Kurulum dosyasi WebView2'yi icinde tasidigi icin ilk derlemede ~130 MB'lik
# bir indirme yapiyor; /root/.cache/tauri hacimde tutuluyor, sonra onbellekten.
# --- Deneme build'i ----------------------------------------------------
# DENEME=1: kurulum dosyasi yok, imza yok; yalnizca "ZsenClock Deneme" exe'si.
# Kimligi farkli oldugu icin kurulu ZsenClock acikken de yaninda calisir
# (tek kopya kilidi kimlige bagli), verisi exe'nin yanindaki data\'da durur,
# masaustu kisayolu ayri adla olusur. Test icin her seferinde setup kurmamak
# icin var.
if [ "${DENEME:-}" = "1" ]; then
  echo "==> Deneme build'i (kurulumsuz, imzasiz)"
  ZSEN_DENEME=1 cargo tauri build --target "$HEDEF" --no-bundle --config \
    '{"identifier":"com.zsenclock.deneme","productName":"ZsenClock Deneme","bundle":{"createUpdaterArtifacts":false}}'
  KAYNAK=src-tauri/target/$HEDEF/release
  mkdir -p /cikti
  cp "$KAYNAK/zsenclock.exe" "/cikti/ZsenClock-Deneme.exe"
  echo "==> Deneme:     $(du -h /cikti/ZsenClock-Deneme.exe | cut -f1) -> dist-windows/ZsenClock-Deneme.exe"
  exit 0
fi

# Guncelleyici icin kurulum dosyasi imzalaniyor. Anahtar repoda degil:
# build.ps1 onu kullanicinin %USERPROFILE%\.tauri klasorunden salt okunur
# baglar. Anahtar sifreli; sifre build.ps1'de sorulup ortam degiskeniyle
# geliyor (komut satirinda gorunmesin diye `-e AD` bicimiyle). Anahtar yoksa
# (baskasinin klonu ya da `-Imzasiz`) imzasiz derlenir; uygulama yine
# calisir, yalnizca o build'den release yayinlanamaz.
ANAHTAR=/anahtar/zsenclock-updater.key
IMZA_AYARI=()
if [ -f "$ANAHTAR" ]; then
  if [ -z "${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}" ]; then
    echo "HATA: imza anahtari sifreli ama sifre gelmedi (build.ps1 sormaliydi)"
    exit 1
  fi
  echo "==> Guncelleme imzasi: $ANAHTAR"
  export TAURI_SIGNING_PRIVATE_KEY="$(cat "$ANAHTAR")"
else
  echo "==> UYARI: imza anahtari yok, guncelleme dosyalari uretilmeyecek"
  IMZA_AYARI=(--config '{"bundle":{"createUpdaterArtifacts":false}}')
fi

echo "==> Windows exe ve kurulum dosyasi derleniyor ($HEDEF)"
cargo tauri build --target "$HEDEF" --bundles nsis "${IMZA_AYARI[@]}"

KAYNAK=src-tauri/target/$HEDEF/release
EXE=$(find "$KAYNAK" -maxdepth 1 -iname "*.exe" ! -iname "*build-script*" | head -1)
[ -n "$EXE" ] || { echo "HATA: exe bulunamadi ($KAYNAK)"; ls -la "$KAYNAK" || true; exit 1; }

mkdir -p /cikti
cp "$EXE" /cikti/ZsenClock.exe
echo "==> Tasinabilir: $(du -h /cikti/ZsenClock.exe | cut -f1) -> dist-windows/ZsenClock.exe"

# Surum yukselince eski surumun kurulumu target volume'unda kaliyor; `head -1`
# onu secip yenisinin yerine kopyaliyordu. En yenisini al, ciktidaki eski
# kurulumlari da temizle ki hangisinin guncel oldugu karismasin.
KURULUM=$(find "$KAYNAK/bundle/nsis" -maxdepth 1 -iname "*-setup.exe" -printf '%T@ %p\n' 2>/dev/null \
  | sort -n | tail -1 | cut -d' ' -f2-)
if [ -n "$KURULUM" ]; then
  rm -f /cikti/*-setup.exe /cikti/*-setup.exe.sig /cikti/latest.json
  cp "$KURULUM" /cikti/
  echo "==> Kurulum:    $(du -h "$KURULUM" | cut -f1) -> dist-windows/$(basename "$KURULUM")"
else
  echo "HATA: kurulum dosyasi bulunamadi ($KAYNAK/bundle/nsis)"
  ls -la "$KAYNAK/bundle" 2>/dev/null || true
  exit 1
fi

# --- 6) Guncelleme dosyalari -------------------------------------------
# Uygulama, son release'teki latest.json'a bakip yeni surumu buluyor
# (tauri.conf.json > plugins.updater.endpoints). Release'e uc dosya yuklenir:
# kurulum, imzasi (.sig) ve bu latest.json.
if [ -f "$KURULUM.sig" ]; then
  cp "$KURULUM.sig" /cikti/
  SURUM=$(node -p "require('./src-tauri/tauri.conf.json').version")
  AD=$(basename "$KURULUM")
  SURUM="$SURUM" AD="$AD" IMZA="$(cat "$KURULUM.sig")" TARIH="$(date -u +%Y-%m-%dT%H:%M:%SZ)" node -e '
    const { SURUM, AD, IMZA, TARIH } = process.env;
    const json = {
      version: SURUM,
      notes: "",
      pub_date: TARIH,
      platforms: {
        "windows-x86_64": {
          signature: IMZA,
          url: `https://github.com/OuzOzsn/zsen-clock/releases/download/v${SURUM}/${AD}`,
        },
      },
    };
    require("fs").writeFileSync("/cikti/latest.json", JSON.stringify(json, null, 2) + "\n");
  '
  echo "==> Guncelleme:  dist-windows/$AD.sig + dist-windows/latest.json (v$SURUM)"
fi
