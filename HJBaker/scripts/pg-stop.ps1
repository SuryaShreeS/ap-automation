# Stop the local (portable) PostgreSQL 16 server.
$ErrorActionPreference = "Stop"
$root = "$env:LOCALAPPDATA\ap-invoice-pg"
& "$root\pgsql\bin\pg_ctl.exe" -D "$root\data" stop -m fast
