$ErrorActionPreference = 'Stop'

$targets = @(
  'Database/845466_f2374cba400138f050cfb9bde30d163e.sql',
  'backend/backend.zip',
  'backend/_zip_extract'
)

Write-Output ('snapshot_utc=' + [DateTime]::UtcNow.ToString('o'))
Write-Output 'addition_commits:'
git log --all --diff-filter=A --format='%H %cI %s' -- $targets

Write-Output 'historical_objects:'
git rev-list --all --objects |
  Select-String -Pattern 'Database/845466_f2374cba400138f050cfb9bde30d163e.sql$|backend/backend.zip$|backend/_zip_extract/'

$introductionCommits = @(
  '954190f58fe2ea5d409da13c8551b86690597428',
  '5d50a7113c4b8d40925f3f377f5d006fb95af68e'
)
foreach ($commit in $introductionCommits) {
  Write-Output ('remote_refs_containing_' + $commit + ':')
  git branch -r --contains $commit
}

Write-Output 'tracked_at_head:'
git ls-tree -r --name-only HEAD -- $targets

Write-Output 'Important: this collector reports metadata only and never reads target contents.'
