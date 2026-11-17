# Uses synthetic data in a disposable local PostgreSQL cluster. Never reads production credentials.
param([string]$PostgresBin = (Join-Path $PSScriptRoot '../../.cache/database-backup-tools/pgsql/bin'))
$ErrorActionPreference = 'Stop'
$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('kunafa-retention-test-' + [guid]::NewGuid().ToString('N'))
$cluster = Join-Path $testRoot 'cluster'
New-Item -ItemType Directory -Path $testRoot | Out-Null
$probe = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, 0)
$probe.Start(); $port = $probe.LocalEndpoint.Port; $probe.Stop()
$started = $false
try {
    & (Join-Path $PostgresBin 'initdb.exe') -D $cluster -U postgres --auth=trust --encoding=UTF8 --locale=C *> (Join-Path $testRoot 'initdb.log')
    if ($LASTEXITCODE -ne 0) { throw 'Synthetic PostgreSQL initialization failed.' }
    $server = Start-Process -FilePath (Join-Path $PostgresBin 'pg_ctl.exe') -ArgumentList @('-D', ('"' + $cluster + '"'), '-l', ('"' + (Join-Path $testRoot 'postgres.log') + '"'), '-o', ('"-h 127.0.0.1 -p ' + $port + ' -F"'), '-w', 'start') -WindowStyle Hidden -PassThru
    if (!$server.WaitForExit(30000) -or $server.ExitCode -ne 0) { throw 'Synthetic PostgreSQL start failed.' }
    $started = $true
    $psql = Join-Path $PostgresBin 'psql.exe'
    $seed = @'
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE TABLE public.admin_users(id text PRIMARY KEY, role text);
INSERT INTO public.admin_users VALUES ('test-owner','owner'), ('not-owner','location');
GRANT SELECT ON public.admin_users TO service_role;
CREATE TABLE public.orders (id varchar(255) PRIMARY KEY, order_number text DEFAULT '#test', status text DEFAULT 'klar', payment_status text DEFAULT 'paid', payment_method text DEFAULT 'card', total_ore integer DEFAULT 10000, created_at timestamp DEFAULT '2020-01-01', updated_at timestamp DEFAULT '2020-01-01', scheduled_at timestamp, completed_at timestamp, cancelled_at timestamp, stripe_checkout_session_id text DEFAULT 'cs_live_test', refund_status text DEFAULT 'none', customer_name text DEFAULT 'Synthetic customer', customer_email text DEFAULT 'synthetic@example.invalid', customer_phone text DEFAULT 'synthetic phone', internal_notes text DEFAULT 'Synthetic work instructions', delivery_info_json jsonb DEFAULT '{"name":"Synthetic customer","email":"synthetic@example.invalid","phone":"synthetic phone","address":"Synthetic address","pricing":{"feeOre":5000}}');
GRANT SELECT, UPDATE ON public.orders TO service_role;
INSERT INTO public.orders(id) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
'@
    $seedPath = Join-Path $testRoot 'seed.sql'
    [System.IO.File]::WriteAllText($seedPath, $seed)
    & $psql -X -h 127.0.0.1 -p $port -U postgres -d postgres -v ON_ERROR_STOP=1 -f $seedPath *> (Join-Path $testRoot 'seed.log')
    if ($LASTEXITCODE -ne 0) { throw 'Synthetic schema creation failed.' }
    & $psql -X -h 127.0.0.1 -p $port -U postgres -d postgres -v ON_ERROR_STOP=1 -f (Join-Path $PSScriptRoot '../src/db/migrations/20261117165627_order_retention_holds.sql') *> (Join-Path $testRoot 'migration.log')
    if ($LASTEXITCODE -ne 0) { throw 'Retention migration failed in synthetic PostgreSQL.' }
    $result = & $psql -X -h 127.0.0.1 -p $port -U postgres -d postgres -v ON_ERROR_STOP=1 -f (Join-Path $PSScriptRoot '../src/db/verification/order-retention-holds.sql') 2>&1
    if ($LASTEXITCODE -ne 0) { throw ($result -join [Environment]::NewLine) }
    Write-Host ($result -join [Environment]::NewLine)
} finally {
    if ($started) { & (Join-Path $PostgresBin 'pg_ctl.exe') -D $cluster -m fast -w stop *> (Join-Path $testRoot 'stop.log') }
    $resolved = [System.IO.Path]::GetFullPath($testRoot)
    $tempBase = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    if (!$resolved.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase) -or (Split-Path $resolved -Leaf) -notlike 'kunafa-retention-test-*') { throw 'Unsafe test cleanup path.' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
