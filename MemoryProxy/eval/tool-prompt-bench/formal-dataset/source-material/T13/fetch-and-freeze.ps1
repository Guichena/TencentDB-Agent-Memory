$ErrorActionPreference = "Stop"

$repo = "https://github.com/grafana/skills"
$commit = "51d33e71e191b409bbd25fc7be2684c610d18166"
$license = "Apache-2.0"
$root = $PSScriptRoot
$rawRoot = Join-Path $root "raw"

$sources = @(
  @{ id = "T13-SRC-PROMETHEUS"; slug = "prometheus"; path = "skills/grafana-lgtm/prometheus/SKILL.md" },
  @{ id = "T13-SRC-LOKI"; slug = "loki"; path = "skills/grafana-lgtm/loki/SKILL.md" },
  @{ id = "T13-SRC-TEMPO"; slug = "tempo"; path = "skills/grafana-lgtm/tempo/SKILL.md" },
  @{ id = "T13-SRC-PYROSCOPE"; slug = "pyroscope"; path = "skills/grafana-lgtm/pyroscope/SKILL.md" },
  @{ id = "T13-SRC-PROFILECLI"; slug = "profilecli-insights"; path = "skills/grafana-lgtm/profilecli-insights/SKILL.md" },
  @{ id = "T13-SRC-PROMQL"; slug = "promql"; path = "skills/grafana-core/promql/SKILL.md" },
  @{ id = "T13-SRC-ALERTING-IRM"; slug = "alerting-irm"; path = "skills/grafana-core/alerting-irm/SKILL.md" },
  @{ id = "T13-SRC-ALLOY"; slug = "alloy"; path = "skills/grafana-core/alloy/SKILL.md" },
  @{ id = "T13-SRC-OPENTELEMETRY"; slug = "opentelemetry"; path = "skills/grafana-core/opentelemetry/SKILL.md" },
  @{ id = "T13-SRC-DASHBOARDING"; slug = "dashboarding"; path = "skills/grafana-core/dashboarding/SKILL.md" },
  @{ id = "T13-SRC-LOKI-LABEL"; slug = "loki-label-analyzer"; path = "skills/grafana-cloud/loki-label-analyzer/SKILL.md" },
  @{ id = "T13-SRC-DPM-FINDER"; slug = "dpm-finder"; path = "skills/grafana-cloud/dpm-finder/SKILL.md" },
  @{ id = "T13-SRC-SYNTHETIC"; slug = "synthetic-monitoring-checks"; path = "skills/grafana-cloud/synthetic-monitoring-checks/SKILL.md" },
  @{ id = "T13-SRC-K6-INVESTIGATE"; slug = "k6-cloud-investigate-test"; path = "skills/grafana-k6/k6-cloud-investigate-test/SKILL.md" },
  @{ id = "T13-SRC-K6-TREND"; slug = "k6-trend-analysis"; path = "skills/grafana-k6/k6-trend-analysis/SKILL.md" },
  @{ id = "T13-SRC-K6-WEBSITE"; slug = "k6-perf-test-website"; path = "skills/grafana-k6/k6-perf-test-website/SKILL.md" },
  @{ id = "T13-SRC-DPM-CLI"; slug = "dpm-finder"; path = "skills/grafana-cloud/dpm-finder/references/cli.md"; resource = $true }
)

New-Item -ItemType Directory -Force -Path $rawRoot | Out-Null

$frozen = foreach ($source in $sources) {
  $destination = Join-Path $rawRoot (Join-Path $source.slug ($source.path -replace '^.*/', ''))
  if ($source.resource) {
    $destination = Join-Path $rawRoot (Join-Path $source.slug "references/cli.md")
  }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
  $url = "https://raw.githubusercontent.com/grafana/skills/$commit/$($source.path)"
  Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $destination
  $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $destination).Hash.ToLowerInvariant()
  [ordered]@{
    source_id = $source.id
    repository_url = $repo
    commit_sha = $commit
    path = $source.path
    license = $license
    raw_url = $url
    raw_file_sha256 = $hash
    local_path = $destination.Substring($root.Length + 1).Replace('\', '/')
    kind = $(if ($source.resource) { "resource" } else { "skill" })
  }
}

$licenseDestination = Join-Path $rawRoot "_licenses/grafana-skills/LICENSE"
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $licenseDestination) | Out-Null
$licenseUrl = "https://raw.githubusercontent.com/grafana/skills/$commit/LICENSE"
Invoke-WebRequest -UseBasicParsing -Uri $licenseUrl -OutFile $licenseDestination
$licenseHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $licenseDestination).Hash.ToLowerInvariant()

$manifest = [ordered]@{
  schema_version = "task1.skill_source_freeze.v1"
  team_id = "T13"
  frozen_by = "sol"
  repository_url = $repo
  commit_sha = $commit
  license = $license
  license_path = "LICENSE"
  license_raw_url = $licenseUrl
  license_sha256 = $licenseHash
  ordinary_github_search = @(
    "site:github.com SKILL.md prometheus grafana observability",
    "site:github.com SKILL.md OpenTelemetry logs tracing incident response"
  )
  sources = @($frozen)
}

$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $root "source-freeze.json") -Encoding utf8
Write-Output ($manifest | ConvertTo-Json -Depth 8)
