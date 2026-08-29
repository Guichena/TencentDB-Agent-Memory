param(
  [string]$SourceRoot = $PSScriptRoot,
  [string]$AdaptationsPath = (Join-Path $PSScriptRoot '..\..\generators\parallel\build-07\T13\batches\pilot-skill-01\adaptations.json')
)

$ErrorActionPreference = 'Stop'
$freezePath = Join-Path $SourceRoot 'source-freeze.json'
$freeze = Get-Content -Raw -LiteralPath $freezePath | ConvertFrom-Json
$adaptations = (Get-Content -Raw -LiteralPath $AdaptationsPath | ConvertFrom-Json).adaptations
$adaptedRoot = Join-Path $SourceRoot 'adapted'
New-Item -ItemType Directory -Force -Path $adaptedRoot | Out-Null

$records = @()
foreach ($adaptation in $adaptations) {
  $source = $freeze.sources | Where-Object { $_.source_id -eq $adaptation.source_id }
  if ($null -eq $source) {
    throw "Missing frozen source for $($adaptation.source_id)"
  }
  if ($source.kind -ne 'skill') {
    throw "Expected a skill source for $($adaptation.source_id)"
  }
  $rawPath = Join-Path $SourceRoot $source.local_path
  $rawHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $rawPath).Hash.ToLowerInvariant()
  if ($rawHash -ne $source.raw_file_sha256 -or $rawHash -ne $adaptation.raw_sha256) {
    throw "Frozen hash mismatch for $($adaptation.source_id)"
  }
  $destinationDirectory = Join-Path $adaptedRoot $adaptation.asset_id
  New-Item -ItemType Directory -Force -Path $destinationDirectory | Out-Null
  $destinationPath = Join-Path $destinationDirectory 'SKILL.md'
  Copy-Item -LiteralPath $rawPath -Destination $destinationPath -Force
  $adaptedHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $destinationPath).Hash.ToLowerInvariant()
  if ($adaptedHash -ne $rawHash) {
    throw "Technical body changed while adapting $($adaptation.source_id)"
  }
  $records += [ordered]@{
    asset_id = $adaptation.asset_id
    source_id = $adaptation.source_id
    raw_path = $source.local_path
    adapted_path = "adapted/$($adaptation.asset_id)/SKILL.md"
    raw_sha256 = $rawHash
    adapted_sha256 = $adaptedHash
    body_transform = 'byte_identical'
    metadata_transform = 'listing_description_use_when_do_not_use_when_only'
  }
}

$resource = $freeze.sources | Where-Object { $_.source_id -eq 'T13-SRC-DPM-CLI' }
if ($null -eq $resource) {
  throw 'Missing frozen DPM CLI resource'
}
$resourceRawPath = Join-Path $SourceRoot $resource.local_path
$resourceHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $resourceRawPath).Hash.ToLowerInvariant()
if ($resourceHash -ne $resource.raw_file_sha256) {
  throw 'Frozen DPM CLI resource hash mismatch'
}
$resourceDestinationDirectory = Join-Path $adaptedRoot 'T13-SKILL-DPM-FINDER\references'
New-Item -ItemType Directory -Force -Path $resourceDestinationDirectory | Out-Null
$resourceDestination = Join-Path $resourceDestinationDirectory 'cli.md'
Copy-Item -LiteralPath $resourceRawPath -Destination $resourceDestination -Force
$resourceAdaptedHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $resourceDestination).Hash.ToLowerInvariant()
if ($resourceAdaptedHash -ne $resourceHash) {
  throw 'DPM CLI resource changed while adapting'
}

$manifest = [ordered]@{
  schema_version = 'task1.skill_source_adaptation.v1'
  team_id = 'T13'
  repository_url = $freeze.repository_url
  commit_sha = $freeze.commit_sha
  license = $freeze.license
  adaptations = $records
  resources = @([ordered]@{
    asset_id = 'T13-SKILL-DPM-FINDER'
    source_id = 'T13-SRC-DPM-CLI'
    raw_path = $resource.local_path
    adapted_path = 'adapted/T13-SKILL-DPM-FINDER/references/cli.md'
    raw_sha256 = $resourceHash
    adapted_sha256 = $resourceAdaptedHash
    body_transform = 'byte_identical'
  })
}
$manifest | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath (Join-Path $SourceRoot 'adapted-source-manifest.json') -Encoding utf8
Write-Output "Prepared $($records.Count) byte-identical Skill packages and 1 resource for T13."
