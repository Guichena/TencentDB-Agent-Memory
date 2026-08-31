[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$RepositoryRoot,
  [Parameter(Mandatory = $true)][string]$Config,
  [Parameter(Mandatory = $true)][string]$RunRoot,
  [Parameter(Mandatory = $true)][string]$FrozenDataRoot,
  [Parameter(Mandatory = $true)][string]$MemoryCoreBaseUrl,
  [Parameter(Mandatory = $true)][string]$MemoryKnowledgeBaseUrl,
  [Parameter(Mandatory = $true)][string]$MemoryProxyBaseUrl,
  [Parameter(Mandatory = $true)][string]$RuntimeServiceId,
  [Parameter(Mandatory = $true)][string]$RuntimeAuthUserId,
  [string]$CampaignId = "task1-r05-blank-stack-preflight-r1",
  [string]$DataTag = "task1-data-formal-v2.1",
  [string]$CodeRef = "HEAD",
  [string]$PromptFreezeRef = "task1-code-freeze",
  [ValidateSet("Restore", "Inspect")][string]$Stage = "Restore",
  [switch]$KnowledgeReadyConfirmed,
  [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$expectedRunCount = 40
$expectedChecks = @(
  "auth-user-mapping",
  "metadata-identity",
  "session-identity",
  "visible-assets",
  "write-side-disabled",
  "fresh-session-namespace"
)

function Require-NonBlank {
  param([string]$Name, [AllowNull()][object]$Value)
  if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value)) {
    throw "$Name must be a non-empty string."
  }
  return ([string]$Value).Trim()
}

function Resolve-ExistingDirectory {
  param([string]$Name, [string]$Path)
  $candidate = Require-NonBlank $Name $Path
  if (-not (Test-Path -LiteralPath $candidate -PathType Container)) {
    throw "$Name directory does not exist: $candidate"
  }
  return (Resolve-Path -LiteralPath $candidate).Path
}

function Resolve-ExistingFile {
  param([string]$Name, [string]$Path)
  $candidate = Require-NonBlank $Name $Path
  if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
    throw "$Name file does not exist: $candidate"
  }
  return (Resolve-Path -LiteralPath $candidate).Path
}

function Resolve-R05RunRoot {
  param([string]$Path, [string]$Stage)
  $candidate = [System.IO.Path]::GetFullPath((Require-NonBlank "RunRoot" $Path))
  if ($Stage -eq "Restore") {
    if (Test-Path -LiteralPath $candidate) {
      throw "RunRoot must not already exist for Restore (create-new policy): $candidate"
    }
    return $candidate
  }
  if (-not (Test-Path -LiteralPath $candidate -PathType Container)) {
    throw "RunRoot must already exist for Inspect: $candidate"
  }
  return (Resolve-Path -LiteralPath $candidate).Path
}

function Test-PathWithin {
  param([string]$Candidate, [string]$Root)
  $rootWithSeparator = $Root.TrimEnd("\", "/") + [System.IO.Path]::DirectorySeparatorChar
  return $Candidate.Equals($Root, [System.StringComparison]::OrdinalIgnoreCase) -or
    $Candidate.StartsWith($rootWithSeparator, [System.StringComparison]::OrdinalIgnoreCase)
}

function Resolve-ServiceUrl {
  param([string]$Name, [string]$Value)
  $text = Require-NonBlank $Name $Value
  $uri = $null
  if (-not [System.Uri]::TryCreate($text, [System.UriKind]::Absolute, [ref]$uri)) {
    throw "$Name must be an absolute URL."
  }
  if ($uri.Scheme -ne "http" -and $uri.Scheme -ne "https") {
    throw "$Name must use HTTP or HTTPS."
  }
  if (-not [string]::IsNullOrEmpty($uri.UserInfo) -or
      -not [string]::IsNullOrEmpty($uri.Query) -or
      -not [string]::IsNullOrEmpty($uri.Fragment)) {
    throw "$Name must not contain credentials, a query, or a fragment."
  }
  if (-not $uri.IsLoopback) {
    throw "$Name must use a local loopback host for the dedicated R05 blank stack."
  }
  return $text.TrimEnd("/")
}

function Invoke-GitText {
  param([string]$Root, [string[]]$ArgumentList)
  $lines = @(& git -C $Root @ArgumentList 2>$null)
  $exitCode = $LASTEXITCODE
  $text = [string]::Join([Environment]::NewLine, $lines)
  if ($exitCode -ne 0) {
    throw "git $($ArgumentList -join ' ') failed in $Root."
  }
  return $text.Trim()
}

function Assert-CleanRepository {
  param([string]$Name, [string]$Root)
  $inside = Invoke-GitText $Root @("rev-parse", "--is-inside-work-tree")
  if ($inside -ne "true") { throw "$Name is not a Git worktree: $Root" }
  $dirty = Invoke-GitText $Root @("status", "--porcelain=v1", "--untracked-files=all")
  if (-not [string]::IsNullOrWhiteSpace($dirty)) {
    throw "$Name must be clean before runtime preflight: $Root"
  }
}

function Assert-FinalGitLocks {
  param(
    [string]$RepositoryRoot,
    [string]$FrozenDataRoot,
    [string]$CodeCommit,
    [string]$DataTag,
    [string]$DataTagObject,
    [string]$DataCommit
  )
  Assert-CleanRepository "final RepositoryRoot" $RepositoryRoot
  Assert-CleanRepository "final FrozenDataRoot" $FrozenDataRoot

  $finalCodeCommit = Invoke-GitText $RepositoryRoot @("rev-parse", "HEAD")
  if ($finalCodeCommit -ne $CodeCommit) {
    throw "RepositoryRoot HEAD changed during runtime preflight."
  }
  $finalFrozenDataCommit = Invoke-GitText $FrozenDataRoot @("rev-parse", "HEAD")
  if ($finalFrozenDataCommit -ne $DataCommit) {
    throw "FrozenDataRoot HEAD changed during runtime preflight."
  }
  $finalTagType = Invoke-GitText $RepositoryRoot @("cat-file", "-t", $DataTag)
  if ($finalTagType -ne "tag") {
    throw "$DataTag stopped resolving to an annotated Git tag during runtime preflight."
  }
  $finalDataTagObject = Invoke-GitText $RepositoryRoot @("rev-parse", $DataTag)
  if ($finalDataTagObject -ne $DataTagObject) {
    throw "$DataTag object changed during runtime preflight."
  }
  $finalDataCommit = Invoke-GitText $RepositoryRoot @("rev-parse", "$DataTag^{commit}")
  if ($finalDataCommit -ne $DataCommit) {
    throw "$DataTag peeled commit changed during runtime preflight."
  }

  return [pscustomobject]@{
    repositoryClean = $true
    frozenDataRootClean = $true
    codeCommit = $finalCodeCommit
    frozenDataCommit = $finalFrozenDataCommit
    dataTagType = $finalTagType
    dataTagObject = $finalDataTagObject
    dataCommit = $finalDataCommit
  }
}

function Get-RequiredProperty {
  param([string]$Name, [AllowNull()][object]$Object, [string]$Property)
  if ($null -eq $Object) { throw "$Name is absent." }
  $found = $Object.PSObject.Properties[$Property]
  if ($null -eq $found) { throw "$Name.$Property is absent." }
  return $found.Value
}

function Assert-TrueProperty {
  param([string]$Name, [object]$Object, [string]$Property)
  if ((Get-RequiredProperty $Name $Object $Property) -ne $true) {
    throw "$Name.$Property must be true."
  }
}

function Invoke-JsonGet {
  param([string]$Name, [string]$Url)
  try {
    return Invoke-RestMethod -Method Get -Uri $Url -Headers @{ Accept = "application/json" } -TimeoutSec 15
  } catch {
    throw "$Name GET failed: $Url ($($_.Exception.Message))"
  }
}

function Invoke-AuthVerify {
  param([string]$CoreBaseUrl, [string]$ServiceId, [string]$UserKey, [string]$CoreApiKey)
  $body = @{ user_key = $UserKey } | ConvertTo-Json -Compress
  try {
    return Invoke-RestMethod -Method Post `
      -Uri "$CoreBaseUrl/v3/meta/auth/verify" `
      -Headers @{
        Authorization = "Bearer $CoreApiKey"
        "x-tdai-service-id" = $ServiceId
        Accept = "application/json"
      } `
      -ContentType "application/json" `
      -Body $body `
      -TimeoutSec 15
  } catch {
    throw "MemoryCore auth verification failed without exposing the user key ($($_.Exception.Message))"
  }
}

function Invoke-NativeChecked {
  param([string]$FilePath, [string[]]$ArgumentList, [string]$WorkingDirectory)
  Push-Location $WorkingDirectory
  try {
    & $FilePath @ArgumentList
    if ($LASTEXITCODE -ne 0) {
      throw "$([System.IO.Path]::GetFileName($FilePath)) failed with exit code $LASTEXITCODE."
    }
  } finally {
    Pop-Location
  }
}

function Invoke-NativeJsonChecked {
  param([string]$FilePath, [string[]]$ArgumentList, [string]$WorkingDirectory)
  Push-Location $WorkingDirectory
  try {
    $stdout = @(& $FilePath @ArgumentList)
    if ($LASTEXITCODE -ne 0) {
      throw "$([System.IO.Path]::GetFileName($FilePath)) contract validation failed with exit code $LASTEXITCODE."
    }
    $text = [string]::Join([Environment]::NewLine, $stdout)
    try {
      return $text | ConvertFrom-Json
    } catch {
      throw "$([System.IO.Path]::GetFileName($FilePath)) returned invalid contract JSON."
    }
  } finally {
    Pop-Location
  }
}

function Write-CreateNewJson {
  param([string]$Path, [object]$Value)
  $parent = Split-Path -Parent $Path
  [System.IO.Directory]::CreateDirectory($parent) | Out-Null
  $bytes = [System.Text.UTF8Encoding]::new($false).GetBytes(
    (($Value | ConvertTo-Json -Depth 20) + [Environment]::NewLine)
  )
  $stream = [System.IO.FileStream]::new(
    $Path,
    [System.IO.FileMode]::CreateNew,
    [System.IO.FileAccess]::Write,
    [System.IO.FileShare]::None
  )
  try {
    $stream.Write($bytes, 0, $bytes.Length)
  } finally {
    $stream.Dispose()
  }
}

function Assert-ProxyHealth {
  param([object]$Health, [string]$ConfigSha256)
  if ((Get-RequiredProperty "MemoryProxy health" $Health "status") -ne "ok") {
    throw "MemoryProxy health.status must be ok."
  }
  Assert-TrueProperty "MemoryProxy health" $Health "injectionEnabled"
  if ((Get-RequiredProperty "MemoryProxy health" $Health "toolPromptProfile") -ne "legacy") {
    throw "MemoryProxy must run the V0 legacy profile for the R05 blank-stack preflight."
  }
  if ((Get-RequiredProperty "MemoryProxy health" $Health "codexUpstream") -ne
      "https://chatgpt.com/backend-api/codex") {
    throw "MemoryProxy must report the official ChatGPT Codex upstream."
  }
  if ((Get-RequiredProperty "MemoryProxy health" $Health "codexUpstreamAuth") -ne
      "client-passthrough") {
    throw "MemoryProxy must report client-passthrough Codex authentication."
  }
  if ((Get-RequiredProperty "MemoryProxy health" $Health "toolPromptDiagnostic") -ne "disabled") {
    throw "MemoryProxy tool prompt diagnostic mode must be disabled."
  }
  $readOnly = Get-RequiredProperty "MemoryProxy health" $Health "experimentReadOnly"
  foreach ($field in @(
    "extractionDisabled",
    "tdaiL0WriteDisabled",
    "skillLlmWriteDisabled",
    "analyseMarkerDisabled",
    "toolPromptDiagnosticDisabled",
    "ready"
  )) {
    Assert-TrueProperty "MemoryProxy health.experimentReadOnly" $readOnly $field
  }
  $reportedConfigSha = [string](Get-RequiredProperty "MemoryProxy health" $Health "experimentConfigFileSha256")
  if ($reportedConfigSha.ToLowerInvariant() -ne $ConfigSha256) {
    throw "MemoryProxy startup config SHA-256 does not match the supplied config file."
  }
  Require-NonBlank "MemoryProxy health.serverInstanceId" (Get-RequiredProperty "MemoryProxy health" $Health "serverInstanceId") | Out-Null
  Require-NonBlank "MemoryProxy health.serverStartedAt" (Get-RequiredProperty "MemoryProxy health" $Health "serverStartedAt") | Out-Null
}

$RepositoryRoot = Resolve-ExistingDirectory "RepositoryRoot" $RepositoryRoot
$FrozenDataRoot = Resolve-ExistingDirectory "FrozenDataRoot" $FrozenDataRoot
$Config = Resolve-ExistingFile "Config" $Config
$RunRoot = Resolve-R05RunRoot $RunRoot $Stage
$MemoryCoreBaseUrl = Resolve-ServiceUrl "MemoryCoreBaseUrl" $MemoryCoreBaseUrl
$MemoryKnowledgeBaseUrl = Resolve-ServiceUrl "MemoryKnowledgeBaseUrl" $MemoryKnowledgeBaseUrl
$MemoryProxyBaseUrl = Resolve-ServiceUrl "MemoryProxyBaseUrl" $MemoryProxyBaseUrl
$RuntimeServiceId = Require-NonBlank "RuntimeServiceId" $RuntimeServiceId
$RuntimeAuthUserId = Require-NonBlank "RuntimeAuthUserId" $RuntimeAuthUserId
$CampaignId = Require-NonBlank "CampaignId" $CampaignId
if ($CampaignId -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*$' -or
    $CampaignId -eq "." -or $CampaignId -eq "..") {
  throw "CampaignId must be a safe path segment."
}
if ($DataTag -ne "task1-data-formal-v2.1") {
  throw "DataTag must remain task1-data-formal-v2.1 for the R05 runtime Gate."
}
if ($PromptFreezeRef -ne "task1-code-freeze") {
  throw "PromptFreezeRef must remain task1-code-freeze for the R05 runtime Gate."
}
if ((Test-PathWithin $RunRoot $RepositoryRoot) -or (Test-PathWithin $RunRoot $FrozenDataRoot)) {
  throw "RunRoot must be outside both Git worktrees."
}

function Assert-ExactProperty {
  param([string]$Name, [object]$Object, [string]$Property, [AllowNull()][object]$Expected)
  $actual = Get-RequiredProperty $Name $Object $Property
  if ([string]$actual -cne [string]$Expected) {
    throw "$Name.$Property does not match the frozen restore-stage handoff."
  }
  return $actual
}
if ($Stage -eq "Inspect" -and -not $DryRun -and -not $KnowledgeReadyConfirmed) {
  throw "KnowledgeReadyConfirmed is required for Inspect after the user has confirmed all visible code-graphs are ready."
}

$nodeVersion = (& node --version 2>&1).Trim()
if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v22\.') {
  throw "R05 runtime preflight requires Node.js 22; active node is $nodeVersion."
}
$npmCommand = Get-Command npm.cmd -ErrorAction Stop
$powerShellHost = [System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName

Assert-CleanRepository "RepositoryRoot" $RepositoryRoot
Assert-CleanRepository "FrozenDataRoot" $FrozenDataRoot

$tagType = Invoke-GitText $RepositoryRoot @("cat-file", "-t", $DataTag)
if ($tagType -ne "tag") { throw "$DataTag must be an annotated Git tag." }
$dataTagObject = Invoke-GitText $RepositoryRoot @("rev-parse", $DataTag)
$dataCommit = Invoke-GitText $RepositoryRoot @("rev-parse", "$DataTag^{commit}")
$frozenDataCommit = Invoke-GitText $FrozenDataRoot @("rev-parse", "HEAD")
if ($frozenDataCommit -ne $dataCommit) {
  throw "FrozenDataRoot HEAD must equal $DataTag commit $dataCommit."
}
$codeCommit = Invoke-GitText $RepositoryRoot @("rev-parse", "$CodeRef^{commit}")
$headCommit = Invoke-GitText $RepositoryRoot @("rev-parse", "HEAD")
if ($codeCommit -ne $headCommit) {
  throw "CodeRef must resolve to the checked-out HEAD used by this preflight."
}
$promptFreezeCommit = Invoke-GitText $RepositoryRoot @("rev-parse", "$PromptFreezeRef^{commit}")
$skillSourceRoot = Join-Path $FrozenDataRoot "MemoryProxy\eval\tool-prompt-bench\formal-dataset\source-material"
if (-not (Test-Path -LiteralPath $skillSourceRoot -PathType Container)) {
  throw "FrozenDataRoot does not contain the frozen formal source-material directory."
}

$configSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $Config).Hash.ToLowerInvariant()
$benchRoot = Join-Path $RepositoryRoot "MemoryProxy\eval\tool-prompt-bench"
$proxyRoot = Join-Path $RepositoryRoot "MemoryProxy"
$prepareScript = Resolve-ExistingFile "PrepareOnly wrapper" (Join-Path $benchRoot "run-formal-prepare.ps1")
$receiptScript = Resolve-ExistingFile "Receipt wrapper" (Join-Path $benchRoot "create-formal-preflight-receipt.ps1")
$restoreAdapter = Resolve-ExistingFile "Production restore adapter" (Join-Path $benchRoot "formal-assets\server-team-production-adapter.ts")
$inspectorAdapter = Resolve-ExistingFile "Production inspector" (Join-Path $benchRoot "formal-assets\server-team-production-inspector.ts")
$tsx = Resolve-ExistingFile "Local tsx" (Join-Path $proxyRoot "node_modules\.bin\tsx.cmd")
$contractCli = Resolve-ExistingFile "R05 runtime contract CLI" (Join-Path $benchRoot "r05-runtime-preflight-contract.ts")
$smokePreregistration = Resolve-ExistingFile "Frozen Dev Smoke preregistration" (
  Join-Path $benchRoot "formal-runtime\frozen\dev-smoke-preregistration.json"
)

$artifactRoot = Join-Path $RunRoot "evidence"
$campaignOutputRoot = Join-Path $RunRoot "prepared"
$planPath = Join-Path $artifactRoot "dev-restore-plan.json"
$restorePath = Join-Path $artifactRoot "dev-restore-observations.json"
$inspectRoot = Join-Path $artifactRoot "inspect"
$receiptRoot = Join-Path $artifactRoot "preflight"
$restoreStagePath = Join-Path $RunRoot "r05-restore-stage.json"
$summaryPath = Join-Path $RunRoot "r05-runtime-preflight-summary.json"

if ($DryRun) {
  [pscustomobject]@{
    schemaVersion = "task1.r05-runtime-preflight-plan.v2"
    mode = "dry-run"
    stage = $Stage
    createsFiles = $false
    contactsServices = $false
    invokesModel = $false
    nodeVersion = $nodeVersion
    repositoryRoot = $RepositoryRoot
    codeCommit = $codeCommit
    dataTag = $DataTag
    dataTagObject = $dataTagObject
    dataCommit = $dataCommit
    frozenDataRoot = $FrozenDataRoot
    promptFreezeCommit = $promptFreezeCommit
    configFileSha256 = $configSha256
    runRoot = $RunRoot
    expectedRunCount = $expectedRunCount
    orderedSteps = if ($Stage -eq "Restore") {
      @(
        "MemoryCore/MemoryKnowledge/MemoryProxy health",
        "MemoryCore auth/verify",
        "build restore plan",
        "restore Dev assets once",
        "prepare and validate the frozen 40-case preflight selection without a model",
        "write create-new restore-stage handoff",
        "stop at wait-for-knowledge-ready"
      )
    } else {
      @(
        "validate the existing restore-stage handoff without restoring again",
        "MemoryCore/MemoryKnowledge/MemoryProxy health and identity",
        "MemoryCore auth/verify",
        "inspect each prepared run",
        "create and verify six-check ready receipt for each run",
        "recheck config, service identity/health, and Git locks",
        "write create-new final summary"
      )
    }
  } | ConvertTo-Json -Depth 10
  return
}

$userKey = Require-NonBlank "TDAI_EVAL_USER_KEY environment variable" $env:TDAI_EVAL_USER_KEY
$memoryCoreApiKey = Require-NonBlank `
  "TDAI_FORMAL_MEMORY_CORE_API_KEY environment variable" `
  $env:TDAI_FORMAL_MEMORY_CORE_API_KEY
$coreHealth = Invoke-JsonGet "MemoryCore health" "$MemoryCoreBaseUrl/health"
if ((Get-RequiredProperty "MemoryCore health" $coreHealth "status") -ne "ok") {
  throw "MemoryCore health.status must be ok."
}
$stores = Get-RequiredProperty "MemoryCore health" $coreHealth "stores"
Assert-TrueProperty "MemoryCore health.stores" $stores "vectorStore"

$knowledgeHealth = Invoke-JsonGet "MemoryKnowledge health" "$MemoryKnowledgeBaseUrl/health"
if ((Get-RequiredProperty "MemoryKnowledge health" $knowledgeHealth "status") -ne "ok") {
  throw "MemoryKnowledge health.status must be ok."
}

$proxyHealth = Invoke-JsonGet "MemoryProxy health" "$MemoryProxyBaseUrl/health"
Assert-ProxyHealth $proxyHealth $configSha256

$authEnvelope = Invoke-AuthVerify `
  $MemoryCoreBaseUrl `
  $RuntimeServiceId `
  $userKey `
  $memoryCoreApiKey
if ((Get-RequiredProperty "MemoryCore auth envelope" $authEnvelope "code") -ne 0) {
  throw "MemoryCore auth envelope code must be 0."
}
$authData = Get-RequiredProperty "MemoryCore auth envelope" $authEnvelope "data"
Assert-TrueProperty "MemoryCore auth data" $authData "valid"
$authUser = Get-RequiredProperty "MemoryCore auth data" $authData "user"
$resolvedAuthUserId = Require-NonBlank "MemoryCore auth data.user.user_id" (
  Get-RequiredProperty "MemoryCore auth data.user" $authUser "user_id"
)
if ($resolvedAuthUserId -ne $RuntimeAuthUserId) {
  throw "RuntimeAuthUserId does not match the user_id resolved by auth/verify."
}

$previousEnvironment = @{}
foreach ($name in @(
  "TDAI_FORMAL_MEMORY_CORE_URL",
  "TDAI_FORMAL_MEMORY_KNOWLEDGE_URL",
  "TDAI_FORMAL_MEMORY_PROXY_URL",
  "TDAI_FORMAL_RUNTIME_SERVICE_ID",
  "TDAI_FORMAL_RUNTIME_AUTH_USER_ID",
  "TDAI_FORMAL_DATA_ROOT"
)) {
  $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
}

if ($Stage -eq "Restore") {
  New-Item -ItemType Directory -Path $RunRoot -ErrorAction Stop | Out-Null
}
$startedAt = [DateTimeOffset]::UtcNow.ToString("o")
try {
  $env:TDAI_FORMAL_MEMORY_CORE_URL = $MemoryCoreBaseUrl
  $env:TDAI_FORMAL_MEMORY_KNOWLEDGE_URL = $MemoryKnowledgeBaseUrl
  $env:TDAI_FORMAL_MEMORY_PROXY_URL = $MemoryProxyBaseUrl
  $env:TDAI_FORMAL_RUNTIME_SERVICE_ID = $RuntimeServiceId
  $env:TDAI_FORMAL_RUNTIME_AUTH_USER_ID = $RuntimeAuthUserId
  $env:TDAI_FORMAL_DATA_ROOT = $FrozenDataRoot

  if ($Stage -eq "Restore") {
    Invoke-NativeChecked $npmCommand.Source @(
      "run", "eval:tool-prompt:formal:build-restore-plan", "--",
      "--repo-root", $RepositoryRoot,
      "--split", "dev",
      "--output", $planPath
    ) $proxyRoot

    # This frozen hash/cardinality Gate must pass before the adapter can issue
    # its first production restore request.
    $planContract = Invoke-NativeJsonChecked $tsx @(
      $contractCli,
      "--mode", "plan",
      "--input", $planPath
    ) $proxyRoot

    Invoke-NativeChecked $npmCommand.Source @(
      "run", "eval:tool-prompt:formal:restore-assets", "--",
      "--plan", $planPath,
      "--split", "dev",
      "--adapter", $restoreAdapter,
      "--output", $restorePath
    ) $proxyRoot

    # The adapter may only describe an unverified complete restore. It cannot
    # self-attest eligibility or readiness for formal measurement.
    $restoreContract = Invoke-NativeJsonChecked $tsx @(
      $contractCli,
      "--mode", "restore",
      "--input", $restorePath
    ) $proxyRoot

    Invoke-NativeChecked $powerShellHost @(
      "-NoLogo", "-NoProfile", "-File", $prepareScript,
      "-Scope", "smoke",
      "-Variant", "V0",
      "-Campaign", $CampaignId,
      "-RepositoryRoot", $RepositoryRoot,
      "-Config", $Config,
      "-OutputRoot", $campaignOutputRoot,
      "-ProxyBaseUrl", $MemoryProxyBaseUrl,
      "-Repeats", "1",
      "-Model", "gpt-5.6-luna",
      "-ReasoningEffort", "high",
      "-CodeRef", $CodeRef,
      "-PromptFreezeRef", $PromptFreezeRef
    ) $proxyRoot
  } else {
    $restoreStagePath = Resolve-ExistingFile "Restore-stage handoff" $restoreStagePath
    foreach ($path in @($summaryPath, $inspectRoot, $receiptRoot)) {
      if (Test-Path -LiteralPath $path) {
        throw "Inspect requires create-new evidence paths; already exists: $path"
      }
    }
    $restoreStage = Get-Content -LiteralPath $restoreStagePath -Raw | ConvertFrom-Json
    Assert-ExactProperty "restore-stage handoff" $restoreStage "schemaVersion" "task1.r05-restore-stage.v1" | Out-Null
    Assert-ExactProperty "restore-stage handoff" $restoreStage "stage" "wait-for-knowledge-ready" | Out-Null
    if ((Get-RequiredProperty "restore-stage handoff" $restoreStage "invokesModel") -ne $false) {
      throw "restore-stage handoff.invokesModel must remain false."
    }
    foreach ($binding in @(
      @("repositoryRoot", $RepositoryRoot),
      @("codeCommit", $codeCommit),
      @("dataTag", $DataTag),
      @("dataTagObject", $dataTagObject),
      @("dataCommit", $dataCommit),
      @("frozenDataRoot", $FrozenDataRoot),
      @("promptFreezeCommit", $promptFreezeCommit),
      @("configFileSha256", $configSha256),
      @("campaignId", $CampaignId),
      @("memoryCoreBaseUrl", $MemoryCoreBaseUrl),
      @("memoryKnowledgeBaseUrl", $MemoryKnowledgeBaseUrl),
      @("memoryProxyBaseUrl", $MemoryProxyBaseUrl),
      @("runtimeServiceId", $RuntimeServiceId),
      @("runtimeAuthUserId", $RuntimeAuthUserId)
    )) {
      Assert-ExactProperty "restore-stage handoff" $restoreStage $binding[0] $binding[1] | Out-Null
    }
    Assert-ExactProperty "restore-stage handoff" $restoreStage "memoryKnowledgeServerInstanceId" (
      Require-NonBlank "MemoryKnowledge health.serverInstanceId" (
        Get-RequiredProperty "MemoryKnowledge health" $knowledgeHealth "serverInstanceId"
      )
    ) | Out-Null
    foreach ($identityField in @("serverInstanceId", "serverStartedAt")) {
      Assert-ExactProperty "restore-stage handoff" $restoreStage "memoryProxy$($identityField.Substring(0,1).ToUpperInvariant())$($identityField.Substring(1))" (
        Get-RequiredProperty "MemoryProxy health" $proxyHealth $identityField
      ) | Out-Null
    }
    $startedAt = Require-NonBlank "restore-stage handoff.startedAt" (
      Get-RequiredProperty "restore-stage handoff" $restoreStage "startedAt"
    )

    $planPath = Resolve-ExistingFile "Restore plan" $planPath
    $restorePath = Resolve-ExistingFile "Restore observations" $restorePath
    Assert-ExactProperty "restore-stage handoff" $restoreStage "restorePlanFileSha256" (
      (Get-FileHash -Algorithm SHA256 -LiteralPath $planPath).Hash.ToLowerInvariant()
    ) | Out-Null
    Assert-ExactProperty "restore-stage handoff" $restoreStage "restoreObservationsFileSha256" (
      (Get-FileHash -Algorithm SHA256 -LiteralPath $restorePath).Hash.ToLowerInvariant()
    ) | Out-Null
    $planContract = Invoke-NativeJsonChecked $tsx @(
      $contractCli,
      "--mode", "plan",
      "--input", $planPath
    ) $proxyRoot
    $restoreContract = Invoke-NativeJsonChecked $tsx @(
      $contractCli,
      "--mode", "restore",
      "--input", $restorePath
    ) $proxyRoot
  }

  $runManifestFiles = @(
    Get-ChildItem -LiteralPath $campaignOutputRoot -Filter "run-manifest.json" -File -Recurse |
      Sort-Object FullName
  )
  if ($runManifestFiles.Count -ne $expectedRunCount) {
    throw "PrepareOnly must create exactly $expectedRunCount run manifests; found $($runManifestFiles.Count)."
  }

  $preparedContractArguments = @(
    $contractCli,
    "--mode", "prepared",
    "--preregistration", $smokePreregistration
  )
  foreach ($manifestFile in $runManifestFiles) {
    $preparedContractArguments += @("--manifest", $manifestFile.FullName)
  }
  # Validate exact case membership and all unique identities before the first
  # inspect call consumes a fresh Session namespace.
  $preparedContract = Invoke-NativeJsonChecked $tsx $preparedContractArguments $proxyRoot

  if ($Stage -eq "Restore") {
    $manifestEvidence = @(
      foreach ($manifestFile in $runManifestFiles) {
        [ordered]@{
          path = $manifestFile.FullName
          sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $manifestFile.FullName).Hash.ToLowerInvariant()
        }
      }
    )
    $restoreStage = [ordered]@{
      schemaVersion = "task1.r05-restore-stage.v1"
      stage = "wait-for-knowledge-ready"
      ready = $false
      invokesModel = $false
      startedAt = $startedAt
      restoreFinishedAt = [DateTimeOffset]::UtcNow.ToString("o")
      repositoryRoot = $RepositoryRoot
      codeCommit = $codeCommit
      dataTag = $DataTag
      dataTagObject = $dataTagObject
      dataCommit = $dataCommit
      frozenDataRoot = $FrozenDataRoot
      promptFreezeCommit = $promptFreezeCommit
      configFileSha256 = $configSha256
      campaignId = $CampaignId
      memoryCoreBaseUrl = $MemoryCoreBaseUrl
      memoryKnowledgeBaseUrl = $MemoryKnowledgeBaseUrl
      memoryProxyBaseUrl = $MemoryProxyBaseUrl
      runtimeServiceId = $RuntimeServiceId
      runtimeAuthUserId = $RuntimeAuthUserId
      memoryKnowledgeServerInstanceId = Require-NonBlank "MemoryKnowledge health.serverInstanceId" (
        Get-RequiredProperty "MemoryKnowledge health" $knowledgeHealth "serverInstanceId"
      )
      memoryProxyServerInstanceId = Get-RequiredProperty "MemoryProxy health" $proxyHealth "serverInstanceId"
      memoryProxyServerStartedAt = Get-RequiredProperty "MemoryProxy health" $proxyHealth "serverStartedAt"
      restorePlan = $planPath
      restorePlanFileSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $planPath).Hash.ToLowerInvariant()
      restorePlanContract = $planContract
      restoreObservations = $restorePath
      restoreObservationsFileSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $restorePath).Hash.ToLowerInvariant()
      restoreObservationContract = $restoreContract
      devSmokeSelectionSha256 = $preparedContract.selectionSha256
      devSmokeCaseIds = @($preparedContract.caseIds)
      runManifests = $manifestEvidence
      finalGitLocks = Assert-FinalGitLocks `
        $RepositoryRoot `
        $FrozenDataRoot `
        $codeCommit `
        $DataTag `
        $dataTagObject `
        $dataCommit
      nextStage = "Inspect"
      knowledgeReadyConfirmationRequired = $true
    }
    Write-CreateNewJson $restoreStagePath $restoreStage
    $restoreStage | ConvertTo-Json -Depth 20
    return
  }

  $recordedManifests = @(Get-RequiredProperty "restore-stage handoff" $restoreStage "runManifests")
  if ($recordedManifests.Count -ne $runManifestFiles.Count) {
    throw "restore-stage handoff run manifest count changed before Inspect."
  }
  for ($index = 0; $index -lt $runManifestFiles.Count; $index += 1) {
    Assert-ExactProperty "restore-stage handoff runManifests[$index]" $recordedManifests[$index] "path" (
      $runManifestFiles[$index].FullName
    ) | Out-Null
    Assert-ExactProperty "restore-stage handoff runManifests[$index]" $recordedManifests[$index] "sha256" (
      (Get-FileHash -Algorithm SHA256 -LiteralPath $runManifestFiles[$index].FullName).Hash.ToLowerInvariant()
    ) | Out-Null
  }
  Assert-ExactProperty "restore-stage handoff" $restoreStage "devSmokeSelectionSha256" $preparedContract.selectionSha256 | Out-Null

  $inspectStartedAt = [DateTimeOffset]::UtcNow.ToString("o")
  $seenRunIds = @{}
  $readyRunIds = @()
  $readyRunEvidence = @()
  foreach ($manifestFile in $runManifestFiles) {
    $manifest = Get-Content -LiteralPath $manifestFile.FullName -Raw | ConvertFrom-Json
    $runId = Require-NonBlank "run manifest run_id" (Get-RequiredProperty "run manifest" $manifest "run_id")
    if ($runId -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*$' -or $seenRunIds.ContainsKey($runId)) {
      throw "Prepared run_id is unsafe or duplicated: $runId"
    }
    $seenRunIds[$runId] = $true
    if ((Get-RequiredProperty "run manifest" $manifest "prepareOnly") -ne $true -or
        (Get-RequiredProperty "run manifest" $manifest "formalMetricEligible") -ne $false -or
        (Get-RequiredProperty "run manifest" $manifest "variant_id") -ne "V0" -or
        (Get-RequiredProperty "run manifest" $manifest "split") -ne "dev" -or
        (Get-RequiredProperty "run manifest" $manifest "model_id") -ne "gpt-5.6-luna" -or
        (Get-RequiredProperty "run manifest" $manifest "reasoning_effort") -ne "high") {
      throw "Prepared run contract drifted for $runId."
    }

    $runDirectory = $manifestFile.Directory.FullName
    $inspectPath = Join-Path $inspectRoot "$runId.json"
    $receiptPath = Join-Path $receiptRoot "$runId.json"

    Invoke-NativeChecked $npmCommand.Source @(
      "run", "eval:tool-prompt:formal:inspect-assets", "--",
      "--plan", $planPath,
      "--restore-observations", $restorePath,
      "--split", "dev",
      "--run-dir", $runDirectory,
      "--adapter", $inspectorAdapter,
      "--output", $inspectPath
    ) $proxyRoot

    Invoke-NativeChecked $powerShellHost @(
      "-NoLogo", "-NoProfile", "-File", $receiptScript,
      "-RunDirectory", $runDirectory,
      "-Plan", $planPath,
      "-InspectObservations", $inspectPath,
      "-Split", "dev",
      "-Output", $receiptPath
    ) $proxyRoot

    $receipt = Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
    if ((Get-RequiredProperty "preflight receipt" $receipt "ready") -ne $true) {
      throw "Preflight receipt is not ready for $runId."
    }
    $checks = @(Get-RequiredProperty "preflight receipt" $receipt "checks")
    if ($checks.Count -ne $expectedChecks.Count) {
      throw "Preflight receipt must contain exactly six checks for $runId."
    }
    foreach ($expectedCheck in $expectedChecks) {
      $matched = @($checks | Where-Object { $_.id -eq $expectedCheck -and $_.status -eq "pass" })
      if ($matched.Count -ne 1) {
        throw "Preflight receipt check $expectedCheck did not pass exactly once for $runId."
      }
    }
    $readyRunIds += $runId
    $readyRunEvidence += [ordered]@{
      runId = $runId
      runManifestFileSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $manifestFile.FullName).Hash.ToLowerInvariant()
      inspectFileSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $inspectPath).Hash.ToLowerInvariant()
      receiptFileSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $receiptPath).Hash.ToLowerInvariant()
    }
  }

  $finalConfigSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $Config).Hash.ToLowerInvariant()
  if ($finalConfigSha256 -ne $configSha256) {
    throw "The supplied config file changed during runtime preflight."
  }
  $finalCoreHealth = Invoke-JsonGet "final MemoryCore health" "$MemoryCoreBaseUrl/health"
  if ((Get-RequiredProperty "final MemoryCore health" $finalCoreHealth "status") -ne "ok") {
    throw "Final MemoryCore health.status must be ok."
  }
  $finalCoreStores = Get-RequiredProperty "final MemoryCore health" $finalCoreHealth "stores"
  Assert-TrueProperty "final MemoryCore health.stores" $finalCoreStores "vectorStore"
  $finalKnowledgeHealth = Invoke-JsonGet "final MemoryKnowledge health" "$MemoryKnowledgeBaseUrl/health"
  if ((Get-RequiredProperty "final MemoryKnowledge health" $finalKnowledgeHealth "status") -ne "ok") {
    throw "Final MemoryKnowledge health.status must be ok."
  }
  $initialKnowledgeInstanceId = Require-NonBlank "MemoryKnowledge health.serverInstanceId" (
    Get-RequiredProperty "MemoryKnowledge health" $knowledgeHealth "serverInstanceId"
  )
  $finalKnowledgeInstanceId = Require-NonBlank "final MemoryKnowledge health.serverInstanceId" (
    Get-RequiredProperty "final MemoryKnowledge health" $finalKnowledgeHealth "serverInstanceId"
  )
  if ($initialKnowledgeInstanceId -ne $finalKnowledgeInstanceId) {
    throw "MemoryKnowledge restarted during runtime preflight."
  }
  $finalProxyHealth = Invoke-JsonGet "final MemoryProxy health" "$MemoryProxyBaseUrl/health"
  Assert-ProxyHealth $finalProxyHealth $configSha256
  foreach ($identityField in @("serverInstanceId", "serverStartedAt")) {
    if ((Get-RequiredProperty "MemoryProxy health" $proxyHealth $identityField) -ne
        (Get-RequiredProperty "final MemoryProxy health" $finalProxyHealth $identityField)) {
      throw "MemoryProxy $identityField changed during runtime preflight."
    }
  }
  $finalAuthEnvelope = Invoke-AuthVerify `
    $MemoryCoreBaseUrl `
    $RuntimeServiceId `
    $userKey `
    $memoryCoreApiKey
  if ((Get-RequiredProperty "final MemoryCore auth envelope" $finalAuthEnvelope "code") -ne 0) {
    throw "Final MemoryCore auth envelope code must be 0."
  }
  $finalAuthData = Get-RequiredProperty "final MemoryCore auth envelope" $finalAuthEnvelope "data"
  Assert-TrueProperty "final MemoryCore auth data" $finalAuthData "valid"
  $finalAuthUser = Get-RequiredProperty "final MemoryCore auth data" $finalAuthData "user"
  if ((Require-NonBlank "final MemoryCore auth user_id" (
      Get-RequiredProperty "final MemoryCore auth user" $finalAuthUser "user_id"
    )) -ne $RuntimeAuthUserId) {
    throw "auth/verify user mapping changed during runtime preflight."
  }

  $finalGitLocks = Assert-FinalGitLocks `
    $RepositoryRoot `
    $FrozenDataRoot `
    $codeCommit `
    $DataTag `
    $dataTagObject `
    $dataCommit

  $summary = [ordered]@{
    schemaVersion = "task1.r05-runtime-preflight-summary.v1"
    ready = $true
    invokesModel = $false
    stage = "r05-blank-stack-preflight"
    variant = "V0"
    split = "dev"
    scope = "smoke"
    campaignId = $CampaignId
    startedAt = $startedAt
    inspectStartedAt = $inspectStartedAt
    finishedAt = [DateTimeOffset]::UtcNow.ToString("o")
    repositoryRoot = $RepositoryRoot
    codeCommit = $codeCommit
    dataTag = $DataTag
    dataTagObject = $dataTagObject
    dataCommit = $dataCommit
    frozenDataRoot = $FrozenDataRoot
    finalGitLocks = $finalGitLocks
    promptFreezeCommit = $promptFreezeCommit
    configFileSha256 = $configSha256
    memoryProxyServerInstanceId = Get-RequiredProperty "MemoryProxy health" $proxyHealth "serverInstanceId"
    memoryKnowledgeServerInstanceId = $initialKnowledgeInstanceId
    runtimeServiceId = $RuntimeServiceId
    runtimeAuthUserId = $RuntimeAuthUserId
    restoreStageHandoff = $restoreStagePath
    restoreStageHandoffFileSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $restoreStagePath).Hash.ToLowerInvariant()
    restorePlan = $planPath
    restorePlanFileSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $planPath).Hash.ToLowerInvariant()
    restorePlanContract = $planContract
    restoreObservations = $restorePath
    restoreObservationsFileSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $restorePath).Hash.ToLowerInvariant()
    restoreObservationContract = $restoreContract
    expectedRunCount = $expectedRunCount
    readyRunCount = $readyRunIds.Count
    devSmokeSelectionSha256 = $preparedContract.selectionSha256
    devSmokeCaseIds = @($preparedContract.caseIds)
    readyRunIds = $readyRunIds
    readyRunEvidence = $readyRunEvidence
    requiredChecks = $expectedChecks
  }
  Write-CreateNewJson $summaryPath $summary
  $summary | ConvertTo-Json -Depth 20
} finally {
  foreach ($name in $previousEnvironment.Keys) {
    [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], "Process")
  }
}
