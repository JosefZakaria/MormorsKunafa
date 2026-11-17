param([switch]$IfDue)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'DatabaseBackup.psm1') -Force
try {
    Invoke-DatabaseBackup -InstallRoot $PSScriptRoot -IfDue:$IfDue
    exit 0
} catch {
    Write-Error 'Database backup failed. See status.json in the private backup folder.' -ErrorAction Continue
    exit 1
}
