[CmdletBinding()]
param(
  [string]$BackendUrl = "http://localhost:3001",
  [string]$CameraUrl = "",
  [string]$ControllerUrl = "",
  [switch]$RunSoftwareTests,
  [switch]$BuildFirmware
)

$ErrorActionPreference = "Stop"
$sourceRoot = Split-Path -Parent $PSScriptRoot
$failures = [System.Collections.Generic.List[string]]::new()
$warnings = [System.Collections.Generic.List[string]]::new()

function Write-Check([string]$Label, [string]$Status, [ConsoleColor]$Color) {
  Write-Host ("[{0}] {1}" -f $Status, $Label) -ForegroundColor $Color
}

function Add-Pass([string]$Message) {
  Write-Check $Message "PASS" Green
}

function Add-Warning([string]$Message) {
  $warnings.Add($Message)
  Write-Check $Message "WARN" Yellow
}

function Add-Failure([string]$Message) {
  $failures.Add($Message)
  Write-Check $Message "FAIL" Red
}

function Read-DotEnv([string]$Path) {
  $values = @{}
  if (-not (Test-Path -LiteralPath $Path)) {
    return $values
  }
  foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#") -or -not $trimmed.Contains("=")) {
      continue
    }
    $name, $value = $trimmed.Split("=", 2)
    $values[$name.Trim()] = $value.Trim().Trim('"').Trim("'")
  }
  return $values
}

function Invoke-JsonEndpoint([string]$Name, [string]$Url) {
  try {
    $response = Invoke-RestMethod -Uri $Url -TimeoutSec 8
    Add-Pass "$Name reachable: $Url"
    return $response
  } catch {
    Add-Failure "$Name unreachable: $Url ($($_.Exception.Message))"
    return $null
  }
}

Write-Host "Sentinel MVP preflight" -ForegroundColor Cyan
Write-Host "Workspace: $sourceRoot"

foreach ($command in @("node", "npm", "docker")) {
  if (Get-Command $command -ErrorAction SilentlyContinue) {
    Add-Pass "$command is installed"
  } else {
    Add-Failure "$command is not installed or not in PATH"
  }
}

$backendEnvPath = Join-Path $sourceRoot "software/backend/.env"
$frontendEnvPath = Join-Path $sourceRoot "software/frontend/.env.local"
$backendEnv = Read-DotEnv $backendEnvPath
$frontendEnv = Read-DotEnv $frontendEnvPath

if (Test-Path -LiteralPath $backendEnvPath) {
  Add-Pass "backend .env exists"
} else {
  Add-Warning "software/backend/.env is missing; copy .env.example before hardware demo"
}
if (Test-Path -LiteralPath $frontendEnvPath) {
  Add-Pass "frontend .env.local exists"
} else {
  Add-Warning "software/frontend/.env.local is missing; camera stream will be unconfigured"
}

if (-not $CameraUrl) {
  $CameraUrl = [string]$backendEnv["CAMERA_URL"]
}
if (-not $CameraUrl) {
  $CameraUrl = [string]$frontendEnv["VITE_CAMERA_URL"]
}
if (-not $ControllerUrl) {
  $ControllerUrl = [string]$backendEnv["CONTROLLER_URL"]
}

try {
  docker info *> $null
  if ($LASTEXITCODE -eq 0) {
    Add-Pass "Docker Engine is running"
  } else {
    Add-Failure "Docker Engine is not running"
  }
} catch {
  Add-Failure "Docker Engine is not running"
}

$health = Invoke-JsonEndpoint "Backend health" "$($BackendUrl.TrimEnd('/'))/api/health"
if ($health) {
  if ($health.database -eq "connected") {
    Add-Pass "PostgreSQL is connected"
  } else {
    Add-Failure "Backend did not report a connected database"
  }
  if (-not $health.cameraConfigured) {
    Add-Warning "Backend CAMERA_URL is not configured"
  }
  if (-not $health.controllerConfigured) {
    Add-Warning "Backend CONTROLLER_URL is not configured"
  }
}

if ($CameraUrl) {
  $cameraStatus = Invoke-JsonEndpoint "ESP32-CAM status" "$($CameraUrl.TrimEnd('/'))/status"
  if ($cameraStatus) {
    if ($cameraStatus.cameraReady) {
      Add-Pass "Camera hardware is ready"
    } else {
      Add-Failure "Camera hardware is not ready"
    }
    if ($cameraStatus.faceRecognitionAvailable) {
      Add-Pass "Face embedding model is available"
    } else {
      Add-Failure "Face embedding model is unavailable; use the pinned PlatformIO build"
    }
  }
} else {
  Add-Warning "Camera URL is empty; camera and Face ID checks were skipped"
}

if ($ControllerUrl) {
  $controllerStatus = Invoke-JsonEndpoint "Controller status" "$($ControllerUrl.TrimEnd('/'))/api/hardware/status"
  if ($controllerStatus -and $controllerStatus.hardware) {
    Add-Pass "Controller returned hardware telemetry"
  } elseif ($controllerStatus) {
    Add-Failure "Controller response has no hardware telemetry"
  }
} else {
  Add-Warning "Controller URL is empty; controller checks were skipped"
}

if ($RunSoftwareTests) {
  Push-Location (Join-Path $sourceRoot "software/backend")
  try {
    & npm run test:all
    if ($LASTEXITCODE -eq 0) { Add-Pass "Backend unit and integration tests passed" }
    else { Add-Failure "Backend tests failed" }
  } finally {
    Pop-Location
  }

  Push-Location (Join-Path $sourceRoot "software/frontend")
  try {
    & npm run lint
    if ($LASTEXITCODE -eq 0) { Add-Pass "Frontend typecheck passed" }
    else { Add-Failure "Frontend typecheck failed" }
  } finally {
    Pop-Location
  }
}

if ($BuildFirmware) {
  $pioCommand = Get-Command pio -ErrorAction SilentlyContinue
  $pioPath = if ($pioCommand) { $pioCommand.Source } else { $null }
  if (-not $pioPath) {
    $localPio = Join-Path $env:USERPROFILE ".platformio/penv/Scripts/pio.exe"
    if (Test-Path -LiteralPath $localPio) {
      $pioPath = $localPio
    }
  }
  if (-not $pioPath) {
    Add-Failure "PlatformIO was not found"
  } else {
    Push-Location $sourceRoot
    try {
      & $pioPath run -e esp32_main_controller -e esp32cam_node
      if ($LASTEXITCODE -eq 0) { Add-Pass "Both firmware environments built successfully" }
      else { Add-Failure "Firmware build failed" }
    } finally {
      Pop-Location
    }
  }
}

Write-Host ""
Write-Host ("Summary: {0} failure(s), {1} warning(s)" -f $failures.Count, $warnings.Count) -ForegroundColor Cyan
if ($warnings.Count -gt 0) {
  $warnings | ForEach-Object { Write-Host "  WARN: $_" -ForegroundColor Yellow }
}
if ($failures.Count -gt 0) {
  $failures | ForEach-Object { Write-Host "  FAIL: $_" -ForegroundColor Red }
  exit 1
}
exit 0
