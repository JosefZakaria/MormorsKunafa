[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
  [Parameter(Mandatory = $true)]
  [ValidateScript({ Test-Path -LiteralPath $_ })]
  [string]$MirrorPath,

  [Parameter(Mandatory = $true)]
  [ValidatePattern('^https://github\.com/[^/]+/[^/]+(?:\.git)?$')]
  [string]$ExpectedOrigin,

  [switch]$ExecuteLocalRewrite
)

$ErrorActionPreference = 'Stop'

$mirror = (Resolve-Path -LiteralPath $MirrorPath).Path.TrimEnd('\', '/')
$workspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path.TrimEnd('\', '/')
$workspacePrefix = $workspace + [IO.Path]::DirectorySeparatorChar
if ($mirror.Equals($workspace, [StringComparison]::OrdinalIgnoreCase) -or
    $mirror.StartsWith($workspacePrefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'The mirror must be outside the active workspace.'
}

$isBare = (& git -C $mirror rev-parse --is-bare-repository 2>$null)
if ($LASTEXITCODE -ne 0 -or $isBare -ne 'true') {
  throw 'MirrorPath must be a bare repository created with git clone --mirror.'
}

$actualOrigin = (& git -C $mirror remote get-url origin 2>$null)
if ($LASTEXITCODE -ne 0 -or $actualOrigin -ne $ExpectedOrigin) {
  throw "Mirror origin does not exactly match ExpectedOrigin. Actual: $actualOrigin"
}

$refsBefore = @(& git -C $mirror for-each-ref '--format=%(refname)' | Sort-Object)
if ($LASTEXITCODE -ne 0 -or $refsBefore.Count -eq 0) {
  throw 'The mirror has no refs to rewrite.'
}
$commitCountBefore = [int64](& git -C $mirror rev-list --count --all)
$mergeCountBefore = @(& git -C $mirror rev-list --all '--min-parents=2').Count
$rootCountBefore = @(& git -C $mirror rev-list --all '--max-parents=0').Count
if ($LASTEXITCODE -ne 0 -or $commitCountBefore -le 0 -or $rootCountBefore -le 0) {
  throw 'Unable to establish the pre-rewrite commit topology.'
}

Write-Output ('mirror=' + $mirror)
Write-Output ('origin=' + $actualOrigin)
Write-Output ('ref_count=' + $refsBefore.Count)
Write-Output ('commit_count=' + $commitCountBefore)
Write-Output ('merge_count=' + $mergeCountBefore)
Write-Output ('root_count=' + $rootCountBefore)
Write-Output 'push_enabled=false'

if (-not $ExecuteLocalRewrite) {
  Write-Output 'preflight=passed'
  Write-Output 'No history was changed. Re-run with -ExecuteLocalRewrite only after credential rotation and verified deployment.'
  exit 0
}

if (-not (Get-Command git-filter-repo -ErrorAction SilentlyContinue)) {
  throw 'git-filter-repo is required for the local rewrite but is not installed.'
}
$filterRepoHelp = (& git filter-repo -h 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0 -or $filterRepoHelp -notmatch '--sensitive-data-removal') {
  throw 'git-filter-repo 2.47 or newer with --sensitive-data-removal is required.'
}

$description = "remove the known SQL dump, ZIP and extracted ZIP paths from all refs in $mirror"
if (-not $PSCmdlet.ShouldProcess($mirror, $description)) {
  Write-Output 'rewrite=cancelled'
  exit 0
}

& git -C $mirror filter-repo --force --sensitive-data-removal --invert-paths `
  --prune-empty never `
  --prune-degenerate never `
  --path 'Database/845466_f2374cba400138f050cfb9bde30d163e.sql' `
  --path 'backend/backend.zip' `
  --path 'backend/_zip_extract/'
if ($LASTEXITCODE -ne 0) {
  throw 'git-filter-repo failed. Do not push this mirror.'
}

$refsAfter = @(& git -C $mirror for-each-ref '--format=%(refname)' | Sort-Object)
$refDifference = @(Compare-Object -ReferenceObject $refsBefore -DifferenceObject $refsAfter)
if ($refDifference.Count -ne 0) {
  throw 'Ref names changed during the rewrite. Do not push this mirror.'
}

$commitCountAfter = [int64](& git -C $mirror rev-list --count --all)
$mergeCountAfter = @(& git -C $mirror rev-list --all '--min-parents=2').Count
$rootCountAfter = @(& git -C $mirror rev-list --all '--max-parents=0').Count
if ($LASTEXITCODE -ne 0 -or
    $commitCountAfter -ne $commitCountBefore -or
    $mergeCountAfter -ne $mergeCountBefore -or
    $rootCountAfter -ne $rootCountBefore) {
  throw 'Commit or merge topology changed during the targeted rewrite. Do not push this mirror.'
}

$verificationScript = Join-Path $PSScriptRoot 'Test-GitHistorySanitization.ps1'
& $verificationScript -RepositoryPath $mirror
if ($LASTEXITCODE -ne 0) {
  throw 'Forbidden paths or blobs remain reachable. Do not push this mirror.'
}

Write-Output 'rewrite=verified-locally'
Write-Output ('commit_count_preserved=' + $commitCountAfter)
Write-Output ('merge_count_preserved=' + $mergeCountAfter)
Write-Output ('root_count_preserved=' + $rootCountAfter)
Write-Output 'No push was performed. Run an independent secret scan before the user coordinates any force-push.'
