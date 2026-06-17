# Cash Buddy EPA - Instalador para PC nuevo
# Uso (en PowerShell como Administrador):
#   iex (irm https://raw.githubusercontent.com/alejiar200-sudo/cash-buddy-epa/main/scripts/install.ps1)

$ErrorActionPreference = "Stop"

function Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "    $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "    $msg" -ForegroundColor Yellow }

# ---- 0. Requiere admin (winget install + firewall) ----
$isAdmin = ([Security.Principal.WindowsPrincipal] `
  [Security.Principal.WindowsIdentity]::GetCurrent() `
).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")
if (-not $isAdmin) {
  Warn "Este script necesita PowerShell como Administrador."
  Warn "Cierra esta ventana, abre PowerShell con 'Ejecutar como administrador' y vuelve a pegar el comando."
  exit 1
}

Write-Host ""
Write-Host "+--------------------------------------+" -ForegroundColor Cyan
Write-Host "|        Cash Buddy EPA                |" -ForegroundColor Cyan
Write-Host "|        Instalador automático         |" -ForegroundColor Cyan
Write-Host "+--------------------------------------+" -ForegroundColor Cyan
Write-Host ""

# ---- 1. PostgreSQL ----
Step "Verificando PostgreSQL..."
$svc = Get-Service postgresql-x64-17 -ErrorAction SilentlyContinue
if (-not $svc) {
  Step "Instalando PostgreSQL 17 (puede tardar 5-10 min)..."
  winget install --id PostgreSQL.PostgreSQL.17 `
    --silent --accept-source-agreements --accept-package-agreements `
    --override "--mode unattended --unattendedmodeui none --superpassword postgres --serverport 5432 --servicename postgresql-x64-17"
  Start-Sleep -Seconds 5
  Ok "PostgreSQL instalado."
} else {
  Ok "PostgreSQL ya está instalado."
}

# Asegurar que PostgreSQL arranque automáticamente con Windows y esté activo ahora.
$svc = Get-Service postgresql-x64-17 -ErrorAction SilentlyContinue
if ($svc) {
  Set-Service -Name postgresql-x64-17 -StartupType Automatic
  Ok "PostgreSQL configurado como inicio automático."
  if ($svc.Status -ne "Running") { Start-Service postgresql-x64-17 }
}

# ---- 2. Localizar psql ----
$psql = Get-ChildItem 'C:\Program Files\PostgreSQL' -Recurse -Filter psql.exe -ErrorAction SilentlyContinue |
  Select-Object -First 1 -ExpandProperty FullName
if (-not $psql) {
  Warn "No se encontró psql.exe. Cierra y reabre PowerShell e intenta otra vez."
  exit 1
}

# ---- 3. Crear DB cashbuddy ----
Step "Preparando la base de datos 'cashbuddy'..."
$env:PGPASSWORD = "postgres"
$exists = & $psql -U postgres -h localhost -p 5432 -tAc "SELECT 1 FROM pg_database WHERE datname='cashbuddy';" 2>$null
if ($exists -ne "1") {
  & $psql -U postgres -h localhost -p 5432 -c "CREATE DATABASE cashbuddy;" | Out-Null
  Ok "Base de datos 'cashbuddy' creada."
} else {
  Ok "Base de datos 'cashbuddy' ya existe."
}

# ---- 4. Descargar el instalador ----
Step "Descargando Cash Buddy EPA..."
$installer = "$env:TEMP\CashBuddyEPA-Setup.exe"
$url = "https://github.com/alejiar200-sudo/cash-buddy-epa/releases/latest/download/Cash-Buddy-EPA-Setup.exe"
Invoke-WebRequest -Uri $url -OutFile $installer -UseBasicParsing
Ok "Descargado en $installer"

# ---- 5. Ejecutar el instalador (NSIS silencioso) ----
Step "Instalando la app..."
Start-Process -FilePath $installer -ArgumentList "/S" -Wait
Ok "App instalada."

# ---- 6. Tarea programada para inicio automático de CashBuddy.exe ----
Step "Configurando inicio automático de Cash Buddy EPA..."
$exePath = "C:\EPA DOMICILIOS\cash-buddy-epa\CashBuddy.exe"
$taskName = "CashBuddyEPA_Autostart"
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false }
if (Test-Path $exePath) {
  $action  = New-ScheduledTaskAction -Execute $exePath
  $trigger = New-ScheduledTaskTrigger -AtLogOn
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit 0
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
    -Settings $settings -RunLevel Highest -Force | Out-Null
  Ok "Tarea programada 'CashBuddyEPA_Autostart' creada (inicio al iniciar sesión)."
} else {
  Warn "CashBuddy.exe no encontrado en $exePath — tarea no creada."
}

# ---- 7. Regla de firewall (puerto 4000 para acceso remoto vía Tailscale) ----
Step "Configurando firewall para acceso remoto (puerto 4000)..."
$rule = Get-NetFirewallRule -DisplayName "Cash Buddy EPA" -ErrorAction SilentlyContinue
if (-not $rule) {
  New-NetFirewallRule -DisplayName "Cash Buddy EPA" `
    -Direction Inbound -LocalPort 4000 -Protocol TCP -Action Allow | Out-Null
  Ok "Regla de firewall creada."
} else {
  Ok "Regla de firewall ya existía."
}

# ---- 7. Listo ----
Write-Host ""
Write-Host "+--------------------------------------+" -ForegroundColor Green
Write-Host "|  Instalación completa.               |" -ForegroundColor Green
Write-Host "+--------------------------------------+" -ForegroundColor Green
Write-Host ""
Write-Host "  - Abre 'Cash Buddy EPA' desde el Escritorio."
Write-Host "  - Credenciales iniciales: admin@cashbuddy.local / admin123"
Write-Host "  - Acceso remoto vía Tailscale: http://<ip-tailscale>:4000"
Write-Host ""
