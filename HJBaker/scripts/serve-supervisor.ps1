# Always-on supervisor for the Alferix AP platform.
# Ensures PostgreSQL (5432), backend (8001) and frontend (3001) are running.
# Idempotent: only (re)starts a service when its port is not listening.
# Launched at logon by the "AlferixAP-Servers" scheduled task; self-heals every 20s.
$ErrorActionPreference = "SilentlyContinue"
$root = "C:\Users\Admin\OneDrive - Alferix (1)\Documents\Projects\HJBaker"
$logs = "$root\scripts\logs"
New-Item -ItemType Directory -Force -Path $logs | Out-Null

# Single-instance guard: if another supervisor holds the lock and is alive, exit.
$lock = "$logs\supervisor.lock"
if (Test-Path $lock) {
  $old = Get-Content $lock -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($old -and (Get-Process -Id $old -ErrorAction SilentlyContinue)) { exit }
}
$PID | Out-File -FilePath $lock -Encoding ascii -Force

function PortUp($p) {
  [bool](Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue)
}
function Log($m) { "$(Get-Date -Format 'u')  $m" | Out-File -FilePath "$logs\supervisor.log" -Append -Encoding utf8 }

Log "supervisor started (pid $PID)"
while ($true) {
  if (-not (PortUp 5432)) {
    Log "starting PostgreSQL"
    & "$root\scripts\pg-start.ps1" *>> "$logs\pg.log"
  }
  if (-not (PortUp 8001)) {
    Log "starting backend (uvicorn 8001)"
    Start-Process -FilePath "$root\backend\.venv\Scripts\python.exe" `
      -ArgumentList "-m","uvicorn","app.main:app","--host","127.0.0.1","--port","8001" `
      -WorkingDirectory "$root\backend" -WindowStyle Hidden `
      -RedirectStandardOutput "$logs\backend.out.log" -RedirectStandardError "$logs\backend.err.log"
  }
  if (-not (PortUp 3001)) {
    Log "starting frontend (next dev 3001)"
    Start-Process -FilePath "C:\Program Files\nodejs\npm.cmd" `
      -ArgumentList "run","dev","--","-p","3001" `
      -WorkingDirectory "$root\frontend" -WindowStyle Hidden `
      -RedirectStandardOutput "$logs\frontend.out.log" -RedirectStandardError "$logs\frontend.err.log"
  }
  Start-Sleep -Seconds 20
}
