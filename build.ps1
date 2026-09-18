<#
  Windows .exe'yi Docker icinde derler. Bu makineye Rust/VS Build Tools kurulmaz.

  Kullanim:
    .\build.ps1            # derle
    .\build.ps1 -Yeniden   # Docker imajini sifirdan kur
    .\build.ps1 -Temizle   # ara katmanlari (cache volume'leri) sil
#>
param(
    [switch]$Yeniden,
    [switch]$Temizle
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

# node_modules ve target dizinleri volume ile golgelenir:
# Windows'taki node_modules platforma ozel ikililer icerir, container'da kullanilamaz.
Adim 'Derleniyor'
docker run --rm `
    -v "${Kok}:/app" `
    -v zsenclock-node:/app/node_modules `
    -v zsenclock-target:/app/src-tauri/target `
    -v zsenclock-cargo:/usr/local/cargo/registry `
    -v zsenclock-xwin:/xwin `
    -v zsenclock-tauri:/root/.cache/tauri `
    -v "${Cikti}:/cikti" `
    $Imaj bash docker/build.sh

if ($LASTEXITCODE -ne 0) { throw 'Derleme basarisiz' }

$Exe = Join-Path $Cikti 'ZsenClock.exe'
$Mb  = [math]::Round((Get-Item $Exe).Length / 1MB, 1)
Write-Host "`nTasinabilir: $Exe ($Mb MB)" -ForegroundColor Green

$Kurulum = Get-ChildItem -Path $Cikti -Filter '*-setup.exe' | Select-Object -First 1
if ($Kurulum) {
    $KMb = [math]::Round($Kurulum.Length / 1MB, 1)
    Write-Host "Kurulum:     $($Kurulum.FullName) ($KMb MB)" -ForegroundColor Green
}
