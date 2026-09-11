[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$DestinationDirectory,

  [Parameter(Mandatory = $true)]
  [switch]$AcknowledgeRestrictedDestination
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

function Assert-PublicArchiveScope([object[]]$Catalog) {
  foreach ($line in $Catalog) {
    $entry = ([string]$line).Trim()
    if (-not $entry -or $entry.StartsWith(';')) { continue }
    if ($entry -notmatch '^\d+;\s+\d+\s+\d+\s+(?:SCHEMA - public(?:\s|$)|(?:COMMENT|ACL) - SCHEMA public(?:\s|$)|(?:TABLE DATA|TABLE|SEQUENCE SET|SEQUENCE OWNED BY|SEQUENCE|FUNCTION|PROCEDURE|CHECK CONSTRAINT|CONSTRAINT|FK CONSTRAINT|INDEX|TRIGGER|POLICY|ROW SECURITY|DEFAULT ACL|ACL|COMMENT|DEFAULT|TYPE|DOMAIN|MATERIALIZED VIEW DATA|MATERIALIZED VIEW|VIEW) public\s)') {
      throw 'Archive contains an unsupported or non-public object. No managed schema may be restored.'
    }
  }
}

function Get-SecurityMetadataHash($PsqlCommand, [string]$Profile) {
  $verificationSql = Join-Path $PSScriptRoot '..\backend\src\db\verification\verify-security-metadata.sql'
  $report = @(& $PsqlCommand '--no-psqlrc' '--no-password' '--quiet' '--tuples-only' '--no-align' `
    '--set' 'ON_ERROR_STOP=1' '--set' "expected_accounting_profile=$Profile" '--file' $verificationSql)
  if ($LASTEXITCODE -ne 0) { throw 'Source security metadata verification failed.' }
  $hashes = @($report | Where-Object { [string]$_ -cmatch '^security_metadata_sha256=[a-f0-9]{64}$' })
  if ($hashes.Count -ne 1) { throw 'Source security metadata fingerprint is missing or ambiguous.' }
  return ([string]$hashes[0]).Substring('security_metadata_sha256='.Length)
}

if (-not $AcknowledgeRestrictedDestination) {
  throw 'AcknowledgeRestrictedDestination is required. The dump contains personal and accounting data from the explicitly selected source.'
}

$workspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path.TrimEnd('\', '/')
$destination = [IO.Path]::GetFullPath($DestinationDirectory).TrimEnd('\', '/')
$workspacePrefix = $workspace + [IO.Path]::DirectorySeparatorChar
if ($destination.Equals($workspace, [StringComparison]::OrdinalIgnoreCase) -or
    $destination.StartsWith($workspacePrefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'The backup destination must be outside the Git workspace.'
}

$connection = Get-PgConnectionSettings

$pgDump = Get-Command pg_dump -ErrorAction Stop
$pgRestore = Get-Command pg_restore -ErrorAction Stop
$psql = Get-Command psql -ErrorAction Stop
New-Item -ItemType Directory -Path $destination -Force | Out-Null

$timestamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')
$archivePath = Join-Path $destination "mormors-kunafa-$timestamp.dump"
$partialPath = $archivePath + '.partial'
$manifestPath = $archivePath + '.manifest.json'
if ((Test-Path -LiteralPath $archivePath) -or
    (Test-Path -LiteralPath $partialPath) -or
    (Test-Path -LiteralPath $manifestPath)) {
  throw 'Refusing to overwrite an existing backup artifact.'
}

$savedPgEnvironment = Enter-IsolatedPgEnvironment $connection

try {
  $sourceIdentity = Assert-PgDatabase $psql.Source $connection.PGDATABASE
  $metadataBefore = Get-SecurityMetadataHash $psql.Source 'legacy-core'
  # Keep application ACLs and default privileges. Managed auth/storage schemas
  # and object bytes are outside this accounting archive and remain untouched.
  & $pgDump.Source '--no-password' '--format=custom' '--schema=public' '--no-owner' '--file' $partialPath
  if ($LASTEXITCODE -ne 0) {
    throw 'pg_dump failed. No backup was accepted.'
  }

  $catalog = @(& $pgRestore.Source '--list' $partialPath)
  if ($LASTEXITCODE -ne 0 -or $catalog.Count -eq 0) {
    throw 'pg_restore could not read the archive catalog.'
  }

  $publicTables = Get-PublicTablesFromArchiveCatalog $catalog
  $requiredTables = @('admin_settings', 'admin_users', 'order_items', 'orders', 'products')
  $missingTables = @($requiredTables | Where-Object {
    $publicTables -cnotcontains $_
  })
  if ($missingTables.Count -gt 0) {
    throw ('Backup archive is missing required public tables: ' + ($missingTables -join ', '))
  }
  Assert-PublicArchiveScope $catalog
  $securedLedgerTables = @(
    'duplicate_stripe_refunds',
    'order_refund_items',
    'order_refunds',
    'payment_provider_events',
    'security_audit_log'
  )
  $accountingProfile = Get-AccountingProfile $publicTables $securedLedgerTables
  $metadataProfile = if ($accountingProfile -eq 'secured-ledgers') { 'secured-ledgers' } else { 'legacy-core' }
  $securityMetadataHash = Get-SecurityMetadataHash $psql.Source $metadataProfile
  if ($securityMetadataHash -cne $metadataBefore) {
    throw 'Source security metadata changed during backup. Quiesce schema changes and retake the archive.'
  }

  Move-Item -LiteralPath $partialPath -Destination $archivePath
  $file = Get-Item -LiteralPath $archivePath
  $manifest = [ordered]@{
    formatVersion = 3
    createdUtc = [DateTime]::UtcNow.ToString('o')
    archiveFile = $file.Name
    archiveBytes = $file.Length
    archiveSha256 = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    sourceHostFingerprint = Get-TextSha256 $connection.PGHOST
    sourceDatabase = $sourceIdentity.database
    sourceConnectionIsolated = $true
    archiveScope = 'public-schema-only'
    privilegesIncluded = $true
    securityMetadataSha256 = $securityMetadataHash
    requiredTables = $requiredTables
    publicTables = $publicTables
    accountingProfile = $accountingProfile
    restoreTested = $false
  }
  $manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $manifestPath -Encoding utf8

  Write-Output ('archive=' + $archivePath)
  Write-Output ('manifest=' + $manifestPath)
  Write-Output ('sha256=' + $manifest.archiveSha256)
  Write-Output ('bytes=' + $manifest.archiveBytes)
  Write-Output 'archive_catalog=verified'
  Write-Output ('accounting_profile=' + $manifest.accountingProfile)
  Write-Output 'restore_tested=false'
  Write-Output 'Keep both files encrypted and restricted. Do not add them to Git or an ordinary cloud-synced folder.'
} catch {
  if (Test-Path -LiteralPath $partialPath) {
    Remove-Item -LiteralPath $partialPath -Force
  }
  throw
} finally {
  Restore-PgEnvironment $savedPgEnvironment
}
