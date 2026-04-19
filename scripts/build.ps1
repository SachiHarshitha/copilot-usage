# build.ps1 — Local build script for copilot-usage executable
# Usage: .\build.ps1 [-Clean] [-Install] [-Run]

param(
    [switch]$Clean,   # Remove previous build artifacts first
    [switch]$Install, # Install/upgrade build dependencies before building
    [switch]$Run      # Launch the executable after a successful build
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$root = Split-Path -Parent $scriptDir
$cliDir = Join-Path $root "apps" "cli"
$spec = Join-Path $cliDir "copilot-usage.spec"
$dist = Join-Path $root "dist"
$exe  = Join-Path $dist "copilot-usage.exe"

Write-Host "`n=== Copilot Usage Analytics — Local Build ===" -ForegroundColor Cyan

# --- Clean ---
if ($Clean) {
    Write-Host "[1/4] Cleaning previous artifacts..." -ForegroundColor Yellow
    foreach ($dir in @("build", "dist")) {
        $p = Join-Path $root $dir
        if (Test-Path $p) { Remove-Item $p -Recurse -Force }
    }
    Write-Host "       Cleaned." -ForegroundColor Green
} else {
    Write-Host "[1/4] Clean skipped (use -Clean to remove old artifacts)" -ForegroundColor DarkGray
}

# --- Install deps ---
if ($Install) {
    Write-Host "[2/4] Installing build dependencies..." -ForegroundColor Yellow
    Push-Location $cliDir
    pip install -e ".[dev]" -q
    Pop-Location
    Write-Host "       Dependencies ready." -ForegroundColor Green
} else {
    Write-Host "[2/4] Dependency install skipped (use -Install to update)" -ForegroundColor DarkGray
}

# --- Build ---
Write-Host "[3/4] Building executable with PyInstaller..." -ForegroundColor Yellow
$sw = [System.Diagnostics.Stopwatch]::StartNew()
pyinstaller $spec --noconfirm 2>&1 | ForEach-Object {
    if ($_ -match "ERROR|WARN") { Write-Host "       $_" -ForegroundColor Red }
}
$sw.Stop()

if (Test-Path $exe) {
    $sizeMB = [math]::Round((Get-Item $exe).Length / 1MB, 1)
    Write-Host "       Build succeeded: $exe ($sizeMB MB) in $([math]::Round($sw.Elapsed.TotalSeconds))s" -ForegroundColor Green
} else {
    Write-Host "       Build FAILED — executable not found." -ForegroundColor Red
    exit 1
}

# --- Run ---
if ($Run) {
    Write-Host "[4/4] Launching executable..." -ForegroundColor Yellow
    & $exe
} else {
    Write-Host "[4/4] Run skipped (use -Run to launch after build)" -ForegroundColor DarkGray
    Write-Host "`n  To run: .\dist\copilot-usage.exe" -ForegroundColor DarkGray
    Write-Host "  To run with args: .\dist\copilot-usage.exe analyze" -ForegroundColor DarkGray
}

Write-Host ""
