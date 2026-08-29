param([string]$DestinationRoot = $PSScriptRoot)

$ErrorActionPreference = 'Stop'
$repositories = @(
  [ordered]@{
    repository_id = 'aidas-k8s-agent-skills'
    repository_url = 'https://github.com/Aidas-dev/k8s-agent-skills'
    commit_sha = '077702b44a5367fde0496db6a91b015f1416312a'
    license = 'MIT'
    license_path = 'LICENSE'
    license_raw_url = 'https://raw.githubusercontent.com/Aidas-dev/k8s-agent-skills/077702b44a5367fde0496db6a91b015f1416312a/LICENSE'
    source_task_time = '2026-08-14T14:12:25Z'
  },
  [ordered]@{
    repository_id = 'fluxcd-agent-skills'
    repository_url = 'https://github.com/fluxcd/agent-skills'
    commit_sha = 'e7e95ef1648a72f5276db6f98b799c5974ea846f'
    license = 'Apache-2.0'
    license_path = 'LICENSE'
    license_raw_url = 'https://raw.githubusercontent.com/fluxcd/agent-skills/e7e95ef1648a72f5276db6f98b799c5974ea846f/LICENSE'
    source_task_time = '2026-08-25T00:13:56Z'
  }
)

$sources = @(
  @('T14-SRC-HELM-CHART','aidas-k8s-agent-skills','skills/helm-chart/SKILL.md','raw/helm-chart/SKILL.md','skill'),
  @('T14-SRC-HELM-OPS','aidas-k8s-agent-skills','skills/helm-ops/SKILL.md','raw/helm-ops/SKILL.md','skill'),
  @('T14-SRC-FLAGGER','aidas-k8s-agent-skills','skills/flagger/SKILL.md','raw/flagger/SKILL.md','skill'),
  @('T14-SRC-SEALED-SECRETS','aidas-k8s-agent-skills','skills/sealed-secrets/SKILL.md','raw/sealed-secrets/SKILL.md','skill'),
  @('T14-SRC-RELOADER','aidas-k8s-agent-skills','skills/stakater-reloader/SKILL.md','raw/stakater-reloader/SKILL.md','skill'),
  @('T14-SRC-TEKTON-PIPELINES','aidas-k8s-agent-skills','skills/tekton-pipelines/SKILL.md','raw/tekton-pipelines/SKILL.md','skill'),
  @('T14-SRC-TEKTON-PAC','aidas-k8s-agent-skills','skills/tekton-pac/SKILL.md','raw/tekton-pac/SKILL.md','skill'),
  @('T14-SRC-GITEA-REGISTRY','aidas-k8s-agent-skills','skills/gitea-registry/SKILL.md','raw/gitea-registry/SKILL.md','skill'),
  @('T14-SRC-HARBOR-API','aidas-k8s-agent-skills','skills/harbor-api/SKILL.md','raw/harbor-api/SKILL.md','skill'),
  @('T14-SRC-HARBOR-HELM','aidas-k8s-agent-skills','skills/harbor-helm/SKILL.md','raw/harbor-helm/SKILL.md','skill'),
  @('T14-SRC-EXTERNAL-SECRETS','aidas-k8s-agent-skills','skills/external-secrets/SKILL.md','raw/external-secrets/SKILL.md','skill'),
  @('T14-SRC-CILIUM-GATEWAY','aidas-k8s-agent-skills','skills/cilium-gateway/SKILL.md','raw/cilium-gateway/SKILL.md','skill'),
  @('T14-SRC-TUPPR','aidas-k8s-agent-skills','skills/tuppr/SKILL.md','raw/tuppr/SKILL.md','skill'),
  @('T14-SRC-FLUX-KNOWLEDGE','fluxcd-agent-skills','skills/gitops-knowledge/SKILL.md','raw/gitops-knowledge/SKILL.md','skill'),
  @('T14-SRC-FLUX-AUDIT','fluxcd-agent-skills','skills/gitops-repo-audit/SKILL.md','raw/gitops-repo-audit/SKILL.md','skill'),
  @('T14-SRC-FLUX-DEBUG','fluxcd-agent-skills','skills/gitops-cluster-debug/SKILL.md','raw/gitops-cluster-debug/SKILL.md','skill'),
  @('T14-SRC-FLUX-IMAGE-AUTOMATION','fluxcd-agent-skills','skills/gitops-knowledge/references/image-automation.md','raw/gitops-knowledge/references/image-automation.md','resource')
)

New-Item -ItemType Directory -Force -Path $DestinationRoot | Out-Null
$frozenRepositories = @()
foreach ($repository in $repositories) {
  $licenseLocalPath = "raw/_licenses/$($repository.repository_id)/LICENSE"
  $licenseDestination = Join-Path $DestinationRoot $licenseLocalPath
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $licenseDestination) | Out-Null
  Invoke-WebRequest -UseBasicParsing -Uri $repository.license_raw_url -OutFile $licenseDestination
  $licenseHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $licenseDestination).Hash.ToLowerInvariant()
  $frozenRepositories += [ordered]@{
    repository_id = $repository.repository_id
    repository_url = $repository.repository_url
    commit_sha = $repository.commit_sha
    license = $repository.license
    license_path = $repository.license_path
    license_raw_url = $repository.license_raw_url
    license_sha256 = $licenseHash
    license_local_path = $licenseLocalPath
    source_task_time = $repository.source_task_time
  }
}

$frozenSources = @()
foreach ($entry in $sources) {
  $sourceId, $repositoryId, $path, $localPath, $kind = $entry
  $repository = $repositories | Where-Object { $_.repository_id -eq $repositoryId }
  if ($null -eq $repository) { throw "Unknown repository $repositoryId" }
  $slug = $repository.repository_url.Replace('https://github.com/','')
  $rawUrl = "https://raw.githubusercontent.com/$slug/$($repository.commit_sha)/$path"
  $destination = Join-Path $DestinationRoot $localPath
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
  Invoke-WebRequest -UseBasicParsing -Uri $rawUrl -OutFile $destination
  $rawHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $destination).Hash.ToLowerInvariant()
  $frozenSources += [ordered]@{
    source_id = $sourceId
    repository_id = $repositoryId
    repository_url = $repository.repository_url
    commit_sha = $repository.commit_sha
    path = $path
    license = $repository.license
    raw_url = $rawUrl
    raw_file_sha256 = $rawHash
    local_path = $localPath
    kind = $kind
  }
}

$manifest = [ordered]@{
  schema_version = 'task1.skill_source_freeze.v1'
  team_id = 'T14'
  frozen_by = 'sol'
  ordinary_github_search = @(
    'site:github.com SKILL.md Kubernetes Helm GitOps Flux Tekton Harbor Flagger agent skills',
    'site:github.com/Aidas-dev/k8s-agent-skills SKILL.md helm flux tekton flagger',
    'site:github.com/fluxcd/agent-skills gitops-knowledge SKILL.md'
  )
  repositories = $frozenRepositories
  sources = $frozenSources
}
$manifest | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath (Join-Path $DestinationRoot 'source-freeze.json') -Encoding utf8
Write-Output "Frozen $($frozenSources.Count) T14 source files from $($frozenRepositories.Count) licensed repositories."
