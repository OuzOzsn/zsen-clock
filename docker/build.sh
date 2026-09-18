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
echo "==> Windows exe ve kurulum dosyasi derleniyor ($HEDEF)"
cargo tauri build --target "$HEDEF" --bundles nsis

KAYNAK=src-tauri/target/$HEDEF/release
EXE=$(find "$KAYNAK" -maxdepth 1 -iname "*.exe" ! -iname "*build-script*" | head -1)
[ -n "$EXE" ] || { echo "HATA: exe bulunamadi ($KAYNAK)"; ls -la "$KAYNAK" || true; exit 1; }

mkdir -p /cikti
cp "$EXE" /cikti/ZsenClock.exe
echo "==> Tasinabilir: $(du -h /cikti/ZsenClock.exe | cut -f1) -> dist-windows/ZsenClock.exe"

KURULUM=$(find "$KAYNAK/bundle/nsis" -maxdepth 1 -iname "*-setup.exe" 2>/dev/null | head -1)
if [ -n "$KURULUM" ]; then
  cp "$KURULUM" /cikti/
  echo "==> Kurulum:    $(du -h "$KURULUM" | cut -f1) -> dist-windows/$(basename "$KURULUM")"
else
  echo "HATA: kurulum dosyasi bulunamadi ($KAYNAK/bundle/nsis)"
  ls -la "$KAYNAK/bundle" 2>/dev/null || true
  exit 1
fi
