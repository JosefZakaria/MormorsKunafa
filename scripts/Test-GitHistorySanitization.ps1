[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateScript({ Test-Path -LiteralPath $_ })]
  [string]$RepositoryPath
)

$ErrorActionPreference = 'Stop'

$repository = (Resolve-Path -LiteralPath $RepositoryPath).Path
$insideWorkTree = (& git -C $repository rev-parse --is-inside-work-tree 2>$null)
$isBare = (& git -C $repository rev-parse --is-bare-repository 2>$null)
if ($LASTEXITCODE -ne 0 -or ($insideWorkTree -ne 'true' -and $isBare -ne 'true')) {
  throw "RepositoryPath is not a Git worktree or bare repository: $repository"
}

$forbiddenPathPatterns = @(
  '^Database/845466_f2374cba400138f050cfb9bde30d163e\.sql$',
  '^backend/backend\.zip$',
  '^backend/_zip_extract(?:/|$)'
)
$forbiddenBlobIds = @(
  '617582c42ec32691ae3487858071208745b9e0f1',
  '5bd3a0eec2181ab052eaec767c6f9ace51cb9f9c'
)

$objectLines = @(& git -C $repository rev-list --objects --all)
if ($LASTEXITCODE -ne 0) {
  throw 'Unable to enumerate reachable Git objects.'
}

$reachablePaths = @(
  foreach ($line in $objectLines) {
    $parts = $line -split ' ', 2
    if ($parts.Count -eq 2) {
      foreach ($pattern in $forbiddenPathPatterns) {
        if ($parts[1] -match $pattern) {
          $parts[1]
          break
        }
      }
    }
  }
) | Sort-Object -Unique

$reachableObjectIds = @(
  foreach ($line in $objectLines) {
    ($line -split ' ', 2)[0]
  }
)
$reachableBlobs = @($forbiddenBlobIds | Where-Object { $_ -in $reachableObjectIds })
$refs = @(& git -C $repository for-each-ref '--format=%(refname)')
if ($LASTEXITCODE -ne 0) {
  throw 'Unable to enumerate Git refs.'
}

$result = [ordered]@{
  Repository = $repository
  RefCount = $refs.Count
  ReachableObjectCount = $objectLines.Count
  ForbiddenPaths = $reachablePaths
  ForbiddenBlobs = $reachableBlobs
  Sanitized = ($reachablePaths.Count -eq 0 -and $reachableBlobs.Count -eq 0)
}

$result | ConvertTo-Json -Depth 4
if (-not $result.Sanitized) {
  exit 1
}

