$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../../../../../../../..')).Path
$sourceRoot = Join-Path $repoRoot 'MemoryProxy/eval/tool-prompt-bench/formal-dataset/source-material/T19'
$headers = @{
  'User-Agent' = 'TencentDB-Agent-Memory-T19-source-freeze'
}

$repoCatalog = @{
  'aws/agent-toolkit-for-aws' = @{ license = 'Apache-2.0'; licensePath = 'LICENSE' }
  'arjunprabhulal/devops-skills' = @{ license = 'MIT'; licensePath = 'LICENSE' }
  'zoom/skills' = @{ license = 'MIT'; licensePath = 'LICENSE' }
  'cerberauth/stubidp' = @{ license = 'MIT'; licensePath = 'LICENSE' }
  'wshobson/agents' = @{ license = 'MIT'; licensePath = 'LICENSE' }
  'tan-yong-sheng/ai-vision-mcp' = @{ license = 'MIT'; licensePath = 'LICENSE' }
}

$adopted = @(
  @{ key = 'aws-auth'; repo = 'aws/agent-toolkit-for-aws'; path = 'skills/core-skills/aws-auth/SKILL.md'; kind = 'skill' },
  @{ key = 'aws-auth-tokens-sessions'; repo = 'aws/agent-toolkit-for-aws'; path = 'skills/core-skills/aws-auth/references/tokens-and-sessions.md'; kind = 'resource'; parent = 'aws-auth' },
  @{ key = 'aws-iam'; repo = 'aws/agent-toolkit-for-aws'; path = 'skills/core-skills/aws-iam/SKILL.md'; kind = 'skill' },
  @{ key = 'network-security'; repo = 'arjunprabhulal/devops-skills'; path = 'skills/security/network-security/SKILL.md'; kind = 'skill' },
  @{ key = 'aws-security'; repo = 'aws/agent-toolkit-for-aws'; path = 'skills/core-skills/aws-security/SKILL.md'; kind = 'skill' },
  @{ key = 'signing-in-to-aws'; repo = 'aws/agent-toolkit-for-aws'; path = 'skills/core-skills/signing-in-to-aws/SKILL.md'; kind = 'skill' },
  @{ key = 'iam-access-management'; repo = 'arjunprabhulal/devops-skills'; path = 'skills/security/iam-access-management/SKILL.md'; kind = 'skill' },
  @{ key = 'secrets-management'; repo = 'arjunprabhulal/devops-skills'; path = 'skills/security/secrets-management/SKILL.md'; kind = 'skill' },
  @{ key = 'zero-trust'; repo = 'arjunprabhulal/devops-skills'; path = 'skills/security/zero-trust/SKILL.md'; kind = 'skill' },
  @{ key = 'policy-as-code'; repo = 'arjunprabhulal/devops-skills'; path = 'skills/iac/policy-as-code/SKILL.md'; kind = 'skill' },
  @{ key = 'compliance-as-code'; repo = 'arjunprabhulal/devops-skills'; path = 'skills/security/compliance-as-code/SKILL.md'; kind = 'skill' },
  @{ key = 'kubernetes-security'; repo = 'arjunprabhulal/devops-skills'; path = 'skills/kubernetes/kubernetes-security/SKILL.md'; kind = 'skill' },
  @{ key = 'pipeline-security'; repo = 'arjunprabhulal/devops-skills'; path = 'skills/ci-cd/pipeline-security/SKILL.md'; kind = 'skill' },
  @{ key = 'zoom-oauth'; repo = 'zoom/skills'; path = 'skills/oauth/SKILL.md'; kind = 'skill' },
  @{ key = 'zoom-rest-api'; repo = 'zoom/skills'; path = 'skills/rest-api/SKILL.md'; kind = 'skill' },
  @{ key = 'local-oidc-provider'; repo = 'cerberauth/stubidp'; path = 'skills/local-oidc-provider/SKILL.md'; kind = 'skill' },
  @{ key = 'stubidp'; repo = 'cerberauth/stubidp'; path = 'skills/stubidp/SKILL.md'; kind = 'skill' },
  @{ key = 'auth-implementation-patterns'; repo = 'wshobson/agents'; path = 'plugins/developer-essentials/skills/auth-implementation-patterns/SKILL.md'; kind = 'skill' },
  @{ key = 'access-control-policy-design'; repo = 'tan-yong-sheng/ai-vision-mcp'; path = '.claude/skills/access-control-policy-design/SKILL.md'; kind = 'skill' }
)

New-Item -ItemType Directory -Force -Path $sourceRoot | Out-Null

$repoLocks = @{}
foreach ($repoName in ($adopted.repo | Sort-Object -Unique)) {
  $catalog = $repoCatalog[$repoName]
  if (-not $catalog) { throw "missing verified repository catalog entry: $repoName" }
  $remote = @(& git ls-remote --symref ('https://github.com/' + $repoName + '.git') HEAD)
  if ($LASTEXITCODE -ne 0) { throw "cannot inspect upstream HEAD for $repoName" }
  $branchMatch = [regex]::Match(($remote -join "`n"), 'ref: refs/heads/([^\s]+)\s+HEAD')
  $commitMatch = [regex]::Match(($remote -join "`n"), '(?m)^([a-f0-9]{40})\s+HEAD$')
  if (-not $branchMatch.Success -or -not $commitMatch.Success) { throw "cannot freeze default branch and commit for $repoName" }
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
    sourceId = 'T19-SRC-' + $item.key.ToUpperInvariant().Replace('_', '-').Replace(' ', '-')
    skillKey = $item.key
    kind = $item.kind
    parentSkillKey = if ($item.parent) { $item.parent } else { $null }
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
  team_id = 'T19'
  generated_at = (Get-Date).ToUniversalTime().ToString('o')
  adopted_skill_count = @($files | Where-Object { $_.kind -eq 'skill' }).Count
  repositories = @($repoLocks.Values)
  files = $files
}
$lockPath = Join-Path $sourceRoot 'source-lock.json'
[IO.File]::WriteAllText($lockPath, (($sourceLock | ConvertTo-Json -Depth 8) + "`n"), [Text.UTF8Encoding]::new($false))

$sourceLock | ConvertTo-Json -Depth 8
