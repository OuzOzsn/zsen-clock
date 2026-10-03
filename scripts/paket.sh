#!/usr/bin/env bash
# Release paketi: testler -> imza sifresi -> imzali Windows build'i.
#
#   npm run paket
#
# build.ps1'in WSL/Linux karsiligi. Testlerden biri kalirsa sifre bile
# sorulmaz. Sifre ekrana yazilmaz, komut satirina da gecmez: yalnizca bu
# surecin ortam degiskeni olarak Docker'a aktarilir.
#
# Cikti dist-windows/ altinda: ZsenClock.exe, kurulum, .sig, latest.json.
# Dordu de GitHub release'ine yuklenir.
set -euo pipefail
cd "$(dirname "$0")/.."

# --- 1) Testler --------------------------------------------------------
# Rust testlerini build.sh zaten kosuyor.
if ! bash scripts/onay.sh --rustsuz; then
  echo "Testler gecmedi - paket alinmaz."
  exit 1
fi

# --- 2) Docker ve yollar -----------------------------------------------
# WSL'de Windows'taki Docker Desktop kullaniliyor; o Windows yollari ister.
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  DOCKER=docker
  yol() { echo "$1"; }
  ANAHTAR_KLASORU=${ZSEN_ANAHTAR_KLASORU:-$HOME/.tauri}
else
  DOCKER="/mnt/c/Program Files/Docker/Docker/resources/bin/docker.exe"
  yol() { wslpath -w "$1"; }
  WIN_EV=$(wslpath "$(cmd.exe /c 'echo %USERPROFILE%' 2>/dev/null | tr -d '\r')")
  ANAHTAR_KLASORU=${ZSEN_ANAHTAR_KLASORU:-$WIN_EV/.tauri}
fi
"$DOCKER" info >/dev/null 2>&1 || { echo "Docker Desktop calismiyor. Acip tekrar dene."; exit 1; }

ANAHTAR="$ANAHTAR_KLASORU/zsenclock-updater.key"
[ -f "$ANAHTAR" ] || { echo "Imza anahtari yok: $ANAHTAR"; exit 1; }

# --- 3) Sifre ----------------------------------------------------------
read -rsp "Guncelleme imza anahtarinin sifresi: " SIFRE
echo
[ -n "$SIFRE" ] || { echo "Sifre bos olamaz."; exit 1; }
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$SIFRE"
unset SIFRE
# Windows'taki docker.exe'ye WSL ortam degiskeni ancak WSLENV ile gecer.
export WSLENV="${WSLENV:+$WSLENV:}TAURI_SIGNING_PRIVATE_KEY_PASSWORD"

# --- 4) Imzali build ---------------------------------------------------
mkdir -p dist-windows
SURUM=$(node -p "require('./src-tauri/tauri.conf.json').version")
echo "==> v$SURUM derleniyor (birkac dakika surer)"
"$DOCKER" run --rm \
  -v "$(yol "$ANAHTAR_KLASORU"):/anahtar:ro" \
  -e TAURI_SIGNING_PRIVATE_KEY_PASSWORD \
  -v "$(yol "$PWD"):/app" \
  -v zsenclock-node:/app/node_modules \
  -v zsenclock-target:/app/src-tauri/target \
  -v zsenclock-cargo:/usr/local/cargo/registry \
  -v zsenclock-xwin:/xwin \
  -v zsenclock-tauri:/root/.cache/tauri \
  -v "$(yol "$PWD/dist-windows"):/cikti" \
  zsenclock-build bash docker/build.sh
unset TAURI_SIGNING_PRIVATE_KEY_PASSWORD

# --- 5) Kontrol --------------------------------------------------------
eksik=0
for f in ZsenClock.exe "ZsenClock_${SURUM}_x64-setup.exe" "ZsenClock_${SURUM}_x64-setup.exe.sig" latest.json; do
  if [ -f "dist-windows/$f" ]; then echo "  hazir: dist-windows/$f"; else echo "  EKSIK: dist-windows/$f"; eksik=1; fi
done
[ "$eksik" = 0 ] || exit 1
echo "v$SURUM paketi hazir. Dort dosya da release'e yuklenecek."
