<#
  Windows .exe'yi Docker icinde derler. Bu makineye Rust/VS Build Tools kurulmaz.

  Kullanim:
    .\build.ps1            # derle
    .\build.ps1 -Yeniden   # Docker imajini sifirdan kur
    .\build.ps1 -Temizle   # ara katmanlari (cache volume'leri) sil
    .\build.ps1 -Imzasiz   # imza sifresi sormadan, kurulumlu build
    .\build.ps1 -Deneme    # test icin: kurulumsuz ZsenClock-Deneme.exe
#>
param(
    [switch]$Yeniden,
    [switch]$Temizle,
    # Imza anahtarini kullanma, sifre sorma. Release'e konmaz.
    [switch]$Imzasiz,
    # Kurulumsuz "ZsenClock Deneme" exe'si: kurulu surumun yaninda calisir.
    [switch]$Deneme
)

$ErrorActionPreference = 'Stop'
$Kok   = $PSScriptRoot
$Imaj  = 'zsenclock-build'
$Cikti = Join-Path $Kok 'dist-windows'

function Adim($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }

# Docker ayakta mi?
try { docker info --format '{{.ServerVersion}}' *> $null } catch { }
if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker Desktop calismiyor. Baslatiliyor..." -ForegroundColor Yellow
    Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    Write-Host "Docker acilinca bu betigi tekrar calistir." -ForegroundColor Yellow
    exit 1
}

if ($Temizle) {
    Adim 'Cache volume''leri siliniyor'
    docker volume rm -f zsenclock-node zsenclock-target zsenclock-cargo zsenclock-xwin zsenclock-tauri
    exit 0
}

# --- Imaj ---
$Var = docker images -q $Imaj
if ($Yeniden -or -not $Var) {
    Adim 'Docker imaji kuruluyor (ilk seferde 5-10 dk surer)'
    docker build -t $Imaj -f (Join-Path $Kok 'docker\Dockerfile') $Kok
    if ($LASTEXITCODE -ne 0) { throw 'Imaj kurulumu basarisiz' }
}

New-Item -ItemType Directory -Force -Path $Cikti | Out-Null

# Release build'inden once butun testler (scripts/onay.sh). Biri bile
# kalirsa derleme baslamaz. Rust testlerini build.sh zaten kosuyor, burada
# atlaniyor. Testler WSL'de calisiyor (node + Playwright orada kurulu).
if (-not $Deneme) {
    Adim 'Onay testleri (scripts/onay.sh)'
    wsl.exe --cd "$Kok" -- bash -lc 'bash scripts/onay.sh --rustsuz'
    if ($LASTEXITCODE -ne 0) { throw 'Testler gecmedi - release build alinmaz' }
}

# Guncelleme imza anahtari repoda degil, kullanicinin klasorunde duruyor.
# Container'a salt okunur baglaniyor; yoksa imzasiz derlenir. Anahtar sifreli:
# sifre burada sorulur, ortam degiskeniyle (degeri komut satirina yazilmadan)
# container'a gecer ve is bitince silinir.
$AnahtarKlasoru = Join-Path $env:USERPROFILE '.tauri'
$AnahtarBagi = @()
if ($Deneme) {
    $AnahtarBagi = @('-e', 'DENEME=1')
} elseif (-not $Imzasiz -and (Test-Path (Join-Path $AnahtarKlasoru 'zsenclock-updater.key'))) {
    $Gizli = Read-Host 'Guncelleme imza anahtarinin sifresi' -AsSecureString
    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD =
        [System.Net.NetworkCredential]::new('', $Gizli).Password
    $AnahtarBagi = @('-v', "${AnahtarKlasoru}:/anahtar:ro", '-e', 'TAURI_SIGNING_PRIVATE_KEY_PASSWORD')
}

# node_modules ve target dizinleri volume ile golgelenir:
# Windows'taki node_modules platforma ozel ikililer icerir, container'da kullanilamaz.
Adim 'Derleniyor'
docker run --rm `
    @AnahtarBagi `
    -v "${Kok}:/app" `
    -v zsenclock-node:/app/node_modules `
    -v zsenclock-target:/app/src-tauri/target `
    -v zsenclock-cargo:/usr/local/cargo/registry `
    -v zsenclock-xwin:/xwin `
    -v zsenclock-tauri:/root/.cache/tauri `
    -v "${Cikti}:/cikti" `
    $Imaj bash docker/build.sh

$Kod = $LASTEXITCODE
Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue
if ($Kod -ne 0) { throw 'Derleme basarisiz' }

if ($Deneme) {
    Write-Host "`nDeneme: $(Join-Path $Cikti 'ZsenClock-Deneme.exe')" -ForegroundColor Green
    exit 0
}

$Exe = Join-Path $Cikti 'ZsenClock.exe'
$Mb  = [math]::Round((Get-Item $Exe).Length / 1MB, 1)
Write-Host "`nTasinabilir: $Exe ($Mb MB)" -ForegroundColor Green

$Kurulum = Get-ChildItem -Path $Cikti -Filter '*-setup.exe' | Select-Object -First 1
if ($Kurulum) {
    $KMb = [math]::Round($Kurulum.Length / 1MB, 1)
    Write-Host "Kurulum:     $($Kurulum.FullName) ($KMb MB)" -ForegroundColor Green
}
if (Test-Path (Join-Path $Cikti 'latest.json')) {
    Write-Host "Guncelleme:  latest.json + .sig hazir - release'e kurulumla birlikte yukle" -ForegroundColor Green
}
