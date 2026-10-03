#!/usr/bin/env bash
# Yayin oncesi onay: butun testler. Biri bile kirmiziysa cikis kodu 1.
#
#   npm run onay              # hepsi
#   bash scripts/onay.sh --rustsuz   # Rust testleri haric (build.ps1 kullanir;
#                                    # build.sh zaten cargo test kosuyor)
#
# Sirasi: tip kontrolu -> hesap testleri (node) -> arayuz derlemesi ->
# arayuz testleri (Playwright, tarayicida sahte veriyle) -> Rust cekirdek
# testleri (Docker icinde). Yeni ozellik = bu adimlardan birine yeni test.
set -uo pipefail

cd "$(dirname "$0")/.."
RUST=1
[ "${1:-}" = "--rustsuz" ] && RUST=0

KIRMIZI=$'\e[31m'; YESIL=$'\e[32m'; MAVI=$'\e[36m'; SIFIR=$'\e[0m'
SONUC=()
BASARISIZ=0

adim() {
  local ad="$1"; shift
  echo "${MAVI}==> $ad${SIFIR}"
  if "$@"; then
    SONUC+=("${YESIL}GECTI${SIFIR}  $ad")
  else
    SONUC+=("${KIRMIZI}KALDI${SIFIR}  $ad")
    BASARISIZ=1
  fi
}

derle() {
  local gecici
  gecici=$(mktemp -d)
  npx vite build --outDir "$gecici" --emptyOutDir --logLevel warn
  local kod=$?
  rm -rf "$gecici"
  return $kod
}

rust_testleri() {
  # Docker: Linux'ta dogrudan, WSL'de Windows'taki Docker Desktop uzerinden.
  local docker=docker kok="$PWD"
  if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
    docker="/mnt/c/Program Files/Docker/Docker/resources/bin/docker.exe"
    kok=$(wslpath -w "$PWD")
  fi
  "$docker" run --rm \
    -v "$kok:/app" \
    -v zsenclock-target:/app/src-tauri/target \
    -v zsenclock-cargo:/usr/local/cargo/registry \
    zsenclock-build bash -c 'cd /app/src-tauri/cekirdek && RUSTFLAGS= cargo test --quiet'
}

adim "Tip kontrolu (svelte-check)" npx svelte-check --tsconfig ./tsconfig.json --threshold error
adim "Hesap testleri (src/lib/*.test.ts)" node --experimental-strip-types --test src/lib/*.test.ts
adim "Arayuz derlemesi (vite build)" derle
adim "Arayuz testleri (e2e/, Playwright)" npx playwright test
if [ "$RUST" = 1 ]; then
  adim "Rust cekirdek testleri (Docker)" rust_testleri
fi

echo
echo "------------------------------------------------------------"
for s in "${SONUC[@]}"; do echo "  $s"; done
echo "------------------------------------------------------------"
if [ "$BASARISIZ" = 1 ]; then
  echo "${KIRMIZI}ONAY YOK: yayinlanmaz.${SIFIR}"
  exit 1
fi
echo "${YESIL}ONAY: hepsi gecti, yayinlanabilir.${SIFIR}"
