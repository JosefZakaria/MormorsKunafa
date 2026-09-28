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
$global:mkBackupTestState.catalogTables = @('admin_settings','admin_users','order_items','orders','products')
$global:mkBackupTestState.verifiedAccountingProfile = $null
$global:mkBackupTestState.metadataHash = 'a' * 64
$global:mkBackupTestState.metadataFailure = $false
$global:mkBackupTestState.extraCatalog = @()
$global:mkBackupTestState.defaultCalls = 0
$global:mkBackupTestState.defaultsFailure = $false
function Get-Command([string]$Name) {
  # Never fall back to a real executable in this test.
  switch ($Name) {
    'psql' { return @{Source={
      Assert-IsolatedEnvironment
      Assert-Condition ($env:PGHOST -ceq $global:mkBackupTestState.expectedHost) 'Effective host changed'
      $global:LASTEXITCODE = 0
      if ($args -contains '--command') {
        if ([string]$args[[Array]::IndexOf($args,'--command')+1] -match 'ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC') {
          $global:mkBackupTestState.defaultCalls++
          if ($global:mkBackupTestState.defaultsFailure) { $global:LASTEXITCODE=1 }
          return
        }
        return (@{database=$global:mkBackupTestState.identityDatabase;sessionUser='synthetic_user'} | ConvertTo-Json -Compress)
      }
      $profileArgument = @($args | Where-Object { [string]$_ -like 'expected_accounting_profile=*' })
      Assert-Condition ($profileArgument.Count -eq 1) 'Restore verification did not receive exactly one accounting profile'
      $global:mkBackupTestState.verifiedAccountingProfile = ([string]$profileArgument[0]).Split('=', 2)[1]
      if ([string]$args[[Array]::IndexOf($args,'--file')+1] -like '*verify-security-metadata.sql') {
        if ($global:mkBackupTestState.metadataFailure) { $global:LASTEXITCODE=1; return }
        return ('security_metadata_sha256='+$global:mkBackupTestState.metadataHash)
      }
      if ($global:mkBackupTestState.verificationFailure) { $global:LASTEXITCODE = 1 }
    }} }
    'pg_dump' { return @{Source={
      Assert-IsolatedEnvironment
      Assert-Condition ($env:PGHOST -ceq 'source.example.test') 'Backup source was redirected'
      Assert-Condition ($args -contains '--schema=public') 'Backup includes managed schemas'
      Assert-Condition (-not ($args -contains '--no-privileges') -and -not ($args -contains '--blobs')) 'Backup lost ACLs or included unmanaged object bytes'
      $global:mkBackupTestState.dumpCalls++
      $global:LASTEXITCODE = if ($global:mkBackupTestState.commandFailure) { 1 } else { 0 }
      $outputPath=$args[[Array]::IndexOf($args,'--file')+1]
      [IO.File]::WriteAllText($outputPath,'synthetic archive, contains no real data')
    }} }
    'pg_restore' { return @{Source={
      Assert-IsolatedEnvironment
      $global:LASTEXITCODE = 0
      if ($args -contains '--list') {
        return @($global:mkBackupTestState.catalogTables | ForEach-Object { '123; 1259 456 TABLE public ' + $_ + ' synthetic_user' }) + @(
          '5; 2615 2200 SCHEMA - public pg_database_owner',
          '6; 0 0 ACL - SCHEMA public pg_database_owner',
          '7; 2606 123 CHECK CONSTRAINT public orders synthetic_check synthetic_user'
        ) + $global:mkBackupTestState.extraCatalog
      }
      Assert-Condition ($env:PGHOST -ceq 'target.example.test') 'Restore target was redirected'
      Assert-Condition (($args -contains '--single-transaction') -and ($args -contains '--exit-on-error')) 'Restore lost atomic failure options'
      Assert-Condition (-not ($args -contains '--no-privileges')) 'Restore discarded security ACLs'
      Assert-Condition ($args -contains '--use-list') 'Restore can drop the provider-created public schema'
      $restoreList=[string]$args[[Array]::IndexOf($args,'--use-list')+1]
      Assert-Condition (-not ((Get-Content -LiteralPath $restoreList) -match '\sSCHEMA - public\s')) 'Restore would replace the public schema owner'
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
  $manifestData=Get-Content -LiteralPath $manifest -Raw -Encoding utf8 | ConvertFrom-Json
  Assert-Condition ($manifestData.formatVersion -eq 3) 'Backup manifest format was not upgraded'
  Assert-Condition ($manifestData.accountingProfile -ceq 'legacy-core') 'Core backup received the wrong accounting profile'
  Assert-Condition (@($manifestData.publicTables).Count -eq 5) 'Backup manifest omitted public tables'
  Assert-Condition ($manifestData.archiveScope -ceq 'public-schema-only' -and $manifestData.privilegesIncluded -eq $true) 'Backup omitted safe restore scope'
  Assert-Condition ($manifestData.securityMetadataSha256 -ceq ('a'*64)) 'Backup omitted security metadata fingerprint'
  $env:RESTORE_PGHOST='target.example.test'; $env:RESTORE_PGDATABASE='restore_test'
  $env:RESTORE_PGUSER='synthetic_user'; $env:RESTORE_PGPASSWORD='synthetic-restore-password'
  $global:mkBackupTestState.expectedHost='target.example.test'
  $restoreScript=Join-Path $PSScriptRoot 'Test-SupabaseBackupRestore.ps1'
  $restoreArguments=@{ArchivePath=$archive;ManifestPath=$manifest;ExpectedDisposableDatabase='restore_test';ExpectedAccountingProfile='legacy-core';ConfirmDisposableTarget=$true;Confirm=$false}
  $env:RESTORE_PGDATABASE='Restore_Test'; Assert-Rejected { & $restoreScript @restoreArguments }
  $env:RESTORE_PGDATABASE='restore_test'
  $global:mkBackupTestState.identityDatabase='Restore_Test'; Assert-Rejected { & $restoreScript @restoreArguments }
  $global:mkBackupTestState.identityDatabase='restore_test'
  Assert-Condition ($global:mkBackupTestState.restoreCalls -eq 0) 'A failed preflight reached destructive restore'
  $securedArguments=$restoreArguments.Clone(); $securedArguments.ExpectedAccountingProfile='secured-ledgers'
  Assert-Rejected { & $restoreScript @securedArguments }
  $global:mkBackupTestState.catalogTables += 'payment_provider_events'
  Assert-Rejected { & $restoreScript @restoreArguments }
  $global:mkBackupTestState.catalogTables = @('admin_settings','admin_users','order_items','orders','products')
  Assert-Condition ($global:mkBackupTestState.restoreCalls -eq 0) 'A catalog/profile mismatch reached destructive restore'
  foreach ($entry in @('123; 1259 456 TABLE auth users synthetic_user',
    '123; 2615 456 SCHEMA - storage synthetic_user','123; 0 0 ACL - SCHEMA auth synthetic_user',
    '123; 0 0 BLOB - 456 synthetic_user')) {
    $global:mkBackupTestState.extraCatalog=@($entry)
    Assert-Rejected { & $restoreScript @restoreArguments }
  }
  $global:mkBackupTestState.extraCatalog=@()
  Assert-Condition ($global:mkBackupTestState.restoreCalls -eq 0) 'A managed-schema archive reached destructive restore'
  & $restoreScript @restoreArguments -WhatIf | Out-Null
  Assert-Condition ($global:mkBackupTestState.restoreCalls -eq 0) 'WhatIf restored the database'
  & $restoreScript @restoreArguments | Out-Null
  Assert-Condition ($global:mkBackupTestState.restoreCalls -eq 1) 'Restore was not exercised'
  Assert-Condition ($global:mkBackupTestState.verifiedAccountingProfile -ceq 'legacy-core') 'Restore verified the wrong accounting profile'
  $global:mkBackupTestState.metadataHash='b'*64; Assert-Rejected { & $restoreScript @restoreArguments }; $global:mkBackupTestState.metadataHash='a'*64
  $global:mkBackupTestState.metadataFailure=$true; Assert-Rejected { & $restoreScript @restoreArguments }; $global:mkBackupTestState.metadataFailure=$false
  $global:mkBackupTestState.commandFailure=$true; Assert-Rejected { & $restoreScript @restoreArguments }; $global:mkBackupTestState.commandFailure=$false
  $global:mkBackupTestState.verificationFailure=$true; Assert-Rejected { & $restoreScript @restoreArguments }; $global:mkBackupTestState.verificationFailure=$false
  $global:mkBackupTestState.expectedHost='source.example.test'
  $global:mkBackupTestState.catalogTables=@('admin_settings','admin_users','duplicate_stripe_refunds',
    'order_items','order_refund_items','order_refunds','orders','payment_provider_events','products','security_audit_log')
  $securedDirectory=Join-Path $testDirectory 'secured'
  & $backupScript -DestinationDirectory $securedDirectory -AcknowledgeRestrictedDestination | Out-Null
  $securedArguments=@{ArchivePath=(Get-ChildItem -LiteralPath $securedDirectory -Filter '*.dump').FullName;
    ManifestPath=(Get-ChildItem -LiteralPath $securedDirectory -Filter '*.manifest.json').FullName;
    ExpectedDisposableDatabase='restore_test';ExpectedAccountingProfile='secured-ledgers';ConfirmDisposableTarget=$true;Confirm=$false}
  $global:mkBackupTestState.expectedHost='target.example.test'
  & $restoreScript @securedArguments -WhatIf | Out-Null
  Assert-Condition ($global:mkBackupTestState.defaultCalls -eq 0) 'WhatIf changed function defaults'
  $securedOutput=@(& $restoreScript @securedArguments)
  Assert-Condition ($global:mkBackupTestState.defaultCalls -eq 1) 'Secured restore did not establish private function defaults'
  Assert-Condition ($securedOutput -contains 'restore=verified_against_source_profile') 'Secured restore did not verify'
  $restoreCountBeforeDefaultFailure=$global:mkBackupTestState.restoreCalls
  $global:mkBackupTestState.defaultsFailure=$true; Assert-Rejected { & $restoreScript @securedArguments }; $global:mkBackupTestState.defaultsFailure=$false
  Assert-Condition ($global:mkBackupTestState.restoreCalls -eq $restoreCountBeforeDefaultFailure) 'A failed default-ACL preflight reached restore'
  $global:mkBackupTestState.metadataFailure=$true; Assert-Rejected { & $restoreScript @securedArguments }; $global:mkBackupTestState.metadataFailure=$false
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
