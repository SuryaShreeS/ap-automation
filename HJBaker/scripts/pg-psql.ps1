# Open a psql shell on the AP Invoice database.
$root = "$env:LOCALAPPDATA\ap-invoice-pg"
& "$root\pgsql\bin\psql.exe" -U apuser -h 127.0.0.1 -p 5432 -d apinvoice
