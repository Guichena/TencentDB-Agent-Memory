param(
  [string]$SourceRoot = $PSScriptRoot,
  [string]$AdaptationsPath = (Join-Path $PSScriptRoot '..\..\generators\parallel\build-07\T14\batches\pilot-skill-01\adaptations.json')
)

$ErrorActionPreference = 'Stop'
$freeze = Get-Content -Raw -LiteralPath (Join-Path $SourceRoot 'source-freeze.json') | ConvertFrom-Json
$adaptations = (Get-Content -Raw -LiteralPath $AdaptationsPath | ConvertFrom-Json).adaptations
$adaptedRoot = Join-Path $SourceRoot 'adapted'
New-Item -ItemType Directory -Force -Path $adaptedRoot | Out-Null

$records = @()
foreach ($adaptation in $adaptations) {
  $source = $freeze.sources | Where-Object { $_.source_id -eq $adaptation.source_id }
  if ($null -eq $source -or $source.kind -ne 'skill') { throw "Missing frozen Skill source for $($adaptation.source_id)" }
  $rawPath = Join-Path $SourceRoot $source.local_path
  $rawHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $rawPath).Hash.ToLowerInvariant()
  if ($rawHash -ne $source.raw_file_sha256 -or $rawHash -ne $adaptation.raw_sha256) { throw "Frozen hash mismatch for $($adaptation.source_id)" }
  $destinationDirectory = Join-Path $adaptedRoot $adaptation.asset_id
  New-Item -ItemType Directory -Force -Path $destinationDirectory | Out-Null
  $destinationPath = Join-Path $destinationDirectory 'SKILL.md'
  Copy-Item -LiteralPath $rawPath -Destination $destinationPath -Force
  $adaptedHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $destinationPath).Hash.ToLowerInvariant()
  if ($adaptedHash -ne $rawHash) { throw "Technical body changed for $($adaptation.source_id)" }
  $records += [ordered]@{
    asset_id = $adaptation.asset_id
    source_id = $adaptation.source_id
    repository_id = $source.repository_id
    raw_path = $source.local_path
    adapted_path = "adapted/$($adaptation.asset_id)/SKILL.md"
    raw_sha256 = $rawHash
    adapted_sha256 = $adaptedHash
    body_transform = 'byte_identical'
    metadata_transform = 'listing_description_use_when_do_not_use_when_only'
  }
}

$resource = $freeze.sources | Where-Object { $_.source_id -eq 'T14-SRC-FLUX-IMAGE-AUTOMATION' }
if ($null -eq $resource) { throw 'Missing frozen Flux image automation resource' }
$resourceRawPath = Join-Path $SourceRoot $resource.local_path
$resourceHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $resourceRawPath).Hash.ToLowerInvariant()
if ($resourceHash -ne $resource.raw_file_sha256) { throw 'Frozen Flux resource hash mismatch' }
$resourceDirectory = Join-Path $adaptedRoot 'T14-SKILL-FLUX-KNOWLEDGE\references'
New-Item -ItemType Directory -Force -Path $resourceDirectory | Out-Null
$resourceDestination = Join-Path $resourceDirectory 'image-automation.md'
Copy-Item -LiteralPath $resourceRawPath -Destination $resourceDestination -Force
$resourceAdaptedHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $resourceDestination).Hash.ToLowerInvariant()
if ($resourceAdaptedHash -ne $resourceHash) { throw 'Flux image automation resource changed while adapting' }

$manifest = [ordered]@{
  schema_version = 'task1.skill_source_adaptation.v1'
  team_id = 'T14'
  repositories = $freeze.repositories
  adaptations = $records
  resources = @([ordered]@{
    asset_id = 'T14-SKILL-FLUX-KNOWLEDGE'
    source_id = 'T14-SRC-FLUX-IMAGE-AUTOMATION'
    repository_id = $resource.repository_id
    raw_path = $resource.local_path
    adapted_path = 'adapted/T14-SKILL-FLUX-KNOWLEDGE/references/image-automation.md'
    raw_sha256 = $resourceHash
    adapted_sha256 = $resourceAdaptedHash
    body_transform = 'byte_identical'
  })
}
$manifest | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath (Join-Path $SourceRoot 'adapted-source-manifest.json') -Encoding utf8
Write-Output "Prepared $($records.Count) byte-identical T14 Skill packages and 1 resource."
