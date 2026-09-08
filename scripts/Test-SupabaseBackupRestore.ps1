[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
  [Parameter(Mandatory = $true)]
  [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
  [string]$ArchivePath,

  [Parameter(Mandatory = $true)]
  [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
  [string]$ManifestPath,

  [Parameter(Mandatory = $true)]
  [string]$ExpectedDisposableDatabase,

  [Parameter(Mandatory = $true)]
  [switch]$ConfirmDisposableTarget
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib/PostgresConnection.ps1')

function Get-TextSha256([string]$Value) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [Text.Encoding]::UTF8.GetBytes($Value.Trim().ToLowerInvariant())
    return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
  } finally {
    $sha.Dispose()
  }
}

if (-not $ConfirmDisposableTarget) {
  throw 'ConfirmDisposableTarget is required because the target database is cleaned and replaced.'
}

$connection = Get-PgConnectionSettings 'RESTORE_'
if (-not [string]::Equals($connection.PGDATABASE,$ExpectedDisposableDatabase,[StringComparison]::Ordinal)) {
  throw 'RESTORE_PGDATABASE does not exactly match ExpectedDisposableDatabase.'
}

$archive = (Resolve-Path -LiteralPath $ArchivePath).Path
$manifestFile = (Resolve-Path -LiteralPath $ManifestPath).Path
$manifest = Get-Content -LiteralPath $manifestFile -Raw -Encoding utf8 | ConvertFrom-Json
if ($manifest.formatVersion -ne 2 -or $manifest.sourceConnectionIsolated -ne $true -or
    [string]$manifest.sourceHostFingerprint -cnotmatch '^[a-f0-9]{64}$') {
  throw 'Retake the backup with isolated connection settings; this manifest cannot prove its declared source.'
}
$actualHash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualHash -ne [string]$manifest.archiveSha256) {
  throw 'Archive SHA-256 does not match the manifest.'
}
if ((Get-Item -LiteralPath $archive).Length -ne [long]$manifest.archiveBytes) {
  throw 'Archive byte length does not match the manifest.'
}

$targetFingerprint = Get-TextSha256 $connection.PGHOST
if ($targetFingerprint -eq [string]$manifest.sourceHostFingerprint) {
  throw 'Restore target has the same host fingerprint as the source. Production restore is forbidden.'
}

$pgRestore = Get-Command pg_restore -ErrorAction Stop
$psql = Get-Command psql -ErrorAction Stop
$verificationSql = (Resolve-Path -LiteralPath (
  Join-Path $PSScriptRoot '..\backend\src\db\verification\verify-restored-database.sql'
)).Path

$savedPgEnvironment = Enter-IsolatedPgEnvironment $connection

try {
  $targetIdentity = Assert-PgDatabase $psql.Source $connection.PGDATABASE

  $description = "replace disposable database $ExpectedDisposableDatabase from the verified archive"
  if (-not $PSCmdlet.ShouldProcess($ExpectedDisposableDatabase, $description)) {
    Write-Output 'restore=cancelled'
    return
  }

  & $pgRestore.Source '--no-password' '--clean' '--if-exists' '--no-owner' '--no-privileges' `
    '--exit-on-error' '--single-transaction' '--dbname' $connection.PGDATABASE $archive
  if ($LASTEXITCODE -ne 0) {
    throw 'pg_restore failed; the single transaction was not accepted.'
  }

  $verifiedIdentity = Assert-PgDatabase $psql.Source $connection.PGDATABASE
  if (-not [string]::Equals([string]$targetIdentity.sessionUser,[string]$verifiedIdentity.sessionUser,[StringComparison]::Ordinal)) {
    throw 'The effective database user changed during restore.'
  }
  & $psql.Source '--no-psqlrc' '--no-password' '--set' 'ON_ERROR_STOP=1' '--file' $verificationSql
  if ($LASTEXITCODE -ne 0) {
    throw 'The restored database failed verification.'
  }

  Write-Output 'restore=verified'
  Write-Output ('archive_sha256=' + $actualHash)
  Write-Output ('target_database=' + $ExpectedDisposableDatabase)
  Write-Output 'The declared target and restored data passed verification. Record independent target-isolation evidence in the restricted migration journal.'
} finally {
  Restore-PgEnvironment $savedPgEnvironment
}
