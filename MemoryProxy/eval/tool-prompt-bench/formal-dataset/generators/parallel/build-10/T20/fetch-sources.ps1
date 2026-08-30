$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../../../../../../../..')).Path
$sourceRoot = Join-Path $repoRoot 'MemoryProxy/eval/tool-prompt-bench/formal-dataset/source-material/T20'
$headers = @{ 'User-Agent' = 'TencentDB-Agent-Memory-T20-source-freeze' }

$repoCatalog = @{
  'opensearch-project/opensearch-agent-skills' = @{ license = 'Apache-2.0'; licensePath = 'LICENSE.txt' }
  'NVIDIA/skills' = @{ license = 'CC-BY-4.0'; licensePath = 'LICENSE-CC-BY-4.0' }
}

$adopted = @(
  @{ key = 'opensearch-skills'; repo = 'opensearch-project/opensearch-agent-skills'; path = 'skills/opensearch-skills/SKILL.md' },
  @{ key = 'opensearch-ingest'; repo = 'opensearch-project/opensearch-agent-skills'; path = 'skills/opensearch-skills/ingest/SKILL.md' },
  @{ key = 'opensearch-document-processing'; repo = 'opensearch-project/opensearch-agent-skills'; path = 'skills/opensearch-skills/ingest/document-processing/SKILL.md' },
  @{ key = 'opensearch-observability'; repo = 'opensearch-project/opensearch-agent-skills'; path = 'skills/opensearch-skills/observability/SKILL.md' },
  @{ key = 'opensearch-log-analytics'; repo = 'opensearch-project/opensearch-agent-skills'; path = 'skills/opensearch-skills/observability/log-analytics/SKILL.md' },
  @{ key = 'opensearch-trace-analytics'; repo = 'opensearch-project/opensearch-agent-skills'; path = 'skills/opensearch-skills/observability/trace-analytics/SKILL.md' },
  @{ key = 'opensearch-search'; repo = 'opensearch-project/opensearch-agent-skills'; path = 'skills/opensearch-skills/search/SKILL.md' },
  @{ key = 'opensearch-launchpad'; repo = 'opensearch-project/opensearch-agent-skills'; path = 'skills/opensearch-skills/search/opensearch-launchpad/SKILL.md' },
  @{ key = 'opensearch-managed-ingestion'; repo = 'opensearch-project/opensearch-agent-skills'; path = 'skills/opensearch-skills/cloud/managed-ingestion-service/SKILL.md' },
  @{ key = 'nemo-retriever'; repo = 'NVIDIA/skills'; path = 'skills/nemo-retriever/SKILL.md' },
  @{ key = 'nemotron-retrieval-recipes'; repo = 'NVIDIA/skills'; path = 'skills/nemotron-retrieval-recipes/SKILL.md' },
  @{ key = 'rag-blueprint'; repo = 'NVIDIA/skills'; path = 'skills/rag-blueprint/SKILL.md' },
  @{ key = 'rag-eval'; repo = 'NVIDIA/skills'; path = 'skills/rag-eval/SKILL.md' },
  @{ key = 'rag-perf'; repo = 'NVIDIA/skills'; path = 'skills/rag-perf/SKILL.md' },
  @{ key = 'vss-search-archive'; repo = 'NVIDIA/skills'; path = 'skills/vss-search-archive/SKILL.md' },
  @{ key = 'aiq-research'; repo = 'NVIDIA/skills'; path = 'skills/aiq-research/SKILL.md' }
)

New-Item -ItemType Directory -Force -Path $sourceRoot | Out-Null
$repoLocks = @{}
foreach ($repoName in ($adopted.repo | Sort-Object -Unique)) {
  $catalog = $repoCatalog[$repoName]
  $remote = @(& git ls-remote --symref ('https://github.com/' + $repoName + '.git') HEAD)
  if ($LASTEXITCODE -ne 0) { throw "cannot inspect upstream HEAD for $repoName" }
  $branchMatch = [regex]::Match(($remote -join "`n"), 'ref: refs/heads/([^\s]+)\s+HEAD')
  $commitMatch = [regex]::Match(($remote -join "`n"), '(?m)^([a-f0-9]{40})\s+HEAD$')
  if (-not $branchMatch.Success -or -not $commitMatch.Success) { throw "cannot freeze $repoName" }
  $defaultBranch = $branchMatch.Groups[1].Value
  $commitSha = $commitMatch.Groups[1].Value
  $repoSlug = $repoName.Replace('/', '__')
  $repoDir = Join-Path $sourceRoot (Join-Path 'repos' $repoSlug)
  New-Item -ItemType Directory -Force -Path $repoDir | Out-Null
  $licensePath = Join-Path $repoDir 'LICENSE.upstream'
  $licenseUrl = 'https://raw.githubusercontent.com/' + $repoName + '/' + $commitSha + '/' + $catalog.licensePath
  Invoke-WebRequest -Headers $headers -Uri $licenseUrl -OutFile $licensePath
  $repoLocks[$repoName] = [ordered]@{
    repository = 'https://github.com/' + $repoName
    defaultBranch = $defaultBranch
    commit = $commitSha
    license = $catalog.license
    licensePath = (Resolve-Path -LiteralPath $licensePath).Path.Substring($repoRoot.Length + 1).Replace('\', '/')
    licenseSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $licensePath).Hash.ToLowerInvariant()
  }
}

$files = @()
foreach ($item in $adopted) {
  $lock = $repoLocks[$item.repo]
  $repoSlug = $item.repo.Replace('/', '__')
  $destination = Join-Path $sourceRoot (Join-Path 'repos' (Join-Path $repoSlug $item.path))
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
  $rawUrl = 'https://raw.githubusercontent.com/' + $item.repo + '/' + $lock.commit + '/' + $item.path
  Invoke-WebRequest -Headers $headers -Uri $rawUrl -OutFile $destination
  $files += [ordered]@{
    sourceId = 'T20-SRC-' + $item.key.ToUpperInvariant()
    skillKey = $item.key
    kind = 'skill'
    parentSkillKey = $null
    repository = $lock.repository
    commit = $lock.commit
    license = $lock.license
    upstreamPath = $item.path
    rawUrl = $rawUrl
    rawSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $destination).Hash.ToLowerInvariant()
    localPath = (Resolve-Path -LiteralPath $destination).Path.Substring($repoRoot.Length + 1).Replace('\', '/')
  }
}

$sourceLock = [ordered]@{
  schema_version = 'task1.source_lock.v1'
  team_id = 'T20'
  generated_at = (Get-Date).ToUniversalTime().ToString('o')
  adopted_skill_count = $files.Count
  repositories = @($repoLocks.Values)
  files = $files
}
$lockPath = Join-Path $sourceRoot 'source-lock.json'
[IO.File]::WriteAllText($lockPath, (($sourceLock | ConvertTo-Json -Depth 8) + "`n"), [Text.UTF8Encoding]::new($false))
$sourceLock | ConvertTo-Json -Depth 8
