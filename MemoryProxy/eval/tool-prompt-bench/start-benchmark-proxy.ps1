[CmdletBinding()]
param(
  [string]$ConfigPath = $(Join-Path (Resolve-Path (Join-Path $PSScriptRoot "../..")) "config.yaml"),
  [string]$ImageName = "tdai-memory-proxy-task1:local",
  [string]$ContainerName = "tdai-memory-proxy-task1",
  [ValidateRange(1024, 65535)]
  [int]$Port = 8096,
  [string]$OfficialUpstream = "https://chatgpt.com/backend-api/codex",
  [string]$LangfuseHost = "http://host.docker.internal:13000",
  [switch]$SkipBuild,
  [switch]$Foreground,
  [switch]$PrepareOnly
)

$ErrorActionPreference = "Stop"
$proxyRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$resolvedConfig = (Resolve-Path -LiteralPath $ConfigPath).Path
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "docker is not available on PATH."
}
if (-not $resolvedConfig.StartsWith($proxyRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "ConfigPath must stay inside the current MemoryProxy worktree."
}
if (-not (Test-Path -LiteralPath $resolvedConfig -PathType Leaf)) {
  throw "MemoryProxy config not found: $resolvedConfig"
}

$mount = "${resolvedConfig}:/data/config.yaml:ro"
$buildArgs = @("build", "-t", $ImageName, ".")
$runArgs = @("run")
if (-not $Foreground) { $runArgs += "-d" }
$runArgs += @(
  "--name", $ContainerName,
  "--add-host", "host.docker.internal:host-gateway",
  "-p", "${Port}:8096",
  "-v", $mount,
  $ImageName,
  "--config", "/data/config.yaml",
  "--host", "0.0.0.0",
  "--port", "8096",
  "--upstream", $OfficialUpstream,
  "--langfuse-host", $LangfuseHost
)

Write-Host "The inherited config remains read-only and unchanged."
Write-Host "Official upstream override=$OfficialUpstream"
Write-Host "Langfuse host override=$LangfuseHost"
Write-Host "Proxy URL=http://127.0.0.1:$Port"

if ($PrepareOnly) {
  if (-not $SkipBuild) { Write-Host "docker $($buildArgs -join ' ')" }
  Write-Host "docker $($runArgs -join ' ')"
  exit 0
}

$existing = docker ps -a --filter "name=^/${ContainerName}$" --format "{{.Names}}"
if ($existing -eq $ContainerName) {
  throw "Container $ContainerName already exists. Stop or inspect it explicitly before retrying."
}

Push-Location $proxyRoot
try {
  if (-not $SkipBuild) {
    & docker @buildArgs
    if ($LASTEXITCODE -ne 0) { throw "MemoryProxy image build failed." }
  }

  & docker @runArgs
  if ($LASTEXITCODE -ne 0) { throw "MemoryProxy container failed to start." }

  if (-not $Foreground) {
    $healthUrl = "http://127.0.0.1:$Port/health"
    $healthy = $false
    foreach ($attempt in 1..30) {
      try {
        $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 2
        if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
          $healthy = $true
          break
        }
      } catch {
        Start-Sleep -Seconds 1
      }
    }
    if (-not $healthy) {
      throw "MemoryProxy did not become healthy. Inspect: docker logs $ContainerName"
    }
    Write-Host "MemoryProxy is healthy: $healthUrl"
  }
} finally {
  Pop-Location
}
