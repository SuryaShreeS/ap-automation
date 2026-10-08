# Start the local (portable) PostgreSQL 16 server for the AP Invoice Platform.
# The server lives in %LOCALAPPDATA%\ap-invoice-pg (outside the repo / OneDrive sync).
$ErrorActionPreference = "Stop"
$root = "$env:LOCALAPPDATA\ap-invoice-pg"
$bin  = "$root\pgsql\bin"
$data = "$root\data"

if (-not (Test-Path "$bin\pg_ctl.exe")) { Write-Error "Postgres not found at $bin. Re-run setup."; exit 1 }

& "$bin\pg_ctl.exe" -D $data -l "$root\pg.log" -o "-p 5432" start
Start-Sleep -Seconds 2
& "$bin\pg_ctl.exe" -D $data status
Write-Host "`nConnection string:"
Write-Host "  postgresql+psycopg://apuser:appass@localhost:5432/apinvoice"
