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
  [ValidateSet('legacy-core', 'secured-ledgers')]
  [string]$ExpectedAccountingProfile,

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
  throw 'ConfirmDisposableTarget is required because the target public application objects are replaced.'
}

$connection = Get-PgConnectionSettings 'RESTORE_'
if (-not [string]::Equals($connection.PGDATABASE,$ExpectedDisposableDatabase,[StringComparison]::Ordinal)) {
  throw 'RESTORE_PGDATABASE does not exactly match ExpectedDisposableDatabase.'
}

$archive = (Resolve-Path -LiteralPath $ArchivePath).Path
$manifestFile = (Resolve-Path -LiteralPath $ManifestPath).Path
$manifest = Get-Content -LiteralPath $manifestFile -Raw -Encoding utf8 | ConvertFrom-Json
if ($manifest.formatVersion -ne 3 -or $manifest.sourceConnectionIsolated -ne $true -or
    [string]$manifest.sourceHostFingerprint -cnotmatch '^[a-f0-9]{64}$' -or
    [string]$manifest.archiveScope -cne 'public-schema-only' -or $manifest.privilegesIncluded -ne $true -or
    [string]$manifest.securityMetadataSha256 -cnotmatch '^[a-f0-9]{64}$') {
  throw 'Retake the backup with isolated connection settings; this manifest cannot prove its declared source.'
}

function Assert-PublicArchiveScope([object[]]$Catalog) {
  foreach ($line in $Catalog) {
    $entry = ([string]$line).Trim()
    if (-not $entry -or $entry.StartsWith(';')) { continue }
    if ($entry -notmatch '^\d+;\s+\d+\s+\d+\s+(?:SCHEMA - public(?:\s|$)|(?:COMMENT|ACL) - SCHEMA public(?:\s|$)|(?:TABLE DATA|TABLE|SEQUENCE SET|SEQUENCE OWNED BY|SEQUENCE|FUNCTION|PROCEDURE|CHECK CONSTRAINT|CONSTRAINT|FK CONSTRAINT|INDEX|TRIGGER|POLICY|ROW SECURITY|DEFAULT ACL|ACL|COMMENT|DEFAULT|TYPE|DOMAIN|MATERIALIZED VIEW DATA|MATERIALIZED VIEW|VIEW) public\s)') {
      throw 'Archive contains an unsupported or non-public object. No managed schema may be restored.'
    }
  }
}

if (-not [string]::Equals([string]$manifest.archiveFile, (Split-Path $archive -Leaf), [StringComparison]::Ordinal)) {
  throw 'Archive filename does not match the manifest.'
}

function Get-PublicTablesFromArchiveCatalog([object[]]$Catalog) {
  return @($Catalog | ForEach-Object {
    $match = [regex]::Match([string]$_, '(?:^|\s)TABLE\s+public\s+([a-z_][a-z0-9_$]*)(?:\s|$)')
    if ($match.Success) { $match.Groups[1].Value }
  } | Sort-Object -Unique)
}

function Get-AccountingProfile([string[]]$PublicTables, [string[]]$SecuredLedgerTables) {
  $present = @($SecuredLedgerTables | Where-Object { $PublicTables -ccontains $_ }).Count
  if ($present -eq 0) { return 'legacy-core' }
  if ($present -eq $SecuredLedgerTables.Count) { return 'secured-ledgers' }
  return 'partial-investigation'
}

function Test-StringArrayEqual([object[]]$Left, [object[]]$Right) {
  $leftStrings = @($Left | ForEach-Object { [string]$_ })
  $rightStrings = @($Right | ForEach-Object { [string]$_ })
  if ($leftStrings.Count -ne $rightStrings.Count) { return $false }
  for ($index = 0; $index -lt $leftStrings.Count; $index++) {
    if (-not [string]::Equals($leftStrings[$index], $rightStrings[$index], [StringComparison]::Ordinal)) {
      return $false
    }
  }
  return $true
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
$restoreListPath = $null

try {
  $targetIdentity = Assert-PgDatabase $psql.Source $connection.PGDATABASE

  $catalog = @(& $pgRestore.Source '--list' $archive)
  if ($LASTEXITCODE -ne 0 -or $catalog.Count -eq 0) {
    throw 'pg_restore could not read the archive catalog.'
  }
  Assert-PublicArchiveScope $catalog
  $publicTables = Get-PublicTablesFromArchiveCatalog $catalog
  $manifestTables = @($manifest.publicTables | ForEach-Object { [string]$_ })
  if (-not (Test-StringArrayEqual $manifestTables $publicTables)) {
    throw 'Archive public-table catalog does not exactly match the manifest.'
  }
  $requiredTables = @('admin_settings', 'admin_users', 'order_items', 'orders', 'products')
  if (-not (Test-StringArrayEqual @($manifest.requiredTables) $requiredTables)) {
    throw 'Manifest required-table contract is invalid.'
  }
  $securedLedgerTables = @(
    'duplicate_stripe_refunds',
    'order_refund_items',
    'order_refunds',
    'payment_provider_events',
    'security_audit_log'
  )
  $actualAccountingProfile = Get-AccountingProfile $publicTables $securedLedgerTables
  if (-not [string]::Equals([string]$manifest.accountingProfile, $actualAccountingProfile, [StringComparison]::Ordinal) -or
      -not [string]::Equals($ExpectedAccountingProfile, $actualAccountingProfile, [StringComparison]::Ordinal)) {
    throw ('Accounting profile mismatch. Expected ' + $ExpectedAccountingProfile +
      ', archive is ' + $actualAccountingProfile + '. Partial ledger sets require investigation, not approval.')
  }

  $description = "replace public application objects in disposable database $ExpectedDisposableDatabase from the verified archive"
  if (-not $PSCmdlet.ShouldProcess($ExpectedDisposableDatabase, $description)) {
    Write-Output 'restore=cancelled'
    return
  }

  if ($ExpectedAccountingProfile -eq 'secured-ledgers') {
    # Do not let target defaults add privileges absent from the source ACL.
    # pg_restore GRANT SELECT does not remove an inherited service-role UPDATE.
    # Clear API-role defaults for the target owner before creating objects; the
    # archive restores its explicit public ACLs/defaults afterwards. A filtered
    # dump excludes global defaults, so exact metadata equality remains required.
    # Existing managed functions, data and objects are never modified here.
    $privateDefaultsSql = @'
BEGIN;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;
COMMIT;
'@
    & $psql.Source '--no-psqlrc' '--no-password' '--set' 'ON_ERROR_STOP=1' '--command' $privateDefaultsSql
    if ($LASTEXITCODE -ne 0) { throw 'Could not establish private function defaults for the restore owner.' }
  }

  # Preserve the provider-created public schema and its owner. Dropping and
  # recreating it under --no-owner changes pg_database_owner semantics and can
  # touch dependencies from managed schemas. Its archived ACL still restores.
  $restoreListPath = Join-Path ([IO.Path]::GetTempPath()) ('mk-public-restore-' + [guid]::NewGuid() + '.list')
  $restoreCatalog = @($catalog | Where-Object {
    [string]$_ -notmatch '^\d+;\s+\d+\s+\d+\s+SCHEMA - public(?:\s|$)'
  })
  [IO.File]::WriteAllLines($restoreListPath, [string[]]$restoreCatalog, [Text.UTF8Encoding]::new($false))

  & $pgRestore.Source '--no-password' '--clean' '--if-exists' '--no-owner' `
    '--exit-on-error' '--single-transaction' '--use-list' $restoreListPath '--dbname' $connection.PGDATABASE $archive
  if ($LASTEXITCODE -ne 0) {
    throw 'pg_restore failed; the single transaction was not accepted.'
  }

  $verifiedIdentity = Assert-PgDatabase $psql.Source $connection.PGDATABASE
  if (-not [string]::Equals([string]$targetIdentity.sessionUser,[string]$verifiedIdentity.sessionUser,[StringComparison]::Ordinal)) {
    throw 'The effective database user changed during restore.'
  }
  & $psql.Source '--no-psqlrc' '--no-password' '--set' 'ON_ERROR_STOP=1' `
    '--set' "expected_accounting_profile=$ExpectedAccountingProfile" '--file' $verificationSql
  if ($LASTEXITCODE -ne 0) {
    throw 'The restored database failed verification.'
  }

  $metadataSql = Join-Path $PSScriptRoot '..\backend\src\db\verification\verify-security-metadata.sql'
  $metadataReport = @(& $psql.Source '--no-psqlrc' '--no-password' '--quiet' '--tuples-only' '--no-align' `
    '--set' 'ON_ERROR_STOP=1' '--set' "expected_accounting_profile=$ExpectedAccountingProfile" '--file' $metadataSql)
  if ($LASTEXITCODE -ne 0) { throw 'Restored grants/RLS/RPC metadata failed verification.' }
  $metadataHashes = @($metadataReport | Where-Object { [string]$_ -cmatch '^security_metadata_sha256=[a-f0-9]{64}$' })
  if ($metadataHashes.Count -ne 1 -or
      ([string]$metadataHashes[0]).Substring('security_metadata_sha256='.Length) -cne [string]$manifest.securityMetadataSha256) {
    throw 'Restored public catalog and security metadata do not match the source. Restore is not verified.'
  }

  Write-Output 'restore=verified_against_source_profile'
  Write-Output ('security_metadata=verified_against_source_' + $ExpectedAccountingProfile)
  Write-Output 'managed_schemas=excluded'
  Write-Output ('accounting_profile=' + $actualAccountingProfile)
  Write-Output ('archive_sha256=' + $actualHash)
  Write-Output ('target_database=' + $ExpectedDisposableDatabase)
  Write-Output 'The declared target and restored data passed verification. Record independent target-isolation evidence in the restricted migration journal.'
} finally {
  try {
    if ($restoreListPath -and (Test-Path -LiteralPath $restoreListPath)) {
      Remove-Item -LiteralPath $restoreListPath -Force
    }
  } finally {
    Restore-PgEnvironment $savedPgEnvironment
  }
}
