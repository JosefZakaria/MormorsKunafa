param(
    [Parameter(Mandatory=$true)][string]$PostgresBin,
    [Parameter(Mandatory=$true)][string]$CaCertificate,
    [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA 'MormorsKunafaBackup'),
    [switch]$UseSavedDatabaseCredential
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'DatabaseBackup.psm1') -Force
$taskName = 'MormorsKunafa-DatabaseBackup'
try {
    if ((Get-TimeZone).Id -ne 'W. Europe Standard Time') { throw 'Windows must use Stockholm time before installing the 21:30 schedule.' }
    if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) { throw 'The backup task already exists. No settings were overwritten.' }
    $configPath = Join-Path $InstallRoot 'config.json'
    $existingConfig = if (Test-Path -LiteralPath $configPath) { Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json } else { $null }
    $version = & (Join-Path $PostgresBin 'pg_dump.exe') --version
    if ($LASTEXITCODE -ne 0 -or $version -notmatch 'PostgreSQL\) (\d+)' -or [int]$Matches[1] -lt 17) { throw 'PostgreSQL 17 or newer client tools are required.' }
    if (!(Test-Path -LiteralPath $CaCertificate)) { throw 'Supabase CA certificate is missing.' }
    Write-Host 'Mormors Kunafa - lokal databasbackup'
    Write-Host 'Varje kvall 21.30. Missad backup tas efter nasta Windows-inloggning.'
    Write-Host ('Krypterade kopior sparas i: ' + (Join-Path $InstallRoot 'Backups'))
    Write-Host 'Databaslosenordet skickas endast till ert Supabase-projekt.'
    $databasePassword = if ($UseSavedDatabaseCredential -and $existingConfig) {
        (Import-Clixml -LiteralPath (Join-Path $InstallRoot 'database-credential.xml')).Password
    } else { Read-Host 'Ange Supabases databaslosenord (dolt)' -AsSecureString }
    if ($databasePassword.Length -eq 0) { throw 'Database password cannot be empty.' }
    if ($existingConfig) {
        Write-Host 'Fortsatter tidigare installation. Den befintliga aterstallningsnyckeln bevaras.'
        $recoveryPassword = Read-Host 'Befintligt aterstallningslosenord (dolt)' -AsSecureString
    } else {
        Write-Host 'Valj ett SEPARAT losenord for aterstallningsnyckeln. Spara det i er losenordshanterare.'
        $recoveryPassword = Read-Host 'Nytt aterstallningslosenord, minst 12 tecken (dolt)' -AsSecureString
        if ($recoveryPassword.Length -lt 12) { throw 'Recovery password must contain at least 12 characters.' }
        $confirmation = Read-Host 'Bekrafta aterstallningslosenordet (dolt)' -AsSecureString
        $first = New-Object System.Management.Automation.PSCredential('recovery', $recoveryPassword)
        $second = New-Object System.Management.Automation.PSCredential('recovery', $confirmation)
        if ($first.GetNetworkCredential().Password -cne $second.GetNetworkCredential().Password) { throw 'Recovery passwords do not match.' }
        $first = $null; $second = $null
    }
    Set-PrivateBackupDirectory -Path $InstallRoot
    foreach ($file in @('DatabaseBackup.psm1', 'Run-DatabaseBackup.ps1', 'Recover-DatabaseBackup.ps1')) {
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination (Join-Path $InstallRoot $file)
    }
    $installedTools = Join-Path $InstallRoot 'PostgreSQL'
    $installedBin = Join-Path $installedTools 'bin'
    New-Item -ItemType Directory -Path $installedBin -Force | Out-Null
    Get-ChildItem -LiteralPath $PostgresBin | Copy-Item -Destination $installedBin -Recurse -Force
    Copy-Item -LiteralPath $CaCertificate -Destination (Join-Path $InstallRoot 'supabase-ca.crt')
    $recoveryFile = Join-Path $InstallRoot 'RECOVERY-KEY.pfx'
    if ($existingConfig) {
        $certificate = Get-Item -LiteralPath ('Cert:\CurrentUser\My\' + $existingConfig.CertificateThumbprint)
        if (!(Test-Path -LiteralPath $recoveryFile)) { throw 'Existing recovery key is missing. It was not replaced.' }
        $databaseUser = (Import-Clixml -LiteralPath (Join-Path $InstallRoot 'database-credential.xml')).UserName
    } else {
        $certificate = New-SelfSignedCertificate -Subject 'CN=Mormors Kunafa database backup' -Type DocumentEncryptionCert -KeyAlgorithm RSA -KeyLength 3072 -KeyExportPolicy Exportable -CertStoreLocation Cert:\CurrentUser\My -NotAfter (Get-Date).AddYears(10)
        Export-PfxCertificate -Cert $certificate -FilePath $recoveryFile -Password $recoveryPassword | Out-Null
        $databaseUser = 'postgres.zwxdvyxrvixlsetylhur'
    }
    $credential = New-Object System.Management.Automation.PSCredential($databaseUser, $databasePassword)
    $credential | Export-Clixml -LiteralPath (Join-Path $InstallRoot 'database-credential.xml')
    $config = if ($existingConfig) { $existingConfig } else { [pscustomobject]@{ DatabaseHost='aws-1-eu-central-1.pooler.supabase.com'; Port=5432; Database='postgres'; SslMode='verify-full'; CaFile=''; PostgresBin=''; CertificateThumbprint=$certificate.Thumbprint } }
    $config.CaFile = Join-Path $InstallRoot 'supabase-ca.crt'
    $config.PostgresBin = $installedBin
    $config | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
    Write-Host 'Tar och verifierar den forsta backupen. Inga databasuppgifter andras.'
    Invoke-DatabaseBackup -InstallRoot $InstallRoot
    $status = Get-Content -LiteralPath (Join-Path $InstallRoot 'status.json') -Raw | ConvertFrom-Json
    $verifyFile = Join-Path $InstallRoot '.recovery-verification.zip'
    try {
        $portableKey = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($recoveryFile, $recoveryPassword, [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet)
        Unprotect-BackupFile -InputFile (Join-Path (Join-Path $InstallRoot 'Backups') $status.File) -OutputFile $verifyFile -Certificate $portableKey
        $zip = [System.IO.Compression.ZipFile]::OpenRead($verifyFile)
        try { if (!$zip.GetEntry('database.dump') -or !$zip.GetEntry('roles.sql')) { throw 'Recovery verification failed.' } } finally { $zip.Dispose() }
    } finally {
        if (Test-Path -LiteralPath $verifyFile) { Remove-Item -LiteralPath $verifyFile }
        if ($portableKey) { $portableKey.Dispose() }
    }
    $user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $task = New-BackupTaskDefinition -InstallRoot $InstallRoot -UserName $user
    Register-ScheduledTask -TaskName $taskName -InputObject $task | Out-Null
    Write-Host ''
    Write-Host 'KLART: verifierad backup finns. Schemat ar installerat till 21.30.' -ForegroundColor Green
    Write-Host 'Spara RECOVERY-KEY.pfx och en krypterad backup pa en separat plats.'
    Write-Host 'Behall aterstallningslosenordet separat fran filerna.'
    Write-Host ('Status: ' + (Join-Path $InstallRoot 'status.json'))
    Read-Host 'Tryck Enter for att stanga'
    exit 0
} catch {
    Write-Host ('Installationen ar INTE klar: ' + $_.Exception.Message) -ForegroundColor Red
    Write-Verbose $_.ScriptStackTrace
    Write-Host 'Inget befintligt schema eller data i Supabase har andrats.'
    Read-Host 'Tryck Enter for att stanga'
    exit 1
}
