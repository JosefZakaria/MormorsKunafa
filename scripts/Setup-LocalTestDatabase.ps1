$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskCache = Join-Path $taskRoot '.cache/security-test'
$taskVersion = '17.11'
$taskArchive = Join-Path $taskCache "postgresql-$taskVersion-windows-x64.zip"
$taskInstall = Join-Path $taskCache "postgresql-$taskVersion"
$taskHash = '4B8DB0930C38F6EF845DB919551DEDDA3B6B845AEB0927B3D79A6E8E9E4537CF'

# Official Windows x64 link published under PostgreSQL 17.11 at:
# https://www.enterprisedb.com/download-postgresql-binaries
$taskDownload = 'https://sbp.enterprisedb.com/getfile.jsp?fileid=1260491'
New-Item -ItemType Directory -Force -Path $taskCache | Out-Null
if (-not (Test-Path -LiteralPath $taskArchive)) {
  Invoke-WebRequest -Uri $taskDownload -OutFile $taskArchive
}
if ((Get-FileHash -LiteralPath $taskArchive -Algorithm SHA256).Hash -ne $taskHash) {
  throw 'PostgreSQL archive checksum mismatch; no files were extracted'
}
if (-not (Test-Path -LiteralPath (Join-Path $taskInstall '.runtime-complete'))) {
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $taskZip = [IO.Compression.ZipFile]::OpenRead($taskArchive)
  try {
    foreach ($taskEntry in $taskZip.Entries) {
      if ($taskEntry.FullName -notmatch '^pgsql/(bin|lib|share)/' -or $taskEntry.Name -eq '') { continue }
      $taskDestination = [IO.Path]::GetFullPath((Join-Path $taskInstall $taskEntry.FullName))
      $taskPrefix = [IO.Path]::GetFullPath($taskInstall) + [IO.Path]::DirectorySeparatorChar
      if (-not $taskDestination.StartsWith($taskPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Unsafe archive entry'
      }
      [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($taskDestination)) | Out-Null
      [IO.Compression.ZipFileExtensions]::ExtractToFile($taskEntry, $taskDestination, $true)
    }
  } finally { $taskZip.Dispose() }
}
$taskPostgres = Join-Path $taskInstall 'pgsql/bin/postgres.exe'
$taskActualVersion = & $taskPostgres '--version'
if ($LASTEXITCODE -ne 0 -or $taskActualVersion -notmatch 'PostgreSQL\) 17\.11(?:\s|$)') {
  throw 'Unexpected PostgreSQL runtime version'
}
Set-Content -LiteralPath (Join-Path $taskInstall '.runtime-complete') -Value $taskHash
Write-Output "Verified PostgreSQL $taskVersion in the project cache; no service installed or database started"
