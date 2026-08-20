[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$DestinationDirectory,

  [Parameter(Mandatory = $true)]
  [switch]$AcknowledgeRestrictedDestination
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

if (-not $AcknowledgeRestrictedDestination) {
  throw 'AcknowledgeRestrictedDestination is required. The dump contains production personal and accounting data.'
}

$workspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path.TrimEnd('\', '/')
$destination = [IO.Path]::GetFullPath($DestinationDirectory).TrimEnd('\', '/')
$workspacePrefix = $workspace + [IO.Path]::DirectorySeparatorChar
if ($destination.Equals($workspace, [StringComparison]::OrdinalIgnoreCase) -or
    $destination.StartsWith($workspacePrefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'The backup destination must be outside the Git workspace.'
}

$requiredEnvironment = @('PGHOST', 'PGDATABASE', 'PGUSER', 'PGPASSWORD')
$missingEnvironment = @($requiredEnvironment | Where-Object {
  [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($_))
})
if ($missingEnvironment.Count -gt 0) {
  throw ('Missing PostgreSQL environment variables: ' + ($missingEnvironment -join ', '))
}

$pgDump = Get-Command pg_dump -ErrorAction Stop
$pgRestore = Get-Command pg_restore -ErrorAction Stop
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

$previousSslMode = $env:PGSSLMODE
if ([string]::IsNullOrWhiteSpace($env:PGSSLMODE)) {
  $env:PGSSLMODE = 'require'
}

try {
  & $pgDump.Source '--format=custom' '--blobs' '--no-owner' '--no-privileges' '--file' $partialPath
  if ($LASTEXITCODE -ne 0) {
    throw 'pg_dump failed. No backup was accepted.'
  }

  $catalog = @(& $pgRestore.Source '--list' $partialPath)
  if ($LASTEXITCODE -ne 0 -or $catalog.Count -eq 0) {
    throw 'pg_restore could not read the archive catalog.'
  }

  $requiredTables = @('admin_settings', 'admin_users', 'order_items', 'orders', 'products')
  $missingTables = @($requiredTables | Where-Object {
    $table = $_
    -not ($catalog | Where-Object { $_ -match "\bTABLE public $([regex]::Escape($table))\b" })
  })
  if ($missingTables.Count -gt 0) {
    throw ('Backup archive is missing required public tables: ' + ($missingTables -join ', '))
  }

  Move-Item -LiteralPath $partialPath -Destination $archivePath
  $file = Get-Item -LiteralPath $archivePath
  $manifest = [ordered]@{
    formatVersion = 1
    createdUtc = [DateTime]::UtcNow.ToString('o')
    archiveFile = $file.Name
    archiveBytes = $file.Length
    archiveSha256 = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    sourceHostFingerprint = Get-TextSha256 $env:PGHOST
    sourceDatabase = $env:PGDATABASE
    requiredTables = $requiredTables
    restoreTested = $false
  }
  $manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $manifestPath -Encoding utf8

  Write-Output ('archive=' + $archivePath)
  Write-Output ('manifest=' + $manifestPath)
  Write-Output ('sha256=' + $manifest.archiveSha256)
  Write-Output ('bytes=' + $manifest.archiveBytes)
  Write-Output 'archive_catalog=verified'
  Write-Output 'restore_tested=false'
  Write-Output 'Keep both files encrypted and restricted. Do not add them to Git or an ordinary cloud-synced folder.'
} catch {
  if (Test-Path -LiteralPath $partialPath) {
    Remove-Item -LiteralPath $partialPath -Force
  }
  throw
} finally {
  $env:PGSSLMODE = $previousSslMode
}
