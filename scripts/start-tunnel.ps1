# Inicia el túnel Cloudflare para recibir webhooks de Shipday
$cloudflared = "C:\Users\jimen\AppData\Local\Microsoft\WinGet\Packages\Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe\cloudflared.exe"
Start-Process -FilePath $cloudflared -ArgumentList "tunnel --url http://localhost:4000" -WindowStyle Minimized
Write-Host "Tunel Cloudflare iniciado"
