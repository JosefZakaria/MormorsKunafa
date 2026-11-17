param(
    [Parameter(Mandatory=$true)][string]$BackupFile,
    [Parameter(Mandatory=$true)][string]$RecoveryKeyFile,
    [Parameter(Mandatory=$true)][string]$OutputDirectory
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'DatabaseBackup.psm1') -Force
if (Test-Path -LiteralPath $OutputDirectory) { throw 'Choose a new recovery directory. Existing files will not be overwritten.' }
$password = Read-Host 'Losenord for aterstallningsnyckeln (dolt)' -AsSecureString
$certificate = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($RecoveryKeyFile, $password, [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet)
Set-PrivateBackupDirectory -Path $OutputDirectory
$zipPath = Join-Path $OutputDirectory 'recovered.zip'
try {
    Unprotect-BackupFile -InputFile $BackupFile -OutputFile $zipPath -Certificate $certificate
    [System.IO.Compression.ZipFile]::ExtractToDirectory($zipPath, (Join-Path $OutputDirectory 'Database'))
    Write-Host 'Backupen ar dekrypterad. Ingen databas har skrivits over.'
} finally {
    if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath }
    $certificate.Dispose()
}
