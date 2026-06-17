# Compila CashBuddy.exe (lanzador de escritorio WebView2).
# Embebe los 3 DLLs de WebView2 como recursos y usa el ícono de la app.
# Uso:  powershell -ExecutionPolicy Bypass -File scripts\build-launcher.ps1

$ErrorActionPreference = "Stop"
$root  = Split-Path $PSScriptRoot -Parent          # C:\cash-buddy-epa
$build = Join-Path $PSScriptRoot "launcher-build"
$csc   = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$exe   = Join-Path $root "CashBuddy.exe"

$core    = Join-Path $build "Microsoft.Web.WebView2.Core.dll"
$winforms= Join-Path $build "Microsoft.Web.WebView2.WinForms.dll"
$loader  = Join-Path $build "WebView2Loader.dll"
$cs      = Join-Path $build "CashBuddy.cs"
$icon    = Join-Path $root "apps\web\app\favicon.ico"
if (-not (Test-Path $icon)) { $icon = Join-Path $build "favicon.ico" }

foreach ($f in @($core,$winforms,$loader,$cs)) {
  if (-not (Test-Path $f)) { throw "Falta el archivo requerido: $f" }
}

# Cierra cualquier instancia abierta para no chocar con el archivo bloqueado.
Get-Process -Name "CashBuddy" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 400

$args = @(
  "/target:winexe",
  "/out:`"$exe`"",
  "/win32icon:`"$icon`"",
  "/reference:`"$core`"",
  "/reference:`"$winforms`"",
  "/resource:`"$core`",wv2.Core.dll",
  "/resource:`"$winforms`",wv2.WinForms.dll",
  "/resource:`"$loader`",wv2.Loader.dll",
  "`"$cs`""
)

Write-Host "Compilando CashBuddy.exe…" -ForegroundColor Cyan
& $csc @args
if ($LASTEXITCODE -ne 0) { throw "csc falló con código $LASTEXITCODE" }

Write-Host ("OK -> {0} ({1:N0} bytes)" -f $exe, (Get-Item $exe).Length) -ForegroundColor Green
