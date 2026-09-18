<#
  Uygulamanin gercek bellek kullanimini olcer.

  Neden ayri bir betik: Gorev Yoneticisi'nde WebView2 surecleri ayri ayri
  gorunuyor ve bir kismi baska uygulamalara ait olabiliyor. Bu betik yalnizca
  Zsen Clock'un kendi surec agacini topluyor.

  Iki sayi veriyor, ikisi de dogru ama farkli seyi olcuyor:

    Calisma kumesi (working set)  - sureclerin RAM'de tuttugu toplam sayfa.
        Chromium'un paylasilan kod sayfalari her surecte tekrar sayildigi icin
        gercekte kullanilan RAM'den YUKSEK cikar.

    Ozel bellek (private working set) - yalnizca o surece ait sayfalar.
        Gorev Yoneticisi'nin "Bellek" sutununda gosterdigi deger budur ve
        uygulamayi kapatinca sisteme geri donen miktara daha yakindir.

  Kullanim:  .\scripts\bellek-olc.ps1
#>

$ErrorActionPreference = 'Stop'

$ana = Get-Process -Name ZsenClock -ErrorAction SilentlyContinue
if (-not $ana) {
    Write-Host "Zsen Clock calismiyor. Once uygulamayi baslat." -ForegroundColor Yellow
    exit 1
}

$tum = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name

function Get-Cocuklar($ebeveyn) {
    $c = $tum | Where-Object { $_.ParentProcessId -eq $ebeveyn }
    $c
    foreach ($x in $c) { Get-Cocuklar $x.ProcessId }
}

$agac = @($tum | Where-Object { $_.ProcessId -eq $ana.Id }) + (Get-Cocuklar $ana.Id)

# Ozel calisma kumesi yalnizca performans sayaclarindan alinabiliyor.
$ozelSayac = @{}
try {
    (Get-Counter '\Process(*)\Working Set - Private' -ErrorAction Stop).CounterSamples |
        ForEach-Object {
            if ($_.InstanceName -match 'zsenclock|msedgewebview2') {
                $ozelSayac[$_.Path] = $_.CookedValue
            }
        }
} catch {
    # Sayac yoksa yalnizca calisma kumesi raporlanir.
}

$satirlar = foreach ($s in $agac) {
    $p = Get-Process -Id $s.ProcessId -ErrorAction SilentlyContinue
    if (-not $p) { continue }
    [pscustomobject]@{
        Surec   = $s.Name
        PID     = $s.ProcessId
        CalismaMB = [math]::Round($p.WorkingSet64 / 1MB, 1)
        OzelMB    = [math]::Round($p.PrivateMemorySize64 / 1MB, 1)
    }
}

$satirlar | Sort-Object CalismaMB -Descending | Format-Table -AutoSize

$calisma = ($satirlar | Measure-Object CalismaMB -Sum).Sum
$ozel    = ($satirlar | Measure-Object OzelMB -Sum).Sum

Write-Host ""
Write-Host ("Surec sayisi     : {0}" -f $satirlar.Count)
Write-Host ("Calisma kumesi   : {0:N0} MB  (paylasilan sayfalar tekrar sayilir)" -f $calisma)
Write-Host ("Ozel bellek      : {0:N0} MB  (gercek ayak izine daha yakin)" -f $ozel) -ForegroundColor Cyan
