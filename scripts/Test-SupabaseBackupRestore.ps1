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

$requiredEnvironment = @('RESTORE_PGHOST', 'RESTORE_PGDATABASE', 'RESTORE_PGUSER', 'RESTORE_PGPASSWORD')
$missingEnvironment = @($requiredEnvironment | Where-Object {
  [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($_))
})
if ($missingEnvironment.Count -gt 0) {
  throw ('Missing restore-target environment variables: ' + ($missingEnvironment -join ', '))
}
if ($env:RESTORE_PGDATABASE -ne $ExpectedDisposableDatabase) {
  throw 'RESTORE_PGDATABASE does not exactly match ExpectedDisposableDatabase.'
}

$archive = (Resolve-Path -LiteralPath $ArchivePath).Path
$manifestFile = (Resolve-Path -LiteralPath $ManifestPath).Path
$manifest = Get-Content -LiteralPath $manifestFile -Raw -Encoding utf8 | ConvertFrom-Json
$actualHash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualHash -ne [string]$manifest.archiveSha256) {
  throw 'Archive SHA-256 does not match the manifest.'
}
if ((Get-Item -LiteralPath $archive).Length -ne [long]$manifest.archiveBytes) {
  throw 'Archive byte length does not match the manifest.'
}

$targetFingerprint = Get-TextSha256 $env:RESTORE_PGHOST
if ($targetFingerprint -eq [string]$manifest.sourceHostFingerprint) {
  throw 'Restore target has the same host fingerprint as the source. Production restore is forbidden.'
}

$pgRestore = Get-Command pg_restore -ErrorAction Stop
$psql = Get-Command psql -ErrorAction Stop
$verificationSql = (Resolve-Path -LiteralPath (
  Join-Path $PSScriptRoot '..\backend\src\db\verification\verify-restored-database.sql'
)).Path

$saved = @{}
foreach ($name in @('PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD', 'PGSSLMODE')) {
  $saved[$name] = [Environment]::GetEnvironmentVariable($name)
}

try {
  $env:PGHOST = $env:RESTORE_PGHOST
  $env:PGPORT = if ($env:RESTORE_PGPORT) { $env:RESTORE_PGPORT } else { '5432' }
  $env:PGDATABASE = $env:RESTORE_PGDATABASE
  $env:PGUSER = $env:RESTORE_PGUSER
  $env:PGPASSWORD = $env:RESTORE_PGPASSWORD
  $env:PGSSLMODE = if ($env:RESTORE_PGSSLMODE) { $env:RESTORE_PGSSLMODE } else { 'require' }

  $currentDatabase = (& $psql.Source '--no-psqlrc' '--tuples-only' '--no-align' '--command' 'SELECT current_database();').Trim()
  if ($LASTEXITCODE -ne 0 -or $currentDatabase -ne $ExpectedDisposableDatabase) {
    throw 'Could not prove the exact disposable restore target.'
  }

  $description = "replace disposable database $ExpectedDisposableDatabase from the verified archive"
  if (-not $PSCmdlet.ShouldProcess($ExpectedDisposableDatabase, $description)) {
    Write-Output 'restore=cancelled'
    exit 0
  }

  & $pgRestore.Source '--clean' '--if-exists' '--no-owner' '--no-privileges' `
    '--exit-on-error' '--single-transaction' '--dbname' $ExpectedDisposableDatabase $archive
  if ($LASTEXITCODE -ne 0) {
    throw 'pg_restore failed; the single transaction was not accepted.'
  }

  & $psql.Source '--no-psqlrc' '--set' 'ON_ERROR_STOP=1' '--file' $verificationSql
  if ($LASTEXITCODE -ne 0) {
    throw 'The restored database failed verification.'
  }

  Write-Output 'restore=verified'
  Write-Output ('archive_sha256=' + $actualHash)
  Write-Output ('target_database=' + $ExpectedDisposableDatabase)
  Write-Output 'Production was not modified. Record this result in the restricted migration journal.'
} finally {
  foreach ($name in $saved.Keys) {
    [Environment]::SetEnvironmentVariable($name, $saved[$name])
  }
}
