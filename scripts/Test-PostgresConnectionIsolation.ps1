# All PostgreSQL executables are replaced by script blocks. No database/network
# command is launched; both success and failure exercise the real operator scripts.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib/PostgresConnection.ps1')

$testDirectory = Join-Path ([IO.Path]::GetTempPath()) ('mk-backup-contract-' + [guid]::NewGuid())
$savedTestEnvironment = @{}
foreach ($name in @([Environment]::GetEnvironmentVariables().Keys)) {
  if ([string]$name -match '^(PG|RESTORE_PG)') { $savedTestEnvironment[$name] = [Environment]::GetEnvironmentVariable($name) }
}
function Assert-Condition([bool]$Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
function Assert-Rejected([scriptblock]$Action) {
  $rejected = $false
  try { & $Action | Out-Null } catch { $rejected = $true }
  Assert-Condition $rejected 'Expected the unsafe operation to fail'
}
function Assert-IsolatedEnvironment {
  foreach ($name in @('PGHOSTADDR','PGSERVICE','PGSERVICEFILE','PGOPTIONS','PGPASSFILE','PGTARGETSESSIONATTRS')) {
    Assert-Condition ([Environment]::GetEnvironmentVariable($name) -eq $null) 'Ambient libpq option survived isolation'
  }
  Assert-Condition ($env:PGDATABASE -ceq 'restore_test') 'Unexpected effective database'
  Assert-Condition ($env:PGSSLMODE -ceq 'require') 'TLS default changed'
}
$global:mkBackupTestState = @{ restoreCalls = 0 }
$global:mkBackupTestState.dumpCalls = 0
$global:mkBackupTestState.identityDatabase = 'restore_test'
$global:mkBackupTestState.commandFailure = $false
$global:mkBackupTestState.verificationFailure = $false
$global:mkBackupTestState.expectedHost = 'source.example.test'
function Get-Command([string]$Name) {
  # Never fall back to a real executable in this test.
  switch ($Name) {
    'psql' { return @{Source={
      Assert-IsolatedEnvironment
      Assert-Condition ($env:PGHOST -ceq $global:mkBackupTestState.expectedHost) 'Effective host changed'
      $global:LASTEXITCODE = 0
      if ($args -contains '--command') {
        return (@{database=$global:mkBackupTestState.identityDatabase;sessionUser='synthetic_user'} | ConvertTo-Json -Compress)
      }
      if ($global:mkBackupTestState.verificationFailure) { $global:LASTEXITCODE = 1 }
    }} }
    'pg_dump' { return @{Source={
      Assert-IsolatedEnvironment
      Assert-Condition ($env:PGHOST -ceq 'source.example.test') 'Backup source was redirected'
      $global:mkBackupTestState.dumpCalls++
      $global:LASTEXITCODE = if ($global:mkBackupTestState.commandFailure) { 1 } else { 0 }
      $outputPath=$args[[Array]::IndexOf($args,'--file')+1]
      [IO.File]::WriteAllText($outputPath,'synthetic archive, contains no real data')
    }} }
    'pg_restore' { return @{Source={
      Assert-IsolatedEnvironment
      $global:LASTEXITCODE = 0
      if ($args -contains '--list') {
        return @('admin_settings','admin_users','order_items','orders','products') | ForEach-Object { 'TABLE public ' + $_ }
      }
      Assert-Condition ($env:PGHOST -ceq 'target.example.test') 'Restore target was redirected'
      Assert-Condition (($args -contains '--single-transaction') -and ($args -contains '--exit-on-error')) 'Restore lost atomic failure options'
      Assert-Condition ($args[[Array]::IndexOf($args,'--dbname')+1] -ceq 'restore_test') 'Restore changed the preflight database'
      $global:mkBackupTestState.restoreCalls++
      if ($global:mkBackupTestState.commandFailure) { $global:LASTEXITCODE = 1 }
    }} }
    default { throw 'Test attempted to resolve an unmocked executable' }
  }
}
try {
  foreach ($name in @([Environment]::GetEnvironmentVariables().Keys)) {
    if ([string]$name -match '^(PG|RESTORE_PG)') { [Environment]::SetEnvironmentVariable($name,$null) }
  }
  $env:PGHOST='source.example.test'; $env:PGDATABASE='restore_test'; $env:PGUSER='synthetic_user'; $env:PGPASSWORD='synthetic-password'
  $env:PGHOSTADDR='192.0.2.1'; $env:PGSERVICE='inherited-source'; $env:PGSERVICEFILE='ignored';
  $env:PGOPTIONS='-c search_path=untrusted'; $env:PGPASSFILE='ignored'; $env:PGTARGETSESSIONATTRS='read-write'
  $connection=Get-PgConnectionSettings
  $snapshot=Enter-IsolatedPgEnvironment $connection
  try { Assert-IsolatedEnvironment } finally { Restore-PgEnvironment $snapshot }
  Assert-Condition ($env:PGHOSTADDR -ceq '192.0.2.1') 'Original environment was not restored'
  foreach ($badHost in @('source.example.test,other.example.test','/tmp/socket','host=source.example.test')) {
    $env:PGHOST=$badHost; Assert-Rejected { Get-PgConnectionSettings }
  }
  $env:PGHOST='source.example.test'
  foreach ($badDatabase in @('postgresql://source.example.test/restore_test','host=source.example.test dbname=restore_test',' restore_test')) {
    $env:PGDATABASE=$badDatabase; Assert-Rejected { Get-PgConnectionSettings }
  }
  $env:PGDATABASE='restore_test'
  $backupScript=Join-Path $PSScriptRoot 'New-SupabaseSafetyBackup.ps1'
  & $backupScript -DestinationDirectory $testDirectory -AcknowledgeRestrictedDestination | Out-Null
  Assert-Condition ($global:mkBackupTestState.dumpCalls -eq 1) 'Backup was not exercised'
  Assert-Condition ($env:PGHOSTADDR -ceq '192.0.2.1') 'Backup leaked isolated environment'
  $archive=(Get-ChildItem -LiteralPath $testDirectory -Filter '*.dump').FullName
  $manifest=(Get-ChildItem -LiteralPath $testDirectory -Filter '*.manifest.json').FullName
  $env:RESTORE_PGHOST='target.example.test'; $env:RESTORE_PGDATABASE='restore_test'
  $env:RESTORE_PGUSER='synthetic_user'; $env:RESTORE_PGPASSWORD='synthetic-restore-password'
  $global:mkBackupTestState.expectedHost='target.example.test'
  $restoreScript=Join-Path $PSScriptRoot 'Test-SupabaseBackupRestore.ps1'
  $restoreArguments=@{ArchivePath=$archive;ManifestPath=$manifest;ExpectedDisposableDatabase='restore_test';ConfirmDisposableTarget=$true;Confirm=$false}
  $env:RESTORE_PGDATABASE='Restore_Test'; Assert-Rejected { & $restoreScript @restoreArguments }
  $env:RESTORE_PGDATABASE='restore_test'
  $global:mkBackupTestState.identityDatabase='Restore_Test'; Assert-Rejected { & $restoreScript @restoreArguments }
  $global:mkBackupTestState.identityDatabase='restore_test'
  Assert-Condition ($global:mkBackupTestState.restoreCalls -eq 0) 'A failed preflight reached destructive restore'
  & $restoreScript @restoreArguments -WhatIf | Out-Null
  Assert-Condition ($global:mkBackupTestState.restoreCalls -eq 0) 'WhatIf restored the database'
  & $restoreScript @restoreArguments | Out-Null
  Assert-Condition ($global:mkBackupTestState.restoreCalls -eq 1) 'Restore was not exercised'
  $global:mkBackupTestState.commandFailure=$true; Assert-Rejected { & $restoreScript @restoreArguments }; $global:mkBackupTestState.commandFailure=$false
  $global:mkBackupTestState.verificationFailure=$true; Assert-Rejected { & $restoreScript @restoreArguments }; $global:mkBackupTestState.verificationFailure=$false
  Assert-Condition ($env:PGHOSTADDR -ceq '192.0.2.1') 'Failure did not restore the original environment'
  Assert-Condition ($env:PGHOST -ceq 'source.example.test') 'Restore replaced source configuration'
  $env:RESTORE_PGHOST='source.example.test'; Assert-Rejected { & $restoreScript @restoreArguments }
  $global:mkBackupTestState.expectedHost='source.example.test'; $global:mkBackupTestState.commandFailure=$true
  Assert-Rejected { & $backupScript -DestinationDirectory (Join-Path $testDirectory 'failure') -AcknowledgeRestrictedDestination }
  Assert-Condition ($env:PGHOSTADDR -ceq '192.0.2.1') 'Failed backup did not restore source overrides'
  Write-Output 'Verified isolated backup/restore commands, case-sensitive identity, hostile settings, cancellation, failures and environment restoration using mock executables only.'
} finally {
  foreach ($name in @([Environment]::GetEnvironmentVariables().Keys)) {
    if ([string]$name -match '^(PG|RESTORE_PG)') { [Environment]::SetEnvironmentVariable($name,$null) }
  }
  foreach ($name in $savedTestEnvironment.Keys) { [Environment]::SetEnvironmentVariable($name,$savedTestEnvironment[$name]) }
  if (Test-Path -LiteralPath $testDirectory) {
    $resolvedTest=(Resolve-Path -LiteralPath $testDirectory).Path
    $tempPrefix=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\','/')+[IO.Path]::DirectorySeparatorChar
    if (-not $resolvedTest.StartsWith($tempPrefix,[StringComparison]::OrdinalIgnoreCase) -or
      (Split-Path $resolvedTest -Leaf) -notmatch '^mk-backup-contract-[0-9a-f-]{36}$') { throw 'Unsafe synthetic artifact cleanup path' }
    Remove-Item -LiteralPath $resolvedTest -Recurse -Force
  }
}
