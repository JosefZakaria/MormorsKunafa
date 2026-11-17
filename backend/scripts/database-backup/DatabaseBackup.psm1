# Windows PowerShell 5.1; no application or production database writes.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
# A launcher running PowerShell 7 must not redirect this Windows PowerShell 5.1 process to its modules.
$env:PSModulePath = "$PSHOME\Modules;$env:ProgramFiles\WindowsPowerShell\Modules;$([Environment]::GetFolderPath('MyDocuments'))\WindowsPowerShell\Modules"
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1') -ErrorAction Stop
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Utility/Microsoft.PowerShell.Utility.psd1') -ErrorAction Stop
Add-Type -AssemblyName System.Security
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Test-BackupDue {
    param([datetime]$Now = (Get-Date), [Nullable[datetime]]$LastSuccess)
    $boundary = $Now.Date.AddHours(21).AddMinutes(30)
    if ($Now -lt $boundary) { $boundary = $boundary.AddDays(-1) }
    return $null -eq $LastSuccess -or $LastSuccess -lt $boundary
}

function Set-PrivateBackupDirectory {
    param([string]$Path)
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
    $acl = Get-Acl -LiteralPath $Path
    $acl.SetAccessRuleProtection($true, $false)
    $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    foreach ($existingRule in @($acl.Access)) { [void]$acl.RemoveAccessRuleSpecific($existingRule) }
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $acl.AddAccessRule($rule)
    [System.IO.Directory]::SetAccessControl($Path, $acl)
}

function Protect-BackupFile {
    param([string]$InputFile, [string]$OutputFile, [System.Security.Cryptography.X509Certificates.X509Certificate2]$Certificate)
    $content = New-Object System.Security.Cryptography.Pkcs.ContentInfo(,[System.IO.File]::ReadAllBytes($InputFile))
    $algorithm = New-Object System.Security.Cryptography.Pkcs.AlgorithmIdentifier([System.Security.Cryptography.Oid]'2.16.840.1.101.3.4.1.42')
    $envelope = New-Object System.Security.Cryptography.Pkcs.EnvelopedCms($content, $algorithm)
    $envelope.Encrypt((New-Object System.Security.Cryptography.Pkcs.CmsRecipient($Certificate)))
    [System.IO.File]::WriteAllBytes($OutputFile, $envelope.Encode())
}

function Unprotect-BackupFile {
    param([string]$InputFile, [string]$OutputFile, [System.Security.Cryptography.X509Certificates.X509Certificate2]$Certificate)
    if (!$Certificate.HasPrivateKey) { throw 'The recovery certificate has no private key.' }
    $envelope = New-Object System.Security.Cryptography.Pkcs.EnvelopedCms
    $envelope.Decode([System.IO.File]::ReadAllBytes($InputFile))
    $recipient = @($envelope.RecipientInfos | Where-Object {
        $_.RecipientIdentifier.Type -eq 'IssuerAndSerialNumber' -and
        $_.RecipientIdentifier.Value.IssuerName -eq $Certificate.Issuer -and
        $_.RecipientIdentifier.Value.SerialNumber -eq $Certificate.SerialNumber
    })
    if ($recipient.Count -ne 1) { throw 'This recovery key does not match the encrypted backup.' }
    $keys = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2Collection
    [void]$keys.Add($Certificate)
    $envelope.Decrypt($recipient[0], $keys)
    [System.IO.File]::WriteAllBytes($OutputFile, $envelope.ContentInfo.Content)
}

function New-BackupTaskDefinition {
    param([string]$InstallRoot, [string]$UserName)
    $runner = Join-Path $InstallRoot 'Run-DatabaseBackup.ps1'
    $action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $runner + '" -IfDue') -WorkingDirectory $InstallRoot
    $daily = New-ScheduledTaskTrigger -Daily -At '21:30'
    $daily.StartBoundary = (Get-Date).Date.AddHours(21).AddMinutes(30).ToString('yyyy-MM-ddTHH:mm:ss')
    $signIn = New-ScheduledTaskTrigger -AtLogOn -User $UserName
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -RestartCount 12 -RestartInterval (New-TimeSpan -Minutes 5) -ExecutionTimeLimit (New-TimeSpan -Hours 1)
    $principal = New-ScheduledTaskPrincipal -UserId $UserName -LogonType Interactive -RunLevel Limited
    New-ScheduledTask -Action $action -Trigger @($daily, $signIn) -Settings $settings -Principal $principal -Description 'Encrypted Mormors Kunafa database backup at 21:30 local time; catch up after Windows sign-in.'
}

function Invoke-BackupPgTool {
    param([string]$Tool, [string[]]$Arguments, $Config, [pscredential]$Credential)
    $start = New-Object System.Diagnostics.ProcessStartInfo
    $start.FileName = Join-Path $Config.PostgresBin ($Tool + '.exe')
    $start.Arguments = ($Arguments | ForEach-Object { '"' + $_ + '"' }) -join ' '
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    foreach ($entry in @{ PGHOST=$Config.DatabaseHost; PGPORT=[string]$Config.Port; PGDATABASE=$Config.Database; PGUSER=$Credential.UserName; PGPASSWORD=$Credential.GetNetworkCredential().Password; PGSSLMODE=$Config.SslMode; PGSSLROOTCERT=$Config.CaFile; PGCONNECT_TIMEOUT='20'; PGAPPNAME='kunafa-backup'; PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=600000 -c lock_timeout=30000' }.GetEnumerator()) {
        $start.EnvironmentVariables[$entry.Key] = [string]$entry.Value
    }
    if ($Config.DatabaseHost -notin @('127.0.0.1', 'localhost', '::1') -and $Config.SslMode -ne 'verify-full') { throw 'Remote backups require verified TLS.' }
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $start
    try {
        [void]$process.Start()
        $output = $process.StandardOutput.ReadToEndAsync()
        $errorOutput = $process.StandardError.ReadToEndAsync()
        if (!$process.WaitForExit(900000)) { $process.Kill(); throw "$Tool timed out." }
        $stdout = $output.GetAwaiter().GetResult()
        $stderr = $errorOutput.GetAwaiter().GetResult()
        if ($process.ExitCode -ne 0) { throw "$Tool failed (exit $($process.ExitCode)). Check the database connection, password and tool version." }
        return $stdout
    } finally {
        $start.EnvironmentVariables.Remove('PGPASSWORD')
        $process.Dispose()
    }
}

function Write-BackupStatus {
    param([string]$Path, $Status)
    $pending = $Path + '.tmp'
    $Status | ConvertTo-Json | Set-Content -LiteralPath $pending -Encoding UTF8
    if (Test-Path -LiteralPath $Path) { [System.IO.File]::Replace($pending, $Path, [System.Management.Automation.Language.NullString]::Value) }
    else { [System.IO.File]::Move($pending, $Path) }
}

function Invoke-DatabaseBackup {
    param([string]$InstallRoot, [switch]$IfDue)
    $config = Get-Content -LiteralPath (Join-Path $InstallRoot 'config.json') -Raw | ConvertFrom-Json
    $statusPath = Join-Path $InstallRoot 'status.json'
    $previous = $null
    $lastSuccess = $null
    try {
        if (Test-Path -LiteralPath $statusPath) {
            $previous = Get-Content -LiteralPath $statusPath -Raw | ConvertFrom-Json
            $null = $previous.File
            if ($previous.LastSuccess) { $lastSuccess = [datetime]::Parse($previous.LastSuccess).ToLocalTime() }
        }
    } catch { $previous = $null; $lastSuccess = $null }
    $backupDirectory = Join-Path $InstallRoot 'Backups'
    if ($IfDue -and $lastSuccess -and $previous.File -and (Test-Path -LiteralPath (Join-Path $backupDirectory $previous.File)) -and !(Test-BackupDue -LastSuccess $lastSuccess)) { return }
    try { $lock = [System.IO.File]::Open((Join-Path $InstallRoot 'backup.lock'), 'OpenOrCreate', 'ReadWrite', 'None') }
    catch [System.IO.IOException] { return }
    $work = Join-Path $InstallRoot ('.work-' + [guid]::NewGuid().ToString('N'))
    $partial = $null
    try {
        New-Item -ItemType Directory -Path $work | Out-Null
        New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
        $payload = Join-Path $work 'payload'
        New-Item -ItemType Directory -Path $payload | Out-Null
        $credential = Import-Clixml -LiteralPath (Join-Path $InstallRoot 'database-credential.xml')
        $certificate = Get-Item -LiteralPath ('Cert:\CurrentUser\My\' + $config.CertificateThumbprint)
        if (!$certificate.HasPrivateKey -or $certificate.NotAfter -lt (Get-Date)) { throw 'Backup recovery certificate is unavailable or expired.' }
        Invoke-BackupPgTool -Tool pg_dump -Arguments @('--no-password', '--format=custom', ('--file=' + (Join-Path $payload 'database.dump'))) -Config $config -Credential $credential | Out-Null
        Invoke-BackupPgTool -Tool pg_dumpall -Arguments @('--no-password', '--roles-only', '--no-role-passwords', ('--file=' + (Join-Path $payload 'roles.sql'))) -Config $config -Credential $credential | Out-Null
        $listing = Invoke-BackupPgTool -Tool pg_restore -Arguments @('--list', (Join-Path $payload 'database.dump')) -Config $config -Credential $credential
        if ($listing -notmatch 'TABLE DATA') { throw 'The database archive contains no table data.' }
        $createdAt = (Get-Date).ToUniversalTime().ToString('o')
        @{ CreatedAt=$createdAt; Format='pg_dump custom + roles'; StorageObjectsIncluded=$false; RolePasswordsIncluded=$false } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $payload 'manifest.json') -Encoding UTF8
        $zipPath = Join-Path $work 'backup.zip'
        [System.IO.Compression.ZipFile]::CreateFromDirectory($payload, $zipPath, 'NoCompression', $false)
        $name = 'kunafa-db-' + (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssfffZ') + '.p7m'
        $destination = Join-Path $backupDirectory $name
        $partial = $destination + '.partial'
        Protect-BackupFile -InputFile $zipPath -OutputFile $partial -Certificate $certificate
        $verifyPath = Join-Path $work 'verify.zip'
        Unprotect-BackupFile -InputFile $partial -OutputFile $verifyPath -Certificate $certificate
        if ((Get-FileHash -LiteralPath $zipPath).Hash -ne (Get-FileHash -LiteralPath $verifyPath).Hash) { throw 'Backup encryption verification failed.' }
        Move-Item -LiteralPath $partial -Destination $destination
        $status = @{ Result='success'; LastAttempt=(Get-Date).ToUniversalTime().ToString('o'); LastSuccess=$createdAt; File=$name; Sha256=(Get-FileHash -LiteralPath $destination).Hash }
        Write-BackupStatus -Path $statusPath -Status $status
        Get-ChildItem -LiteralPath $backupDirectory -File | Where-Object Name -Match '^kunafa-db-\d{8}T\d{9}Z\.p7m$' | Sort-Object Name -Descending | Select-Object -Skip 14 | ForEach-Object { Remove-Item -LiteralPath $_.FullName }
        Write-Output "Backup verified: $destination"
    } catch {
        Write-BackupStatus -Path $statusPath -Status @{ Result='failed'; LastAttempt=(Get-Date).ToUniversalTime().ToString('o'); LastSuccess=$(if ($previous) { $previous.LastSuccess } else { $null }); File=$(if ($previous) { $previous.File } else { $null }); Error=$_.Exception.Message }
        throw
    } finally {
        if ($partial -and (Test-Path -LiteralPath $partial)) { Remove-Item -LiteralPath $partial }
        $resolvedRoot = [System.IO.Path]::GetFullPath($InstallRoot).TrimEnd('\')
        $resolvedWork = [System.IO.Path]::GetFullPath($work)
        if ((Split-Path $resolvedWork) -eq $resolvedRoot -and (Split-Path $resolvedWork -Leaf) -match '^\.work-[a-f0-9]{32}$' -and (Test-Path -LiteralPath $resolvedWork)) { Remove-Item -LiteralPath $resolvedWork -Recurse -Force }
        $lock.Dispose()
    }
}

Export-ModuleMember -Function Test-BackupDue, Set-PrivateBackupDirectory, Protect-BackupFile, Unprotect-BackupFile, New-BackupTaskDefinition, Invoke-DatabaseBackup
