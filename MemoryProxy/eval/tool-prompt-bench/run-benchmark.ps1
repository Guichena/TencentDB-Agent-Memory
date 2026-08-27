[CmdletBinding()]
param(
  [ValidateSet("case", "smoke", "dev", "test")]
  [string]$Scope = "case",
  [string]$CaseId,
  [ValidateSet("V0")]
  [string]$Variant = "V0",
  [ValidateRange(1, 10)]
  [int]$Repeats = 1,
  [string]$Model = "gpt-5.6-luna",
  [ValidateSet("minimal", "low", "medium", "high", "xhigh")]
  [string]$ReasoningEffort = "high",
  [ValidateSet("low", "medium", "high")]
  [string]$Verbosity = "medium",
  [string]$CodexHome = $(if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE ".codex" }),
  [string]$ProviderBaseUrl,
  [ValidateRange(10000, 1800000)]
  [int]$TimeoutMs = 180000,
  [switch]$AllowHeldOutTest,
  [switch]$PrepareOnly
)

$ErrorActionPreference = "Stop"
$benchmarkRoot = Split-Path -Parent $PSCommandPath
$proxyRoot = Resolve-Path (Join-Path $benchmarkRoot "../..")
$resolvedCodexHome = [System.IO.Path]::GetFullPath($CodexHome)
$npmCommand = if (Get-Command npm.cmd -ErrorAction SilentlyContinue) { "npm.cmd" } else { "npm" }

if ($Scope -eq "case" -and [string]::IsNullOrWhiteSpace($CaseId)) {
  throw "-Scope case requires -CaseId."
}
if ($Scope -eq "test" -and -not $AllowHeldOutTest) {
  throw "Test is held out. Add -AllowHeldOutTest only for the preregistered final comparison."
}
if (-not (Test-Path -LiteralPath $resolvedCodexHome -PathType Container)) {
  throw "CODEX_HOME does not exist: $resolvedCodexHome"
}

function Read-JsonLines([string]$Path) {
  return Get-Content -LiteralPath $Path | Where-Object { $_.Trim() } | ForEach-Object { $_ | ConvertFrom-Json }
}

function Write-Utf8NoBom([string]$Path, [string]$Content) {
  [System.IO.File]::WriteAllText($Path, $Content, [System.Text.UTF8Encoding]::new($false))
}

$caseIds = switch ($Scope) {
  "case" { @($CaseId) }
  "smoke" { @((Get-Content -LiteralPath (Join-Path $benchmarkRoot "cases/smoke-case-ids.json") -Raw | ConvertFrom-Json).caseIds) }
  "dev" { @(Read-JsonLines (Join-Path $benchmarkRoot "cases/dev.jsonl") | ForEach-Object { $_.caseId }) }
  "test" { @(Read-JsonLines (Join-Path $benchmarkRoot "cases/test.jsonl") | ForEach-Object { $_.caseId }) }
}

$campaignName = "{0}-{1}-{2}" -f (Get-Date -Format "yyyyMMdd-HHmmss"), $Scope, $Variant
$campaignRoot = Join-Path $benchmarkRoot "runs/$campaignName"
$commonArgs = @(
  "--model", $Model,
  "--reasoning-effort", $ReasoningEffort,
  "--verbosity", $Verbosity,
  "--variant", $Variant,
  "--codex-home", $resolvedCodexHome,
  "--timeout-ms", [string]$TimeoutMs,
  "--out", $campaignRoot
)
if ($ProviderBaseUrl) { $commonArgs += @("--provider-base-url", $ProviderBaseUrl) }

Write-Host "Experiment plan only uses the existing CODEX_HOME; auth.json will not be copied."
Write-Host "Scope=$Scope Cases=$($caseIds.Count) Repeats=$Repeats Model=$Model Reasoning=$ReasoningEffort Variant=$Variant"
Write-Host "CODEX_HOME=$resolvedCodexHome"

if ($PrepareOnly) {
  Write-Host "`nValidation command:"
  Write-Host "  $npmCommand run eval:tool-prompt:validate"
  Write-Host "`nCodex commands:"
  foreach ($repeat in 1..$Repeats) {
    foreach ($id in $caseIds) {
      $display = @("run", "eval:tool-prompt:codex", "--", "--case", $id, "--repeat", [string]$repeat) + $commonArgs
      Write-Host "  $npmCommand $($display -join ' ')"
    }
  }
  exit 0
}

Push-Location $proxyRoot
try {
  & $npmCommand run eval:tool-prompt:validate
  if ($LASTEXITCODE -ne 0) { throw "Dataset validation failed." }

  New-Item -ItemType Directory -Path $campaignRoot -Force | Out-Null
  $campaignManifest = [ordered]@{
    schemaVersion = "1.0"
    createdAt = (Get-Date).ToUniversalTime().ToString("o")
    scope = $Scope
    caseCount = $caseIds.Count
    repeats = $Repeats
    variant = $Variant
    model = $Model
    reasoningEffort = $ReasoningEffort
    verbosity = $Verbosity
    timeoutMs = $TimeoutMs
    codexHomeMode = "shared-no-copy"
    providerBaseUrl = if ($ProviderBaseUrl) { $ProviderBaseUrl } else { $null }
    caseIds = $caseIds
  }
  Write-Utf8NoBom (Join-Path $campaignRoot "campaign-manifest.json") ($campaignManifest | ConvertTo-Json -Depth 8)

  foreach ($repeat in 1..$Repeats) {
    foreach ($id in $caseIds) {
      Write-Host "`n[$id][$Variant][repeat $repeat]"
      $runnerArgs = @("run", "eval:tool-prompt:codex", "--", "--case", $id, "--repeat", [string]$repeat) + $commonArgs
      & $npmCommand @runnerArgs
      if ($LASTEXITCODE -ne 0) { throw "Runner process failed for $id repeat $repeat." }
    }
  }

  $traceLines = Get-ChildItem -LiteralPath $campaignRoot -Recurse -Filter "trace.jsonl" |
    Sort-Object FullName |
    ForEach-Object { (Get-Content -LiteralPath $_.FullName -Raw).Trim() } |
    Where-Object { $_ }
  [System.IO.File]::WriteAllText(
    (Join-Path $campaignRoot "traces.jsonl"),
    (($traceLines -join [Environment]::NewLine) + [Environment]::NewLine),
    [System.Text.UTF8Encoding]::new($false)
  )

  $usageRows = Get-ChildItem -LiteralPath $campaignRoot -Recurse -Filter "usage.json" | Sort-Object FullName | ForEach-Object {
    $usage = Get-Content -LiteralPath $_.FullName -Raw | ConvertFrom-Json
    [ordered]@{
      runDirectory = Split-Path -Parent $_.FullName
      injectionTokens = $usage.injection.tokens
      injectionCharacters = $usage.injection.characters
      inputTokens = $usage.model.inputTokens
      cachedInputTokens = $usage.model.cachedInputTokens
      outputTokens = $usage.model.outputTokens
      reasoningOutputTokens = $usage.model.reasoningOutputTokens
    }
  }
  $usageAggregate = [ordered]@{
    runs = $usageRows.Count
    injectionTokenTotal = ($usageRows | Measure-Object -Property injectionTokens -Sum).Sum
    injectionTokenMean = ($usageRows | Measure-Object -Property injectionTokens -Average).Average
    inputTokenTotal = ($usageRows | Measure-Object -Property inputTokens -Sum).Sum
    cachedInputTokenTotal = ($usageRows | Measure-Object -Property cachedInputTokens -Sum).Sum
    outputTokenTotal = ($usageRows | Measure-Object -Property outputTokens -Sum).Sum
    reasoningOutputTokenTotal = ($usageRows | Measure-Object -Property reasoningOutputTokens -Sum).Sum
  }
  $campaignUsage = [ordered]@{ encoding = "o200k_base"; aggregate = $usageAggregate; runs = $usageRows }
  Write-Utf8NoBom (Join-Path $campaignRoot "campaign-usage.json") ($campaignUsage | ConvertTo-Json -Depth 8)

  & $npmCommand run eval:tool-prompt:score -- --traces (Join-Path $campaignRoot "traces.jsonl") --out (Join-Path $campaignRoot "scores.jsonl")
  if ($LASTEXITCODE -ne 0) { throw "Scoring failed." }

  $invalidRuns = Get-ChildItem -LiteralPath $campaignRoot -Recurse -Filter "evaluation.json" | Where-Object {
    (Get-Content -LiteralPath $_.FullName -Raw | ConvertFrom-Json).state -eq "INFRASTRUCTURE_ERROR"
  }
  if ($invalidRuns.Count -gt 0) {
    throw "$($invalidRuns.Count) infrastructure-invalid run(s) were excluded. Inspect the campaign before continuing."
  }

  Write-Host "`nCampaign complete: $campaignRoot"
} finally {
  Pop-Location
}
