# Uses only synthetic files and a disposable local PostgreSQL cluster.
param([string]$PostgresBin = (Join-Path $PSScriptRoot '../../.cache/database-backup-tools/pgsql/bin'))
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot '../scripts/database-backup/DatabaseBackup.psm1') -Force

function Assert-True($Condition, [string]$Message) {
    if (!$Condition) { throw $Message }
}

Assert-True ((Get-Module Microsoft.PowerShell.Security -All | Select-Object -First 1).Path.StartsWith($PSHOME, [System.StringComparison]::OrdinalIgnoreCase)) 'Security module must match Windows PowerShell even when launched by PowerShell 7.'

$now = [datetime]'2026-11-17T21:29:00'
Assert-True (Test-BackupDue -Now $now -LastSuccess ([datetime]'2026-11-15T22:00:00')) 'Missed previous evening must catch up before 21:30.'
Assert-True (!(Test-BackupDue -Now $now -LastSuccess ([datetime]'2026-11-16T21:31:00'))) 'Successful previous evening is current before 21:30.'
Assert-True (Test-BackupDue -Now ([datetime]'2026-11-17T21:30:00') -LastSuccess ([datetime]'2026-11-17T10:00:00')) 'Morning catch-up does not replace the next evening backup.'
Assert-True (!(Test-BackupDue -Now ([datetime]'2026-11-17T21:31:00') -LastSuccess ([datetime]'2026-11-17T21:30:00'))) 'An overlapping sign-in trigger must not duplicate tonight.'
Write-Host 'PASS: 21:30 due-time and missed-run rules'

$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('kunafa-backup-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot | Out-Null
$certificate = $null
$wrongCertificate = $null
try {
    $certificate = New-SelfSignedCertificate -Subject 'CN=Kunafa disposable backup test' -Type DocumentEncryptionCert -KeyAlgorithm RSA -KeyLength 2048 -KeyExportPolicy Exportable -CertStoreLocation Cert:\CurrentUser\My -NotAfter (Get-Date).AddDays(1)
    $sourceFile = Join-Path $testRoot 'synthetic.txt'
    $original = [System.Text.Encoding]::UTF8.GetBytes('Synthetic customer: \u00e5\u00e4\u00f6; no real data')
    [System.IO.File]::WriteAllBytes($sourceFile, $original)
    $protectedFile = Join-Path $testRoot 'synthetic.p7m'
    Protect-BackupFile -InputFile $sourceFile -OutputFile $protectedFile -Certificate $certificate
    Assert-True ([System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($protectedFile)) -notmatch 'Synthetic customer') 'Encrypted archive must not expose plaintext.'
    $wrongCertificate = New-SelfSignedCertificate -Subject 'CN=Kunafa wrong disposable test key' -Type DocumentEncryptionCert -KeyExportPolicy Exportable -CertStoreLocation Cert:\CurrentUser\My -NotAfter (Get-Date).AddDays(1)
    $wrongKeyRejected = $false
    try { Unprotect-BackupFile -InputFile $protectedFile -OutputFile (Join-Path $testRoot 'wrong-key.txt') -Certificate $wrongCertificate } catch { $wrongKeyRejected = $true }
    Assert-True $wrongKeyRejected 'An unrelated recovery key must be rejected even when the correct key exists in the Windows store.'
    $recoveryPassword = ConvertTo-SecureString 'test-only-recovery-password' -AsPlainText -Force
    $recoveryFile = Join-Path $testRoot 'recovery.pfx'
    Export-PfxCertificate -Cert $certificate -FilePath $recoveryFile -Password $recoveryPassword | Out-Null
    $portableKey = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($recoveryFile, $recoveryPassword, [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet)
    $recovered = Join-Path $testRoot 'recovered.txt'
    Remove-Item -LiteralPath ('Cert:\CurrentUser\My\' + $certificate.Thumbprint)
    try { Unprotect-BackupFile -InputFile $protectedFile -OutputFile $recovered -Certificate $portableKey }
    finally {
        $store = New-Object System.Security.Cryptography.X509Certificates.X509Store('My', 'CurrentUser')
        $store.Open('ReadWrite'); $store.Add($certificate); $store.Close()
    }
    Assert-True ([Convert]::ToBase64String([System.IO.File]::ReadAllBytes($recovered)) -eq [Convert]::ToBase64String($original)) 'Portable recovery key must recover exact bytes.'
    Write-Host 'PASS: encryption and independent PFX recovery'

    $task = New-BackupTaskDefinition -InstallRoot $testRoot -UserName ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name)
    [xml]$taskXml = Export-ScheduledTask -InputObject $task
    Assert-True ($taskXml.Task.Triggers.CalendarTrigger.StartBoundary -match 'T21:30:00') 'Task must run at 21:30 local time.'
    Assert-True ($taskXml.Task.Settings.StartWhenAvailable -eq 'true') 'Task must recover a missed daily trigger.'
    Assert-True ($taskXml.Task.Triggers.LogonTrigger.Enabled -eq 'true') 'Task must catch up on user sign-in.'
    Assert-True ($taskXml.Task.Settings.MultipleInstancesPolicy -eq 'IgnoreNew') 'Overlapping triggers must not run in parallel.'
    Write-Host 'PASS: daily and sign-in task definition'

    $cluster = Join-Path $testRoot 'cluster'
    $portProbe = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, 0)
    $portProbe.Start(); $testPort = $portProbe.LocalEndpoint.Port; $portProbe.Stop()
    $testPassword = 'synthetic:password!with spaces\and-symbols'
    $passwordFile = Join-Path $testRoot 'test-password.txt'
    [System.IO.File]::WriteAllText($passwordFile, $testPassword)
    & (Join-Path $PostgresBin 'initdb.exe') -D $cluster -U postgres --auth=scram-sha-256 "--pwfile=$passwordFile" --encoding=UTF8 --locale=C *> (Join-Path $testRoot 'initdb.log')
    Assert-True ($LASTEXITCODE -eq 0) 'Synthetic local test cluster must initialize.'
    $startServer = Start-Process -FilePath (Join-Path $PostgresBin 'pg_ctl.exe') -ArgumentList @('-D', ('"' + $cluster + '"'), '-l', ('"' + (Join-Path $testRoot 'postgres.log') + '"'), '-o', ('"-h 127.0.0.1 -p ' + $testPort + ' -F"'), '-w', 'start') -WindowStyle Hidden -PassThru
    Assert-True ($startServer.WaitForExit(30000) -and $startServer.ExitCode -eq 0) 'Synthetic local test cluster must start.'
    try {
        $env:PGPASSWORD = $testPassword
        $seed = "CREATE ROLE synthetic_reader; CREATE TABLE orders (id integer PRIMARY KEY, customer text); INSERT INTO orders VALUES (1, 'synthetic only'); ALTER TABLE orders ENABLE ROW LEVEL SECURITY; CREATE POLICY owner_only ON orders FOR SELECT TO synthetic_reader USING (false); GRANT SELECT ON orders TO synthetic_reader; CREATE FUNCTION public.backup_test_function() RETURNS integer LANGUAGE sql AS 'SELECT 42';"
        & (Join-Path $PostgresBin 'psql.exe') -h 127.0.0.1 -p $testPort -U postgres -d postgres -v ON_ERROR_STOP=1 -c $seed *> (Join-Path $testRoot 'seed.log')
        Assert-True ($LASTEXITCODE -eq 0) 'Synthetic schema, rows, function, role and RLS must be created.'
        $install = Join-Path $testRoot 'installation'
        Set-PrivateBackupDirectory -Path $install
        $config = @{ PostgresBin=(Resolve-Path $PostgresBin).Path; DatabaseHost='127.0.0.1'; Port=$testPort; Database='postgres'; SslMode='disable'; CaFile=''; CertificateThumbprint=$certificate.Thumbprint }
        $config | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $install 'config.json')
        $credential = New-Object System.Management.Automation.PSCredential('postgres', (ConvertTo-SecureString $testPassword -AsPlainText -Force))
        $credential | Export-Clixml -LiteralPath (Join-Path $install 'database-credential.xml')
        Assert-True ((Get-Content -LiteralPath (Join-Path $install 'database-credential.xml') -Raw) -notmatch [regex]::Escape($testPassword)) 'Saved database password must be DPAPI encrypted.'
        Invoke-DatabaseBackup -InstallRoot $install | Out-Null
        $statusPath = Join-Path $install 'status.json'
        $status = Get-Content -LiteralPath $statusPath -Raw | ConvertFrom-Json
        Assert-True ($status.Result -eq 'success') 'First local backup must succeed.'
        $savedArchive = Join-Path (Join-Path $install 'Backups') $status.File
        $restoreZip = Join-Path $testRoot 'restore.zip'
        Unprotect-BackupFile -InputFile $savedArchive -OutputFile $restoreZip -Certificate $portableKey
        $restore = Join-Path $testRoot 'restore'
        [System.IO.Compression.ZipFile]::ExtractToDirectory($restoreZip, $restore)
        Assert-True ((Get-Content -LiteralPath (Join-Path $restore 'roles.sql') -Raw) -match 'synthetic_reader') 'Role definitions must be included.'
        & (Join-Path $PostgresBin 'psql.exe') -h 127.0.0.1 -p $testPort -U postgres -d postgres -v ON_ERROR_STOP=1 -c 'CREATE DATABASE restored' *> (Join-Path $testRoot 'create-restore.log')
        & (Join-Path $PostgresBin 'pg_restore.exe') -h 127.0.0.1 -p $testPort -U postgres -d restored --exit-on-error (Join-Path $restore 'database.dump') *> (Join-Path $testRoot 'restore.log')
        Assert-True ($LASTEXITCODE -eq 0) 'Encrypted backup must restore to a separate local database.'
        $check = & (Join-Path $PostgresBin 'psql.exe') -h 127.0.0.1 -p $testPort -U postgres -d restored -tAc "SELECT customer || ':' || backup_test_function() || ':' || relrowsecurity::text FROM orders, pg_class WHERE pg_class.oid='orders'::regclass"
        Assert-True (($check -join '').Trim() -eq 'synthetic only:42:true') 'Restored data, function and RLS must remain intact.'
        Write-Host 'PASS: real PostgreSQL export, protected credentials and encrypted restore'

        Copy-Item -LiteralPath $recoveryFile -Destination (Join-Path $install 'RECOVERY-KEY.pfx')
        $setupWrapper = Join-Path $testRoot 'resume-setup.ps1'
        @'
param($SetupScript, $Tools, $Ca, $Install)
$ErrorActionPreference = 'Stop'
$VerbosePreference = 'Continue'
Import-Module ScheduledTasks
function Get-ScheduledTask { return $null }
function Register-ScheduledTask { param($TaskName, $InputObject); Set-Content -LiteralPath (Join-Path $Install 'test-task-registered.txt') -Value $TaskName }
function Read-Host {
    param($Prompt, [switch]$AsSecureString)
    if ($Prompt -like '*databaslosenord*') { return (Import-Clixml -LiteralPath (Join-Path $Install 'database-credential.xml')).Password }
    if ($AsSecureString) { return ConvertTo-SecureString 'test-only-recovery-password' -AsPlainText -Force }
    return ''
}
& $SetupScript -PostgresBin $Tools -CaCertificate $Ca -InstallRoot $Install -UseSavedDatabaseCredential
exit $LASTEXITCODE
'@ | Set-Content -LiteralPath $setupWrapper
        & "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File $setupWrapper (Join-Path $PSScriptRoot '../scripts/database-backup/Setup-DatabaseBackup.ps1') (Resolve-Path $PostgresBin).Path $recoveryFile $install *> (Join-Path $testRoot 'setup-resume.log')
        if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath (Join-Path $install 'test-task-registered.txt'))) { Get-Content -LiteralPath (Join-Path $testRoot 'setup-resume.log') -Tail 18 | Write-Host }
        Assert-True ($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath (Join-Path $install 'test-task-registered.txt'))) 'An interrupted setup must resume using its existing recovery key.'
        Assert-True ((Get-FileHash -LiteralPath (Join-Path $install 'RECOVERY-KEY.pfx')).Hash -eq (Get-FileHash -LiteralPath $recoveryFile).Hash) 'Resuming must preserve the recovery key.'
        Write-Host 'PASS: interrupted installation resumes without replacing the recovery key'

        Set-Content -LiteralPath $statusPath -Value '{interrupted'
        Invoke-DatabaseBackup -InstallRoot $install -IfDue | Out-Null
        $status = Get-Content -LiteralPath $statusPath -Raw | ConvertFrom-Json
        Assert-True ($status.Result -eq 'success') 'Interrupted status file must not disable future backups.'
        Write-Host 'PASS: malformed status recovers by taking a new backup'

        for ($day = 1; $day -le 16; $day++) {
            Copy-Item -LiteralPath $savedArchive -Destination (Join-Path (Join-Path $install 'Backups') ('kunafa-db-202001' + $day.ToString('D2') + 'T213000000Z.p7m'))
        }
        Invoke-DatabaseBackup -InstallRoot $install | Out-Null
        $status = Get-Content -LiteralPath $statusPath -Raw | ConvertFrom-Json
        Assert-True (@(Get-ChildItem -LiteralPath (Join-Path $install 'Backups') -Filter '*.p7m').Count -eq 14) 'Only 14 latest archives should remain after verified success.'
        Assert-True (!(Test-Path -LiteralPath (Join-Path (Join-Path $install 'Backups') 'kunafa-db-20200101T213000000Z.p7m'))) 'Only oldest task-owned archives should be rotated.'
        Write-Host 'PASS: successful backup rotates only the oldest archives and retains 14 copies'

        $lastSuccess = $status.LastSuccess
        $oldArchive = Join-Path (Join-Path $install 'Backups') 'kunafa-db-20200101T213000000Z.p7m'
        [System.IO.File]::WriteAllText($oldArchive, 'synthetic older backup')
        $config.Port = 1
        $config | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $install 'config.json')
        $failed = $false
        try { Invoke-DatabaseBackup -InstallRoot $install | Out-Null } catch { $failed = $true }
        Assert-True $failed 'Unreachable database must fail, not publish success.'
        $afterFailure = Get-Content -LiteralPath $statusPath -Raw | ConvertFrom-Json
        Assert-True ($afterFailure.LastSuccess -eq $lastSuccess -and $afterFailure.Result -eq 'failed') 'Failure must preserve last successful timestamp.'
        Assert-True ((Test-Path -LiteralPath $oldArchive) -and (Test-Path -LiteralPath $savedArchive)) 'A failed backup must not rotate existing archives.'
        Assert-True (@(Get-ChildItem -LiteralPath $install -Directory -Filter '.work-*').Count -eq 0) 'Plaintext staging files must be removed after failure.'
        Write-Host 'PASS: export failure preserves earlier backups and removes plaintext staging'
    } finally {
        Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
        if (Test-Path -LiteralPath (Join-Path $cluster 'postmaster.pid')) {
            $stopServer = Start-Process -FilePath (Join-Path $PostgresBin 'pg_ctl.exe') -ArgumentList @('-D', ('"' + $cluster + '"'), '-w', 'stop') -WindowStyle Hidden -PassThru
            [void]$stopServer.WaitForExit(30000)
        }
    }
} finally {
    if ($certificate) { Remove-Item -LiteralPath ('Cert:\CurrentUser\My\' + $certificate.Thumbprint) -ErrorAction SilentlyContinue }
    if ($wrongCertificate) { Remove-Item -LiteralPath ('Cert:\CurrentUser\My\' + $wrongCertificate.Thumbprint) -ErrorAction SilentlyContinue }
    if ([System.IO.Path]::GetFullPath($testRoot).StartsWith([System.IO.Path]::GetTempPath(), [System.StringComparison]::OrdinalIgnoreCase)) {
        Remove-Item -LiteralPath $testRoot -Recurse -Force
    }
}
