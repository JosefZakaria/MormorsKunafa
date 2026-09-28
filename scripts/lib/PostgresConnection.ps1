# Keep libpq's effective connection identical for preflight and every command.
function Get-PgConnectionSettings([string]$Prefix = '') {
  $settings = @{}
  foreach ($name in @('PGHOST','PGDATABASE','PGUSER','PGPASSWORD')) {
    $value = [Environment]::GetEnvironmentVariable($Prefix + $name)
    if ([string]::IsNullOrEmpty($value)) { throw "Missing $Prefix$name" }
    $settings[$name] = $value
  }
  $address = $null
  if ([Net.IPAddress]::TryParse($settings.PGHOST, [ref]$address)) {
    $settings.PGHOST = $address.ToString()
  } elseif ($settings.PGHOST -cnotmatch '^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$' -or
      $settings.PGHOST.Contains('..')) {
    throw 'PGHOST must be one TCP hostname or IP address, without lists or connection-string syntax.'
  }
  if ($settings.PGDATABASE -cnotmatch '^[A-Za-z_][A-Za-z0-9_-]{0,62}$') {
    throw 'PGDATABASE must be a literal database name, not a URI or connection string.'
  }
  if ($settings.PGUSER -cnotmatch '^[A-Za-z_][A-Za-z0-9_.-]{0,127}$') { throw 'Invalid PGUSER format.' }
  $port = [Environment]::GetEnvironmentVariable($Prefix + 'PGPORT')
  if ([string]::IsNullOrEmpty($port)) { $port = '5432' }
  if ($port -cnotmatch '^\d{1,5}$' -or [int]$port -lt 1 -or [int]$port -gt 65535) { throw 'Invalid single PGPORT.' }
  $settings.PGPORT = $port
  $ssl = [Environment]::GetEnvironmentVariable($Prefix + 'PGSSLMODE')
  if ([string]::IsNullOrEmpty($ssl)) { $ssl = 'require' }
  if ($ssl -cnotin @('disable','require','verify-ca','verify-full')) { throw 'Choose an explicit PGSSLMODE: disable, require, verify-ca or verify-full.' }
  $settings.PGSSLMODE = $ssl
  foreach ($name in @('PGSSLCERT','PGSSLKEY','PGSSLROOTCERT','PGSSLCRL','PGSSLCRLDIR','PGSSLPASSWORD')) {
    $value = [Environment]::GetEnvironmentVariable($Prefix + $name)
    if (-not [string]::IsNullOrEmpty($value)) { $settings[$name] = $value }
  }
  $settings.PGCONNECT_TIMEOUT = '10'
  return $settings
}

function Restore-PgEnvironment([hashtable]$Saved) {
  foreach ($name in @([Environment]::GetEnvironmentVariables().Keys)) {
    if ([string]$name -match '^PG') { [Environment]::SetEnvironmentVariable($name, $null) }
  }
  foreach ($name in $Saved.Keys) { [Environment]::SetEnvironmentVariable($name, $Saved[$name]) }
}

function Enter-IsolatedPgEnvironment([hashtable]$Settings) {
  $saved = @{}
  foreach ($name in @([Environment]::GetEnvironmentVariables().Keys)) {
    if ([string]$name -match '^PG') { $saved[$name] = [Environment]::GetEnvironmentVariable($name) }
  }
  try {
    Restore-PgEnvironment @{}
    foreach ($name in $Settings.Keys) { [Environment]::SetEnvironmentVariable($name, $Settings[$name]) }
    return $saved
  } catch {
    Restore-PgEnvironment $saved
    throw
  }
}

function Assert-PgDatabase($PsqlCommand, [string]$ExpectedDatabase) {
  $query = "SELECT pg_catalog.json_build_object('database',pg_catalog.current_database(),'sessionUser',session_user)::text"
  $output = @(& $PsqlCommand '--no-psqlrc' '--no-password' '--set' 'ON_ERROR_STOP=1' '--tuples-only' '--no-align' '--command' $query)
  if ($LASTEXITCODE -ne 0 -or $output.Count -ne 1) { throw 'Database identity preflight failed.' }
  try { $identity = $output[0] | ConvertFrom-Json -ErrorAction Stop } catch { throw 'Malformed database identity response.' }
  if (-not [string]::Equals([string]$identity.database,$ExpectedDatabase,[StringComparison]::Ordinal) -or
      [string]::IsNullOrWhiteSpace([string]$identity.sessionUser)) { throw 'The effective database does not exactly match the approved database.' }
  return $identity
}
